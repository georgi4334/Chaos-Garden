import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // On SIGTERM: stop reading, finish the current batch, then close connections.
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3200);
}
await bootstrap();
