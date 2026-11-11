import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

process.env.DATABASE_URL ??= 'postgres://chaos:chaos@localhost:5432/chaos_garden';
const KEY = 'logs-test-key';

describe('Request logs (e2e)', () => {
  let app: INestApplication;
  let ingest: http.Server;
  let ingestPort: number;
  const seen: Array<{ url: string; key: string | undefined; requestId?: string }> = [];

  beforeAll(async () => {
    // Stub ingest service: checks the internal key and echoes what it was asked.
    ingest = http.createServer((req, res) => {
      seen.push({
        url: req.url ?? '',
        key: req.headers['x-internal-key'] as string | undefined,
        requestId: req.headers['x-request-id'] as string | undefined,
      });
      res.setHeader('content-type', 'application/json');
      if (req.headers['x-internal-key'] !== KEY) {
        res.statusCode = 401;
        return res.end('{}');
      }
      res.end(JSON.stringify({ stub: true, url: req.url }));
    });
    await new Promise<void>((r) => ingest.listen(0, '127.0.0.1', r));
    ingestPort = (ingest.address() as AddressInfo).port;

    process.env.INTERNAL_API_KEY = KEY;
    process.env.INGEST_URL = `http://127.0.0.1:${ingestPort}`;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await new Promise((r) => ingest.close(r));
  });

  async function newGarden() {
    const res = await request(app.getHttpServer()).post('/gardens').send({ name: 'logs' }).expect(201);
    return res.body as { id: string; adminToken: string };
  }

  it('requires the garden admin token', async () => {
    const g = await newGarden();
    const other = await newGarden();
    await request(app.getHttpServer()).get(`/gardens/${g.id}/requests`).expect(401);
    await request(app.getHttpServer())
      .get(`/gardens/${g.id}/stats`)
      .set('Authorization', `Bearer ${other.adminToken}`)
      .expect(401);
  });

  it('forwards to the ingest service with the internal key and the validated query', async () => {
    const g = await newGarden();
    const auth = { Authorization: `Bearer ${g.adminToken}` };
    const target = '22222222-2222-4222-8222-222222222222';
    seen.length = 0;

    const logs = await request(app.getHttpServer())
      .get(`/gardens/${g.id}/requests?limit=20&targetId=${target}&before=2026-11-11T10:00:00.000Z`)
      .set(auth)
      .set('x-request-id', 'dashboard-req-0001')
      .expect(200);
    expect(seen[0].requestId).toBe('dashboard-req-0001'); // the same id reaches the ingest service
    expect(logs.body.stub).toBe(true);
    expect(seen[0].key).toBe(KEY);
    expect(seen[0].url).toBe(
      `/internal/gardens/${g.id}/requests?limit=20&targetId=${target}&before=2026-11-11T10%3A00%3A00.000Z`,
    );

    await request(app.getHttpServer()).get(`/gardens/${g.id}/stats?minutes=15`).set(auth).expect(200);
    expect(seen[1].url).toBe(`/internal/gardens/${g.id}/stats?minutes=15`);
  });

  it('rejects bad query parameters before calling the ingest service', async () => {
    const g = await newGarden();
    const auth = { Authorization: `Bearer ${g.adminToken}` };
    seen.length = 0;
    await request(app.getHttpServer()).get(`/gardens/${g.id}/requests?limit=500`).set(auth).expect(400);
    await request(app.getHttpServer()).get(`/gardens/${g.id}/requests?targetId=nope`).set(auth).expect(400);
    await request(app.getHttpServer()).get(`/gardens/${g.id}/stats?minutes=0`).set(auth).expect(400);
    await request(app.getHttpServer()).get(`/gardens/${g.id}/stats?extra=1`).set(auth).expect(400);
    expect(seen).toHaveLength(0);
  });

  it('answers 503 with a clear message when the ingest service is down', async () => {
    const g = await newGarden();
    const saved = process.env.INGEST_URL;
    process.env.INGEST_URL = 'http://127.0.0.1:1'; // nothing listens here
    try {
      const res = await request(app.getHttpServer())
        .get(`/gardens/${g.id}/requests`)
        .set('Authorization', `Bearer ${g.adminToken}`)
        .expect(503);
      expect(res.body.message).toBe('Request logs are unavailable right now.');
    } finally {
      process.env.INGEST_URL = saved;
    }
  });
});
