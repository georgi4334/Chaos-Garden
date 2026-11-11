import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

process.env.DATABASE_URL ??= 'postgres://chaos:chaos@localhost:5432/chaos_garden';
process.env.INTERNAL_API_KEY = 'test-internal-key';

describe('Internal config endpoint (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const internal = { 'x-internal-key': 'test-internal-key' };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects missing and wrong keys, and admin tokens', async () => {
    const g = (await http().post('/gardens').send({ name: 'g' }).expect(201)).body;
    const url = `/internal/gardens/${g.id}/config`;
    await http().get(url).expect(401);
    await http().get(url).set({ 'x-internal-key': 'wrong' }).expect(401);
    await http().get(url).set({ Authorization: `Bearer ${g.adminToken}` }).expect(401);
  });

  it('returns 404 for an unknown garden and 400 for a malformed id', async () => {
    await http()
      .get('/internal/gardens/00000000-0000-4000-8000-000000000000/config')
      .set(internal)
      .expect(404);
    await http().get('/internal/gardens/not-a-uuid/config').set(internal).expect(400);
  });

  it('returns targets with only enabled rules, probability as a number', async () => {
    const g = (await http().post('/gardens').send({ name: 'cfg' }).expect(201)).body;
    const h = { Authorization: `Bearer ${g.adminToken}` };

    const empty = await http().get(`/internal/gardens/${g.id}/config`).set(internal).expect(200);
    expect(empty.body).toEqual({ gardenId: g.id, rateLimit: { rps: 10, burst: 20 }, targets: [] });

    const target = (
      await http()
        .post(`/gardens/${g.id}/targets`)
        .set(h)
        .send({ name: 'api', baseUrl: 'http://localhost:4000' })
        .expect(201)
    ).body;
    const rulesUrl = `/gardens/${g.id}/targets/${target.id}/rules`;
    await http()
      .post(rulesUrl)
      .set(h)
      .send({ type: 'error', probability: 0.25, pathPattern: '/users/*', params: { status: 503 } })
      .expect(201);
    await http()
      .post(rulesUrl)
      .set(h)
      .send({ type: 'drop', enabled: false })
      .expect(201);

    const res = await http().get(`/internal/gardens/${g.id}/config`).set(internal).expect(200);
    expect(res.body.targets).toHaveLength(1);
    expect(res.body.targets[0]).toMatchObject({ name: 'api', baseUrl: 'http://localhost:4000' });
    expect(res.body.targets[0].rules).toHaveLength(1);
    expect(res.body.targets[0].rules[0]).toMatchObject({
      type: 'error',
      method: '*',
      pathPattern: '/users/*',
      probability: 0.25,
      params: { status: 503 },
    });
    expect(res.body.adminTokenHash).toBeUndefined();
  });
});
