import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

process.env.DATABASE_URL ??= 'postgres://chaos:chaos@localhost:5432/chaos_garden';

/** Value of the first sample of `name` whose labels include all of `labels` (label order doesn't matter). */
function metricValue(text: string, name: string, labels: Record<string, string>): number {
  for (const line of text.split('\n')) {
    const m = line.match(/^([a-zA-Z_:][\w:]*)\{(.*)\} (\S+)$/);
    if (!m || m[1] !== name) continue;
    const found = Object.fromEntries([...m[2].matchAll(/(\w+)="((?:[^"\\]|\\.)*)"/g)].map((x) => [x[1], x[2]]));
    if (Object.entries(labels).every(([k, v]) => found[k] === v)) return Number(m[3]);
  }
  return Number.NaN;
}

describe('Observability (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns a request id on every response, keeping a valid incoming one', async () => {
    const fresh = await request(app.getHttpServer()).get('/health').expect(200);
    expect(fresh.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    const kept = await request(app.getHttpServer()).get('/health').set('x-request-id', 'from-the-dashboard-42').expect(200);
    expect(kept.headers['x-request-id']).toBe('from-the-dashboard-42');
  });

  it('exposes RED metrics by route template, never with real ids in the labels', async () => {
    const g = (await request(app.getHttpServer()).post('/gardens').send({ name: 'metrics' }).expect(201)).body;
    await request(app.getHttpServer()).get(`/gardens/${g.id}`).set('Authorization', `Bearer ${g.adminToken}`).expect(200);
    await request(app.getHttpServer()).get(`/gardens/${g.id}`).expect(401);
    await request(app.getHttpServer()).get('/no/such/route').expect(404);

    const res = await request(app.getHttpServer()).get('/metrics').expect(200);
    const text = res.text;
    const count = (labels: Record<string, string>) =>
      metricValue(text, 'http_server_requests_seconds_count', { service: 'control-api', ...labels });
    expect(count({ method: 'POST', route: '/gardens', status_code: '201' })).toBeGreaterThan(0);
    expect(count({ method: 'GET', route: '/gardens/:gardenId', status_code: '200' })).toBeGreaterThan(0);
    expect(count({ method: 'GET', route: '/gardens/:gardenId', status_code: '401' })).toBeGreaterThan(0);
    expect(count({ method: 'GET', route: 'unmatched', status_code: '404' })).toBeGreaterThan(0);
    expect(text).not.toContain(g.id);
    expect(text).not.toContain('/no/such/route');
    // scrapes and health checks are not counted
    expect(text).not.toMatch(/route="\/metrics"/);
  });

  it('can require a token for /metrics', async () => {
    process.env.METRICS_TOKEN = 'scrape-secret';
    try {
      await request(app.getHttpServer()).get('/metrics').expect(401);
      await request(app.getHttpServer()).get('/metrics').set('Authorization', 'Bearer scrape-secret').expect(200);
    } finally {
      delete process.env.METRICS_TOKEN;
    }
  });
});
