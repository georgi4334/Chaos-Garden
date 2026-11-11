# Chaos Garden: Control API

Chaos Garden is a fault-injection platform for frontend developers. You register an API target, define fault rules (latency, error status codes, dropped connections, corrupted bodies), and the platform injects them so you can test how your app handles failure.

This repository is the **control API** (NestJS + TypeScript + Postgres via Drizzle). It manages gardens, targets and fault rules. Other services (fault proxy, ingest worker, web dashboard) will live in their own repositories.

## How access works (no registration)

`POST /gardens` creates a garden and returns an `adminToken` **once**. Only its SHA-256 hash is stored. Send it as `Authorization: Bearer <adminToken>` on every other call. A token only works for its own garden.

## Endpoints

| Method | Path | Auth |
|---|---|---|
| POST | `/gardens` | none |
| GET / PATCH / DELETE | `/gardens/:gardenId` | token |
| GET / POST | `/gardens/:gardenId/targets` | token |
| GET / PATCH / DELETE | `/gardens/:gardenId/targets/:targetId` | token |
| GET / POST | `/gardens/:gardenId/targets/:targetId/rules` | token |
| GET / PATCH / DELETE | `/gardens/:gardenId/targets/:targetId/rules/:ruleId` | token |
| GET | `/gardens/:gardenId/requests?limit=&targetId=&before=` | token |
| GET | `/gardens/:gardenId/stats?minutes=&targetId=` | token |
| GET | `/health` | none |

Rule types and their `params`: `latency` `{ ms: 0..30000 }`, `error` `{ status: 400..599 }`, `drop` and `corrupt` take none. `probability` is 0..1. Interactive docs are at `/docs`.

## Development

```bash
npm install --legacy-peer-deps   # plain `npm install` crashes in some environments
cp .env.example .env
npm run db:up                    # Postgres + Redis via Docker (infra/docker-compose.yml)
npm run db:migrate
npm run start:dev
```

Tests (the e2e tests need the database running and migrated):

```bash
npm test
npm run test:e2e
```

After changing `src/database/schema.ts`, run `npm run db:generate` and commit the new migration.

## Request logs and stats

`/requests` (newest first, page back with `before=<nextBefore>`) and `/stats` (per-minute counts by outcome, default the last 60 minutes) are served by the separate ingest service. This API checks the garden's admin token, then reads from the ingest service at `INGEST_URL` with `INTERNAL_API_KEY`. If the ingest service is down, these two endpoints answer 503 and everything else keeps working.

Outcomes: `ok`, `slow` (delayed), `error` (injected), `drop`, `corrupt`, `target_error` (the target itself returned 4xx/5xx), `no_response`.

The compose file creates the ingest service's database (`chaos_ingest`) on first start via `infra/postgres-init/`. If your Postgres volume already exists, create it once by hand: `CREATE DATABASE chaos_ingest OWNER chaos;`

## Internal endpoint (for other services)

`GET /internal/gardens/:gardenId/config` returns a garden's targets and enabled rules. It is used by the fault proxy and requires the `x-internal-key` header to match `INTERNAL_API_KEY`. If `INTERNAL_API_KEY` is not set, it rejects every request.
