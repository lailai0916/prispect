import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'work/samples');
await mkdir(output, { recursive: true });
const input = JSON.parse(await readFile(path.join(root, 'data/cases/songyuan-2025.json'), 'utf8'));
await writeFile(path.join(output, 'cashlens-input.json'), JSON.stringify(input, null, 2) + '\n');
const columns = [
  'company',
  'shortName',
  'year',
  'key',
  'value',
  'unit',
  'currency',
  'scope',
  'period',
  'page',
  'quote',
  'documentDate',
  'sourceUrl',
];
const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const rows = input.observations
  .filter((item) => item.key !== 'otherAdjustments')
  .map((item) =>
    columns.map((column) => escape(column in item ? item[column] : input[column])).join(',')
  );
await writeFile(
  path.join(output, 'cashlens-input.csv'),
  '\uFEFF' + columns.join(',') + '\n' + rows.join('\n') + '\n'
);
process.stdout.write(
  'Wrote work/samples/cashlens-input.json and .csv. JSON includes raw grouped rows; CSV intentionally lacks grouped components.\n'
);
