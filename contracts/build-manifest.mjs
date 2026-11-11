// Lists every contract file with its SHA-256, so other repos can tell whether
// their vendored copy matches this one.
//   node contracts/build-manifest.mjs          rewrite manifest.json
//   node contracts/build-manifest.mjs --check  fail if manifest.json is out of date
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const SKIP = new Set(['manifest.json', 'build-manifest.mjs', 'README.md']);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return SKIP.has(name) && dir === root ? [] : [full];
  });
}

const files = Object.fromEntries(
  walk(root)
    .map((f) => [relative(root, f).split('\\').join('/'), createHash('sha256').update(readFileSync(f)).digest('hex')])
    .sort(([a], [b]) => a.localeCompare(b)),
);
const manifest = `${JSON.stringify({ contract: 'request-event', version: 1, files }, null, 2)}\n`;
const path = join(root, 'manifest.json');

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(path, 'utf8');
  } catch {
    // missing counts as out of date
  }
  if (current !== manifest) {
    console.error('contracts/manifest.json is out of date. Run: node contracts/build-manifest.mjs');
    process.exit(1);
  }
  console.log(`contracts/manifest.json is up to date (${Object.keys(files).length} files)`);
} else {
  writeFileSync(path, manifest);
  console.log(`wrote contracts/manifest.json (${Object.keys(files).length} files)`);
}
