import type { PeriodName, Tariff } from './tariff.ts';
import { isHoliday } from './holidays.ts';

export type Period = PeriodName;

/** Weekend or statutory holiday: priced from the plan's weekend_holiday table. */
export function isOffDay(y: number, m: number, d: number): boolean {
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return w === 0 || w === 6 || isHoliday(y, m, d);
}

export function isSummer(t: Tariff, month: number): boolean {
  return month >= t.summerMonths[0] && month <= t.summerMonths[1];
}

/** Price period of the hour starting at `h` (0-23), read from the tariff's hour tables. */
export function periodOf(t: Tariff, plan: 'tou' | 'ulo', y: number, m: number, d: number, h: number): Period {
  const p = t[plan];
  if (isOffDay(y, m, d)) return p.weekendHoliday[h]!;
  return (isSummer(t, m) ? p.weekday.summer : p.weekday.winter)[h]!;
}
