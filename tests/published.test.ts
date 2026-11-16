import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { changeSummary, pageText, parseAlectraPrices, priceChanges, tariffPrices, updateTariffYaml, type PriceKey, type PublishedPrices } from '../src/tariff/published.ts';
import { parseTariff } from '../src/tariff/tariff.ts';
import { TARIFF } from './helpers/tariff.ts';

const YAML_TEXT = readFileSync(new URL('../data/tariffs/2026-11-01.yaml', import.meta.url), 'utf8');
const SHIPPED = tariffPrices(TARIFF) as Record<PriceKey, number>;

interface PageOptions {
  prices?: Partial<Record<PriceKey, number | null>>;
  dates?: { tou?: string | null; tiered?: string | null; ulo?: string | null };
  extra?: string;
}

/** A small page laid out like Alectra's: a heading and date range per plan, then label and price pairs. null leaves one out. */
function page(o: PageOptions = {}): string {
  const p = { ...SHIPPED, ...o.prices };
  const d = { tou: 'November 01, 2026 - April 30, 2027', tiered: 'November 01, 2026 - April 30, 2027', ulo: 'November 01, 2026 - October 31, 2027', ...o.dates };
  const row = (label: string, key: PriceKey) => (p[key] === null ? '' : `<div><span>${label}</span><strong>${p[key]}&nbsp;&cent;/kWh</strong></div>`);
  const head = (name: string, range: string | null) => `<h3>Current ${name} Rates</h3>${range === null ? '' : `<p>${range}</p>`}`;
  return `<html><head><style>.x { content: "TOU On-Peak 99 ¢/kWh"; }</style><script>var s = "Tier 1 55 ¢/kWh";</script></head><body>
${head('TOU', d.tou)}<div>tou-oeb-pricing</div>${row('TOU On-Peak', 'tou.on')}${row('TOU Mid-Peak', 'tou.mid')}${row('TOU Off-Peak', 'tou.off')}
${head('Tiered', d.tiered)}${row('Tier 1', 'tiered.tier1')}${row('Tier 2', 'tiered.tier2')}<p>Residential &amp; Small Business</p>
${head('ULO', d.ulo)}${row('ULO On-Peak', 'ulo.on')}${row('ULO Mid-Peak', 'ulo.mid')}${row('ULO Off-Peak', 'ulo.off')}${row('ULO Ultra-Low Overnight', 'ulo.ul')}
${o.extra ?? ''}</body></html>`;
}

const published = (over: Partial<Record<PriceKey, number>> = {}, effective = '2027-11-01'): PublishedPrices => ({ effective, prices: { ...SHIPPED, ...over } });
const unreadable = (html: string, text: RegExp) => assert.throws(() => parseAlectraPrices(html), text);

test('pageText drops scripts and styles, keeps words in different tags apart and decodes entities', () => {
  const text = pageText('<style>a{}</style><p>One</p><script>\nvar hidden = 1;\n</script><b>Two&nbsp;&cent;&#160;&amp;\n three</b>');
  assert.ok(!text.includes('hidden') && !text.includes('a{}'));
  assert.match(text, /One\|.*\|Two ¢ & three\|/);
});

test('a page showing the shipped prices parses to exactly the shipped tariff', () => {
  const p = parseAlectraPrices(page());
  assert.deepEqual(p.prices, SHIPPED);
  assert.equal(p.effective, '2026-11-01');
  assert.deepEqual(priceChanges(TARIFF, p), []);
});

test('the effective date is the newest start date on the page', () => {
  // In summer TOU and Tiered show a May range while ULO still shows the November it started.
  assert.equal(parseAlectraPrices(page({ dates: { tou: 'May 1, 2027 - October 31, 2027', tiered: 'May 01, 2027 - October 31, 2027' } })).effective, '2027-05-01');
});

test('prices hidden in scripts and styles are ignored, and a price repeated with the same value is fine', () => {
  const p = parseAlectraPrices(page({ extra: `<p>TOU On-Peak</p><p>${SHIPPED['tou.on']} ¢/kWh</p>` }));
  assert.equal(p.prices['tou.on'], SHIPPED['tou.on']);
  assert.equal(p.prices['tiered.tier1'], SHIPPED['tiered.tier1']);
});

test('a page missing a price, or showing two different ones, is refused', () => {
  unreadable(page({ prices: { 'ulo.ul': null } }), /no price found for "ULO Ultra-Low Overnight"/);
  unreadable(page({ extra: '<p>Tier 2</p><p>14.0 ¢/kWh</p>' }), /"Tier 2" has more than one price: 13\.2, 14/);
});

test('a price that cannot be cents per kWh is refused', () => {
  unreadable(page({ prices: { 'tou.off': 0 } }), /"TOU Off-Peak" has an implausible price: 0/);
  unreadable(page({ prices: { 'tou.on': 189 } }), /"TOU On-Peak" has an implausible price: 189/);
});

test('a page with a missing or unreadable date range is refused', () => {
  unreadable(page({ dates: { ulo: null } }), /no date range found for "Current ULO Rates"/);
  unreadable(page({ dates: { tou: 'Nov 01, 2026 - Apr 30, 2027' } }), /"Current TOU Rates" has an impossible date range: Nov 01, 2026 - Apr 30, 2027/);
});

// Regression: only the start of the range was read, so a range with no readable end was accepted.
test('a date range without a readable end is refused', () => {
  unreadable(page({ dates: { tou: 'November 01, 2027 - unavailable' } }), /no date range found for "Current TOU Rates"/);
  unreadable(page({ dates: { tiered: 'November 01, 2027' } }), /no date range found for "Current Tiered Rates"/);
});

