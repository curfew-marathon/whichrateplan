/**
 * PDF -> text lines, using pdf.js. Text items are grouped by their y position and ordered by x, so a
 * table row comes back as one line. The pdf.js entry point is injected so the browser (main build +
 * worker) and the tests (legacy build under Node) share this code.
 */
interface TextItemLike {
  str: string;
  transform: number[];
}

export interface PdfLoader {
  (args: { data: Uint8Array }): { promise: Promise<PdfDocLike> };
}
interface PdfDocLike {
  numPages: number;
  getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }>;
}

const Y_TOLERANCE = 2;

export async function extractLines(data: Uint8Array, getDocument: PdfLoader): Promise<string[]> {
  const doc = await getDocument({ data }).promise;
  const lines: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = (content.items as TextItemLike[]).filter((i) => typeof i.str === 'string' && i.str.trim() !== '');
    const rows: { y: number; parts: { x: number; s: string }[] }[] = [];
    for (const it of items) {
      const x = it.transform[4] ?? 0, y = it.transform[5] ?? 0;
      const row = rows.find((r) => Math.abs(r.y - y) <= Y_TOLERANCE);
      if (row) row.parts.push({ x, s: it.str });
      else rows.push({ y, parts: [{ x, s: it.str }] });
    }
    rows.sort((a, b) => b.y - a.y); // PDF y grows upward: top of page first
    for (const r of rows) {
      r.parts.sort((a, b) => a.x - b.x);
      lines.push(r.parts.map((q) => q.s.trim()).join(' '));
    }
  }
  return lines;
}
