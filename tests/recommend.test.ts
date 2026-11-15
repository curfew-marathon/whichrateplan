import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PlanId } from '../src/model.ts';
import type { MonthCost } from '../src/tariff/cost.ts';
import { recommend } from '../src/recommend.ts';

/** Build 12 months (Nov 2025 - Oct 2026) from a per-calendar-month cost function. */
function year(f: (calMonth: number) => Record<PlanId, number>, coverage = 1): MonthCost[] {
  const keys = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
  return keys.map((month) => ({ month, kwh: 1000, coverage, cost: f(Number(month.slice(5, 7))) }));
}
const summer = (m: number) => m >= 6 && m <= 9;

test('one plan cheapest every month: stay on it, no seasonal split', () => {
  const r = recommend(year(() => ({ tiered: 200, tou: 150, ulo: 180 })));
  assert.equal(r.advice, 'stay');
  assert.equal(r.bestSingle.plan, 'tou');
  assert.equal(r.seasonal, null);
});

test('ULO wins Oct-May, TOU wins Jun-Sep by a wide margin: recommend that exact split', () => {
  const r = recommend(year((m) => (summer(m) ? { tiered: 300, tou: 200, ulo: 260 } : { tiered: 200, tou: 160, ulo: 100 })));
  assert.equal(r.advice, 'seasonal');
  assert.ok(r.seasonal);
  assert.equal(r.seasonal.worthIt, true);
  const plans = new Map<string, PlanId>();
  for (const mo of ['Jun', 'Jul', 'Aug', 'Sep']) plans.set(mo, 'tou');
  for (const mo of ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May']) plans.set(mo, 'ulo');
  const inWindow = new Set(r.seasonal.window);
  for (const [mo, plan] of plans) {
    assert.equal(inWindow.has(mo) ? r.seasonal.inside : r.seasonal.outside, plan, mo);
  }
  // Best single plan is ULO at 4*260 + 8*100 = 1840; the split costs 4*200 + 8*100 = 1600.
  assert.equal(r.bestSingle.plan, 'ulo');
  assert.ok(Math.abs(r.seasonal.saving - 240) < 1e-6);
});

test('a split that saves less than the threshold is reported but not recommended', () => {
  // Winter ULO beats TOU by $3/month over 8 months = $24 < $50.
  const r = recommend(year((m) => (summer(m) ? { tiered: 300, tou: 100, ulo: 150 } : { tiered: 200, tou: 103, ulo: 100 })));
  assert.equal(r.advice, 'stay');
  assert.ok(r.seasonal && r.seasonal.worthIt === false);
  assert.ok(r.seasonal.saving > 0 && r.seasonal.saving < 50);
});

test('threshold edge: saving exactly equal to the threshold counts as worth it', () => {
  const r = recommend(year((m) => (summer(m) ? { tiered: 300, tou: 100, ulo: 150 } : { tiered: 200, tou: 106.25, ulo: 100 })), 50);
  assert.ok(r.seasonal);
  assert.ok(Math.abs(r.seasonal.saving - 50) < 1e-6);
  assert.equal(r.seasonal.worthIt, true);
});

test('fewer than 12 months: no seasonal advice, totals still reported', () => {
  const r = recommend(year(() => ({ tiered: 200, tou: 150, ulo: 180 })).slice(0, 5));
  assert.equal(r.advice, 'insufficient-data');
  assert.equal(r.fullYear, false);
  assert.equal(r.seasonal, null);
  assert.equal(r.planTotals.tou, 750);
});

test('a month with mostly missing data blocks the seasonal advice', () => {
  const months = year(() => ({ tiered: 200, tou: 150, ulo: 180 }));
  months[3] = { ...months[3]!, coverage: 0.3 };
  assert.equal(recommend(months).advice, 'insufficient-data');
});

test('more than 12 months uses the latest 12', () => {
  const old: MonthCost = { month: '2024-10', kwh: 1, coverage: 1, cost: { tiered: 1e6, tou: 1e6, ulo: 1e6 } };
  const r = recommend([old, ...year(() => ({ tiered: 200, tou: 150, ulo: 180 }))]);
  assert.equal(r.planTotals.tou, 1800);
});
