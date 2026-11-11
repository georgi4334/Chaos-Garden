import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

process.env.DATABASE_URL ??= 'postgres://chaos:chaos@localhost:5432/chaos_garden';

describe('Control API (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function newGarden(name = 'test garden') {
    const res = await http().post('/gardens').send({ name }).expect(201);
    return res.body as { id: string; adminToken: string; name: string };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('health reports db up', async () => {
    const res = await http().get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', db: 'up' });
  });

  describe('gardens and auth', () => {
    it('creates a garden and returns the token once, without the hash', async () => {
      const g = await newGarden();
      expect(g.adminToken).toBeTruthy();
      const got = await http().get(`/gardens/${g.id}`).set(auth(g.adminToken)).expect(200);
      expect(got.body.adminToken).toBeUndefined();
      expect(got.body.adminTokenHash).toBeUndefined();
    });

    it('rejects invalid garden bodies', async () => {
      await http().post('/gardens').send({}).expect(400);
      await http().post('/gardens').send({ name: 'x', extra: 1 }).expect(400);
    });

    it('rejects missing and wrong tokens', async () => {
      const g = await newGarden();
      await http().get(`/gardens/${g.id}`).expect(401);
      await http().get(`/gardens/${g.id}`).set(auth('nope')).expect(401);
    });

    it("a token for garden A cannot access garden B", async () => {
      const a = await newGarden('A');
      const b = await newGarden('B');
      await http().get(`/gardens/${b.id}`).set(auth(a.adminToken)).expect(401);
      await http().get(`/gardens/${b.id}/targets`).set(auth(a.adminToken)).expect(401);
    });

    it('renames and deletes a garden', async () => {
      const g = await newGarden();
      const renamed = await http()
        .patch(`/gardens/${g.id}`)
        .set(auth(g.adminToken))
        .send({ name: 'renamed' })
        .expect(200);
      expect(renamed.body.name).toBe('renamed');
      await http().delete(`/gardens/${g.id}`).set(auth(g.adminToken)).expect(204);
      await http().get(`/gardens/${g.id}`).set(auth(g.adminToken)).expect(401);
    });
  });

  describe('targets and rules', () => {
    it('runs full CRUD and cascades on delete', async () => {
      const g = await newGarden();
      const h = auth(g.adminToken);

      const target = (
        await http()
          .post(`/gardens/${g.id}/targets`)
          .set(h)
          .send({ name: 'api', baseUrl: 'http://localhost:4000' })
          .expect(201)
      ).body;

      await http()
        .post(`/gardens/${g.id}/targets`)
        .set(h)
        .send({ name: 'bad', baseUrl: 'not-a-url' })
        .expect(400);

      const rulesUrl = `/gardens/${g.id}/targets/${target.id}/rules`;
      const rule = (
        await http()
          .post(rulesUrl)
          .set(h)
          .send({ type: 'error', probability: 0.5, params: { status: 503 } })
          .expect(201)
      ).body;
      expect(rule).toMatchObject({ type: 'error', params: { status: 503 }, enabled: true });
      expect(Number(rule.probability)).toBeCloseTo(0.5);

      // validation failures
      await http().post(rulesUrl).set(h).send({ type: 'error', params: { status: 200 } }).expect(400);
      await http().post(rulesUrl).set(h).send({ type: 'latency', probability: 1.5, params: { ms: 10 } }).expect(400);
      await http().post(rulesUrl).set(h).send({ type: 'nope' }).expect(400);

      const updated = await http()
        .patch(`${rulesUrl}/${rule.id}`)
        .set(h)
        .send({ enabled: false })
        .expect(200);
      expect(updated.body.enabled).toBe(false);
      expect(updated.body.params).toEqual({ status: 503 });

      const list = await http().get(rulesUrl).set(h).expect(200);
      expect(list.body).toHaveLength(1);

      await http().delete(`${rulesUrl}/${rule.id}`).set(h).expect(204);
      await http().get(`${rulesUrl}/${rule.id}`).set(h).expect(404);

      await http().post(rulesUrl).set(h).send({ type: 'drop' }).expect(201);
      await http().delete(`/gardens/${g.id}`).set(h).expect(204);
    });

    it('keeps rules and targets in creation order, even after an update', async () => {
      const g = await newGarden();
      const h = auth(g.adminToken);
      const mk = async (name: string) =>
        (await http().post(`/gardens/${g.id}/targets`).set(h).send({ name, baseUrl: 'http://localhost:4000' }).expect(201)).body;
      const t1 = await mk('first');
      await mk('second');
      const rulesUrl = `/gardens/${g.id}/targets/${t1.id}/rules`;
      const types = ['drop', 'corrupt', 'error'];
      const ids: string[] = [];
      for (const type of types) {
        const body = type === 'error' ? { type, params: { status: 500 } } : { type };
        ids.push((await http().post(rulesUrl).set(h).send(body).expect(201)).body.id);
      }

      // Updating the oldest rule rewrites its row; the list order must not change.
      await http().patch(`${rulesUrl}/${ids[0]}`).set(h).send({ enabled: false }).expect(200);
      await http().patch(`/gardens/${g.id}/targets/${t1.id}`).set(h).send({ name: 'first', baseUrl: 'http://localhost:4001' }).expect(200);

      const rules = (await http().get(rulesUrl).set(h).expect(200)).body;
      expect(rules.map((r: { type: string }) => r.type)).toEqual(types);
      const targets = (await http().get(`/gardens/${g.id}/targets`).set(h).expect(200)).body;
      expect(targets.map((t: { name: string }) => t.name)).toEqual(['first', 'second']);
    });

    it("cannot reach another garden's target through your own garden id", async () => {
      const a = await newGarden('A');
      const b = await newGarden('B');
      const target = (
        await http()
          .post(`/gardens/${b.id}/targets`)
          .set(auth(b.adminToken))
          .send({ name: 'b-api', baseUrl: 'http://localhost:5000' })
          .expect(201)
      ).body;
      await http().get(`/gardens/${a.id}/targets/${target.id}`).set(auth(a.adminToken)).expect(404);
      await http()
        .post(`/gardens/${a.id}/targets/${target.id}/rules`)
        .set(auth(a.adminToken))
        .send({ type: 'drop' })
        .expect(404);
    });
  });
});
