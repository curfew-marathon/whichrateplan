import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clock, injectPlanReference, longDate, PLAN_REFERENCE_MARKER, ranges, renderPlanReference, schedule } from '../src/tariff/reference.ts';
import type { PeriodName, TimedPlan } from '../src/tariff/tariff.ts';
import { TARIFF } from './helpers/tariff.ts';

const PAGE = readFileSync(new URL('../src/ui/index.html', import.meta.url), 'utf8');
const SITE = 'https://curfew-marathon.github.io/whichrateplan/';

/** 24 hours of `fill`, with [from, to) set to `p`. */
const hours = (fill: PeriodName, p: PeriodName, from: number, to: number): PeriodName[] =>
  Array.from({ length: 24 }, (_, h) => (h >= from && h < to ? p : fill));

test('clock names midnight and noon and uses a 12-hour clock otherwise', () => {
  assert.deepEqual([0, 1, 11, 12, 13, 23, 24].map(clock), ['midnight', '1 a.m.', '11 a.m.', 'noon', '1 p.m.', '11 p.m.', 'midnight']);
});

test('ranges joins consecutive hours and keeps separate runs apart', () => {
  assert.deepEqual(ranges(TARIFF.tou.weekday.winter, 'on'), [[7, 11], [17, 19]]);
  assert.deepEqual(ranges(TARIFF.tou.weekday.winter, 'ul'), []);
  assert.deepEqual(ranges(TARIFF.tou.weekendHoliday, 'off'), [[0, 24]]);
});

test('ranges reports a run that wraps past midnight as one range', () => {
  assert.deepEqual(ranges(TARIFF.tou.weekday.winter, 'off'), [[19, 7]]);
  assert.deepEqual(ranges(TARIFF.ulo.weekendHoliday, 'ul'), [[23, 7]]);
  // Touching only one end of the day is not a wrap.
  assert.deepEqual(ranges(hours('mid', 'on', 0, 3), 'on'), [[0, 3]]);
  assert.deepEqual(ranges(hours('mid', 'on', 20, 24), 'on'), [[20, 24]]);
});

test('schedule describes the shipped plans the way the OEB does', () => {
  assert.deepEqual(schedule(TARIFF.tou, 'on'), ['Winter weekdays, 7 a.m. to 11 a.m. and 5 p.m. to 7 p.m.', 'Summer weekdays, 11 a.m. to 5 p.m.']);
  assert.deepEqual(schedule(TARIFF.tou, 'off'), ['Weekdays, 7 p.m. to 7 a.m.', 'Weekends and holidays, all day']);
  assert.deepEqual(schedule(TARIFF.ulo, 'ul'), ['Every day, 11 p.m. to 7 a.m.']);
  assert.deepEqual(schedule(TARIFF.ulo, 'on'), ['Weekdays, 4 p.m. to 9 p.m.']);
  assert.deepEqual(schedule(TARIFF.ulo, 'mid'), ['Weekdays, 7 a.m. to 4 p.m. and 9 p.m. to 11 p.m.']);
  assert.deepEqual(schedule(TARIFF.ulo, 'off'), ['Weekends and holidays, 7 a.m. to 11 p.m.']);
});

test('schedule handles a period used in only one season, or not at all', () => {
  const plan: TimedPlan = {
    prices: { on: 2, off: 1, mid: 1.5 },
    weekday: { winter: hours('off', 'on', 8, 10), summer: hours('off', 'mid', 12, 24) },
    weekendHoliday: hours('off', 'off', 0, 0),
  };
  assert.deepEqual(schedule(plan, 'on'), ['Winter weekdays, 8 a.m. to 10 a.m.']);
  assert.deepEqual(schedule(plan, 'mid'), ['Summer weekdays, noon to midnight']);
  assert.deepEqual(schedule(plan, 'ul'), []);
});

test('longDate writes an ISO date out in words', () => {
  assert.equal(longDate('2026-11-01'), 'November 1, 2026');
  assert.equal(longDate('2027-05-31'), 'May 31, 2027');
});

