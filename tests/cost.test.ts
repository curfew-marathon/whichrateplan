import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { IntervalRecord } from '../src/model.ts';
import { monthlyCosts, tieredCost } from '../src/tariff/cost.ts';
import { RATES_2026 } from '../src/tariff/rates.ts';

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

/** Every hour of a month at a flat kWh/hour. */
function flatMonth(y: number, m: number, kwhPerHour: number): IntervalRecord[] {
  const out: IntervalRecord[] = [];
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  for (let d = 1; d <= days; d++) {
    for (let h = 0; h < 24; h++) {
      out.push({ start: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00`, kwh: kwhPerHour });
    }
  }
  return out;
}

test('Tiered: winter threshold 1000, tier 1 below it and tier 2 above', () => {
  near(tieredCost(800, 1, 1, RATES_2026), 800 * 0.112);
  near(tieredCost(1500, 1, 1, RATES_2026), 1000 * 0.112 + 500 * 0.132);
});

test('Tiered: summer threshold is 600, not 1000', () => {
  near(tieredCost(1000, 7, 1, RATES_2026), 600 * 0.112 + 400 * 0.132);
});

test('Tiered threshold scales with data coverage so a partial month is not under-billed', () => {
  // Half the month present, 500 kWh: threshold 500 in winter, so all of it is tier 1.
  near(tieredCost(500, 1, 0.5, RATES_2026), 500 * 0.112);
  near(tieredCost(600, 1, 0.5, RATES_2026), 500 * 0.112 + 100 * 0.132);
});

test('flat 1 kWh/hour in a winter month: TOU and ULO match a hand calculation', () => {
  // January 2026: Thu Jan 1 is a holiday. Weekday TOU hours: on 6 (7-11, 17-19), mid 6, off 12.
  const [jan] = monthlyCosts(flatMonth(2026, 1, 1), RATES_2026);
  // Jan 2026: 31 days, 8 weekend days (3,4,10,11,17,18,24,25,31 -> 9), 1 holiday (Jan 1) => 10 off-days, 21 weekdays.
  const weekdays = 21, offDays = 10;
  const tou = weekdays * (6 * 18.9 + 6 * 14.6 + 12 * 9.1) / 100 + offDays * 24 * 9.1 / 100;
  const ulo = weekdays * (8 * 3.7 + 9 * 14.6 + 5 * 37.7 + 2 * 14.6) / 100 + offDays * (8 * 3.7 + 16 * 9.1) / 100;
  near(jan!.cost.tou, tou);
  near(jan!.cost.ulo, ulo);
  near(jan!.cost.tiered, 744 * 0.112); // 744 kWh is under the 1000 kWh winter threshold
});

test('missing hours (null) are left out of cost and reduce coverage', () => {
  const recs = flatMonth(2026, 1, 1).map((r, i) => (i < 372 ? { ...r, kwh: null } : r));
  const [jan] = monthlyCosts(recs, RATES_2026);
  assert.equal(jan!.kwh, 372);
  near(jan!.coverage, 0.5);
});
