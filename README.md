# Chaos Garden: Control API

Chaos Garden is a fault-injection platform for frontend developers. You register an API target, define fault rules (latency, error status codes, dropped connections, corrupted bodies), and the platform injects them so you can test how your app handles failure.

This repository is the **control API** (NestJS + TypeScript). It manages gardens, targets and fault rules. Other services (fault proxy, ingest worker, web dashboard) live in their own repositories.

## Development

```bash
npm install --legacy-peer-deps
npm run start:dev
npm test
```

`--legacy-peer-deps` is needed because a plain `npm install` currently crashes in this environment.

Local Postgres and Redis come from the `chaos-garden-infra` docker-compose setup.
