/**
 * Statutory holidays priced as weekends under TOU and ULO, computed from the OEB's rules so no
 * yearly list needs maintaining. A holiday that falls on a weekend moves to the next weekday that is
 * not already a holiday.
 */
const key = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const dow = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday

/** n-th (1-based) given weekday of a month. */
function nthWeekday(y: number, m: number, weekday: number, n: number): number {
  const first = dow(y, m, 1);
  return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
}

/** Anonymous Gregorian algorithm (Meeus/Jones/Butcher). */
function easter(y: number): { m: number; d: number } {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const mm = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * mm + 114) / 31);
  const day = ((h + l - 7 * mm + 114) % 31) + 1;
  return { m: month, d: day };
}

const cache = new Map<number, Set<string>>();

export function holidaysForYear(y: number): Set<string> {
  const hit = cache.get(y);
  if (hit) return hit;
  const e = easter(y);
  const goodFriday = new Date(Date.UTC(y, e.m - 1, e.d - 2));
  // Victoria Day: the Monday on or before May 24.
  const may24 = dow(y, 5, 24);
  const victoria = 24 - ((may24 + 6) % 7);
  const raw: [number, number][] = [
    [1, 1],
    [2, nthWeekday(y, 2, 1, 3)],
    [goodFriday.getUTCMonth() + 1, goodFriday.getUTCDate()],
    [5, victoria],
    [7, 1],
    [8, nthWeekday(y, 8, 1, 1)],
    [9, nthWeekday(y, 9, 1, 1)],
    [10, nthWeekday(y, 10, 1, 2)],
    [12, 25],
    [12, 26],
  ];
  const out = new Set<string>();
  for (const [m, d] of raw) {
    let t = Date.UTC(y, m - 1, d);
    // Weekend (or an already-taken day): roll forward to the next free weekday.
    for (;;) {
      const date = new Date(t);
      const w = date.getUTCDay();
      const k = key(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
      if (w !== 0 && w !== 6 && !out.has(k)) {
        out.add(k);
        break;
      }
      t += 86_400_000;
    }
  }
  cache.set(y, out);
  return out;
}

export function isHoliday(y: number, m: number, d: number): boolean {
  return holidaysForYear(y).has(key(y, m, d));
}
