/** Prices in cents/kWh from the OEB / Alectra "choose my rate option" page. Update every Nov 1. */
export interface RateSet {
  effective: string; // first day these prices apply, 'YYYY-MM-DD'
  tou: { on: number; mid: number; off: number };
  ulo: { on: number; mid: number; off: number; ul: number };
  tiered: { tier1: number; tier2: number; thresholdWinter: number; thresholdSummer: number };
}

export const RATES_2026: RateSet = {
  effective: '2026-11-01',
  tou: { on: 18.9, mid: 14.6, off: 9.1 },
  ulo: { on: 37.7, mid: 14.6, off: 9.1, ul: 3.7 },
  tiered: { tier1: 11.2, tier2: 13.2, thresholdWinter: 1000, thresholdSummer: 600 },
};

export const CURRENT_RATES = RATES_2026;
