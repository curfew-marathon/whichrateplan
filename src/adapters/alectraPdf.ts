import type { FormatAdapter, IntervalRecord, ParseResult } from '../model.ts';

const NUM = String.raw`-?\d+(?:\.\d+)?`;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DATE_LED = /^\d{1,2}-[A-Za-z]{3}-\d{2}\s/;
// Header seen in both the 2025 and 2026 exports: "Total Data" in one, "TOTAL DAILY" in the other.
const HEADER = /^Date\s+1:00\s+2:00\s.*\b23:00\s+0:00\b/;
const REGISTER = new RegExp(
  `^(\\d+)\\s+(\\d+/\\d+/\\d{4})\\s+[\\d:]+\\s+(\\d+/\\d+/\\d{4})\\s+[\\d:]+\\s+(${NUM})\\s+(${NUM})\\s+(${NUM})\\s+(${NUM})\\s*$`,
);
const TOTAL_TOLERANCE = 0.011 * 24;

const pad = (n: number) => String(n).padStart(2, '0');

function parseDate(token: string): { y: number; m: number; d: number } | null {
  // Only called on tokens that already matched DATE_LED, so this always matches.
  const parts = /^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/.exec(token)!;
  const m = MONTHS.indexOf(parts[2]!.toLowerCase()) + 1;
  const d = Number(parts[1]);
  const y = 2000 + Number(parts[3]);
  if (!m) return null;
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return { y, m, d };
}

/** "0.82ND ND" -> "0.82 ND ND": the PDF text glues ND cells onto the previous number. */
function normalise(line: string): string {
  return line.trim().replace(/(\d)(ND)\b/g, '$1 $2').replace(/\s+/g, ' ');
}

export function parseAlectraLines(rawLines: string[]): ParseResult {
  const problems: string[] = [];
  const notes: string[] = [];
  const days = new Map<string, (number | null)[]>();
  let registerTotal: number | null = null;

  for (const raw of rawLines) {
    const line = normalise(raw);
    if (DATE_LED.test(line)) {
      const [dateTok, ...rest] = line.split(' ');
      const date = parseDate(dateTok!);
      const valid = rest.length === 25 && rest.slice(0, 24).every((t) => t === 'ND' || new RegExp(`^${NUM}$`).test(t)) &&
        new RegExp(`^${NUM}$`).test(rest[24]!);
      if (!date || !valid) {
        problems.push(`unparsed row (not a real date, or not 24 readings + Total): "${line.slice(0, 60)}"`);
        continue;
      }
      const key = `${date.y}-${pad(date.m)}-${pad(date.d)}`;
      const readings = rest.slice(0, 24).map((t) => (t === 'ND' ? null : Number(t)));
      const total = Number(rest[24]);
      const sum = readings.reduce<number>((a, v) => a + (v ?? 0), 0);
      if (days.has(key)) problems.push(`duplicate day ${key}`);
      if (Math.abs(sum - total) > TOTAL_TOLERANCE) {
        problems.push(`${key}: hourly values sum to ${sum.toFixed(2)} but the Total column says ${total.toFixed(2)}`);
      }
      days.set(key, readings);
      continue;
    }
    const reg = REGISTER.exec(line);
    if (reg) registerTotal = Number(reg[7]);
  }

  if (days.size === 0) {
    problems.push('no hourly rows found: this does not look like an Alectra hourly usage PDF');
    return { records: [], problems, notes };
  }

  const keys = [...days.keys()].sort();
  const first = Date.parse(`${keys[0]}T00:00:00Z`);
  const last = Date.parse(`${keys[keys.length - 1]}T00:00:00Z`);
  const expected = Math.round((last - first) / 86_400_000) + 1;
  if (expected !== keys.length) {
    const have = new Set(keys);
    const gaps: string[] = [];
    for (let i = 0; i < expected; i++) {
      const k = new Date(first + i * 86_400_000).toISOString().slice(0, 10);
      if (!have.has(k)) gaps.push(k);
    }
    problems.push(`missing days: ${gaps.join(', ')}`);
  }

  const records: IntervalRecord[] = [];
  let missingHours = 0;
  for (const key of keys) {
    const readings = days.get(key)!;
    // Column order is hour-ENDING 1:00..23:00 then 0:00 (= 24:00), so column i is the hour starting at i.
    readings.forEach((kwh, h) => {
      if (kwh === null) missingHours++;
      records.push({ start: `${key}T${pad(h)}:00`, kwh });
    });
  }
  if (missingHours > 0) notes.push(`${missingHours} hours had no data ("ND") and are left out of the cost.`);

  const sum = records.reduce((a, r) => a + (r.kwh ?? 0), 0);
  if (registerTotal !== null && Math.abs(registerTotal - sum) > 0.5) {
    problems.push(`hourly values sum to ${sum.toFixed(2)} kWh but the PDF's Interval Total says ${registerTotal}`);
  }
  return { records, problems, notes };
}

export const alectraPdf: FormatAdapter = {
  id: 'alectra-pdf',
  label: 'Alectra hourly usage PDF',
  detect: (lines) => lines.some((l) => HEADER.test(normalise(l))),
  parse: parseAlectraLines,
};
