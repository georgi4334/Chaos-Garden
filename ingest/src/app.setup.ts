import { INestApplication } from '@nestjs/common';
import { httpObservabilityMiddleware } from './observability/http-observability.middleware.js';
import { initMetrics } from './observability/metrics.js';
import { requestIdMiddleware } from './observability/request-context.js';

/** Shared by main.ts and the e2e tests so both run with identical behaviour. */
export function configureApp(app: INestApplication) {
  initMetrics('ingest');
  app.use(requestIdMiddleware);
  app.use(httpObservabilityMiddleware);
  // On SIGTERM: stop reading, finish the current batch, then close connections.
  app.enableShutdownHooks();
}
