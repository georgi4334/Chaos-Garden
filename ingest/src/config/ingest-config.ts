import { ConfigService } from '@nestjs/config';
import os from 'node:os';

export const INGEST_CONFIG = Symbol('INGEST_CONFIG');

export interface IngestConfig {
  redisUrl: string;
  /** Stream the proxy writes request events to. */
  stream: string;
  /** Consumer group: every ingest instance joins it, and each event goes to one of them. */
  group: string;
  /** This instance's name inside the group. Must be unique per running instance. */
  consumer: string;
  batchSize: number;
  /** How long one read waits for new events before looping. Also bounds shutdown time. */
  blockMs: number;
  /** An event unacknowledged for this long is considered stuck and is retried. */
  claimIdleMs: number;
  /** After this many delivery attempts an event goes to the dead-letter stream. */
  maxDeliveries: number;
  deadLetterStream: string;
  /** Start consuming on boot. Tests turn this off to control timing. */
  autoStart: boolean;
  logRetentionDays: number;
  statsRetentionDays: number;
  retentionIntervalMs: number;
  internalApiKey: string;
}

export function loadIngestConfig(config: ConfigService): IngestConfig {
  const num = (key: string, fallback: number) => {
    const value = Number(config.get<string>(key) ?? fallback);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  const stream = config.get<string>('EVENT_STREAM') ?? 'chaos:requests';
  return {
    redisUrl: config.get<string>('REDIS_URL') ?? 'redis://localhost:6379',
    stream,
    group: config.get<string>('CONSUMER_GROUP') ?? 'ingest',
    consumer: config.get<string>('CONSUMER_NAME') ?? `${os.hostname()}-${process.pid}`,
    batchSize: num('BATCH_SIZE', 200),
    blockMs: num('BLOCK_MS', 2000),
    claimIdleMs: num('CLAIM_IDLE_MS', 30_000),
    maxDeliveries: num('MAX_DELIVERIES', 5),
    deadLetterStream: config.get<string>('DEAD_LETTER_STREAM') ?? `${stream}:dead`,
    autoStart: config.get<string>('INGEST_AUTOSTART') !== 'false',
    logRetentionDays: num('LOG_RETENTION_DAYS', 7),
    statsRetentionDays: num('STATS_RETENTION_DAYS', 30),
    retentionIntervalMs: num('RETENTION_INTERVAL_MS', 3_600_000),
    internalApiKey: config.get<string>('INTERNAL_API_KEY') ?? '',
  };
}
