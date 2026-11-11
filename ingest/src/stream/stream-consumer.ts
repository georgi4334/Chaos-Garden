import {
  BeforeApplicationShutdown,
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { INGEST_CONFIG, type IngestConfig } from '../config/ingest-config.js';
import { LogWriter } from '../logs/log-writer.js';
import { batchDuration, batchFailures, eventsProcessed, setLagSource } from '../observability/ingest-metrics.js';
import { REDIS, REDIS_BLOCKING } from './redis.providers.js';
import { parseEntry, type RequestEventV1 } from './request-event.js';

type StreamEntry = [id: string, fields: string[]];
/** XPENDING extended form: [id, consumer, idle ms, delivery count] */
type PendingEntry = [string, string, number, number];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Reads request events from the Redis Stream with a consumer group and stores them.
 *
 * Delivery is at-least-once:
 *  - an event is acknowledged (XACK) only after it is committed to Postgres;
 *  - if writing fails, the event stays pending and is retried once it has been
 *    idle for `claimIdleMs` (this also recovers events from a crashed instance);
 *  - after `maxDeliveries` attempts it moves to the dead-letter stream;
 *  - malformed events go straight to the dead-letter stream.
 * Retries can deliver an event twice, which the writer absorbs (event id is the primary key).
 */
@Injectable()
export class StreamConsumer
  implements OnApplicationBootstrap, BeforeApplicationShutdown, OnApplicationShutdown
{
  private readonly logger = new Logger(StreamConsumer.name);
  private running = false;
  private loop: Promise<void> | null = null;
  private lastRecoveryAt = 0;

  readonly counters = { stored: 0, duplicates: 0, deadLettered: 0, failedBatches: 0 };

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(REDIS_BLOCKING) private readonly blocking: Redis,
    @Inject(INGEST_CONFIG) private readonly config: IngestConfig,
    private readonly writer: LogWriter,
  ) {}

  async onApplicationBootstrap() {
    setLagSource(() => this.lag());
    await this.ensureGroup();
    if (this.config.autoStart) this.start();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.loop = this.run();
    this.logger.log(`Consuming ${this.config.stream} as ${this.config.group}/${this.config.consumer}`);
  }

  /** Stops after the current read returns (at most `blockMs`) and its batch is handled. */
  async stop() {
    this.running = false;
    await this.loop;
    this.loop = null;
  }

  async beforeApplicationShutdown() {
    await this.stop(); // finish the in-flight batch before the DB pool closes
  }

  async onApplicationShutdown() {
    await Promise.allSettled([this.redis.quit(), this.blocking.quit()]);
  }

  /** Creates the consumer group (and the stream) if missing. Starts from the beginning of the stream. */
  async ensureGroup() {
    try {
      await this.redis.xgroup('CREATE', this.config.stream, this.config.group, '0', 'MKSTREAM');
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes('BUSYGROUP')) throw err;
    }
  }

  private async run() {
    while (this.running) {
      try {
        if (Date.now() - this.lastRecoveryAt >= this.config.claimIdleMs / 2) {
          this.lastRecoveryAt = Date.now();
          await this.recoverStuck();
        }
        const result = (await this.blocking.xreadgroup(
          'GROUP',
          this.config.group,
          this.config.consumer,
          'COUNT',
          this.config.batchSize,
          'BLOCK',
          this.config.blockMs,
          'STREAMS',
          this.config.stream,
          '>',
        )) as Array<[string, StreamEntry[]]> | null;
        if (result) await this.handle(result[0][1]);
      } catch (err) {
        this.counters.failedBatches++;
        batchFailures.inc();
        this.logger.error(`Batch failed, will retry: ${(err as Error).message}`);
        await sleep(1000);
      }
    }
  }

  /** Stores a batch, then acknowledges it. Throws (without acknowledging) if the write fails. */
  async handle(entries: StreamEntry[]) {
    const good: Array<{ id: string; event: RequestEventV1 }> = [];
    for (const [id, fields] of entries) {
      if (!fields) {
        await this.ack([id]); // entry was trimmed from the stream; nothing left to process
        continue;
      }
      const parsed = parseEntry(fields);
      if (parsed.ok) good.push({ id, event: parsed.event });
      else await this.deadLetter(id, fields, parsed.reason);
    }
    if (good.length === 0) return;

    const endTimer = batchDuration.startTimer();
    const stored = await this.writer.write(good.map((g) => g.event));
    this.counters.stored += stored;
    this.counters.duplicates += good.length - stored;
    await this.ack(good.map((g) => g.id));
    endTimer();
    eventsProcessed.inc({ result: 'stored' }, stored);
    if (good.length > stored) eventsProcessed.inc({ result: 'duplicate' }, good.length - stored);
  }

  /**
   * Retries events that were delivered but never acknowledged for `claimIdleMs`
   * (a failed write, or an instance that crashed mid-batch). XCLAIM moves them to
   * this consumer and bumps their delivery count.
   */
  async recoverStuck() {
    const pending = (await this.redis.xpending(
      this.config.stream,
      this.config.group,
      'IDLE',
      this.config.claimIdleMs,
      '-',
      '+',
      this.config.batchSize,
    )) as PendingEntry[];
    if (pending.length === 0) return;

    const exhausted = pending.filter((p) => p[3] >= this.config.maxDeliveries).map((p) => p[0]);
    const retry = pending.filter((p) => p[3] < this.config.maxDeliveries).map((p) => p[0]);

    if (exhausted.length) {
      const claimed = await this.claim(exhausted);
      for (const [id, fields] of claimed) {
        await this.deadLetter(id, fields ?? [], `gave up after ${this.config.maxDeliveries} attempts`);
      }
      await this.ack(exhausted); // also clears ids whose entries were trimmed away
    }
    if (retry.length) {
      const claimed = await this.claim(retry);
      const missing = retry.filter((id) => !claimed.some(([cid]) => cid === id));
      if (missing.length) await this.ack(missing);
      await this.handle(claimed);
    }
  }

  private async claim(ids: string[]): Promise<StreamEntry[]> {
    const claimed = (await this.redis.xclaim(
      this.config.stream,
      this.config.group,
      this.config.consumer,
      this.config.claimIdleMs,
      ...ids,
    )) as Array<StreamEntry | null>;
    return claimed.filter((e): e is StreamEntry => e !== null);
  }

  private async deadLetter(id: string, fields: string[], reason: string) {
    await this.redis.xadd(
      this.config.deadLetterStream,
      'MAXLEN',
      '~',
      '10000',
      '*',
      'originalId',
      id,
      'reason',
      reason,
      'fields',
      JSON.stringify(fields),
    );
    await this.ack([id]);
    this.counters.deadLettered++;
    eventsProcessed.inc({ result: 'dead_lettered' });
    this.logger.warn({ msg: 'Dead-lettered event', streamId: id, reason, requestId: requestIdOf(fields) });
  }

  private async ack(ids: string[]) {
    if (ids.length) await this.redis.xack(this.config.stream, this.config.group, ...ids);
  }

  /** For /health: how far behind this group is. */
  async lag(): Promise<{ pending: number; lag: number | null }> {
    const groups = (await this.redis.xinfo('GROUPS', this.config.stream)) as unknown[][];
    for (const g of groups) {
      const info: Record<string, unknown> = {};
      for (let i = 0; i < g.length; i += 2) info[String(g[i])] = g[i + 1];
      if (info.name === this.config.group) {
        return { pending: Number(info.pending ?? 0), lag: info.lag === null || info.lag === undefined ? null : Number(info.lag) };
      }
    }
    return { pending: 0, lag: null };
  }
}

/** Best effort: the request id inside an event's JSON, for logging a dead-lettered entry. */
function requestIdOf(fields: string[]): string | undefined {
  const i = fields.indexOf('data');
  if (i === -1) return undefined;
  try {
    const id = (JSON.parse(fields[i + 1]) as { requestId?: unknown }).requestId;
    return typeof id === 'string' ? id : undefined;
  } catch {
    return undefined;
  }
}
