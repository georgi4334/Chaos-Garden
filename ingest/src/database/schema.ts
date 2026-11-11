import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * One row per proxied request. The event id from the proxy is the primary key,
 * which is what makes ingestion idempotent: a redelivered event is ignored.
 */
export const requestLogs = pgTable(
  'request_logs',
  {
    eventId: uuid('event_id').primaryKey(),
    gardenId: uuid('garden_id').notNull(),
    targetId: uuid('target_id').notNull(),
    targetName: text('target_name').notNull(),
    method: text('method').notNull(),
    path: text('path').notNull(),
    status: integer('status'),
    completed: boolean('completed').notNull(),
    durationMs: integer('duration_ms').notNull(),
    outcome: text('outcome').notNull(),
    faults: text('faults').array().notNull().default([]),
    ruleIds: text('rule_ids').array().notNull().default([]),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('request_logs_garden_time_idx').on(t.gardenId, t.occurredAt.desc())],
);

/** Pre-aggregated counts per garden, target and minute, so stats queries stay cheap. */
export const requestStatsMinute = pgTable(
  'request_stats_minute',
  {
    gardenId: uuid('garden_id').notNull(),
    targetId: uuid('target_id').notNull(),
    bucket: timestamp('bucket', { withTimezone: true }).notNull(),
    total: integer('total').notNull().default(0),
    ok: integer('ok').notNull().default(0),
    slow: integer('slow').notNull().default(0),
    error: integer('error').notNull().default(0),
    drop: integer('drop').notNull().default(0),
    corrupt: integer('corrupt').notNull().default(0),
    targetError: integer('target_error').notNull().default(0),
    noResponse: integer('no_response').notNull().default(0),
    rateLimited: integer('rate_limited').notNull().default(0),
    durationMsSum: bigint('duration_ms_sum', { mode: 'number' }).notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.gardenId, t.targetId, t.bucket] }),
    index('request_stats_garden_bucket_idx').on(t.gardenId, t.bucket),
  ],
);
