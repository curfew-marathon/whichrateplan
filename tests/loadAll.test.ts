// Node only counts coverage for files a test actually loads, so a new, untested source file would never
// lower the number. Loading every source file here makes the coverage threshold see it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';

// The UI needs a browser; current.ts imports YAML, which only the bundler can load.
const EXCLUDE = new Set(['src/tariff/current.ts', 'src/yaml.d.ts']);

test('every non-UI source file can be loaded, so coverage counts it', async () => {
  const root = new URL('../src/', import.meta.url);
  const files = (readdirSync(root, { recursive: true }) as string[])
    .map((f) => `src/${f}`)
    .filter((f) => f.endsWith('.ts') && !f.startsWith('src/ui/') && !EXCLUDE.has(f));
  assert.ok(files.length > 5);
  for (const f of files) await import(new URL(`../${f}`, import.meta.url).href);
});
