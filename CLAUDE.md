# CLAUDE.md

Client-side site that compares Ontario Tiered / Time-of-Use / Ultra-Low Overnight plans from a user's
Alectra hourly usage PDF. Static, no backend. Public repo: published via GitHub Pages.

## Commands (Node 26, see `.nvmrc`)

    npm ci
    npm run check      # typecheck + lint + tests; run before every commit
    npm test           # node:test; fails if line, branch or function coverage of src/ (UI excluded) is under 99%
    npm run build      # esbuild -> dist/

## Layout

    src/adapters/   one adapter per utility (detect + parse text lines); register in adapters/index.ts
    src/pdfText.ts  pdf.js -> text lines (loader is injected so tests run under Node)
    data/tariffs/   the OEB prices and hours as YAML (update every Nov 1; see README)
    src/tariff/     tariff.ts (validates the YAML), current.ts (which file is live), holidays.ts (computed),
                    periods.ts, cost.ts
    src/recommend.ts, summary.ts   plan totals, seasonal split, plain-language headline
    src/ev.ts       EV charging detection/shifting; tested but not wired into the UI right now
    src/ui/         vanilla DOM + CSS tokens, no framework
    tests/          synthetic rows and a hand-built PDF; golden.test.ts uses local-fixtures/ if present

## Rules

- **Never commit real usage data.** Real PDFs/CSVs go in `local-fixtures/` (gitignored). They hold a
  meter ID and hourly usage. Test fixtures use fake IDs. This repo is public.
- **Dependencies are pinned exactly** (no `^`). Keep the set tiny; adding one needs a reason. TypeScript
  is held at 6.0.x because typescript-eslint does not support 7. Source avoids syntax Node's type
  stripping rejects (enums, parameter properties); `erasableSyntaxOnly` enforces it.
- **No em dashes** anywhere in code, docs or UI copy.
- **Costs are commodity only.** Delivery and regulatory charges are identical across plans, but HST is
  charged on the whole bill, so it varies with the commodity charge. The plan ranking holds; after-tax
  savings are somewhat larger than the figures shown. Hours are hour-ENDING in the PDF: column `1:00` is
  the hour starting 00:00.
- When a change touches existing behaviour, keep a test for the behaviour that is meant to stay the same,
  and update the tests for anything deliberately changed. When a review or bug is fixed, add a
  regression test that fails without the fix.
- `tests/golden.test.ts` only runs when real PDFs are in `local-fixtures/`; otherwise it is skipped.
- `main` is protected: open a PR, do not push directly.

## Adding a utility

New adapter in `src/adapters/`, register it, add synthetic-row tests, and extend the "supported" copy in
`src/ui/index.html`. Nothing in `tariff/` or `recommend.ts` should need to change.
