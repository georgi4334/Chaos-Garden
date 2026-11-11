import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, lt, sql, type SQL } from 'drizzle-orm';
import { DB, type Database } from '../database/database.module.js';
import { requestLogs, requestStatsMinute } from '../database/schema.js';
import { minuteOf } from './aggregate.js';

const COUNT_COLUMNS = [
  'total',
  'ok',
  'slow',
  'error',
  'drop',
  'corrupt',
  'targetError',
  'noResponse',
  'rateLimited',
] as const;
type CountColumn = (typeof COUNT_COLUMNS)[number];
export type Counts = Record<CountColumn, number> & { avgDurationMs: number | null };

@Injectable()
export class LogsQueryService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Newest first. Pass the last item's `occurredAt` as `before` to page back. */
  async recent(gardenId: string, opts: { limit: number; targetId?: string; before?: Date }) {
    const where: SQL[] = [eq(requestLogs.gardenId, gardenId)];
    if (opts.targetId) where.push(eq(requestLogs.targetId, opts.targetId));
    if (opts.before) where.push(lt(requestLogs.occurredAt, opts.before));

    const rows = await this.db
      .select({
        id: requestLogs.eventId,
        targetId: requestLogs.targetId,
        targetName: requestLogs.targetName,
        method: requestLogs.method,
        path: requestLogs.path,
        status: requestLogs.status,
        outcome: requestLogs.outcome,
        durationMs: requestLogs.durationMs,
        faults: requestLogs.faults,
        occurredAt: requestLogs.occurredAt,
      })
      .from(requestLogs)
      .where(and(...where))
      .orderBy(desc(requestLogs.occurredAt), desc(requestLogs.eventId))
      .limit(opts.limit);
    return { items: rows, nextBefore: rows.length === opts.limit ? rows[rows.length - 1].occurredAt : null };
  }

  /** Per-minute counts for the last `minutes` minutes (all targets summed unless one is given). */
  async stats(gardenId: string, opts: { minutes: number; targetId?: string; now?: Date }) {
    const to = minuteOf(opts.now ?? new Date());
    const from = new Date(to.getTime() - (opts.minutes - 1) * 60_000);
    const where: SQL[] = [eq(requestStatsMinute.gardenId, gardenId), gte(requestStatsMinute.bucket, from)];
    if (opts.targetId) where.push(eq(requestStatsMinute.targetId, opts.targetId));

    const sum = (col: CountColumn) => sql<number>`coalesce(sum(${requestStatsMinute[col]}), 0)::int`;
    const rows = await this.db
      .select({
        bucket: requestStatsMinute.bucket,
        total: sum('total'),
        ok: sum('ok'),
        slow: sum('slow'),
        error: sum('error'),
        drop: sum('drop'),
        corrupt: sum('corrupt'),
        targetError: sum('targetError'),
        noResponse: sum('noResponse'),
        rateLimited: sum('rateLimited'),
        durationMsSum: sql<number>`coalesce(sum(${requestStatsMinute.durationMsSum}), 0)::bigint`,
      })
      .from(requestStatsMinute)
      .where(and(...where))
      .groupBy(requestStatsMinute.bucket)
      .orderBy(asc(requestStatsMinute.bucket));

    const buckets = rows.map((r) => withAverage(r));
    const totals = withAverage(
      rows.reduce(
        (acc, r) => {
          for (const c of COUNT_COLUMNS) acc[c] += r[c];
          acc.durationMsSum += Number(r.durationMsSum);
          return acc;
        },
        { total: 0, ok: 0, slow: 0, error: 0, drop: 0, corrupt: 0, targetError: 0, noResponse: 0, rateLimited: 0, durationMsSum: 0 },
      ),
    );
    return { from, to, totals, buckets };
  }
}

function withAverage<T extends { total: number; durationMsSum: number | string }>(row: T) {
  const { durationMsSum, ...rest } = row;
  const sum = Number(durationMsSum);
  return { ...rest, avgDurationMs: row.total > 0 ? Math.round(sum / row.total) : null };
}
