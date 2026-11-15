import type { PlanId } from '../model.ts';
import { isHoliday } from './holidays.ts';

export type Period = 'on' | 'mid' | 'off' | 'ul';

const isSummer = (m: number) => m >= 5 && m <= 10;

/** Weekend or statutory holiday: priced at the lowest non-overnight rate all day. */
export function isOffDay(y: number, m: number, d: number): boolean {
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return w === 0 || w === 6 || isHoliday(y, m, d);
}

/** Price period of the hour starting at `h` (0-23). Tiered has no periods. */
export function periodOf(plan: 'tou', y: number, m: number, d: number, h: number): 'on' | 'mid' | 'off';
export function periodOf(plan: 'ulo', y: number, m: number, d: number, h: number): Period;
export function periodOf(plan: Exclude<PlanId, 'tiered'>, y: number, m: number, d: number, h: number): Period {
  const offDay = isOffDay(y, m, d);
  if (plan === 'tou') {
    if (offDay || h >= 19 || h < 7) return 'off';
    const busy = isSummer(m) ? h >= 11 && h < 17 : (h >= 7 && h < 11) || (h >= 17 && h < 19);
    return busy ? 'on' : 'mid';
  }
  if (h >= 23 || h < 7) return 'ul';
  if (offDay) return 'off';
  return h >= 16 && h < 21 ? 'on' : 'mid';
}
