import type { IntervalRecord, PlanId } from '../model.ts';
import { PLAN_IDS } from '../model.ts';
import type { RateSet } from './rates.ts';
import { periodOf } from './periods.ts';

export interface MonthCost {
  month: string; // 'YYYY-MM'
  kwh: number;
  /** Fraction of the month's hours that have data, 0-1. */
  coverage: number;
  /** Dollars per plan, commodity only. */
  cost: Record<PlanId, number>;
}

const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Tiered billing, with the tier threshold scaled down when the month has missing hours. */
export function tieredCost(kwh: number, month: number, coverage: number, rates: RateSet): number {
  const base = month >= 5 && month <= 10 ? rates.tiered.thresholdSummer : rates.tiered.thresholdWinter;
  const threshold = base * coverage;
  return (Math.min(kwh, threshold) * rates.tiered.tier1 + Math.max(0, kwh - threshold) * rates.tiered.tier2) / 100;
}

export function monthlyCosts(records: IntervalRecord[], rates: RateSet): MonthCost[] {
  const acc = new Map<string, { kwh: number; hours: number; tou: number; ulo: number }>();
  for (const r of records) {
    if (r.kwh === null) continue;
    const y = Number(r.start.slice(0, 4)), m = Number(r.start.slice(5, 7));
    const d = Number(r.start.slice(8, 10)), h = Number(r.start.slice(11, 13));
    const k = r.start.slice(0, 7);
    const a = acc.get(k) ?? { kwh: 0, hours: 0, tou: 0, ulo: 0 };
    a.kwh += r.kwh;
    a.hours += 1;
    a.tou += r.kwh * rates.tou[periodOf('tou', y, m, d, h)] / 100;
    a.ulo += r.kwh * rates.ulo[periodOf('ulo', y, m, d, h)] / 100;
    acc.set(k, a);
  }
  return [...acc.keys()].sort().map((month) => {
    const a = acc.get(month)!;
    const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
    const coverage = Math.min(1, a.hours / (daysIn(y, m) * 24));
    const cost: Record<PlanId, number> = { tiered: tieredCost(a.kwh, m, coverage, rates), tou: a.tou, ulo: a.ulo };
    return { month, kwh: a.kwh, coverage, cost };
  });
}

export function totals(months: MonthCost[]): Record<PlanId, number> {
  const t = { tiered: 0, tou: 0, ulo: 0 };
  for (const m of months) for (const p of PLAN_IDS) t[p] += m.cost[p];
  return t;
}
