/** One hour of usage. `start` is the local wall-clock hour start, 'YYYY-MM-DDTHH:00'. */
export interface IntervalRecord {
  start: string;
  /** kWh used in the hour; null when the utility reported no data (e.g. "ND"). */
  kwh: number | null;
}

export interface ParseResult {
  records: IntervalRecord[];
  /** Anything that makes the data untrustworthy. Empty means every check passed. */
  problems: string[];
  /** Non-fatal observations (e.g. missing hours), shown to the user. */
  notes: string[];
}

/** One utility's export format. Add a new utility by adding an adapter to adapters/index.ts. */
export interface FormatAdapter {
  id: string;
  label: string;
  /** Cheap check on the extracted text lines. */
  detect(lines: string[]): boolean;
  parse(lines: string[]): ParseResult;
}

export type PlanId = 'tiered' | 'tou' | 'ulo';
export const PLAN_IDS: readonly PlanId[] = ['tiered', 'tou', 'ulo'];
export const PLAN_LABEL: Record<PlanId, string> = {
  tiered: 'Tiered',
  tou: 'Time-of-Use',
  ulo: 'Ultra-Low Overnight',
};
