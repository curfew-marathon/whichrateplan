import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { findLeaks, type TrackedFile } from './helpers/leaks.ts';

const f = (content: string, over: Partial<TrackedFile> = {}): TrackedFile => ({ path: 'x.md', mode: '100644', content, ...over });

// Regression: a node_modules symlink to a local path was once committed to this public repo.
test('a committed symlink is flagged', () => {
  assert.equal(findLeaks([f('/some/target', { path: 'node_modules', mode: '120000' })]).length, 1);
});

test('home directory paths are flagged', () => {
  assert.equal(findLeaks([f('see /Users/someone/src/project')]).length, 1);
  assert.equal(findLeaks([f('see /home/someone/project')]).length, 1);
  assert.equal(findLeaks([f('see C:\\Users\\someone\\project')]).length, 1);
});

test('tilde paths are flagged', () => {
  assert.equal(findLeaks([f('run ~/Downloads/script.py')]).length, 1);
});

test('personal email addresses are flagged but GitHub noreply addresses are not', () => {
  assert.equal(findLeaks([f('contact someone@example.com')]).length, 1);
  assert.equal(findLeaks([f('12345+name@users.noreply.github.com')]).length, 0);
});

test('em dashes are flagged', () => {
  assert.equal(findLeaks([f(`a ${String.fromCharCode(0x2014)} b`)]).length, 1);
});

test('ordinary text and en dashes are not flagged', () => {
  assert.deepEqual(findLeaks([f('Oct\u2013May, 100% fine, ./relative/path and a/b/c')]), []);
});

test('every tracked file in this repo is clean', () => {
  const ls = execFileSync('git', ['ls-files', '-s', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  const files: TrackedFile[] = [];
  for (const line of ls) {
    const [meta, path] = line.split('\t') as [string, string];
    const mode = meta.split(' ')[0]!;
    files.push({ path, mode, content: mode === '120000' ? '' : readFileSync(path, 'utf8') });
  }
  assert.deepEqual(findLeaks(files), []);
});
