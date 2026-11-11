import { Counter, Gauge, Histogram } from 'prom-client';
import { registry } from './metrics.js';

export const eventsProcessed = new Counter({
  name: 'chaos_ingest_events_total',
  help: 'Events handled: stored, duplicate (already stored), or dead_lettered',
  labelNames: ['result'] as const,
  registers: [registry],
});

export const batchFailures = new Counter({
  name: 'chaos_ingest_batch_failures_total',
  help: 'Batches that failed to store and will be retried',
  registers: [registry],
});

export const batchDuration = new Histogram({
  name: 'chaos_ingest_batch_seconds',
  help: 'Time to store one batch and acknowledge it',
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

/** Set by the stream consumer; read on every scrape so the gauges are always current. */
let lagSource: (() => Promise<{ pending: number; lag: number | null }>) | null = null;
export function setLagSource(source: typeof lagSource) {
  lagSource = source;
}

export const consumerPending = new Gauge({
  name: 'chaos_ingest_consumer_pending',
  help: 'Events delivered to the consumer group but not yet acknowledged',
  registers: [registry],
  async collect() {
    if (!lagSource) return;
    try {
      this.set((await lagSource()).pending);
    } catch {
      // Redis unavailable: keep the last value
    }
  },
});

export const consumerLag = new Gauge({
  name: 'chaos_ingest_consumer_lag',
  help: 'Events in the stream the consumer group has not read yet (how far behind ingest is)',
  registers: [registry],
  async collect() {
    if (!lagSource) return;
    try {
      const { lag } = await lagSource();
      if (lag !== null) this.set(lag);
    } catch {
      // Redis unavailable: keep the last value
    }
  },
});
