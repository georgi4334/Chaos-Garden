import type { Provider } from '@nestjs/common';
import { Redis } from 'ioredis';
import { INGEST_CONFIG, type IngestConfig } from '../config/ingest-config.js';

/** For normal commands (XACK, XCLAIM, XADD, ...). */
export const REDIS = Symbol('REDIS');
/**
 * For XREADGROUP ... BLOCK. A blocking read occupies its connection until it
 * returns, so it gets a connection of its own.
 */
export const REDIS_BLOCKING = Symbol('REDIS_BLOCKING');

export const redisProviders: Provider[] = [
  {
    provide: REDIS,
    inject: [INGEST_CONFIG],
    useFactory: (config: IngestConfig) => new Redis(config.redisUrl, { maxRetriesPerRequest: 3 }),
  },
  {
    provide: REDIS_BLOCKING,
    inject: [INGEST_CONFIG],
    useFactory: (config: IngestConfig) => new Redis(config.redisUrl, { maxRetriesPerRequest: 3 }),
  },
];
