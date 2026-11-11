import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { lt } from 'drizzle-orm';
import { INGEST_CONFIG, type IngestConfig } from '../config/ingest-config.js';
import { DB, type Database } from '../database/database.module.js';
import { requestLogs, requestStatsMinute } from '../database/schema.js';

const DAY_MS = 86_400_000;

/** Deletes old request logs and stats on a timer, so the database doesn't grow forever. */
@Injectable()
export class RetentionService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(RetentionService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(INGEST_CONFIG) private readonly config: IngestConfig,
  ) {}

  onApplicationBootstrap() {
    if (!this.config.autoStart) return;
    this.timer = setInterval(() => {
      this.purge().catch((err: Error) => this.logger.error(`Retention failed: ${err.message}`));
    }, this.config.retentionIntervalMs);
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  async purge(now = new Date()) {
    const logs = await this.db
      .delete(requestLogs)
      .where(lt(requestLogs.occurredAt, new Date(now.getTime() - this.config.logRetentionDays * DAY_MS)))
      .returning({ id: requestLogs.eventId });
    const stats = await this.db
      .delete(requestStatsMinute)
      .where(lt(requestStatsMinute.bucket, new Date(now.getTime() - this.config.statsRetentionDays * DAY_MS)))
      .returning({ bucket: requestStatsMinute.bucket });
    if (logs.length || stats.length) {
      this.logger.log(`Deleted ${logs.length} old request logs and ${stats.length} old stat rows`);
    }
    return { logs: logs.length, stats: stats.length };
  }
}
