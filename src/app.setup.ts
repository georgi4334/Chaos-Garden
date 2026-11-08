import { INestApplication, ValidationPipe } from '@nestjs/common';

/** Shared by main.ts and the e2e tests so both run with identical behaviour. */
export function configureApp(app: INestApplication) {
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
    allowedHeaders: ['content-type', 'authorization'],
    maxAge: 600,
  });
  app.enableShutdownHooks();
}
