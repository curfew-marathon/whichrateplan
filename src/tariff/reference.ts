/**
 * The plan prices and hours as static HTML, rendered from the tariff so the reference tables on the page
 * can never drift from the numbers the calculator uses. scripts/build.ts injects it into index.html, which
 * puts the prices in the markup where search engines (and visitors without JavaScript) can read them.
 */
import type { PeriodName, Tariff, TimedPlan } from './tariff.ts';

/** Where the tables go in src/ui/index.html. */
export const PLAN_REFERENCE_MARKER = '<!-- plan-reference -->';

const PERIOD_LABELS: readonly [PeriodName, string][] = [['on', 'On-peak'], ['mid', 'Mid-peak'], ['off', 'Off-peak'], ['ul', 'Ultra-low overnight']];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** An hour on the 24h clock as people say it: 0 and 24 are "midnight", 12 is "noon", 19 is "7 p.m.". */
export function clock(h: number): string {
  if (h % 24 === 0) return 'midnight';
  if (h === 12) return 'noon';
  return h < 12 ? `${h} a.m.` : `${h - 12} p.m.`;
}

/** The hours a period covers as [from, to) ranges. A run that wraps past midnight comes back as one range, e.g. [19, 7]. */
export function ranges(hours: readonly PeriodName[], period: PeriodName): [number, number][] {
  const out: [number, number][] = [];
  for (let h = 0; h < 24; h++) {
    if (hours[h] !== period) continue;
    const last = out.at(-1);
    if (last && last[1] === h) last[1] = h + 1;
    else out.push([h, h + 1]);
  }
  if (out.length > 1 && out[0]![0] === 0 && out.at(-1)![1] === 24) out.at(-1)![1] = out.shift()![1];
  return out;
}

function when(hours: readonly PeriodName[], period: PeriodName): string {
  const r = ranges(hours, period);
  if (r.length === 1 && r[0]![0] === 0 && r[0]![1] === 24) return 'all day';
  return r.map(([a, b]) => `${clock(a)} to ${clock(b)}`).join(' and ');
}

/** When a period applies, one line per kind of day, collapsing the kinds that share the same hours. */
export function schedule(plan: TimedPlan, period: PeriodName): string[] {
  const winter = when(plan.weekday.winter, period);
  const summer = when(plan.weekday.summer, period);
  const weekend = when(plan.weekendHoliday, period);
  if (winter && winter === summer && summer === weekend) return [`Every day, ${winter}`];
  const lines: string[] = [];
  if (winter && winter === summer) lines.push(`Weekdays, ${winter}`);
  else {
    if (winter) lines.push(`Winter weekdays, ${winter}`);
    if (summer) lines.push(`Summer weekdays, ${summer}`);
  }
  if (weekend) lines.push(`Weekends and holidays, ${weekend}`);
  return lines;
}

// The price as written in the tariff, never rounded: a whole number gets one decimal (4 -> "4.0") so the column lines up.
const cents = (n: number): string => `${Number.isInteger(n) ? n.toFixed(1) : n}&nbsp;¢/kWh`;
const kwh = (n: number): string => `${n.toLocaleString('en-CA')}&nbsp;kWh`;
const attr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/** '2026-11-01' -> 'November 1, 2026' */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

function timedTable(title: string, plan: TimedPlan): string {
  const rows = PERIOD_LABELS.filter(([p]) => plan.prices[p] !== undefined)
    .map(([p, label]) => `<tr><th scope="row">${label}</th><td>${schedule(plan, p).join('<br>')}</td><td class="num">${cents(plan.prices[p]!)}</td></tr>`);
  return `<h3>${title}</h3>
<table>
<thead><tr><th scope="col">Period</th><th scope="col">When</th><th scope="col" class="num">Price</th></tr></thead>
<tbody>
${rows.join('\n')}
</tbody>
</table>`;
}

/** The three plans as headings and tables, plus a note on seasons, the effective date and the source. */
export function renderPlanReference(t: Tariff): string {
  const { tier1, tier2, thresholdWinter, thresholdSummer } = t.tiered;
  const [first, last] = t.summerMonths;
  return `${timedTable('Time-of-Use (TOU)', t.tou)}
${timedTable('Ultra-Low Overnight (ULO)', t.ulo)}
<h3>Tiered</h3>
<table>
<thead><tr><th scope="col">Usage each month</th><th scope="col" class="num">Price</th></tr></thead>
<tbody>
<tr><th scope="row">The first ${kwh(thresholdWinter)} in winter, or the first ${kwh(thresholdSummer)} in summer</th><td class="num">${cents(tier1)}</td></tr>
<tr><th scope="row">Everything above that</th><td class="num">${cents(tier2)}</td></tr>
</tbody>
</table>
<p class="fine">Summer runs from the start of ${MONTHS[first - 1]} to the end of ${MONTHS[last - 1]}; the rest of the year is winter. Prices are set by the Ontario Energy Board, took effect on ${longDate(t.effective)} and cover electricity only. <a href="${attr(t.source)}">See the prices on Alectra's site</a>.</p>`;
}

/** Put the tables where the marker is. Throws if the page lost its marker, so a build cannot quietly ship without them. */
export function injectPlanReference(html: string, t: Tariff): string {
  if (html.split(PLAN_REFERENCE_MARKER).length !== 2) throw new Error(`index.html must contain ${PLAN_REFERENCE_MARKER} exactly once`);
  return html.replace(PLAN_REFERENCE_MARKER, () => renderPlanReference(t));
}
