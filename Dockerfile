# Chaos Garden control API. Build from the repo root: docker build -t chaos-garden-control-api .
# Stage 1: install every dependency (including dev tools needed to build).
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build \
 && npm prune --omit=dev --legacy-peer-deps

# Stage 2: only what runs in production. No compilers, no dev dependencies, no sources.
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=3000 \
    LOG_FORMAT=json
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# SQL migrations, applied by `node dist/database/migrate.js` (run it before the service starts).
COPY --from=build /app/src/database/migrations ./src/database/migrations
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/main.js"]
