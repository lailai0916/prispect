import { readFile, mkdir, writeFile, rename, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(path.join(root, 'data/source-manifest.json'), 'utf8'));
const args = process.argv.slice(2);
if (args.some((arg) => !manifest.sources.some((source) => source.id === arg)))
  throw new Error('参数只能是已核验来源 ID；不接受任意 URL');
const sources = args.length
  ? manifest.sources.filter((source) => args.includes(source.id))
  : manifest.sources;
for (const source of sources) {
  const target = path.resolve(root, source.localFile);
  if (!target.startsWith(path.join(root, 'data/raw') + path.sep)) throw new Error('来源路径越界');
  const url = new URL(source.url);
  if (url.protocol !== 'https:' || url.hostname !== 'static.cninfo.com.cn')
    throw new Error('来源必须来自已核验的公开披露域名');
  await mkdir(path.dirname(target), { recursive: true });
  try {
    await access(target);
    const existing = await readFile(target);
    if (createHash('sha256').update(existing).digest('hex') !== source.sha256)
      throw new Error('已有本机文件哈希不同；未覆盖');
    process.stdout.write(`${source.id}: existing SHA256 verified\n`);
    continue;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const response = await fetch(source.url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${source.id}: download failed ${response.status}`);
  const content = Buffer.from(await response.arrayBuffer());
  if (content.length > 25 * 1024 * 1024 || !content.subarray(0, 5).equals(Buffer.from('%PDF-')))
    throw new Error(`${source.id}: invalid PDF`);
  if (createHash('sha256').update(content).digest('hex') !== source.sha256)
    throw new Error(`${source.id}: SHA256 mismatch; not saved`);
  const temporary = `${target}.download.tmp`;
  await writeFile(temporary, content, { mode: 0o600 });
  await rename(temporary, target);
  process.stdout.write(`${source.id}: downloaded and SHA256 verified\n`);
}
