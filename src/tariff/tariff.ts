/**
 * The price plans as data. A Tariff comes from a YAML file in data/tariffs/ (see that file for the
 * format) and is checked by parseTariff(), so a bad edit fails loudly instead of mispricing quietly.
 */
export type PeriodName = 'on' | 'mid' | 'off' | 'ul';
const PERIOD_NAMES: readonly PeriodName[] = ['on', 'mid', 'off', 'ul'];

export interface Tariff {
  effective: string; // 'YYYY-MM-DD'
  verified: string; // 'YYYY-MM-DD'
  source: string;
  summerMonths: [number, number];
  tou: TimedPlan;
  ulo: TimedPlan;
  tiered: { tier1: number; tier2: number; thresholdWinter: number; thresholdSummer: number };
}

export interface TimedPlan {
  prices: Partial<Record<PeriodName, number>>;
  /** Period of each hour start (0-23), per day type and season. */
  weekday: { winter: PeriodName[]; summer: PeriodName[] };
  weekendHoliday: PeriodName[];
}

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);

function isoDate(v: unknown, label: string, errs: string[]): string {
  const ok = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) &&
    new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
  if (!ok) errs.push(`${label} must be a real date written "YYYY-MM-DD" (quote it), got ${JSON.stringify(v)}`);
  return String(v);
}

function hoursTable(v: unknown, prices: Partial<Record<PeriodName, number>>, label: string, errs: string[]): PeriodName[] {
  const out: (PeriodName | null)[] = new Array<PeriodName | null>(24).fill(null);
  if (!isObj(v)) {
    errs.push(`${label} must list its periods`);
    return [];
  }
  for (const [name, ranges] of Object.entries(v)) {
    if (!(PERIOD_NAMES as readonly string[]).includes(name)) {
      errs.push(`${label}: unknown period "${name}"`);
      continue;
    }
    if (prices[name as PeriodName] === undefined) errs.push(`${label}: period "${name}" has no price`);
    if (!Array.isArray(ranges)) {
      errs.push(`${label}.${name} must be a list of [from, to] ranges`);
      continue;
    }
    for (const r of ranges) {
      const [a, b] = Array.isArray(r) ? (r as unknown[]) : [];
      if (!Number.isInteger(a) || !Number.isInteger(b) || (a as number) < 0 || (b as number) > 24 || (a as number) >= (b as number)) {
        errs.push(`${label}.${name}: bad range ${JSON.stringify(r)} (need whole hours, 0 <= from < to <= 24)`);
        continue;
      }
      for (let h = a as number; h < (b as number); h++) {
        if (out[h] !== null) errs.push(`${label}: hour ${h} is in both "${out[h]}" and "${name}"`);
        out[h] = name as PeriodName;
      }
    }
  }
  const gaps = out.flatMap((p, h) => (p === null ? [h] : []));
  if (gaps.length) errs.push(`${label}: hours not covered: ${gaps.join(', ')}`);
  return out as PeriodName[];
}

function prices(v: unknown, label: string, errs: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObj(v)) {
    errs.push(`${label}.prices is missing`);
    return out;
  }
  for (const [k, n] of Object.entries(v)) {
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) errs.push(`${label}.prices.${k} must be a positive number (cents/kWh), got ${JSON.stringify(n)}`);
    else out[k] = n;
  }
  return out;
}

function timedPlan(v: unknown, label: string, errs: string[]): TimedPlan {
  const plan = isObj(v) ? v : {};
  const p = prices(plan.prices, label, errs) as TimedPlan['prices'];
  const wd = isObj(plan.weekday) ? plan.weekday : {};
  return {
    prices: p,
    weekday: {
      winter: hoursTable(wd.winter, p, `${label}.weekday.winter`, errs),
      summer: hoursTable(wd.summer, p, `${label}.weekday.summer`, errs),
    },
    weekendHoliday: hoursTable(plan.weekend_holiday, p, `${label}.weekend_holiday`, errs),
  };
}

/** Validate a parsed YAML document. Throws one Error listing every problem found. */
export function parseTariff(raw: unknown): Tariff {
  const errs: string[] = [];
  const doc = isObj(raw) ? raw : {};
  const effective = isoDate(doc.effective, 'effective', errs);
  const verified = isoDate(doc.verified, 'verified', errs);
  if (verified < effective) errs.push('verified is before effective: it should be the day someone checked these prices');
  if (typeof doc.source !== 'string' || !/^https:\/\//.test(doc.source)) errs.push('source must be an https URL');

  const sm = doc.summer_months;
  if (!Array.isArray(sm) || sm.length !== 2 || !sm.every((m) => Number.isInteger(m) && m >= 1 && m <= 12) || (sm[0] as number) > (sm[1] as number)) {
    errs.push('summer_months must be [first, last] month numbers, e.g. [5, 10]');
  }
  const plans = isObj(doc.plans) ? doc.plans : {};
  const tou = timedPlan(plans.tou, 'plans.tou', errs);
  const ulo = timedPlan(plans.ulo, 'plans.ulo', errs);
  const t = isObj(plans.tiered) ? plans.tiered : {};
  const tp = prices(t.prices, 'plans.tiered', errs);
  for (const k of ['tier1', 'tier2']) if (tp[k] === undefined) errs.push(`plans.tiered.prices.${k} is missing`);
  const th = isObj(t.threshold_kwh) ? t.threshold_kwh : {};
  for (const s of ['winter', 'summer']) {
    if (typeof th[s] !== 'number' || (th[s] as number) <= 0) errs.push(`plans.tiered.threshold_kwh.${s} must be a positive number`);
  }
  if (errs.length) throw new Error(`Invalid tariff file:\n - ${errs.join('\n - ')}`);
  return {
    effective,
    verified,
    source: doc.source as string,
    summerMonths: sm as [number, number],
    tou,
    ulo,
    tiered: { tier1: tp.tier1!, tier2: tp.tier2!, thresholdWinter: th.winter as number, thresholdSummer: th.summer as number },
  };
}

/** True once the next Nov 1 after `effective` has arrived: the OEB will have reset the prices. */
export function isStale(t: Tariff, today: string): boolean {
  const year = Number(t.effective.slice(0, 4));
  const next = t.effective.slice(5) < '11-01' ? `${year}-11-01` : `${year + 1}-11-01`;
  return today >= next;
}
