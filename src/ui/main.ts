import * as pdfjs from 'pdfjs-dist';
import { extractLines, type PdfLoader } from '../pdfText.ts';
import { parseWithAdapters } from '../adapters/index.ts';
import { fromCsv, toCsv } from '../csv.ts';
import { PLAN_IDS, PLAN_LABEL, type IntervalRecord } from '../model.ts';
import { monthlyCosts } from '../tariff/cost.ts';
import { CURRENT_RATES } from '../tariff/rates.ts';
import { recommend, SEASONAL_THRESHOLD_DOLLARS } from '../recommend.ts';
import { dollars, headline, splitText } from '../summary.ts';
import { monthlyChart } from './chart.ts';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.min.mjs', import.meta.url).href;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const results = $('results');

function h(tag: string, props: Record<string, string> = {}, ...kids: (Node | string)[]): HTMLElement {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) e.setAttribute(k, v);
  e.append(...kids);
  return e;
}

function showMessage(kind: 'error' | 'warn', title: string, lines: string[]) {
  results.replaceChildren(h('section', { class: `card ${kind}` }, h('h2', {}, title), h('ul', {}, ...lines.map((l) => h('li', {}, l)))));
}

interface State { records: IntervalRecord[]; notes: string[]; cutoff: number }

function renderResults(outlet: HTMLElement, st: State) {
  const months = monthlyCosts(st.records, CURRENT_RATES);
  const rec = recommend(months, st.cutoff);
  const head = headline(rec);

  const table = h('table', {},
    h('thead', {}, h('tr', {}, h('th', {}, 'Plan'), h('th', { class: 'num' }, `Cost over ${rec.monthsCovered} month${rec.monthsCovered === 1 ? '' : 's'}`))),
    h('tbody', {}, ...[...PLAN_IDS].sort((a, b) => rec.planTotals[a] - rec.planTotals[b]).map((p, i) =>
      h('tr', i === 0 ? { class: 'best' } : {}, h('td', {}, PLAN_LABEL[p]), h('td', { class: 'num' }, dollars(rec.planTotals[p]))))),
  );
  const legend = h('div', { class: 'legend' }, ...PLAN_IDS.map((p) => h('span', { class: `key key-${p}` }, PLAN_LABEL[p])));
  const csvBtn = h('button', { type: 'button', class: 'btn' }, 'Download as CSV') as HTMLButtonElement;
  csvBtn.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([toCsv(st.records)], { type: 'text/csv' }));
    const a = h('a', { href: url, download: 'hourly-usage.csv' });
    document.body.append(a);
    (a as HTMLAnchorElement).click();
    a.remove();
    URL.revokeObjectURL(url);
  });
  const split = rec.seasonal
    ? [h('section', { class: 'card' }, h('h3', {}, 'Best seasonal split'),
        h('p', { class: 'split' }, splitText(rec.seasonal)),
        h('p', {}, `${dollars(rec.seasonal.total)} a year, ${dollars(rec.seasonal.saving)} less than ${PLAN_LABEL[rec.bestSingle.plan]} all year (${dollars(rec.bestSingle.total)}). `,
          rec.seasonal.worthIt ? `That clears your ${dollars(rec.threshold)} cutoff.` : `That is under your ${dollars(rec.threshold)} cutoff, so we suggest staying put.`))]
    : [];

  outlet.replaceChildren(
    h('section', { class: 'card hero' }, h('h2', {}, head.title), h('p', {}, head.detail)),
    ...(st.notes.length ? [h('section', { class: 'card warn' }, h('ul', {}, ...st.notes.map((n) => h('li', {}, n))))] : []),
    h('section', { class: 'card' }, h('h3', {}, 'What each plan would cost you'), table,
      h('p', { class: 'fine' }, `Commodity charges only, at the prices effective ${CURRENT_RATES.effective}. Delivery, regulatory charges and tax are the same on every plan.`)),
    ...split,
    h('section', { class: 'card' }, h('h3', {}, 'Month by month'), monthlyChart(months), legend),
    h('section', { class: 'card' }, h('h3', {}, 'If you switch'),
      h('p', {}, 'A change only starts at the beginning of your next billing period. Submit the form at least 10 business days before that period starts, and only one change is processed per billing cycle.'),
      csvBtn),
  );
}

function render(records: IntervalRecord[], notes: string[]) {
  const st: State = { records, notes, cutoff: SEASONAL_THRESHOLD_DOLLARS };
  const outlet = h('div', { id: 'outlet' });
  const redraw = () => renderResults(outlet, st);

  const cutoff = h('input', { type: 'number', min: '0', step: '10', value: String(st.cutoff), id: 'cutoff', inputmode: 'numeric' }) as HTMLInputElement;
  cutoff.addEventListener('input', () => { const n = Number(cutoff.value); if (cutoff.value !== '' && Number.isFinite(n) && n >= 0) { st.cutoff = n; redraw(); } });
  const controls = [h('label', { class: 'field', for: 'cutoff' }, 'Only suggest a seasonal switch if it saves at least $', cutoff, ' a year')];

  results.replaceChildren(h('section', { class: 'card controls' }, h('h3', {}, 'Your cutoff'), ...controls), outlet);
  redraw();
  results.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

async function handle(file: File) {
  results.replaceChildren(h('p', { class: 'status', role: 'status' }, 'Reading your file in this browser…'));
  try {
    if (/\.csv$/i.test(file.name)) {
      const { records, problems } = fromCsv(await file.text());
      if (problems.length) return showMessage('error', 'That CSV did not look right', problems.slice(0, 8));
      return render(records, []);
    }
    const lines = await extractLines(new Uint8Array(await file.arrayBuffer()), pdfjs.getDocument as unknown as PdfLoader);
    const { result } = parseWithAdapters(lines);
    if (result.problems.length) {
      return showMessage('error', 'We could not trust this file, so we did not guess', result.problems.slice(0, 8));
    }
    render(result.records, result.notes);
  } catch (e) {
    showMessage('error', 'Could not read that file', [e instanceof Error ? e.message : 'Unknown error']);
  }
}

const input = $<HTMLInputElement>('file');
const drop = $('drop');
input.addEventListener('change', () => input.files?.[0] && void handle(input.files[0]));
for (const ev of ['dragenter', 'dragover']) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); });
for (const ev of ['dragleave', 'drop']) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); });
drop.addEventListener('drop', (e) => { const f = (e as DragEvent).dataTransfer?.files[0]; if (f) void handle(f); });

const themeBtn = $('theme');
const saved = (() => { try { return localStorage.getItem('theme'); } catch { return null; } })();
if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
themeBtn.addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  const next = dark ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch { /* private mode: fine */ }
});
