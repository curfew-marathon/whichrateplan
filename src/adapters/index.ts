import type { FormatAdapter, ParseResult } from '../model.ts';
import { alectraPdf } from './alectraPdf.ts';

/** First adapter whose detect() matches wins. Add other utilities here. */
export const ADAPTERS: readonly FormatAdapter[] = [alectraPdf];

export function parseWithAdapters(lines: string[]): { adapter: FormatAdapter | null; result: ParseResult } {
  const adapter = ADAPTERS.find((a) => a.detect(lines)) ?? null;
  if (!adapter) {
    return {
      adapter: null,
      result: {
        records: [],
        notes: [],
        problems: ['This file is not a format we support yet. Right now only the Alectra hourly usage PDF works.'],
      },
    };
  }
  return { adapter, result: adapter.parse(lines) };
}
