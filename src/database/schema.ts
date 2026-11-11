import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const faultType = pgEnum('fault_type', [
  'latency',
  'error',
  'drop',
  'corrupt',
]);

export const gardens = pgTable('gardens', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  adminTokenHash: text('admin_token_hash').notNull(),
  /** Proxy rate limit for this garden: sustained requests per second, and burst size. */
  rateLimitRps: integer('rate_limit_rps').notNull().default(10),
  rateLimitBurst: integer('rate_limit_burst').notNull().default(20),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const targets = pgTable('targets', {
  id: uuid('id').primaryKey().defaultRandom(),
  gardenId: uuid('garden_id')
    .notNull()
    .references(() => gardens.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  baseUrl: text('base_url').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const faultRules = pgTable('fault_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  targetId: uuid('target_id')
    .notNull()
    .references(() => targets.id, { onDelete: 'cascade' }),
  method: text('method').notNull().default('*'),
  pathPattern: text('path_pattern').notNull().default('/*'),
  type: faultType('type').notNull(),
  probability: numeric('probability', { precision: 4, scale: 3 })
    .notNull()
    .default('1'),
  params: jsonb('params').$type<Record<string, unknown>>().notNull().default({}),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
