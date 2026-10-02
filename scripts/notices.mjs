import { access, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const packages = [
  'lucide-react',
  'react',
  'react-dom',
  'scheduler',
  '@base-ui/react',
  '@better-auth/passkey',
  '@gsap/react',
  'gsap',
  'better-auth',
  'libphonenumber-js',
  'react-qr-code',
  'papaparse',
  '@zxcvbn-ts/core',
  '@zxcvbn-ts/language-common',
  '@zxcvbn-ts/language-en',
];
const blocks = [
  'Prispect browser dependencies: license notices',
  'The following notices apply to client libraries and their installed dependency trees.',
];
const seen = new Set();
const entries = [];
async function locate(name, from = process.cwd()) {
  let directory = path.resolve(from);
  while (true) {
    const candidate = path.join(directory, 'node_modules', name);
    try {
      await access(path.join(candidate, 'package.json'));
      return candidate;
    } catch {
      const parent = path.dirname(directory);
      if (parent === directory) throw new Error(`Missing dependency: ${name}`);
      directory = parent;
    }
  }
}
async function collect(name, from) {
  const directory = await locate(name, from);
  const metadata = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
  const identity = `${metadata.name}@${metadata.version}`;
  if (seen.has(identity)) return;
  seen.add(identity);
  const files = (await readdir(directory))
    .filter((file) => /^(LICENSE|COPYING|NOTICE)(\.|$)/i.test(file))
    .sort();
  const notices = await Promise.all(
    files.map(
      async (file) => `${file}\n${(await readFile(path.join(directory, file), 'utf8')).trim()}`
    )
  );
  if (name === 'gsap' || name === '@gsap/react') {
    const file = name === 'gsap' ? 'dist/gsap.js' : 'dist/index.js';
    const source = await readFile(path.join(directory, file), 'utf8');
    const header = source.match(/\/\*[\s\S]*?\*\//)?.[0];
    if (!header?.includes('gsap.com/standard-license'))
      throw new Error(`Missing GSAP license notice: ${name}`);
    notices.push(
      `${file}: license header\n${header}\n\nLicense terms: https://gsap.com/standard-license/`
    );
  }
  if (name === 'qrcode-generator') {
    const source = await readFile(path.join(directory, 'dist/qrcode.js'), 'utf8');
    notices.push(source.slice(0, source.indexOf('var qrcode')).trim());
  }
  if (name === '@better-auth/utils') {
    const mit = await readFile(path.join(await locate('react'), 'LICENSE'), 'utf8');
    notices.push(
      'License source: https://github.com/better-auth/utils/blob/main/LICENSE\n\n' +
        mit.replace(/Copyright[^\n]*/, 'Copyright (c) 2024 - present, Bereket Engida').trim()
    );
  }
  if (!notices.length) throw new Error(`Missing license notice: ${identity}`);
  entries.push({
    identity,
    text: `${metadata.name} ${metadata.version} (${metadata.license})\n\n${notices.join('\n\n')}`,
  });
  for (const dependency of Object.keys(metadata.dependencies ?? {}).sort())
    await collect(dependency, directory);
}
for (const name of packages) await collect(name);
blocks.push(
  ...entries.sort((a, b) => a.identity.localeCompare(b.identity, 'en')).map((entry) => entry.text)
);
await writeFile(
  'public/third-party-notices.txt',
  (blocks.join('\n\n---\n\n') + '\n').replace(/\r\n/g, '\n').replace(/[\t ]+$/gm, '')
);
await writeFile('public/software-license.txt', await readFile('LICENSE', 'utf8'));
await writeFile('public/content-license.txt', await readFile('LICENSE-docs', 'utf8'));
