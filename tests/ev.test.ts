import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { IntervalRecord } from '../src/model.ts';
import { applyEv, CHARGER_KW, detectEv, evKwh } from '../src/ev.ts';

const pad = (n: number) => String(n).padStart(2, '0');
/** One day of records from 24 hourly values (null = missing). */
function day(d: number, vals: (number | null)[]): IntervalRecord[] {
  return vals.map((kwh, h) => ({ start: `2026-01-${pad(d)}T${pad(h)}:00`, kwh }));
}
const base = (over: Record<number, number | null> = {}) => Array.from({ length: 24 }, (_, h) => (h in over ? over[h]! : 1));
const sum = (r: IntervalRecord[]) => r.reduce((a, x) => a + (x.kwh ?? 0), 0);

test('a full-power hour plus a partial hour is found as one session', () => {
  const ev = detectEv(day(1, base({ 6: 12.5, 7: 6 })));
  assert.ok(Math.abs(ev[6]! - 11.5) < 1e-9 && Math.abs(ev[7]! - 5) < 1e-9);
  assert.ok(Math.abs(evKwh(day(1, base({ 6: 12.5, 7: 6 }))) - 16.5) < 1e-9);
});

test('a 3.5 kWh dryer-sized spike is not mistaken for charging', () => {
  assert.equal(evKwh(day(1, base({ 12: 4.5 }))), 0);
});

test('a missing hour is never treated as the start or middle of a session', () => {
  const recs = day(1, base({ 5: null, 6: 12.5 }));
  assert.equal(evKwh(recs), 0);
});

test('overnight shifting keeps total kWh and puts the charging in hours 0-6', () => {
  const recs = [...day(1, base({ 17: 12.5, 18: 6 })), ...day(2, base())];
  const out = applyEv(recs, { overnight: true, scale: 1 });
  assert.ok(Math.abs(sum(out) - sum(recs)) < 1e-9);
  assert.equal(out[17]!.kwh, 1); // evening back to base load
  assert.equal(out[18]!.kwh, 1);
  const overnight = out.slice(0, 7).reduce((a, r) => a + r.kwh!, 0);
  assert.ok(Math.abs(overnight - (7 + 16.5)) < 1e-9); // base 7 kWh plus the 16.5 kWh session
  assert.ok(out.slice(0, 7).every((r) => r.kwh! <= 1 + CHARGER_KW + 1e-9));
});

test('scale 2 doubles only the charging energy, shifted or not', () => {
  const recs = day(1, base({ 17: 12.5, 18: 6 }));
  const asIs = applyEv(recs, { overnight: false, scale: 2 });
  const night = applyEv(recs, { overnight: true, scale: 2 });
  assert.ok(Math.abs(sum(asIs) - (sum(recs) + 16.5)) < 1e-9);
  assert.ok(Math.abs(sum(night) - (sum(recs) + 16.5)) < 1e-9);
  assert.equal(asIs[17]!.kwh, 12.5 + 11.5); // extra charging lands where the charging was
});

test('overnight overflow beyond seven chargers-hours stays in the last overnight hour, nothing is lost', () => {
  const recs = day(1, base({ 12: 12.5, 13: 12.5, 14: 12.5, 15: 12.5, 16: 12.5, 17: 12.5, 18: 12.5, 19: 12.5, 20: 12.5, 21: 6 }));
  const out = applyEv(recs, { overnight: true, scale: 1 });
  assert.ok(Math.abs(sum(out) - sum(recs)) < 1e-9);
});

test('nothing changes when overnight is off and scale is 1', () => {
  const recs = day(1, base({ 17: 12.5 }));
  assert.equal(applyEv(recs, { overnight: false, scale: 1 }), recs);
});

test('a day with no usable overnight hours keeps its charging where it was', () => {
  const nullNight = base({ 17: 12.5, 18: 6, 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null });
  const recs = day(1, nullNight);
  const out = applyEv(recs, { overnight: true, scale: 1 });
  assert.ok(Math.abs(sum(out) - sum(recs)) < 1e-9);
  assert.equal(out[17]!.kwh, 12.5);
});
