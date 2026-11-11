import { aggregateByMinute, minuteOf } from './aggregate.js';

const G = 'g';
const at = (iso: string) => new Date(iso);

describe('aggregateByMinute', () => {
  it('rounds down to the minute', () => {
    expect(minuteOf(at('2026-11-11T10:04:59.999Z')).toISOString()).toBe('2026-11-11T10:04:00.000Z');
  });

  it('groups by garden, target and minute and counts each outcome', () => {
    const buckets = aggregateByMinute([
      { gardenId: G, targetId: 'a', occurredAt: at('2026-11-11T10:00:01Z'), outcome: 'ok', durationMs: 10 },
      { gardenId: G, targetId: 'a', occurredAt: at('2026-11-11T10:00:59Z'), outcome: 'error', durationMs: 5 },
      { gardenId: G, targetId: 'a', occurredAt: at('2026-11-11T10:00:30Z'), outcome: 'target_error', durationMs: 7 },
      { gardenId: G, targetId: 'a', occurredAt: at('2026-11-11T10:01:00Z'), outcome: 'slow', durationMs: 900 },
      { gardenId: G, targetId: 'b', occurredAt: at('2026-11-11T10:00:10Z'), outcome: 'no_response', durationMs: 3 },
    ]);
    expect(buckets).toHaveLength(3);
    const first = buckets.find((b) => b.targetId === 'a' && b.bucket.toISOString() === '2026-11-11T10:00:00.000Z')!;
    expect(first).toMatchObject({ total: 3, ok: 1, error: 1, targetError: 1, slow: 0, durationMsSum: 22 });
    expect(buckets.find((b) => b.targetId === 'b')).toMatchObject({ total: 1, noResponse: 1 });
  });

  it('returns nothing for no rows', () => {
    expect(aggregateByMinute([])).toEqual([]);
  });
});
