import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DB, type Database } from '../database/database.module.js';
import { requestLogs, requestStatsMinute } from '../database/schema.js';
import { classify, type Outcome, type RequestEventV1 } from '../stream/request-event.js';
import { aggregateByMinute } from './aggregate.js';

/** Writes a batch of events: request logs and per-minute stats, in one transaction. */
@Injectable()
export class LogWriter {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Returns how many events were new. Already-stored events are skipped and not counted twice. */
  async write(events: RequestEventV1[]): Promise<number> {
    // The same event can appear twice in one batch after a redelivery.
    const unique = [...new Map(events.map((e) => [e.id, e])).values()];
    if (unique.length === 0) return 0;

    return this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(requestLogs)
        .values(
          unique.map((e) => ({
            eventId: e.id,
            gardenId: e.gardenId,
            targetId: e.targetId,
            targetName: e.targetName,
            method: e.method,
            path: e.path,
            status: e.status,
            completed: e.completed,
            durationMs: Math.round(e.durationMs),
            outcome: classify(e),
            faults: e.faults,
            ruleIds: e.ruleIds,
            requestId: e.requestId ?? null,
            occurredAt: new Date(e.at),
          })),
        )
        // Idempotency: an event that is already stored is skipped...
        .onConflictDoNothing({ target: requestLogs.eventId })
        // ...and only rows actually inserted feed the stats below.
        .returning({
          gardenId: requestLogs.gardenId,
          targetId: requestLogs.targetId,
          occurredAt: requestLogs.occurredAt,
          outcome: requestLogs.outcome,
          durationMs: requestLogs.durationMs,
        });

      if (inserted.length === 0) return 0;

      const buckets = aggregateByMinute(inserted.map((r) => ({ ...r, outcome: r.outcome as Outcome })));
      const add = (column: keyof typeof requestStatsMinute.$inferInsert & string) =>
        sql.raw(`"request_stats_minute"."${toSnake(column)}" + excluded."${toSnake(column)}"`);

      await tx
        .insert(requestStatsMinute)
        .values(buckets)
        .onConflictDoUpdate({
          target: [requestStatsMinute.gardenId, requestStatsMinute.targetId, requestStatsMinute.bucket],
          set: {
            total: add('total'),
            ok: add('ok'),
            slow: add('slow'),
            error: add('error'),
            drop: add('drop'),
            corrupt: add('corrupt'),
            targetError: add('targetError'),
            noResponse: add('noResponse'),
            rateLimited: add('rateLimited'),
            durationMsSum: add('durationMsSum'),
          },
        });
      return inserted.length;
    });
  }
}

function toSnake(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}
