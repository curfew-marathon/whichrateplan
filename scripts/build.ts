import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
await build({
  entryPoints: ['src/ui/main.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2023',
  minify: true,
  outfile: 'dist/main.js',
});
cpSync('src/ui/index.html', 'dist/index.html');
cpSync('src/ui/styles.css', 'dist/styles.css');
cpSync('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'dist/pdf.worker.min.mjs');
console.log('built dist/');
