// Runs only when real PDFs are present in local-fixtures/ (gitignored: they contain meter IDs and usage).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractLines, type PdfLoader } from '../src/pdfText.ts';
import { parseWithAdapters } from '../src/adapters/index.ts';
import { monthlyCosts, totals } from '../src/tariff/cost.ts';
import { recommend } from '../src/recommend.ts';
import { RATES_2026 } from '../src/tariff/rates.ts';
import { applyEv } from '../src/ev.ts';

const loader = getDocument as unknown as PdfLoader;
const YEAR = new URL('../local-fixtures/year.pdf', import.meta.url);
const SHORT = new URL('../local-fixtures/may-june-2025.pdf', import.meta.url);

async function load(url: URL) {
  const lines = await extractLines(new Uint8Array(readFileSync(url)), loader);
  return parseWithAdapters(lines);
}

test('real 365-day PDF: parses clean and matches the expected totals to the dollar', { skip: !existsSync(YEAR) }, async () => {
  const { adapter, result } = await load(YEAR);
  assert.equal(adapter?.id, 'alectra-pdf');
  assert.deepEqual(result.problems, []);
  assert.equal(result.records.length, 8760);
  const months = monthlyCosts(result.records, RATES_2026);
  const t = totals(months);
  // Expected totals for this file at the Nov 2026 prices, as-is usage.
  assert.equal(Math.round(t.tou), 2422);
  assert.equal(Math.round(t.tiered), 2462);
  assert.equal(Math.round(t.ulo), 2664);
  assert.equal(recommend(months).fullYear, true);
});

test('real May-June 2025 PDF: parses (ND hours kept as missing) and gives no seasonal advice', { skip: !existsSync(SHORT) }, async () => {
  const { adapter, result } = await load(SHORT);
  assert.equal(adapter?.id, 'alectra-pdf');
  assert.deepEqual(result.problems, []);
  assert.ok(result.records.some((r) => r.kwh === null), 'expected ND hours on 12-May-25');
  assert.ok(result.notes.some((n) => n.includes('no data')));
  const rec = recommend(monthlyCosts(result.records, RATES_2026));
  assert.equal(rec.advice, 'insufficient-data');
});

// Expected totals with every EV hour scaled by m and, where noted, moved overnight.
const EV_CASES: [string, boolean, number, [number, number, number], number][] = [
  // label, overnight, scale, [tou, tiered, ulo], best-split saving in dollars
  ['1x overnight', true, 1, [2382, 2462, 2555], 5.98],
  ['1.5x overnight', true, 1.5, [2549, 2704, 2623], 22.43],
  ['2x overnight', true, 2, [2716, 2946, 2691], 48.56],
  ['2x left where it is', false, 2, [2794, 2946, 2909], 56.46],
];
for (const [label, overnight, scale, [tou, tiered, ulo], saving] of EV_CASES) {
  test(`real PDF, EV ${label}: matches the expected totals`, { skip: !existsSync(YEAR) }, async () => {
    const { result } = await load(YEAR);
    const months = monthlyCosts(applyEv(result.records, { overnight, scale }), RATES_2026);
    const t = totals(months);
    assert.deepEqual([Math.round(t.tou), Math.round(t.tiered), Math.round(t.ulo)], [tou, tiered, ulo]);
    assert.ok(Math.abs((recommend(months).seasonal?.saving ?? 0) - saving) < 0.5, `split saving ${recommend(months).seasonal?.saving} vs ${saving}`);
  });
}
