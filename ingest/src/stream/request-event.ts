/** Mirrors RequestEventV1 in chaos-garden-proxy (src/events/request-event.ts). */
export interface RequestEventV1 {
  v: 1;
  id: string;
  at: string;
  gardenId: string;
  targetId: string;
  targetName: string;
  method: string;
  path: string;
  status: number | null;
  completed: boolean;
  durationMs: number;
  faults: string[];
  ruleIds: string[];
}

export type Outcome = 'ok' | 'slow' | 'error' | 'drop' | 'corrupt' | 'target_error' | 'no_response';

export const OUTCOMES: Outcome[] = ['ok', 'slow', 'error', 'drop', 'corrupt', 'target_error', 'no_response'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

export type ParseResult = { ok: true; event: RequestEventV1 } | { ok: false; reason: string };

/**
 * Validates one stream entry (`['data', '<json>']`). Anything that does not
 * match the contract is rejected with a reason, so it can go to the
 * dead-letter stream instead of being retried forever.
 */
export function parseEntry(fields: string[]): ParseResult {
  const index = fields.indexOf('data');
  if (index === -1 || index % 2 !== 0 || fields[index + 1] === undefined) {
    return { ok: false, reason: 'missing data field' };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fields[index + 1]);
  } catch {
    return { ok: false, reason: 'data is not valid JSON' };
  }
  const e = raw as Partial<RequestEventV1>;
  if (!e || typeof e !== 'object') return { ok: false, reason: 'data is not an object' };
  if (e.v !== 1) return { ok: false, reason: `unsupported event version ${String(e.v)}` };
  if (typeof e.id !== 'string' || !UUID_RE.test(e.id)) return { ok: false, reason: 'id must be a UUID' };
  if (typeof e.gardenId !== 'string' || !UUID_RE.test(e.gardenId)) return { ok: false, reason: 'gardenId must be a UUID' };
  if (typeof e.targetId !== 'string' || !UUID_RE.test(e.targetId)) return { ok: false, reason: 'targetId must be a UUID' };
  if (typeof e.at !== 'string' || Number.isNaN(Date.parse(e.at))) return { ok: false, reason: 'at must be a date' };
  if (typeof e.targetName !== 'string' || typeof e.method !== 'string' || typeof e.path !== 'string') {
    return { ok: false, reason: 'targetName, method and path must be strings' };
  }
  if (e.status !== null && !(Number.isInteger(e.status) && (e.status as number) >= 100 && (e.status as number) <= 599)) {
    return { ok: false, reason: 'status must be an HTTP status or null' };
  }
  if (typeof e.completed !== 'boolean') return { ok: false, reason: 'completed must be a boolean' };
  if (!Number.isFinite(e.durationMs) || (e.durationMs as number) < 0) return { ok: false, reason: 'durationMs must be >= 0' };
  if (!isStringArray(e.faults) || !isStringArray(e.ruleIds)) return { ok: false, reason: 'faults and ruleIds must be string arrays' };
  return { ok: true, event: e as RequestEventV1 };
}

/** One outcome per request. Injected faults win over what the target did. */
export function classify(event: Pick<RequestEventV1, 'faults' | 'status'>): Outcome {
  if (event.faults.includes('drop')) return 'drop';
  if (event.faults.includes('error')) return 'error';
  if (event.status === null) return 'no_response';
  if (event.faults.includes('corrupt')) return 'corrupt';
  if (event.status >= 400) return 'target_error';
  if (event.faults.includes('latency')) return 'slow';
  return 'ok';
}
