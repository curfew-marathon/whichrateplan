/**
 * Reads the prices Alectra currently publishes and compares them with a tariff, so a scheduled job
 * (scripts/check-rates.ts) can propose the new tariff file when the OEB changes them. Prices only: the
 * hours and the tier thresholds are not read from the page and still need a person to check them.
 * Everything here is pure text in, text out; the script does the fetching and the file writes.
 */
import type { Tariff } from './tariff.ts';

/** Each price the page shows, with the label Alectra prints beside it. */
const LABELS = {
  'tou.on': 'TOU On-Peak',
  'tou.mid': 'TOU Mid-Peak',
  'tou.off': 'TOU Off-Peak',
  'ulo.on': 'ULO On-Peak',
  'ulo.mid': 'ULO Mid-Peak',
  'ulo.off': 'ULO Off-Peak',
  'ulo.ul': 'ULO Ultra-Low Overnight',
  'tiered.tier1': 'Tier 1',
  'tiered.tier2': 'Tier 2',
} as const;
export type PriceKey = keyof typeof LABELS;
const KEYS = Object.keys(LABELS) as PriceKey[];
const SECTIONS = ['TOU', 'Tiered', 'ULO'] as const;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export interface PublishedPrices {
  /** The latest "rates from" date the page shows, 'YYYY-MM-DD'. */
  effective: string;
  /** Cents per kWh. */
  prices: Record<PriceKey, number>;
}

export interface PriceChange {
  key: PriceKey;
  label: string;
  from: number | undefined;
  to: number;
}

/** The visible text of a page: tags become "|" so the words either side of one stay apart. */
export function pageText(html: string): string {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, '|')
    .replace(/&cent;/g, '¢')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

/**
 * Pull the nine prices and the effective date out of Alectra's "choose my rate option" page.
 * Throws one Error listing every problem, so a redesigned page fails loudly instead of yielding a guess.
 */
export function parseAlectraPrices(html: string): PublishedPrices {
  const text = pageText(html);
  const errs: string[] = [];
  const prices = {} as Record<PriceKey, number>;
  for (const key of KEYS) {
    const label = LABELS[key];
    const found = new Set([...text.matchAll(new RegExp(`${label}[\\s|]*(\\d+(?:\\.\\d+)?) ?¢/kWh`, 'g'))].map((m) => Number(m[1])));
    const [value] = found;
    if (value === undefined) errs.push(`no price found for "${label}"`);
    else if (found.size > 1) errs.push(`"${label}" has more than one price: ${[...found].join(', ')}`);
    else if (value <= 0 || value >= 100) errs.push(`"${label}" has an implausible price: ${value} cents/kWh`);
    else prices[key] = value;
  }
  const dates: string[] = [];
  for (const section of SECTIONS) {
    const m = new RegExp(`Current ${section} Rates[\\s|]*([A-Z][a-z]+) (\\d{1,2}), (\\d{4})`).exec(text);
    const month = m ? MONTHS.indexOf(m[1]!) + 1 : 0;
    if (!m || month === 0) errs.push(`no start date found for "Current ${section} Rates"`);
    else dates.push(`${m[3]}-${String(month).padStart(2, '0')}-${m[2]!.padStart(2, '0')}`);
  }
  if (errs.length) throw new Error(`Could not read the prices from the page (has it been redesigned?):\n - ${errs.join('\n - ')}`);
  // TOU and Tiered restart their date range each season while ULO runs the whole year; the newest start is
  // the earliest day every price on the page can have changed.
  return { effective: dates.sort().at(-1)!, prices };
}

/** The same nine prices as a tariff holds them. */
export function tariffPrices(t: Tariff): Record<PriceKey, number | undefined> {
  return {
    'tou.on': t.tou.prices.on,
    'tou.mid': t.tou.prices.mid,
    'tou.off': t.tou.prices.off,
    'ulo.on': t.ulo.prices.on,
    'ulo.mid': t.ulo.prices.mid,
    'ulo.off': t.ulo.prices.off,
    'ulo.ul': t.ulo.prices.ul,
    'tiered.tier1': t.tiered.tier1,
    'tiered.tier2': t.tiered.tier2,
  };
}

/** Every price where the page and the tariff disagree. Empty means the tariff is up to date. */
export function priceChanges(t: Tariff, p: PublishedPrices): PriceChange[] {
  const current = tariffPrices(t);
  return KEYS.filter((key) => current[key] !== p.prices[key]).map((key) => ({ key, label: LABELS[key], from: current[key], to: p.prices[key] }));
}

function swapOnce(text: string, re: RegExp, to: string, what: string): string {
  if ((text.match(re)?.length ?? 0) !== 1) throw new Error(`Cannot update the tariff file: expected exactly one ${what}`);
  return text.replace(re, (_all, lead: string) => `${lead}${to}`);
}

/**
 * A tariff file's text with the new prices and dates written in. Works on the text, not the parsed
 * document, so the comments, the hours and the YAML anchors survive untouched.
 */
export function updateTariffYaml(yaml: string, p: PublishedPrices, today: string): string {
  const { prices: n } = p;
  let out = swapOnce(yaml, /^(effective: )"[^"\n]*"/gm, `"${p.effective}"`, 'top-level "effective" line');
  out = swapOnce(out, /^(verified: )"[^"\n]*"/gm, `"${today}"`, 'top-level "verified" line');
  const plan = (name: string): RegExp => new RegExp(`^( {2}${name}:\\n(?: *#.*\\n)* {4}prices: )\\{[^}\\n]*\\}`, 'gm');
  out = swapOnce(out, plan('tou'), `{ on: ${n['tou.on']}, mid: ${n['tou.mid']}, off: ${n['tou.off']} }`, 'tou prices line');
  out = swapOnce(out, plan('ulo'), `{ on: ${n['ulo.on']}, mid: ${n['ulo.mid']}, off: ${n['ulo.off']}, ul: ${n['ulo.ul']} }`, 'ulo prices line');
  return swapOnce(out, plan('tiered'), `{ tier1: ${n['tiered.tier1']}, tier2: ${n['tiered.tier2']} }`, 'tiered prices line');
}

/** The pull request description: what changed, where it came from, and what the reviewer still has to check. */
export function changeSummary(changes: PriceChange[], p: PublishedPrices, source: string, file: string): string {
  const rows = changes.map((c) => `| ${c.label} | ${c.from ?? 'none'} | ${c.to} |`);
  return `The prices on [Alectra's rate page](${source}) no longer match the tariff the site uses. This adds \`${file}\` with the published prices and points the site at it.

| Price (cents/kWh) | Was | Now |
| --- | --- | --- |
${rows.join('\n')}

## Before merging

- [ ] Check the effective date. The page shows rates from ${p.effective}, taken from the newest date range on it.
- [ ] Check the hours and the Tiered thresholds against the page by hand. This job reads prices only, and copied the rest from the previous file.
- [ ] Close and reopen this pull request to run CI on it. Pull requests opened by a workflow do not start it on their own. \`npm run check\` passed in the job that opened this.
`;
}
