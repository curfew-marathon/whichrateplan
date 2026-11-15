/** Minimal one-font text PDF, one page per array entry, one line of text per row. No dependencies. */
export function makePdf(pages: string[][]): Uint8Array {
  const objs: string[] = [];
  const add = (s: string) => objs.push(s) && objs.length;
  const catalog = add('');
  const pagesObj = add('');
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
  const pageIds: number[] = [];
  for (const lines of pages) {
    const stream = lines
      .map((l, i) => `BT /F1 6 Tf 10 ${780 - i * 9} Td (${l.replace(/[\\()]/g, '\\$&')}) Tj ET`)
      .join('\n');
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    pageIds.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 1400 800] /Contents ${content} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`));
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}
