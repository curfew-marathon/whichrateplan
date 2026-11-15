/** Things that must never be committed to this public repo. */
export interface TrackedFile {
  path: string;
  /** git file mode, e.g. '100644'; '120000' is a symlink. */
  mode: string;
  content: string;
}

const EM_DASH = String.fromCharCode(0x2014);
const NOREPLY = /@users\.noreply\.github\.com$/;

const CHECKS: { name: string; test: (f: TrackedFile) => string | null }[] = [
  { name: 'symlink', test: (f) => (f.mode === '120000' ? 'is a symlink (its target is a path on someone\'s machine)' : null) },
  { name: 'home path', test: (f) => /\/Users\/[A-Za-z0-9._-]+|\/home\/[A-Za-z0-9._-]+|[A-Z]:\\Users\\/.exec(f.content)?.[0] ?? null },
  { name: 'tilde path', test: (f) => /~\/[A-Za-z.]/.exec(f.content)?.[0] ?? null },
  {
    name: 'email',
    test: (f) => {
      for (const m of f.content.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) if (!NOREPLY.test(m[0])) return m[0];
      return null;
    },
  },
  { name: 'em dash', test: (f) => (f.content.includes(EM_DASH) ? 'contains an em dash' : null) },
];

/** Files that legitimately contain patterns this scan looks for. */
const SKIP = new Set(['package-lock.json', 'tests/helpers/leaks.ts', 'tests/leaks.test.ts']);

export function findLeaks(files: TrackedFile[]): string[] {
  const out: string[] = [];
  for (const f of files) {
    if (SKIP.has(f.path)) continue;
    for (const c of CHECKS) {
      const hit = c.test(f);
      if (hit) out.push(`${f.path}: ${c.name}: ${hit}`);
    }
  }
  return out;
}
