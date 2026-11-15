import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { isStale, parseTariff } from '../src/tariff/tariff.ts';
import { loadTariff, readTariffYaml, TARIFF } from './helpers/tariff.ts';

const files = readdirSync(new URL('../data/tariffs/', import.meta.url)).filter((f) => f.endsWith('.yaml')).sort();

/** The shipped file as a mutable plain object, so each test breaks exactly one thing. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const doc = (): Record<string, any> => structuredClone(readTariffYaml('2026-11-01.yaml')) as Record<string, any>;
const invalid = (d: unknown, text: RegExp) => assert.throws(() => parseTariff(d), text);

for (const f of files) {
  test(`data/tariffs/${f} is a valid tariff`, () => {
    assert.doesNotThrow(() => loadTariff(f));
  });
}

test('the shipped prices are the published Nov 2026 numbers', () => {
  assert.deepEqual(TARIFF.tou.prices, { on: 18.9, mid: 14.6, off: 9.1 });
  assert.deepEqual(TARIFF.ulo.prices, { on: 37.7, mid: 14.6, off: 9.1, ul: 3.7 });
  assert.deepEqual(TARIFF.tiered, { tier1: 11.2, tier2: 13.2, thresholdWinter: 1000, thresholdSummer: 600 });
  assert.deepEqual(TARIFF.summerMonths, [5, 10]);
});

test('ULO has the same hours in winter and summer (YAML anchor)', () => {
  assert.deepEqual(TARIFF.ulo.weekday.winter, TARIFF.ulo.weekday.summer);
});

test('src/tariff/current.ts points at the newest file in data/tariffs/', () => {
  const src = readFileSync(new URL('../src/tariff/current.ts', import.meta.url), 'utf8');
  assert.ok(src.includes(`data/tariffs/${files[files.length - 1]}`), `current.ts should import ${files[files.length - 1]}`);
});

test('a gap in the hours is rejected and names the missing hours', () => {
  const d = doc();
  d.plans.tou.weekday.winter.off = [[19, 24], [0, 6]]; // hour 6 now uncovered
  invalid(d, /plans\.tou\.weekday\.winter: hours not covered: 6/);
});

test('overlapping hours are rejected', () => {
  const d = doc();
  d.plans.ulo.weekend_holiday.off = [[6, 23]]; // overlaps ultra-low at hour 6
  invalid(d, /hour 6 is in both/);
});

test('a period with no price is rejected', () => {
  const d = doc();
  delete d.plans.tou.prices.mid;
  invalid(d, /period "mid" has no price/);
});

test('a price written as text is rejected', () => {
  const d = doc();
  d.plans.tou.prices.on = '18.9';
  invalid(d, /plans\.tou\.prices\.on must be a positive number/);
});

test('an out-of-range or reversed hour range is rejected', () => {
  const d = doc();
  d.plans.tou.weekday.summer.on = [[11, 25]];
  invalid(d, /bad range/);
  d.plans.tou.weekday.summer.on = [[17, 11]];
  invalid(d, /bad range/);
});

test('an unknown period name is rejected', () => {
  const d = doc();
  d.plans.tou.weekday.summer.shoulder = [[7, 8]];
  invalid(d, /unknown period "shoulder"/);
});

test('dates must be real, quoted ISO dates, and verified cannot precede effective', () => {
  const d = doc();
  d.effective = '2026-13-01';
  invalid(d, /effective must be a real date/);
  const e = doc();
  e.verified = '2026-10-01';
  invalid(e, /verified is before effective/);
  const f = doc();
  f.effective = new Date('2026-11-01T00:00:00Z'); // an unquoted YAML date parses to a Date, not a string
  invalid(f, /effective must be a real date/);
});

test('summer_months, source and the tier thresholds are checked', () => {
  const a = doc(); a.summer_months = [10, 5]; invalid(a, /summer_months/);
  const b = doc(); b.source = 'http://example.com'; invalid(b, /source must be an https URL/);
  const c = doc(); c.plans.tiered.threshold_kwh.winter = 0; invalid(c, /threshold_kwh\.winter/);
  const d = doc(); delete d.plans.tiered.prices.tier2; invalid(d, /tier2 is missing/);
});

test('every problem is reported at once, not just the first', () => {
  const d = doc();
  d.plans.tou.prices.on = -1;
  d.source = 'nope';
  assert.throws(() => parseTariff(d), (e: Error) => /prices\.on/.test(e.message) && /source must be/.test(e.message));
});

test('prices go stale on the first Nov 1 after the effective date', () => {
  assert.equal(isStale(TARIFF, '2026-11-14'), false);
  assert.equal(isStale(TARIFF, '2027-10-31'), false);
  assert.equal(isStale(TARIFF, '2027-11-01'), true);
  assert.equal(isStale({ ...TARIFF, effective: '2026-05-01' }, '2026-10-31'), false); // a mid-year set goes stale the same Nov 1
  assert.equal(isStale({ ...TARIFF, effective: '2026-05-01' }, '2026-11-01'), true);
});

test('a document of the wrong shape is rejected with every section reported', () => {
  for (const bad of [null, 'text', [], {}]) {
    assert.throws(() => parseTariff(bad), /effective must be a real date/);
  }
  assert.throws(() => parseTariff({}), /plans\.tou\.prices is missing[\s\S]*plans\.ulo\.prices is missing[\s\S]*plans\.tiered\.prices is missing/);
});

test('plans and sections that are not mappings are rejected', () => {
  const a = doc(); a.plans = 'nope'; invalid(a, /plans\.tou\.prices is missing/);
  const b = doc(); b.plans.tou = 'nope'; invalid(b, /plans\.tou\.prices is missing/);
  const c = doc(); c.plans.tou.weekday = 'nope'; invalid(c, /plans\.tou\.weekday\.winter must list its periods/);
  const d = doc(); d.plans.tou.weekday.winter = 'nope'; invalid(d, /plans\.tou\.weekday\.winter must list its periods/);
  const e = doc(); e.plans.tou.prices = 'nope'; invalid(e, /plans\.tou\.prices is missing/);
  const f = doc(); f.plans.tiered = 'nope'; invalid(f, /plans\.tiered\.prices is missing/);
  const g = doc(); g.plans.tiered.threshold_kwh = 'nope'; invalid(g, /threshold_kwh\.winter must be a positive number/);
});

test('an hour range that is not a list, and a range that is not a pair, are rejected', () => {
  const a = doc(); a.plans.tou.weekday.summer.on = 'nope'; invalid(a, /summer\.on must be a list of \[from, to\] ranges/);
  const b = doc(); b.plans.tou.weekday.summer.on = ['nope']; invalid(b, /bad range/);
});
