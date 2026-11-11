import type { Outcome } from '../stream/request-event.js';

export interface LoggedRequest {
  gardenId: string;
  targetId: string;
  occurredAt: Date;
  outcome: Outcome;
  durationMs: number;
}

export interface MinuteBucket {
  gardenId: string;
  targetId: string;
  bucket: Date;
  total: number;
  ok: number;
  slow: number;
  error: number;
  drop: number;
  corrupt: number;
  targetError: number;
  noResponse: number;
  durationMsSum: number;
}

const OUTCOME_COLUMN: Record<Outcome, keyof MinuteBucket> = {
  ok: 'ok',
  slow: 'slow',
  error: 'error',
  drop: 'drop',
  corrupt: 'corrupt',
  target_error: 'targetError',
  no_response: 'noResponse',
};

export function minuteOf(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 60_000) * 60_000);
}

/** Folds requests into per-garden, per-target, per-minute counts. */
export function aggregateByMinute(rows: LoggedRequest[]): MinuteBucket[] {
  const buckets = new Map<string, MinuteBucket>();
  for (const row of rows) {
    const bucket = minuteOf(row.occurredAt);
    const key = `${row.gardenId}|${row.targetId}|${bucket.getTime()}`;
    let b = buckets.get(key);
    if (!b) {
      b = {
        gardenId: row.gardenId,
        targetId: row.targetId,
        bucket,
        total: 0,
        ok: 0,
        slow: 0,
        error: 0,
        drop: 0,
        corrupt: 0,
        targetError: 0,
        noResponse: 0,
        durationMsSum: 0,
      };
      buckets.set(key, b);
    }
    b.total++;
    (b[OUTCOME_COLUMN[row.outcome]] as number)++;
    b.durationMsSum += row.durationMs;
  }
  return [...buckets.values()];
}