// Regression: "November 99, 2027" became the date 2027-11-99, which sorts as far in the future, so a real
// price change was reported as "not in effect yet" and skipped without an error.
test('a date range with an impossible day, or one that ends before it starts, is refused', () => {
  unreadable(page({ dates: { ulo: 'November 99, 2027 - October 31, 2028' } }), /"Current ULO Rates" has an impossible date range: November 99, 2027 - October 31, 2028/);
  unreadable(page({ dates: { tou: 'November 01, 2027 - February 30, 2028' } }), /"Current TOU Rates" has an impossible date range/);
  unreadable(page({ dates: { tiered: 'November 01, 2027 - April 30, 2027' } }), /"Current Tiered Rates" has an impossible date range/);
});

test('a date range written with an en dash or without padding is read', () => {
  assert.equal(parseAlectraPrices(page({ dates: { ulo: 'December 5, 2026 \u2013 October 31, 2027' } })).effective, '2026-12-05');
});

test('every problem with a page is reported at once', () => {
  unreadable('<html><body>Under maintenance</body></html>', /redesigned[\s\S]*TOU On-Peak[\s\S]*Tier 2[\s\S]*Current TOU Rates[\s\S]*Current ULO Rates/);
});

test('priceChanges lists only the prices that differ', () => {
  assert.deepEqual(priceChanges(TARIFF, published({ 'tou.on': 20.3, 'tiered.tier2': 14 })), [
    { key: 'tou.on', label: 'TOU On-Peak', from: 18.9, to: 20.3 },
    { key: 'tiered.tier2', label: 'Tier 2', from: 13.2, to: 14 },
  ]);
});

test('a price the tariff lacks counts as a change', () => {
  const t = structuredClone(TARIFF);
  delete t.ulo.prices.ul;
  assert.deepEqual(priceChanges(t, published()), [{ key: 'ulo.ul', label: 'ULO Ultra-Low Overnight', from: undefined, to: 3.7 }]);
});

test('updateTariffYaml writes the new prices and dates into a file the site accepts', () => {
  const p = published({ 'tou.on': 20.3, 'tou.mid': 15, 'tou.off': 9.8, 'ulo.on': 39.1, 'ulo.mid': 15, 'ulo.off': 9.8, 'ulo.ul': 3.9, 'tiered.tier1': 12, 'tiered.tier2': 14.25 });
  const t = parseTariff(parse(updateTariffYaml(YAML_TEXT, p, '2027-11-02')));
  assert.deepEqual(tariffPrices(t), p.prices);
  assert.equal(t.effective, '2027-11-01');
  assert.equal(t.verified, '2027-11-02');
  assert.deepEqual(priceChanges(t, p), []);
});

test('updateTariffYaml leaves the hours, thresholds, comments and anchors alone', () => {
  const out = updateTariffYaml(YAML_TEXT, published({ 'tou.on': 20.3 }), '2027-11-02');
  const t = parseTariff(parse(out));
  assert.deepEqual([t.tou.weekday, t.tou.weekendHoliday, t.ulo.weekday, t.ulo.weekendHoliday], [TARIFF.tou.weekday, TARIFF.tou.weekendHoliday, TARIFF.ulo.weekday, TARIFF.ulo.weekendHoliday]);
  assert.deepEqual([t.tiered.thresholdWinter, t.tiered.thresholdSummer, t.summerMonths, t.source], [TARIFF.tiered.thresholdWinter, TARIFF.tiered.thresholdSummer, TARIFF.summerMonths, TARIFF.source]);
  assert.equal(out.split('\n').length, YAML_TEXT.split('\n').length);
  for (const kept of ['# Ontario Energy Board price plans', '# first day these prices apply', 'winter: &ulo_weekday', 'summer: *ulo_weekday', 'threshold_kwh:']) assert.ok(out.includes(kept), `lost "${kept}"`);
});

test('updateTariffYaml with the values a file already has gives the same text back', () => {
  assert.equal(updateTariffYaml(YAML_TEXT, { effective: TARIFF.effective, prices: SHIPPED }, TARIFF.verified), YAML_TEXT);
});

test('updateTariffYaml refuses a file whose lines it cannot find exactly once', () => {
  const p = published();
  assert.throws(() => updateTariffYaml(YAML_TEXT.replace('effective:', 'starts:'), p, '2027-11-02'), /exactly one top-level "effective" line/);
  assert.throws(() => updateTariffYaml(`${YAML_TEXT}verified: "2026-11-12"\n`, p, '2027-11-02'), /exactly one top-level "verified" line/);
  assert.throws(() => updateTariffYaml(YAML_TEXT.replace('prices: { tier1', 'prices:\n      { tier1'), p, '2027-11-02'), /exactly one tiered prices line/);
});

test('the pull request description shows each change and what is left to check', () => {
  const p = published({ 'tou.on': 20.3 });
  const t = structuredClone(TARIFF);
  delete t.ulo.prices.ul;
  const body = changeSummary(priceChanges(t, p), p, TARIFF.source, 'data/tariffs/2027-11-01.yaml');
  assert.ok(body.includes('| TOU On-Peak | 18.9 | 20.3 |'));
  assert.ok(body.includes('| ULO Ultra-Low Overnight | none | 3.7 |'));
  assert.ok(!body.includes('Tier 1'));
  assert.ok(body.includes(`(${TARIFF.source})`) && body.includes('`data/tariffs/2027-11-01.yaml`') && body.includes('rates from 2027-11-01'));
  assert.match(body, /hours and the Tiered thresholds/);
  assert.ok(!body.includes(String.fromCharCode(0x2014)));
});
