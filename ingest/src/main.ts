import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { createLogger } from './observability/json-logger.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(createLogger('ingest'));
  configureApp(app);
  await app.listen(process.env.PORT ?? 3200);
}
await bootstrap();
