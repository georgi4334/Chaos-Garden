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
