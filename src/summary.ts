import { PLAN_LABEL, type PlanId } from './model.ts';
import type { Recommendation } from './recommend.ts';

export const dollars = (n: number) => '$' + Math.round(n).toLocaleString('en-CA');

const range = (m: string[]) => (m.length === 1 ? m[0]! : `${m[0]}\u2013${m[m.length - 1]}`);

/** One line describing a seasonal split, e.g. "Ultra-Low Overnight Oct-Apr, Time-of-Use May-Sep". */
export function splitText(s: NonNullable<Recommendation['seasonal']>): string {
  return `${PLAN_LABEL[s.inside]} ${range(s.window)}, ${PLAN_LABEL[s.outside]} ${range(s.outsideMonths)}`;
}

/** Plain-language headline and detail for the result card. No DOM, so it is unit-testable. */
export function headline(r: Recommendation): { title: string; detail: string } {
  const sorted = (Object.entries(r.planTotals) as [PlanId, number][]).sort((a, b) => a[1] - b[1]);
  const [best, second, worst] = sorted as [[PlanId, number], [PlanId, number], [PlanId, number]];
  const gap = `${PLAN_LABEL[best[0]]} costs about ${dollars(second[1] - best[1])} a year less than ${PLAN_LABEL[second[0]]} and ${dollars(worst[1] - best[1])} less than ${PLAN_LABEL[worst[0]]}.`;

  if (r.advice === 'insufficient-data') {
    return {
      title: `${PLAN_LABEL[best[0]]} is cheapest on the ${r.monthsCovered} month${r.monthsCovered === 1 ? '' : 's'} you uploaded`,
      detail: `We need 12 months of hourly data (with few gaps) to judge a full year or a seasonal switch. Request a full year from Alectra and upload that. Until then, treat this as a partial answer.`,
    };
  }
  if (r.advice === 'seasonal' && r.seasonal) {
    const s = r.seasonal;
    return {
      title: `Switch seasonally: ${splitText(s)}`,
      detail: `That saves about ${dollars(s.saving)} a year over staying on ${PLAN_LABEL[r.bestSingle.plan]} all year, which clears your ${dollars(r.threshold)} cutoff. ${gap}`,
    };
  }
  const extra = r.seasonal
    ? ` A seasonal split would save only about ${dollars(r.seasonal.saving)} a year, under your ${dollars(r.threshold)} cutoff.`
    : '';
  return { title: `Stay on ${PLAN_LABEL[best[0]]} all year`, detail: `${gap}${extra}` };
}

/** What the cost figures do and do not include. HST is on the whole bill, so it differs by plan. */
export function costNote(effective: string): string {
  return `Commodity charges only, at the prices effective ${effective}. Delivery and regulatory charges are the same on every plan. HST is charged on the whole bill, so your after-tax saving is a little larger than shown.`;
}
