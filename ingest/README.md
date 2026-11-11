# Chaos Garden: Ingest Service

Lives in the `ingest/` folder of the Chaos-Garden repo, next to the control API, but runs, deploys and tests as a separate service.

Turns the fault proxy's request events into request logs and per-minute stats.

```
proxy ──XADD──▶ Redis Stream "chaos:requests" ──XREADGROUP──▶ ingest ──▶ Postgres (chaos_ingest)
                                                                 ▲
control API ──GET /internal/gardens/:id/requests|stats ──────────┘
```

This service owns its own database (`chaos_ingest`). Nothing else writes to it, and other services read it only through this service's internal API.

## How events are processed

- **Consumer group.** Every instance joins the `ingest` group, and each event is delivered to one instance. Run more instances to share the load; give each a unique `CONSUMER_NAME` (the default is hostname plus process id).
- **At-least-once.** An event is acknowledged (`XACK`) only after its batch is committed to Postgres. If the service crashes mid-batch, the events stay pending and are picked up again.
- **Idempotent writes.** The proxy's event id is the primary key, so an event delivered twice is stored and counted once.
- **Retries.** Events left unacknowledged for `CLAIM_IDLE_MS` are claimed again (`XPENDING` + `XCLAIM`). After `MAX_DELIVERIES` attempts they move to the dead-letter stream (`chaos:requests:dead`) with the reason.
- **Malformed events** go straight to the dead-letter stream.
- **Stats** are aggregated per garden, target and minute in the same transaction as the logs, from only the rows that were actually inserted.
- **Retention.** Logs older than `LOG_RETENTION_DAYS` and stats older than `STATS_RETENTION_DAYS` are deleted hourly.
- **Request IDs.** Each event's `requestId` (the proxy's `x-request-id`) is stored with the log row and returned by the internal API, so a logged request can be found in every service's logs.
- **Shutdown.** On SIGTERM it stops reading, finishes the current batch, then closes connections.

Outcomes: `ok`, `slow`, `error` (injected), `drop`, `corrupt`, `target_error` (the target itself returned 4xx/5xx), `no_response`, `rate_limited` (the proxy refused it because of the garden's rate limit).

## Internal API

All routes need the `x-internal-key` header to match `INTERNAL_API_KEY`. The control API calls them after checking the garden's admin token.

| Route | Returns |
|---|---|
| `GET /internal/gardens/:gardenId/requests?limit=50&targetId=&before=` | newest first, plus `nextBefore` for the next page |
| `GET /internal/gardens/:gardenId/stats?minutes=60&targetId=` | per-minute buckets and totals by outcome, with average duration |
| `GET /health` | Postgres and Redis status, consumer group `pending` and `lag`, counters |
| `GET /metrics` | Prometheus metrics: `chaos_ingest_events_total{result}`, batch time and failures, consumer lag and pending, HTTP and runtime metrics (no internal key; set `METRICS_TOKEN` to protect it) |

## Development

Needs Postgres and Redis. `../infra/docker-compose.yml` runs both and creates `chaos_ingest`.

This folder is its own Node project: run the commands below from `ingest/`.

```bash
npm install --legacy-peer-deps   # plain `npm install` crashes in some environments
cp .env.example .env
npm run db:migrate
npm run start:dev                # port 3200
npm test                         # unit tests
npm run test:e2e                 # e2e against real Redis and Postgres
```

After changing `src/database/schema.ts`, run `npm run db:generate` and commit the migration.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3200` | HTTP port |
| `DATABASE_URL` | `postgres://chaos:chaos@localhost:5432/chaos_ingest` | this service's database |
| `REDIS_URL` | `redis://localhost:6379` | Redis with the event stream |
| `INTERNAL_API_KEY` | none (internal API rejects all) | shared with the control API |
| `EVENT_STREAM` | `chaos:requests` | must match the proxy |
| `CONSUMER_GROUP` | `ingest` | consumer group name |
| `CONSUMER_NAME` | `<hostname>-<pid>` | unique per instance |
| `BATCH_SIZE` | `200` | events per read |
| `BLOCK_MS` | `2000` | max wait per read |
| `CLAIM_IDLE_MS` | `30000` | retry events stuck this long |
| `MAX_DELIVERIES` | `5` | attempts before dead-lettering |
| `LOG_RETENTION_DAYS` | `7` | request log retention |
| `STATS_RETENTION_DAYS` | `30` | stats retention |
