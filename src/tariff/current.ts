// The tariff the site prices against. Each November, add the new data/tariffs/<date>.yaml and point this at it.
import raw from '../../data/tariffs/2026-11-01.yaml';
import { parseTariff } from './tariff.ts';

export const CURRENT_TARIFF = parseTariff(raw);
