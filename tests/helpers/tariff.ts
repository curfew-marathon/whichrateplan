import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { parseTariff, type Tariff } from '../../src/tariff/tariff.ts';

const DIR = new URL('../../data/tariffs/', import.meta.url);

export const readTariffYaml = (name: string): unknown => parse(readFileSync(new URL(name, DIR), 'utf8'));
export const loadTariff = (name: string): Tariff => parseTariff(readTariffYaml(name));
export const TARIFF = loadTariff('2026-11-01.yaml');
