// Compare the prices Alectra publishes with the live tariff. If they differ, write the new tariff file,
// point src/tariff/current.ts at it and leave a pull request description for the workflow to use.
//   node scripts/check-rates.ts                 fetch the tariff's `source` page
//   node scripts/check-rates.ts --from page.html   read a saved copy instead (for trying it out)
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { changeSummary, parseAlectraPrices, priceChanges, updateTariffYaml } from '../src/tariff/published.ts';
import { parseTariff } from '../src/tariff/tariff.ts';

const CURRENT = 'src/tariff/current.ts';
const output = (line: string): void => {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${line}\n`);
};

const pointer = readFileSync(CURRENT, 'utf8');
const live = /data\/tariffs\/(\d{4}-\d{2}-\d{2})\.yaml/.exec(pointer);
if (!live) throw new Error(`${CURRENT} does not import a data/tariffs/<date>.yaml file`);
const liveFile = `data/tariffs/${live[1]}.yaml`;
const liveYaml = readFileSync(liveFile, 'utf8');
const tariff = parseTariff(parse(liveYaml));

const from = process.argv.indexOf('--from');
let html: string;
if (from !== -1) html = readFileSync(process.argv[from + 1]!, 'utf8');
else {
  // A browser-like agent: some utility sites turn away the default one.
  const res = await fetch(tariff.source, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; whichrateplan rates check)' }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${tariff.source} answered ${res.status}`);
  html = await res.text();
}

const published = parseAlectraPrices(html);
const changes = priceChanges(tariff, published);
const today = new Date().toISOString().slice(0, 10);
if (changes.length === 0) {
  console.log(`Prices match ${liveFile}. Nothing to do.`);
  output('changed=false');
} else if (published.effective <= tariff.effective) {
  // Different prices under a date we already have means our file or our reading of the page is wrong.
  throw new Error(`The page's prices differ from ${liveFile} but its newest date (${published.effective}) is not later. Check by hand:\n${changes.map((c) => ` - ${c.label}: ${c.from} -> ${c.to}`).join('\n')}`);
} else if (published.effective > today) {
  console.log(`The page shows prices from ${published.effective}, which is still in the future. Waiting.`);
  output('changed=false');
} else {
  const newFile = `data/tariffs/${published.effective}.yaml`;
  const newYaml = updateTariffYaml(liveYaml, published, today);
  parseTariff(parse(newYaml)); // never write a file the site would reject
  writeFileSync(newFile, newYaml);
  writeFileSync(CURRENT, pointer.replace(liveFile, newFile));
  const body = process.env.RATES_PR_BODY ?? join(tmpdir(), 'rates-pr.md');
  writeFileSync(body, changeSummary(changes, published, tariff.source, newFile));
  console.log(`Prices changed. Wrote ${newFile}, updated ${CURRENT}, description in ${body}.`);
  for (const c of changes) console.log(` - ${c.label}: ${c.from} -> ${c.to}`);
  output('changed=true');
  output(`effective=${published.effective}`);
}
