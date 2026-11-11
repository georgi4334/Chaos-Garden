import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type pg from 'pg';
import { PG_POOL } from '../database/database.module.js';
import { REDIS } from '../stream/redis.providers.js';
import { StreamConsumer } from '../stream/stream-consumer.js';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly consumer: StreamConsumer,
  ) {}

  /** Up if Postgres and Redis answer. `lag` is how many events the group has not read yet. */
  @Get()
  async check() {
    const [db, redis] = await Promise.allSettled([this.pool.query('select 1'), this.redis.ping()]);
    const body = {
      status: db.status === 'fulfilled' && redis.status === 'fulfilled' ? 'ok' : 'error',
      db: db.status === 'fulfilled' ? 'up' : 'down',
      redis: redis.status === 'fulfilled' ? 'up' : 'down',
      ...(redis.status === 'fulfilled' ? await this.consumer.lag().catch(() => ({})) : {}),
      counters: this.consumer.counters,
    };
    if (body.status !== 'ok') throw new ServiceUnavailableException(body);
    return body;
  }
}
