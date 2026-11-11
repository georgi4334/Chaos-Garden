import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { LogWriter } from '../src/logs/log-writer.js';
import { RetentionService } from '../src/retention/retention.service.js';
import type { RequestEventV1 } from '../src/stream/request-event.js';
import { StreamConsumer } from '../src/stream/stream-consumer.js';

// Needs local Redis and Postgres (database chaos_ingest, migrated).
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
process.env.DATABASE_URL ??= 'postgres://chaos:chaos@localhost:5432/chaos_ingest';
const KEY = 'ingest-test-key';

let producer: Redis;
const apps: INestApplication[] = [];

beforeAll(() => {
  producer = new Redis(REDIS_URL);
});
afterAll(async () => {
  await Promise.all(apps.map((a) => a.close()));
  await producer.quit();
});

/** Each test gets its own stream, so tests never see each other's events. */
async function startIngest(opts: { writer?: new (...args: never[]) => LogWriter } = {}) {
  const stream = `test:requests:${randomUUID()}`;
  Object.assign(process.env, {
    REDIS_URL,
    EVENT_STREAM: stream,
    CONSUMER_GROUP: 'ingest',
    CONSUMER_NAME: 'test-consumer',
    BLOCK_MS: '100',
    CLAIM_IDLE_MS: '300',
    MAX_DELIVERIES: '3',
    INTERNAL_API_KEY: KEY,
    INGEST_AUTOSTART: 'true',
  });
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (opts.writer) builder = builder.overrideProvider(LogWriter).useClass(opts.writer);
  const app = (await builder.compile()).createNestApplication();
  configureApp(app);
  await app.init();
  apps.push(app);
  return { app, stream, consumer: app.get(StreamConsumer) };
}

function event(over: Partial<RequestEventV1> & Pick<RequestEventV1, 'gardenId' | 'targetId'>): RequestEventV1 {
  return {
    v: 1,
    id: randomUUID(),
    at: new Date().toISOString(),
    targetName: 'api',
    method: 'GET',
    path: '/',
    status: 200,
    completed: true,
    durationMs: 20,
    faults: [],
    ruleIds: [],
    ...over,
  };
}

const publish = (stream: string, e: RequestEventV1 | string) =>
  producer.xadd(stream, '*', 'data', typeof e === 'string' ? e : JSON.stringify(e));

async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs = 5000) {
  const start = Date.now();
  while (!(await check())) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
}

const pendingCount = async (stream: string) =>
  Number(((await producer.xpending(stream, 'ingest')) as [number])[0]);

