const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A date as the Alectra PDF prints it, e.g. 1-Nov-25. */
export function dateToken(y: number, m: number, d: number): string {
  return `${d}-${MON[m - 1]}-${String(y).slice(2)}`;
}

/** An Alectra data row: date, 24 readings, Total. `total` defaults to the true sum. */
export function row(y: number, m: number, d: number, readings: (number | 'ND')[], total?: number): string {
  const sum = readings.reduce<number>((a, v) => a + (v === 'ND' ? 0 : v), 0);
  const t = total ?? Math.round(sum * 100) / 100;
  return `${dateToken(y, m, d)} ${readings.join(' ')} ${t}`;
}

export const flat = (v: number): number[] => Array.from({ length: 24 }, () => v);
/** Distinct value per column so a column/hour mix-up is visible. */
export const ramp = (): number[] => Array.from({ length: 24 }, (_, i) => (i + 1) / 10);

export const HEADER_NEW = 'Date 1:00 2:00 3:00 4:00 5:00 6:00 7:00 8:00 9:00 10:00 11:00 12:00 13:00 14:00 15:00 16:00 17:00 18:00 19:00 20:00 21:00 22:00 23:00 0:00 Total Data';
export const HEADER_OLD = HEADER_NEW.replace('Total Data', 'TOTAL DAILY');
