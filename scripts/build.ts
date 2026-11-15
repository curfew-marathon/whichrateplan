import { build, type Plugin } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { parse } from 'yaml';

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
cpSync('src/ui/index.html', 'dist/index.html');
cpSync('src/ui/styles.css', 'dist/styles.css');
cpSync('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'dist/pdf.worker.min.mjs');
console.log('built dist/');
