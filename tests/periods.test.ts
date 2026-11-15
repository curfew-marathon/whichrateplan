import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodOf as period } from '../src/tariff/periods.ts';
import { TARIFF } from './helpers/tariff.ts';

const periodOf = (plan: 'tou' | 'ulo', y: number, m: number, d: number, h: number) => period(TARIFF, plan, y, m, d, h);

// 2026-11-11 is a Wednesday (winter); 2026-07-15 is a Wednesday (summer); 2026-07-18 is a Saturday.
test('TOU winter weekday: on 7-11 and 17-19, mid 11-17, off 19-7', () => {
  const p = (h: number) => periodOf('tou', 2026, 11, 11, h);
  assert.deepEqual([6, 7, 10, 11, 16, 17, 18, 19, 23].map(p), ['off', 'on', 'on', 'mid', 'mid', 'on', 'on', 'off', 'off']);
});

test('TOU summer weekday swaps on-peak and mid-peak', () => {
  const p = (h: number) => periodOf('tou', 2026, 7, 15, h);
  assert.deepEqual([6, 7, 10, 11, 16, 17, 18, 19].map(p), ['off', 'mid', 'mid', 'on', 'on', 'mid', 'mid', 'off']);
});

test('TOU season switches on May 1 and Nov 1 (boundary days)', () => {
  assert.equal(periodOf('tou', 2026, 4, 30, 8), 'on'); // Thu, winter: 7-11 is on-peak
  assert.equal(periodOf('tou', 2026, 5, 1, 8), 'mid'); // Fri, summer: 7-11 is mid-peak
  assert.equal(periodOf('tou', 2026, 10, 30, 12), 'on'); // Fri, summer: 11-17 is on-peak
  assert.equal(periodOf('tou', 2026, 11, 2, 12), 'mid'); // Mon, winter: 11-17 is mid-peak
});

test('TOU weekends and holidays are off-peak all day', () => {
  for (let h = 0; h < 24; h++) assert.equal(periodOf('tou', 2026, 7, 18, h), 'off');
  for (let h = 0; h < 24; h++) assert.equal(periodOf('tou', 2026, 7, 1, h), 'off'); // Canada Day, a Wednesday
});

test('ULO weekday: ultra-low 23-7, on-peak 16-21, mid otherwise, all year', () => {
  for (const [m, d] of [[11, 11], [7, 15]] as const) {
    const p = (h: number) => periodOf('ulo', 2026, m, d, h);
    assert.deepEqual([0, 6, 7, 15, 16, 20, 21, 22, 23].map(p), ['ul', 'ul', 'mid', 'mid', 'on', 'on', 'mid', 'mid', 'ul']);
  }
});

test('ULO weekend and holiday: ultra-low overnight, 9.1c off-peak 7-23, no on-peak', () => {
  for (const [m, d] of [[7, 18], [7, 1]] as const) {
    const p = (h: number) => periodOf('ulo', 2026, m, d, h);
    assert.deepEqual([0, 6, 7, 17, 22, 23].map(p), ['ul', 'ul', 'off', 'off', 'off', 'ul']);
  }
});
