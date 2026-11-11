import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

process.env.DATABASE_URL ??= 'postgres://chaos:chaos@localhost:5432/chaos_garden';
process.env.INTERNAL_API_KEY = 'rate-test-key';

async function startApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

describe('Garden rate limits (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await startApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('new gardens get the default limit, and the owner can change it within the caps', async () => {
    const created = await request(app.getHttpServer()).post('/gardens').send({ name: 'limits' }).expect(201);
    const { id, adminToken } = created.body;
    expect(created.body).toMatchObject({ rateLimitRps: 10, rateLimitBurst: 20 });
    const auth = { Authorization: `Bearer ${adminToken}` };

    const updated = await request(app.getHttpServer())
      .patch(`/gardens/${id}`)
      .set(auth)
      .send({ rateLimitRps: 5, rateLimitBurst: 8 })
      .expect(200);
    expect(updated.body).toMatchObject({ name: 'limits', rateLimitRps: 5, rateLimitBurst: 8 });
    expect(updated.body.adminTokenHash).toBeUndefined();

    for (const body of [{ rateLimitRps: 0 }, { rateLimitRps: 51 }, { rateLimitBurst: 101 }, { rateLimitRps: 2.5 }, {}]) {
      await request(app.getHttpServer()).patch(`/gardens/${id}`).set(auth).send(body).expect(400);
    }

    // The proxy sees the new limit in the garden config.
    const config = await request(app.getHttpServer())
      .get(`/internal/gardens/${id}/config`)
      .set('x-internal-key', 'rate-test-key')
      .expect(200);
    expect(config.body.rateLimit).toEqual({ rps: 5, burst: 8 });
  });
});

describe('Garden creation limit per address (e2e)', () => {
  let app: INestApplication;
  const saved = process.env.GARDEN_CREATE_LIMIT;
  beforeAll(async () => {
    process.env.GARDEN_CREATE_LIMIT = '3';
    app = await startApp();
  });
  afterAll(async () => {
    process.env.GARDEN_CREATE_LIMIT = saved;
    await app.close();
  });

  it('answers 429 with Retry-After once an address has created the maximum', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer()).post('/gardens').send({ name: `g${i}` }).expect(201);
    }
    const res = await request(app.getHttpServer()).post('/gardens').send({ name: 'one too many' }).expect(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(res.body.message).toMatch(/Too many gardens/);
    // Other endpoints are not affected.
    await request(app.getHttpServer()).get('/health').expect(200);
  });
});
