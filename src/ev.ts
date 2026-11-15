import type { IntervalRecord } from './model.ts';

/** A Level 2 charger tops out near this; used to tell charging from ordinary appliance load. */
export const CHARGER_KW = 11.5;
const JUMP = 4.5; // kWh rise from one hour to the next that starts a session
const SUSTAIN = 4.0; // kWh above the pre-session level that keeps a session going
const TAIL = 1.5; // partial last hour of a session

/**
 * Finds EV-charging energy in hourly data. A session starts with a jump of at least JUMP kWh over the
 * previous hour and lasts while usage stays at least SUSTAIN above the level just before it. Returns the
 * excess kWh per record (0 when not charging). Missing (null) hours are skipped, never guessed.
 * Heuristic: it cannot see slow Level 1 charging or sessions shorter than about 25 minutes.
 */
export function detectEv(records: IntervalRecord[]): number[] {
  const s = records.map((r) => (r.kwh === null ? Number.NaN : r.kwh));
  const ev = new Array<number>(s.length).fill(0);
  let i = 2;
  while (i < s.length) {
    const prev = s[i - 1]!, prev2 = s[i - 2]!, cur = s[i]!;
    const pre = Math.min(prev, prev2);
    if (cur - prev >= JUMP && cur - pre >= JUMP) {
      let j = i;
      while (j < s.length && s[j]! - pre >= SUSTAIN && s[j]! - pre <= CHARGER_KW + 1.5) {
        ev[j] = s[j]! - pre;
        j++;
      }
      if (j < s.length && s[j]! - pre >= TAIL) {
        ev[j] = s[j]! - pre;
        j++;
      }
      i = j;
    } else {
      i++;
    }
  }
  return ev;
}

export interface EvOptions {
  /** Move all charging into 00:00-07:00 of the same day (covers 11pm-7am under ULO). */
  overnight: boolean;
  /** 1 = as in the file; 2 = twice as much charging. */
  scale: number;
}

export function evKwh(records: IntervalRecord[]): number {
  return detectEv(records).reduce((a, v) => a + v, 0);
}

/** Re-shape the EV charging in `records` per `opts`. Total kWh outside EV charging never changes. */
export function applyEv(records: IntervalRecord[], opts: EvOptions): IntervalRecord[] {
  if (!opts.overnight && opts.scale === 1) return records;
  const ev = detectEv(records);
  const out = records.map((r, i) => (r.kwh === null ? r : { ...r, kwh: r.kwh + (opts.overnight ? -ev[i]! : ev[i]! * (opts.scale - 1)) }));
  if (!opts.overnight) return out;

  const byDay = new Map<string, number[]>(); // day -> record indices
  const evByDay = new Map<string, number>();
  records.forEach((r, i) => {
    const day = r.start.slice(0, 10);
    (byDay.get(day) ?? byDay.set(day, []).get(day)!).push(i);
    evByDay.set(day, (evByDay.get(day) ?? 0) + ev[i]!);
  });
  for (const [day, idx] of byDay) {
    let left = evByDay.get(day)! * opts.scale;
    if (left <= 0) continue;
    const slots = idx.filter((i) => Number(records[i]!.start.slice(11, 13)) < 7 && records[i]!.kwh !== null);
    if (slots.length === 0) {
      // No overnight hours with data that day: leave this day's charging where it was.
      for (const i of idx) if (ev[i]! > 0 && out[i]!.kwh !== null) out[i] = { ...out[i]!, kwh: out[i]!.kwh! + ev[i]! * opts.scale };
      continue;
    }
    for (const i of slots) {
      const put = Math.min(CHARGER_KW, left);
      out[i] = { ...out[i]!, kwh: out[i]!.kwh! + put };
      left -= put;
    }
    if (left > 0) out[slots[slots.length - 1]!] = { ...out[slots[slots.length - 1]!]!, kwh: out[slots[slots.length - 1]!]!.kwh! + left };
  }
  return out;
}
