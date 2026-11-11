import { INestApplication, ValidationPipe } from '@nestjs/common';
import { httpObservabilityMiddleware } from './observability/http-observability.middleware.js';
import { initMetrics } from './observability/metrics.js';
import { requestIdMiddleware } from './observability/request-context.js';

/** Shared by main.ts and the e2e tests so both run with identical behaviour. */
export function configureApp(app: INestApplication) {
  initMetrics('control-api');
  // First: give every request an id, then time and access-log it.
  app.use(requestIdMiddleware);
  app.use(httpObservabilityMiddleware);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  // Browsers (the dashboard) may call this API only from the origins listed in
  // CORS_ORIGIN (comma separated). The default is the dashboard's dev address.
  const origins = (process.env.CORS_ORIGIN ?? 'http://localhost:3001')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'authorization', 'x-request-id'],
    exposedHeaders: ['x-request-id', 'retry-after'],
    maxAge: 600,
  });
  app.enableShutdownHooks();
}
