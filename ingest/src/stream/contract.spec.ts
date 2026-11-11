import Ajv2020Import from 'ajv/dist/2020.js';
import addFormatsImport from 'ajv-formats';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEntry } from './request-event.js';

// The contract lives at the repo root (contracts/), shared with chaos-garden-proxy.
const contracts = join(dirname(fileURLToPath(import.meta.url)), '../../../contracts');

// ajv ships CommonJS; take the default export whichever way the loader wraps it.
type AjvCtor = typeof import('ajv/dist/2020.js').default;
const Ajv2020 = ((Ajv2020Import as unknown as { default?: AjvCtor }).default ?? Ajv2020Import) as AjvCtor;
const addFormats = ((addFormatsImport as unknown as { default?: unknown }).default ?? addFormatsImport) as (
  ajv: InstanceType<AjvCtor>,
) => unknown;

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(JSON.parse(readFileSync(join(contracts, 'request-event.v1.schema.json'), 'utf8')));

function fixtures(kind: 'valid' | 'invalid'): Array<[string, string]> {
  const dir = join(contracts, 'fixtures', kind);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f, readFileSync(join(dir, f), 'utf8')]);
}

/**
 * Consumer side of the request-event contract: the ingest parser and the
 * schema must agree on every fixture, so neither can drift from the other.
 */
describe('request-event v1 contract (consumer: ingest)', () => {
  it('has fixtures of both kinds', () => {
    expect(fixtures('valid').length).toBeGreaterThan(0);
    expect(fixtures('invalid').length).toBeGreaterThan(0);
  });

  it.each(fixtures('valid'))('accepts valid/%s, as the schema does', (_name, json) => {
    expect(validate(JSON.parse(json)), JSON.stringify(validate.errors)).toBe(true);
    const parsed = parseEntry(['data', json]);
    expect(parsed.ok, parsed.ok ? '' : parsed.reason).toBe(true);
  });

  it.each(fixtures('invalid'))('rejects invalid/%s, as the schema does', (_name, json) => {
    expect(validate(JSON.parse(json))).toBe(false);
    expect(parseEntry(['data', json]).ok).toBe(false);
  });
});
