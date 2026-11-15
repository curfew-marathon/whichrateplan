import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractLines, type PdfLoader } from '../src/pdfText.ts';
import { parseWithAdapters } from '../src/adapters/index.ts';
import { flat, HEADER_NEW, ramp, row } from './helpers/rows.ts';
import { makePdf } from './helpers/makePdf.ts';

const loader = getDocument as unknown as PdfLoader;

test('lines survive a trip through a real PDF and pdf.js', async () => {
  const lines = ['Meter ID: 1', 'hello 1.5 2.5'];
  const out = await extractLines(makePdf([lines]), loader);
  assert.deepEqual(out, lines);
});

test('end to end: a synthetic Alectra PDF parses to the right records across pages', async () => {
  const pages = [
    ['Meter ID: 100001', HEADER_NEW, row(2025, 11, 1, ramp()), row(2025, 11, 2, flat(1))],
    [row(2025, 11, 3, flat(2))],
  ];
  const lines = await extractLines(makePdf(pages), loader);
  const { adapter, result } = parseWithAdapters(lines);
  assert.equal(adapter?.id, 'alectra-pdf');
  assert.deepEqual(result.problems, []);
  assert.equal(result.records.length, 72);
  assert.deepEqual(result.records[23], { start: '2025-11-01T23:00', kwh: 2.4 });
  assert.equal(result.records[71]?.start, '2025-11-03T23:00');
});
