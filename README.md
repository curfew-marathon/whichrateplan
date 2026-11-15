# Which Rate Plan

Upload your Alectra hourly usage PDF and see whether Tiered, Time-of-Use or Ultra-Low Overnight
is cheapest for you, and whether switching with the seasons is worth it. Everything runs in the
browser; the file is never uploaded.

**Alectra only, for now.** You need a full year (12 months) of hourly data from your My Alectra account.

## Develop

Needs Node 26 (see `.nvmrc`).

    npm ci
    npm run check     # type-check + tests
    npm run build     # writes dist/ (static site)

## How it fits together

    PDF -> pdfText.ts (pdf.js) -> adapters/ (one per utility) -> canonical records / CSV
        -> tariff/ (periods, holidays, cost) -> recommend.ts -> ui/

To support another utility, add an adapter in `src/adapters/` (a `detect` and a `parse` over the
extracted text lines) and register it in `src/adapters/index.ts`. Nothing downstream changes.

## Yearly maintenance (every Nov 1)

The OEB resets prices on Nov 1. Copy `data/tariffs/<latest>.yaml` to the new effective date, edit the
prices and hours from the Alectra "choose my rate option" page, set `verified` to the day you checked
them, and point `src/tariff/current.ts` at the new file. The tests validate the file (hours cover all 24
with no overlap, every period has a price, dates are real), and the page warns visitors once a Nov 1
passes without a newer file. Statutory holidays are computed from the OEB's rules and need no update.

The price tables on the page are generated from the same file at build time (`src/tariff/reference.ts`),
so they follow automatically.

## Search and sharing

`src/ui/index.html` carries the title, description, canonical URL, Open Graph tags and a JSON-LD block.
The canonical and `og:url` are the GitHub Pages address; change them there if the site ever moves.

## Tests and real data

Unit tests use synthetic rows and a hand-built PDF. `tests/golden.test.ts` runs against real PDFs if you
put them in `local-fixtures/` (gitignored, because they contain meter IDs and usage); it is skipped otherwise.
**Never commit a real usage PDF or CSV.**

## Dependency policy

Eight direct packages, all pinned to exact versions: `pdfjs-dist` (runtime); `typescript`, `esbuild`,
`@types/node`, `eslint`, `@eslint/js`, `typescript-eslint`, `globals` (dev). Dependabot checks weekly and
groups minor and patch bumps into one PR to keep the churn low. TypeScript is held at 6.0.x because
typescript-eslint does not support 7 yet.

## Not affiliated

An independent tool, not affiliated with Alectra or the Ontario Energy Board. Estimates only.
