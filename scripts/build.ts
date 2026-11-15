import { build, type Plugin } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { parse } from 'yaml';
import { injectPlanReference } from '../src/tariff/reference.ts';
import type { Tariff } from '../src/tariff/tariff.ts';

// Turn data/*.yaml into a plain JSON module at build time, so the browser ships no YAML parser.
const yamlPlugin: Plugin = {
  name: 'yaml',
  setup(b) {
    b.onLoad({ filter: /\.ya?ml$/ }, (args) => ({ contents: JSON.stringify(parse(readFileSync(args.path, 'utf8'))), loader: 'json' }));
  },
};

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
await build({
  entryPoints: ['src/ui/main.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2023',
  minify: true,
  plugins: [yamlPlugin],
  outfile: 'dist/main.js',
});

// The price tables in the page are rendered from the live tariff. Node cannot import the YAML that
// current.ts points at, so bundle that one module in memory and load the result.
const current = await build({
  stdin: { contents: "export { CURRENT_TARIFF } from './src/tariff/current.ts';", resolveDir: '.' },
  bundle: true,
  format: 'esm',
  write: false,
  plugins: [yamlPlugin],
});
const { CURRENT_TARIFF } = (await import(`data:text/javascript;base64,${Buffer.from(current.outputFiles[0]!.text).toString('base64')}`)) as { CURRENT_TARIFF: Tariff };
writeFileSync('dist/index.html', injectPlanReference(readFileSync('src/ui/index.html', 'utf8'), CURRENT_TARIFF));
cpSync('src/ui/favicon.svg', 'dist/favicon.svg');
cpSync('src/ui/styles.css', 'dist/styles.css');
cpSync('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'dist/pdf.worker.min.mjs');
console.log('built dist/');