describe('Ingest service (e2e)', () => {
  it('stores events once, classifies them, and serves logs and stats', async () => {
    const { app, stream, consumer } = await startIngest();
    const garden = randomUUID();
    const t1 = randomUUID();
    const t2 = randomUUID();
    const first = event({ gardenId: garden, targetId: t1, path: '/users/1', requestId: 'trace-0001-from-proxy' });

    await publish(stream, first);
    await publish(stream, event({ gardenId: garden, targetId: t1, status: 503, faults: ['error'], durationMs: 4 }));
    await publish(stream, event({ gardenId: garden, targetId: t1, status: null, completed: false, faults: ['drop'] }));
    await publish(stream, event({ gardenId: garden, targetId: t1, faults: ['latency'], durationMs: 800 }));
    await publish(stream, event({ gardenId: garden, targetId: t2, status: 404 }));
    await publish(stream, event({ gardenId: garden, targetId: t2, status: 429, faults: ['rate_limited'], durationMs: 1 }));
    await publish(stream, first); // duplicate delivery of the same event

    await waitFor(() => consumer.counters.stored === 6 && consumer.counters.duplicates === 1);
    await waitFor(async () => (await pendingCount(stream)) === 0);

    const http = () => request(app.getHttpServer());
    await http().get(`/internal/gardens/${garden}/requests`).expect(401);

    const logs = await http().get(`/internal/gardens/${garden}/requests`).set('x-internal-key', KEY).expect(200);
    expect(logs.body.items).toHaveLength(6);
    const stored = logs.body.items.filter((i: { id: string }) => i.id === first.id);
    expect(stored).toHaveLength(1);
    expect(stored[0].requestId).toBe('trace-0001-from-proxy');
    expect(logs.body.items.map((i: { outcome: string }) => i.outcome).sort()).toEqual(
      ['drop', 'error', 'ok', 'rate_limited', 'slow', 'target_error'].sort(),
    );

    const stats = await http().get(`/internal/gardens/${garden}/stats?minutes=5`).set('x-internal-key', KEY).expect(200);
    expect(stats.body.totals).toMatchObject({ total: 6, ok: 1, slow: 1, error: 1, drop: 1, targetError: 1, rateLimited: 1, corrupt: 0 });
    expect(stats.body.totals.avgDurationMs).toBe(Math.round((20 + 4 + 20 + 800 + 20 + 1) / 6));

    const onlyT1 = await http()
      .get(`/internal/gardens/${garden}/stats?minutes=5&targetId=${t1}`)
      .set('x-internal-key', KEY)
      .expect(200);
    expect(onlyT1.body.totals.total).toBe(4);

    await http().get(`/internal/gardens/${garden}/stats?minutes=0`).set('x-internal-key', KEY).expect(400);
    await http().get(`/internal/gardens/${garden}/requests?targetId=nope`).set('x-internal-key', KEY).expect(400);

    const metrics = (await http().get('/metrics').expect(200)).text;
    expect(metrics).toMatch(/chaos_ingest_events_total\{[^}]*result="stored"[^}]*\} [1-9]/);
    expect(metrics).toMatch(/chaos_ingest_events_total\{[^}]*result="duplicate"[^}]*\} [1-9]/);
    expect(metrics).toMatch(/chaos_ingest_consumer_lag\{[^}]*service="ingest"[^}]*\} 0/);
    expect(metrics).toMatch(/chaos_ingest_batch_seconds_count\{[^}]*\} [1-9]/);

    const health = await http().get('/health').expect(200);
    expect(health.body).toMatchObject({ status: 'ok', db: 'up', redis: 'up', pending: 0 });
  });

  it('sends malformed events to the dead-letter stream and acknowledges them', async () => {
    const { stream, consumer } = await startIngest();
    await publish(stream, '{"v":1,"id":"not-a-uuid"}');
    await waitFor(() => consumer.counters.deadLettered === 1);
    const [[, fields]] = await producer.xrange(`${stream}:dead`, '-', '+');
    expect(fields).toContain('reason');
    expect(fields[fields.indexOf('reason') + 1]).toBe('id must be a UUID');
    expect(await pendingCount(stream)).toBe(0);
    await producer.del(`${stream}:dead`);
  });

  it('retries a failed write later and stores the event exactly once', async () => {
    let failuresLeft = 2;
    class FlakyWriter extends LogWriter {
      override async write(events: RequestEventV1[]) {
        if (failuresLeft-- > 0) throw new Error('database unavailable');
        return super.write(events);
      }
    }
    const { app, stream, consumer } = await startIngest({ writer: FlakyWriter });
    const garden = randomUUID();
    await publish(stream, event({ gardenId: garden, targetId: randomUUID() }));

    await waitFor(() => consumer.counters.stored === 1, 10_000);
    expect(consumer.counters.failedBatches).toBeGreaterThanOrEqual(2);
    expect(await pendingCount(stream)).toBe(0);
    const logs = await request(app.getHttpServer())
      .get(`/internal/gardens/${garden}/requests`)
      .set('x-internal-key', KEY)
      .expect(200);
    expect(logs.body.items).toHaveLength(1);
  });

  it('gives up after the maximum attempts and dead-letters the event', async () => {
    class BrokenWriter extends LogWriter {
      override async write(): Promise<number> {
        throw new Error('database unavailable');
      }
    }
    const { stream, consumer } = await startIngest({ writer: BrokenWriter });
    const e = event({ gardenId: randomUUID(), targetId: randomUUID() });
    await publish(stream, e);

    await waitFor(() => consumer.counters.deadLettered === 1, 15_000);
    const [[, fields]] = await producer.xrange(`${stream}:dead`, '-', '+');
    expect(fields[fields.indexOf('reason') + 1]).toBe('gave up after 3 attempts');
    expect(JSON.parse(fields[fields.indexOf('fields') + 1])).toEqual(['data', JSON.stringify(e)]);
    expect(await pendingCount(stream)).toBe(0);
    await producer.del(`${stream}:dead`);
  }, 20_000);

  it('purges request logs older than the retention period', async () => {
    const { app } = await startIngest();
    const garden = randomUUID();
    const writer = app.get(LogWriter);
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
    await writer.write([
      event({ gardenId: garden, targetId: randomUUID(), at: tenDaysAgo }),
      event({ gardenId: garden, targetId: randomUUID() }),
    ]);
    const purged = await app.get(RetentionService).purge();
    expect(purged.logs).toBeGreaterThanOrEqual(1);

    const logs = await request(app.getHttpServer())
      .get(`/internal/gardens/${garden}/requests`)
      .set('x-internal-key', KEY)
      .expect(200);
    expect(logs.body.items).toHaveLength(1);
  });
});
