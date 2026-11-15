# CLAUDE.md

Client-side site that compares Ontario Tiered / Time-of-Use / Ultra-Low Overnight plans from a user's
Alectra hourly usage PDF. Static, no backend. Public repo: published via GitHub Pages.

## Commands (Node 26, see `.nvmrc`)

    npm ci
    npm run check      # typecheck + lint + tests; run before every commit
    npm test           # node:test with built-in TypeScript type stripping
    npm run build      # esbuild -> dist/

## Layout

    src/adapters/   one adapter per utility (detect + parse text lines); register in adapters/index.ts
    src/pdfText.ts  pdf.js -> text lines (loader is injected so tests run under Node)
    src/tariff/     rates.ts (update every Nov 1), holidays.ts (computed, no yearly list), periods.ts, cost.ts
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
- **Costs are commodity only** (delivery and HST are identical across plans). Hours are hour-ENDING in
  the PDF: column `1:00` is the hour starting 00:00.
- When a change touches existing behaviour, keep a test that the old behaviour still holds. When a review
  or bug is fixed, add a regression test that fails without the fix.
- `tests/golden.test.ts` checks the engine against totals cross-checked with an independent reference
  implementation. It only runs when real PDFs are in `local-fixtures/`; otherwise it is skipped.
- `main` is protected: open a PR, do not push directly.

## Adding a utility

New adapter in `src/adapters/`, register it, add synthetic-row tests, and extend the "supported" copy in
`src/ui/index.html`. Nothing in `tariff/` or `recommend.ts` should need to change.
