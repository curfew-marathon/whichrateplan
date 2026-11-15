import { PLAN_IDS, PLAN_LABEL } from '../model.ts';
import type { MonthCost } from '../tariff/cost.ts';

const NS = 'http://www.w3.org/2000/svg';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function el(name: string, attrs: Record<string, string | number>, text?: string): SVGElement {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Grouped bars: one group per month, one bar per plan. Colours come from CSS variables. */
export function monthlyChart(months: MonthCost[]): SVGElement {
  const W = 720, H = 260, padL = 44, padB = 28, padT = 10;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Monthly cost by plan' });
  const max = Math.max(1, ...months.flatMap((m) => PLAN_IDS.map((p) => m.cost[p])));
  const top = Math.ceil(max / 50) * 50;
  const plotH = H - padB - padT, plotW = W - padL - 8;
  const y = (v: number) => padT + plotH - (v / top) * plotH;
  for (let g = 0; g <= 4; g++) {
    const v = (top / 4) * g;
    svg.append(el('line', { x1: padL, x2: W - 8, y1: y(v), y2: y(v), class: 'grid' }));
    svg.append(el('text', { x: padL - 6, y: y(v) + 4, class: 'tick', 'text-anchor': 'end' }, '$' + Math.round(v)));
  }
  const slot = plotW / Math.max(1, months.length);
  const bar = Math.min(16, (slot - 8) / 3);
  months.forEach((m, i) => {
    const x0 = padL + i * slot + (slot - bar * 3) / 2;
    PLAN_IDS.forEach((p, j) => {
      const h = (m.cost[p] / top) * plotH;
      const r = el('rect', { x: x0 + j * bar, y: y(m.cost[p]), width: bar - 1, height: h, class: `bar bar-${p}`, rx: 2 });
      r.append(el('title', {}, `${PLAN_LABEL[p]}, ${m.month}: $${m.cost[p].toFixed(2)}`));
      svg.append(r);
    });
    svg.append(el('text', { x: padL + i * slot + slot / 2, y: H - 8, class: 'tick', 'text-anchor': 'middle' }, MONTHS[Number(m.month.slice(5, 7)) - 1] ?? ''));
  });
  return svg;
}
