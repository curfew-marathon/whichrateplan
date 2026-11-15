import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holidaysForYear } from '../src/tariff/holidays.ts';

// Lists published by the OEB / Alectra.
const OEB_2025 = ['2025-01-01', '2025-02-17', '2025-04-18', '2025-05-19', '2025-07-01', '2025-08-04', '2025-09-01', '2025-10-13', '2025-12-25', '2025-12-26'];
const OEB_2026 = ['2026-01-01', '2026-02-16', '2026-04-03', '2026-05-18', '2026-07-01', '2026-08-03', '2026-09-07', '2026-10-12', '2026-12-25', '2026-12-28'];

test('computed holidays equal the OEB 2025 list', () => {
  assert.deepEqual([...holidaysForYear(2025)].sort(), OEB_2025);
});

test('computed holidays equal the OEB 2026 list, including Boxing Day moving to Mon Dec 28', () => {
  assert.deepEqual([...holidaysForYear(2026)].sort(), OEB_2026);
});

test('Christmas on a Saturday and Boxing Day on a Sunday move to the next two free weekdays', () => {
  const h = holidaysForYear(2027); // Dec 25 2027 is a Saturday
  assert.ok(h.has('2027-12-27') && h.has('2027-12-28'));
  assert.ok(!h.has('2027-12-25') && !h.has('2027-12-26'));
});

test('every holiday falls on a weekday', () => {
  for (let y = 2024; y <= 2035; y++) {
    for (const k of holidaysForYear(y)) {
      const w = new Date(`${k}T00:00:00Z`).getUTCDay();
      assert.ok(w !== 0 && w !== 6, `${k} is a weekend`);
    }
  }
});