test('the rendered reference shows every price in the tariff, and only the periods each plan has', () => {
  const html = renderPlanReference(TARIFF);
  for (const n of [...Object.values(TARIFF.tou.prices), ...Object.values(TARIFF.ulo.prices), TARIFF.tiered.tier1, TARIFF.tiered.tier2]) {
    assert.ok(html.includes(`${n.toFixed(1)}&nbsp;¢/kWh`), `missing price ${n}`);
  }
  assert.equal(html.split('Ultra-low overnight</th>').length - 1, 1, 'only ULO has an ultra-low period');
  assert.equal(html.split('On-peak</th>').length - 1, 2);
  assert.match(html, /first 1,000&nbsp;kWh in winter, or the first 600&nbsp;kWh in summer/);
  assert.match(html, /start of May to the end of October/);
  assert.match(html, /took effect on November 1, 2026/);
  assert.ok(html.includes(`<a href="${TARIFF.source}">`));
});

test('the rendered reference follows the tariff it is given and escapes the source URL', () => {
  const t = structuredClone(TARIFF);
  t.tou.prices.on = 20;
  t.summerMonths = [6, 9];
  t.source = 'https://example.org/?a=1&b="2"';
  const html = renderPlanReference(t);
  assert.ok(html.includes('20.0&nbsp;¢/kWh'));
  assert.ok(!html.includes('18.9'));
  assert.match(html, /start of June to the end of September/);
  assert.ok(html.includes('href="https://example.org/?a=1&amp;b=&quot;2&quot;"'));
});

test('injectPlanReference replaces the marker in the real page', () => {
  const out = injectPlanReference(PAGE, TARIFF);
  assert.ok(!out.includes(PLAN_REFERENCE_MARKER));
  assert.ok(out.includes(renderPlanReference(TARIFF)));
  assert.equal(out.length, PAGE.length - PLAN_REFERENCE_MARKER.length + renderPlanReference(TARIFF).length);
});

test('injectPlanReference refuses a page with no marker or more than one', () => {
  assert.throws(() => injectPlanReference('<main></main>', TARIFF), /exactly once/);
  assert.throws(() => injectPlanReference(PLAN_REFERENCE_MARKER + PLAN_REFERENCE_MARKER, TARIFF), /exactly once/);
});

test('the page head carries a keyword title, description, canonical and matching share tags', () => {
  const title = /<title>([^<]+)<\/title>/.exec(PAGE)![1]!;
  assert.match(title, /Ontario/);
  assert.ok(title.length <= 60, `title is ${title.length} characters; search results cut it off after about 60`);
  const description = /<meta name="description" content="([^"]+)">/.exec(PAGE)![1]!;
  assert.ok(description.length >= 70 && description.length <= 160, `description is ${description.length} characters`);
  assert.ok(PAGE.includes(`<link rel="canonical" href="${SITE}">`));
  assert.ok(PAGE.includes(`<meta property="og:url" content="${SITE}">`));
  assert.match(PAGE, /<meta property="og:title" content="[^"]+">/);
  assert.match(PAGE, /<link rel="icon" href="\.\/favicon\.svg"/);
});

test('the structured data is valid JSON describing the site at its canonical URL', () => {
  const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]+?)<\/script>/.exec(PAGE)![1]!) as Record<string, unknown>;
  assert.equal(ld['@context'], 'https://schema.org');
  assert.equal(ld['@type'], 'WebApplication');
  assert.equal(ld.url, SITE);
});

// The tool's hooks must survive edits to the page copy: main.ts looks these up by id.
test('the page keeps one h1 and the elements the script needs', () => {
  assert.equal(PAGE.split('<h1').length - 1, 1);
  for (const id of ['theme', 'drop', 'file', 'results', 'prices-note']) assert.ok(PAGE.includes(`id="${id}"`), `missing #${id}`);
  assert.ok(PAGE.includes('<script type="module" src="./main.js"></script>'));
});

// Regression: prices were rounded to one decimal, so a 12.34 cent price showed as 12.3 while the calculator charged 12.34.
test('the rendered reference shows a price exactly as the tariff gives it, with at least one decimal', () => {
  const t = structuredClone(TARIFF);
  t.tou.prices.mid = 12.34;
  t.tiered.tier2 = 9.125;
  t.ulo.prices.ul = 4;
  const html = renderPlanReference(t);
  assert.ok(html.includes('12.34&nbsp;¢/kWh'));
  assert.ok(html.includes('9.125&nbsp;¢/kWh'));
  assert.ok(html.includes('>4.0&nbsp;¢/kWh'));
  assert.ok(!html.includes('12.3&nbsp;'));
});
