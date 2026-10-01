import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const packages = ['@fontsource/ibm-plex-sans', 'lucide-react', 'react', 'react-dom', 'scheduler'];
const blocks = [
  'CashLens browser dependencies: license notices',
  'The following notices apply to included third-party fonts, icons and client libraries.',
];
for (const name of packages) {
  const directory = path.join('node_modules', name);
  const metadata = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
  const license = await readFile(path.join(directory, 'LICENSE'), 'utf8');
  blocks.push(`${name} ${metadata.version} (${metadata.license})\n\n${license.trim()}`);
}
await writeFile('public/third-party-notices.txt', blocks.join('\n\n---\n\n') + '\n');
