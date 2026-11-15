import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CSV_HEADER, fromCsv, toCsv } from '../src/csv.ts';

test('round trip keeps values and missing hours', () => {
  const recs = [
    { start: '2025-11-01T00:00', kwh: 0.68 },
    { start: '2025-11-01T01:00', kwh: null },
    { start: '2025-11-01T02:00', kwh: 0 },
  ];
  const text = toCsv(recs);
  assert.ok(text.startsWith(CSV_HEADER + '\n'));
  assert.ok(text.includes('2025-11-01T01:00,,missing'));
  assert.deepEqual(fromCsv(text), { records: recs, problems: [] });
});

test('bad header, bad timestamp and negative kWh are reported', () => {
  assert.ok(fromCsv('a,b\n').problems[0]?.includes('header'));
  assert.ok(fromCsv(`${CSV_HEADER}\nnope,1,ok\n`).problems[0]?.includes('interval_start'));
  assert.ok(fromCsv(`${CSV_HEADER}\n2025-11-01T00:00,-1,ok\n`).problems[0]?.includes('kwh'));
});
