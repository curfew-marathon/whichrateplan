import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alectraPdf, parseAlectraLines } from '../src/adapters/alectraPdf.ts';
import { parseWithAdapters } from '../src/adapters/index.ts';
import { flat, HEADER_NEW, HEADER_OLD, ramp, row } from './helpers/rows.ts';

test('a valid row yields 24 records', () => {
  const r = parseAlectraLines([HEADER_NEW, row(2025, 11, 1, flat(1))]);
  assert.deepEqual(r.problems, []);
  assert.equal(r.records.length, 24);
  assert.equal(r.records.reduce((a, x) => a + (x.kwh ?? 0), 0), 24);
});

test('column order is hour-ending: first column is the hour starting 00:00, last is 23:00', () => {
  const r = parseAlectraLines([row(2025, 11, 1, ramp())]);
  assert.deepEqual(r.records[0], { start: '2025-11-01T00:00', kwh: 0.1 });
  assert.deepEqual(r.records[23], { start: '2025-11-01T23:00', kwh: 2.4 });
});

test('a Total that does not match the readings is a problem', () => {
  const r = parseAlectraLines([row(2025, 11, 1, flat(1), 30)]);
  assert.ok(r.problems.some((p) => p.includes('Total column')));
});

test('a duplicate day is a problem', () => {
  const r = parseAlectraLines([row(2025, 11, 1, flat(1)), row(2025, 11, 1, flat(1))]);
  assert.ok(r.problems.some((p) => p.includes('duplicate day 2025-11-01')));
});

test('a missing day in the middle is reported by date', () => {
  const r = parseAlectraLines([row(2025, 11, 1, flat(1)), row(2025, 11, 2, flat(1)), row(2025, 11, 4, flat(1))]);
  assert.ok(r.problems.includes('missing days: 2025-11-03'));
});

// Regression: a malformed row at the END of the range used to vanish, because missing days were
// computed only from the first and last day that parsed. It must be reported, not dropped.
test('a malformed boundary row (23 values) is reported, not silently dropped', () => {
  const bad = `3-Nov-25 ${flat(1).slice(0, 23).join(' ')} 23`;
  const r = parseAlectraLines([row(2025, 11, 1, flat(1)), row(2025, 11, 2, flat(1)), bad]);
  assert.ok(r.problems.some((p) => p.startsWith('unparsed row')));
});

test('a 25-value row is reported, not accepted', () => {
  const bad = `1-Nov-25 ${[...flat(1), 1].join(' ')} 25`;
  assert.ok(parseAlectraLines([bad]).problems.some((p) => p.startsWith('unparsed row')));
});

// Regression: an impossible date like 31-Feb must be reported, not crash the parser.
test('an impossible calendar date is a problem, not an exception', () => {
  const bad = row(2025, 2, 31, flat(1));
  assert.ok(parseAlectraLines([bad]).problems.some((p) => p.startsWith('unparsed row')));
});

// Regression: the May-June 2025 export glues ND onto the previous number ("0.82ND ND ND ...").
test('ND cells glued to the previous number become null and the day still parses', () => {
  const readings: (number | 'ND')[] = [...flat(1).slice(0, 13), ...Array<'ND'>(11).fill('ND')];
  const line = row(2025, 5, 12, readings).replace('1 ND', '1ND'); // glue the first ND like the real PDF
  const r = parseAlectraLines([line]);
  assert.deepEqual(r.problems, []);
  assert.equal(r.records.filter((x) => x.kwh === null).length, 11);
  assert.equal(r.records.filter((x) => x.kwh !== null).length, 13);
  assert.ok(r.notes.some((n) => n.includes('11 hours')));
});

test('the "Total Data" and "TOTAL DAILY" headers are both detected', () => {
  assert.ok(alectraPdf.detect([HEADER_NEW]));
  assert.ok(alectraPdf.detect([HEADER_OLD]));
  assert.ok(!alectraPdf.detect(['Some other bill']));
});

// Regression: the 2025 export prints register reads with decimals, the 2026 one as integers.
test('register lines with decimals reconcile against the interval total', () => {
  const reg = '100001 1/1/2025 0:05 1/2/2025 0:05 1000.5 1024.5 24 24';
  const ok = parseAlectraLines([reg, row(2025, 5, 12, flat(1))]);
  assert.deepEqual(ok.problems, []);
  const bad = parseAlectraLines(['100001 1/1/2025 0:05 1/2/2025 0:05 1000.5 1024.5 24 99', row(2025, 5, 12, flat(1))]);
  assert.ok(bad.problems.some((p) => p.includes('Interval Total')));
});

test('no rows at all is a clear problem', () => {
  assert.ok(parseAlectraLines(['hello']).problems[0]?.includes('does not look like'));
});

test('an unsupported file is rejected by the adapter registry with a plain message', () => {
  const { adapter, result } = parseWithAdapters(['Some other utility', '1,2,3']);
  assert.equal(adapter, null);
  assert.ok(result.problems[0]?.includes('only the Alectra'));
});

test('an unknown month name in the date column is reported, not guessed', () => {
  const bad = row(2025, 5, 12, flat(1)).replace('12-May-25', '12-Foo-25');
  assert.ok(parseAlectraLines([bad]).problems.some((p) => p.startsWith('unparsed row')));
});
