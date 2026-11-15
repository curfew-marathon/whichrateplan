import type { PlanId } from './model.ts';
import { PLAN_IDS } from './model.ts';
import type { MonthCost } from './tariff/cost.ts';
import { totals } from './tariff/cost.ts';

export const SEASONAL_THRESHOLD_DOLLARS = 50;
const MIN_MONTH_COVERAGE = 0.8;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface Recommendation {
  /** True when we have 12 distinct, mostly-complete calendar months. */
  fullYear: boolean;
  monthsCovered: number;
  planTotals: Record<PlanId, number>;
  bestSingle: { plan: PlanId; total: number };
  /** Best two-plan split, or null when it is not better or the data is too short. */
  seasonal: null | {
    inside: PlanId; // plan for the window
    outside: PlanId; // plan for the rest of the year
    window: string[]; // month names, in order, e.g. ['Oct','Nov',...,'May']
    outsideMonths: string[]; // the remaining months, in order
    total: number;
    saving: number; // versus bestSingle
    worthIt: boolean; // saving >= threshold
  };
  advice: 'stay' | 'seasonal' | 'insufficient-data';
  /** The cutoff used to decide worthIt/advice, echoed so the UI can show it. */
  threshold: number;
}

const monthIndex = (key: string) => Number(key.slice(5, 7)) - 1;

/** Use the latest 12 months if there are more than 12, keyed by calendar month. */
function lastYear(months: MonthCost[]): MonthCost[] {
  return months.length > 12 ? months.slice(-12) : months;
}

export function recommend(all: MonthCost[], threshold = SEASONAL_THRESHOLD_DOLLARS): Recommendation {
  const months = lastYear(all);
  const planTotals = totals(months);
  const bestPlan = PLAN_IDS.reduce((a, b) => (planTotals[b] < planTotals[a] ? b : a));
  const bestSingle = { plan: bestPlan, total: planTotals[bestPlan] };

  const distinct = new Set(months.map((m) => monthIndex(m.month)));
  const complete = months.every((m) => m.coverage >= MIN_MONTH_COVERAGE);
  const fullYear = months.length === 12 && distinct.size === 12 && complete;
  if (!fullYear) {
    return { fullYear, monthsCovered: months.length, planTotals, bestSingle, seasonal: null, advice: 'insufficient-data', threshold };
  }

  const byCal: MonthCost[] = [];
  for (const m of months) byCal[monthIndex(m.month)] = m;

  let best: { inside: PlanId; outside: PlanId; start: number; len: number; total: number } | null = null;
  for (let start = 0; start < 12; start++) {
    for (let len = 1; len <= 11; len++) {
      const inWindow = new Set<number>();
      for (let i = 0; i < len; i++) inWindow.add((start + i) % 12);
      for (const inside of PLAN_IDS) {
        for (const outside of PLAN_IDS) {
          if (inside === outside) continue;
          let total = 0;
          for (let i = 0; i < 12; i++) total += byCal[i]!.cost[inWindow.has(i) ? inside : outside];
          if (best === null || total < best.total - 1e-9) best = { inside, outside, start, len, total };
        }
      }
    }
  }
  if (best === null || best.total >= bestSingle.total) {
    return { fullYear, monthsCovered: 12, planTotals, bestSingle, seasonal: null, advice: 'stay', threshold };
  }
  const window = Array.from({ length: best.len }, (_, i) => MONTH_NAMES[(best.start + i) % 12]!);
  const outside = Array.from({ length: 12 - best.len }, (_, i) => MONTH_NAMES[(best.start + best.len + i) % 12]!);
  const saving = bestSingle.total - best.total;
  const worthIt = saving >= threshold;
  return {
    fullYear,
    monthsCovered: 12,
    planTotals,
    bestSingle,
    seasonal: { inside: best.inside, outside: best.outside, window, outsideMonths: outside, total: best.total, saving, worthIt },
    advice: worthIt ? 'seasonal' : 'stay',
    threshold,
  };
}
