import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { createLogger } from './observability/json-logger.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(createLogger('control-api'));
  // Behind a load balancer or reverse proxy, trust X-Forwarded-For so req.ip is the client.
  if (process.env.TRUST_PROXY === 'true') app.getHttpAdapter().getInstance().set('trust proxy', 1);
  configureApp(app);

  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Chaos Garden Control API')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('docs', app, doc);

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
