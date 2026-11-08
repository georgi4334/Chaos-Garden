import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

process.env.DATABASE_URL ??= 'postgres://chaos:chaos@localhost:5432/chaos_garden';

describe('CORS (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.CORS_ORIGIN = 'http://localhost:3001, https://dashboard.example.com';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    delete process.env.CORS_ORIGIN;
    await app.close();
  });

  it('answers a preflight for an allowed origin, including the authorization header', async () => {
    const res = await request(app.getHttpServer())
      .options('/gardens')
      .set('Origin', 'https://dashboard.example.com')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,authorization')
      .expect(204);
    expect(res.headers['access-control-allow-origin']).toBe('https://dashboard.example.com');
    expect(res.headers['access-control-allow-headers']).toMatch(/authorization/i);
  });

  it('adds the allow-origin header to normal responses for allowed origins', async () => {
    const res = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'http://localhost:3001')
      .expect(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3001');
  });

  it('does not allow other origins', async () => {
    const res = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://evil.example.com')
      .expect(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
