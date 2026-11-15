import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costNote, headline, splitText } from '../src/summary.ts';
import type { Recommendation } from '../src/recommend.ts';

const base: Recommendation = {
  fullYear: true,
  monthsCovered: 12,
  planTotals: { tiered: 2562, tou: 2448, ulo: 2475 },
  bestSingle: { plan: 'tou', total: 2448 },
  seasonal: null,
  advice: 'stay',
  threshold: 50,
};

test('stay: names the cheapest plan and the gaps', () => {
  const h = headline(base);
  assert.equal(h.title, 'Stay on Time-of-Use all year');
  assert.ok(h.detail.includes('$27 a year less than Ultra-Low Overnight'));
  assert.ok(h.detail.includes('$114 less than Tiered'));
});

test('seasonal: names both plans, the window and the saving', () => {
  const h = headline({
    ...base,
    advice: 'seasonal',
    seasonal: { inside: 'ulo', outside: 'tou', window: ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'], outsideMonths: ['Jun', 'Jul', 'Aug', 'Sep'], total: 2380, saving: 68, worthIt: true },
  });
  assert.equal(h.title, 'Switch seasonally: Ultra-Low Overnight Oct–May, Time-of-Use Jun–Sep');
  assert.ok(h.detail.includes('$68'));
  assert.ok(h.detail.includes('clears your $50 cutoff'));
});

test('a seasonal split under the bar is mentioned but not recommended', () => {
  const h = headline({
    ...base,
    seasonal: { inside: 'ulo', outside: 'tou', window: ['Nov', 'Dec'], outsideMonths: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'], total: 2420, saving: 28, worthIt: false },
  });
  assert.ok(h.title.startsWith('Stay on'));
  assert.ok(h.detail.includes('only about $28'));
  assert.ok(h.detail.includes('under your $50 cutoff'));
});

test('partial data says so instead of giving a full-year verdict', () => {
  const h = headline({ ...base, fullYear: false, monthsCovered: 2, advice: 'insufficient-data' });
  assert.ok(h.title.includes('2 months you uploaded'));
  assert.ok(h.detail.includes('12 months'));
});

// Regression: the page used to say tax is the same on every plan. HST is charged on the whole bill.
test('the cost note does not claim tax is identical across plans, and mentions HST', () => {
  const note = costNote('2026-11-01', '2026-11-11');
  assert.ok(note.includes('HST'));
  assert.ok(!/tax (is|are) the same/i.test(note));
  assert.ok(note.includes('effective 2026-11-01') && note.includes('checked 2026-11-11'));
});

test('a one-month window reads "Jul", not "Jul-Jul"', () => {
  const text = splitText({ inside: 'ulo', outside: 'tou', window: ['Jul'], outsideMonths: ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], total: 1, saving: 1, worthIt: true });
  assert.equal(text, 'Ultra-Low Overnight Jul, Time-of-Use Aug\u2013Jun');
});

test('a single uploaded month is "1 month", not "1 months"', () => {
  const h = headline({ ...base, fullYear: false, monthsCovered: 1, advice: 'insufficient-data' });
  assert.ok(h.title.includes('the 1 month you uploaded'));
});
