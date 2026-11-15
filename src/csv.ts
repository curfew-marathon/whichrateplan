import type { IntervalRecord } from './model.ts';

export const CSV_HEADER = 'interval_start,kwh,quality';

export function toCsv(records: IntervalRecord[]): string {
  const rows = records.map((r) => `${r.start},${r.kwh === null ? '' : r.kwh},${r.kwh === null ? 'missing' : 'ok'}`);
  return [CSV_HEADER, ...rows].join('\n') + '\n';
}

export function fromCsv(text: string): { records: IntervalRecord[]; problems: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  const problems: string[] = [];
  if (lines[0]?.trim() !== CSV_HEADER) {
    return { records: [], problems: [`expected the header "${CSV_HEADER}"`] };
  }
  const records: IntervalRecord[] = [];
  lines.slice(1).forEach((line, i) => {
    const [start, kwh] = line.split(',');
    if (!start || !/^\d{4}-\d{2}-\d{2}T\d{2}:00$/.test(start)) {
      problems.push(`row ${i + 2}: bad interval_start "${start ?? ''}"`);
      return;
    }
    if (kwh === undefined || kwh === '') return void records.push({ start, kwh: null });
    const n = Number(kwh);
    if (!Number.isFinite(n) || n < 0) {
      problems.push(`row ${i + 2}: bad kwh "${kwh}"`);
      return;
    }
    records.push({ start, kwh: n });
  });
  return { records, problems };
}
