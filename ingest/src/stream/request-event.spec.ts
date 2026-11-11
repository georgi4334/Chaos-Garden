import { classify, parseEntry, type RequestEventV1 } from './request-event.js';

const valid: RequestEventV1 = {
  v: 1,
  id: '0b0c6f0e-6f45-4a39-9a4c-2d8a9a1f5c11',
  at: '2026-11-11T10:00:00.000Z',
  gardenId: '11111111-1111-4111-8111-111111111111',
  targetId: '22222222-2222-4222-8222-222222222222',
  targetName: 'api',
  method: 'GET',
  path: '/users',
  status: 200,
  completed: true,
  durationMs: 12,
  faults: [],
  ruleIds: [],
};
const entry = (data: unknown) => ['data', typeof data === 'string' ? data : JSON.stringify(data)];

describe('parseEntry', () => {
  it('accepts a valid event, including a null status', () => {
    expect(parseEntry(entry(valid))).toEqual({ ok: true, event: valid });
    expect(parseEntry(entry({ ...valid, status: null, completed: false })).ok).toBe(true);
  });

  it.each([
    ['no data field', ['other', 'x']],
    ['bad JSON', entry('{not json')],
    ['wrong version', entry({ ...valid, v: 2 })],
    ['id not a uuid', entry({ ...valid, id: 'abc' })],
    ['garden not a uuid', entry({ ...valid, gardenId: 'g1' })],
    ['bad date', entry({ ...valid, at: 'yesterday' })],
    ['bad status', entry({ ...valid, status: 99 })],
    ['negative duration', entry({ ...valid, durationMs: -1 })],
    ['faults not strings', entry({ ...valid, faults: [1] })],
    ['missing completed', entry({ ...valid, completed: undefined })],
  ])('rejects %s', (_label, fields) => {
    const result = parseEntry(fields as string[]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.length).toBeGreaterThan(0);
  });
});

describe('classify', () => {
  it.each([
    [[], 200, 'ok'],
    [['latency'], 200, 'slow'],
    [['latency', 'error'], 503, 'error'],
    [['drop'], null, 'drop'],
    [['latency', 'drop'], null, 'drop'],
    [['corrupt'], 200, 'corrupt'],
    [[], 404, 'target_error'],
    [['latency'], 500, 'target_error'],
    [[], null, 'no_response'],
    [['latency'], null, 'no_response'],
    [['rate_limited'], 429, 'rate_limited'],
  ] as const)('faults %j with status %s -> %s', (faults, status, expected) => {
    expect(classify({ faults: [...faults], status })).toBe(expected);
  });
});
