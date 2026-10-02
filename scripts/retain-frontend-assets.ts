import { execFileSync } from 'node:child_process';
import { constants } from 'node:fs';
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rm,
  symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RETAINED_BUILDS = 3;
const SHA = /^[0-9a-f]{40}$/;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const HASHED_ASSET = /^[A-Za-z0-9][A-Za-z0-9._-]*-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/;

export interface MainCiRun {
  head_sha: string;
  head_branch: string;
  event: string;
  status: string;
  conclusion: string;
  repository: string;
}

/** Ancestors are supplied in first-parent order, closest to the release first. */
export function selectRetainedCommits(ancestors: string[], runs: MainCiRun[], repo: string) {
  if (!REPOSITORY.test(repo) || ancestors.some((commit) => !SHA.test(commit))) {
    throw new Error('Invalid repository or ancestor SHA.');
  }
  const approved = new Set(
    runs
      .filter(
        (run) =>
          SHA.test(run.head_sha) &&
          run.repository === repo &&
          run.head_branch === 'main' &&
          run.event === 'push' &&
          run.status === 'completed' &&
          run.conclusion === 'success'
      )
      .map((run) => run.head_sha)
  );
  return [...new Set(ancestors)].filter((commit) => approved.has(commit)).slice(0, RETAINED_BUILDS);
}

async function regularDirectory(directory: string) {
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`Expected a regular asset directory: ${directory}`);
  }
}

/** Only flat, hashed Vite assets are retained; entry HTML and public files never enter here. */
export async function mergeFrontendAssets(source: string, destination: string) {
  await regularDirectory(source);
  await regularDirectory(destination);
  const entries = await readdir(source, { withFileTypes: true });
  if (!entries.length) throw new Error('Historical build contains no assets.');

  // Check the entire input and all collisions before adding anything to the release.
  const additions: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !HASHED_ASSET.test(entry.name)) {
      throw new Error(`Historical build contains an unsafe or unhashed asset: ${entry.name}`);
    }
    const target = path.join(destination, entry.name);
    let targetStat;
    try {
      targetStat = await lstat(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      additions.push(entry.name);
      continue;
    }
    if (!targetStat.isFile() || targetStat.isSymbolicLink()) {
      throw new Error(`Retained asset target is not a regular file: ${entry.name}`);
    }
    const [oldBytes, currentBytes] = await Promise.all([
      readFile(path.join(source, entry.name)),
      readFile(target),
    ]);
    if (!oldBytes.equals(currentBytes)) {
      throw new Error(`Different content shares an asset filename: ${entry.name}`);
    }
  }
  for (const name of additions) {
    await copyFile(path.join(source, name), path.join(destination, name), constants.COPYFILE_EXCL);
  }
  return { files: entries.length, added: additions.length };
}

function git(repositoryDir: string, args: string[]) {
  return execFileSync('git', args, { cwd: repositoryDir, encoding: 'utf8' }).trim();
}

/** Build a trusted commit in isolation and retain only its static assets. */
export async function buildHistoricalAssets(repositoryDir: string, commit: string, assets: string) {
  if (!SHA.test(commit) || git(repositoryDir, ['cat-file', '-t', commit]) !== 'commit') {
    throw new Error('Historical build requires a full commit SHA.');
  }
  const temporary = await mkdtemp(path.join(tmpdir(), 'prispect-frontend-assets-'));
  const checkout = path.join(temporary, 'checkout');
  const archive = path.join(temporary, 'source.tar');
  try {
    await mkdir(checkout);
    const output = await open(archive, 'wx');
    try {
      execFileSync('git', ['archive', '--format=tar', commit], {
        cwd: repositoryDir,
        stdio: ['ignore', output.fd, 'inherit'],
      });
    } finally {
      await output.close();
    }
    execFileSync('tar', ['-xf', archive, '-C', checkout]);
    const [currentLock, historicalLock] = await Promise.all([
      readFile(path.join(repositoryDir, 'package-lock.json')),
      readFile(path.join(checkout, 'package-lock.json')),
    ]);
    const env = { ...process.env };
    delete env.GH_TOKEN;
    delete env.GITHUB_TOKEN;
    if (currentLock.equals(historicalLock)) {
      await symlink(path.join(repositoryDir, 'node_modules'), path.join(checkout, 'node_modules'));
    } else {
      execFileSync('npm', ['ci', '--no-audit', '--no-fund'], {
        cwd: checkout,
        env,
        stdio: 'inherit',
      });
    }
    execFileSync('npm', ['run', 'build'], { cwd: checkout, env, stdio: 'inherit' });
    await regularDirectory(path.join(checkout, 'dist'));
    return await mergeFrontendAssets(path.join(checkout, 'dist', 'assets'), assets);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function retainFrontendAssets(release: string) {
  const repositoryDir = process.cwd();
  const repo = process.env.GH_REPO ?? '';
  if (!SHA.test(release) || !REPOSITORY.test(repo)) {
    throw new Error('A full release SHA and GH_REPO are required.');
  }
  if (
    git(repositoryDir, ['rev-parse', 'HEAD']) !== release ||
    git(repositoryDir, ['rev-parse', 'refs/remotes/origin/main']) !== release
  ) {
    throw new Error('Asset retention requires the checked-out current main release.');
  }
  const ancestors = git(repositoryDir, ['rev-list', '--first-parent', release])
    .split('\n')
    .slice(1);
  const response = execFileSync(
    'gh',
    [
      'api',
      '--method',
      'GET',
      `repos/${repo}/actions/workflows/ci.yml/runs`,
      '-H',
      'Accept: application/vnd.github+json',
      '-f',
      'branch=main',
      '-f',
      'event=push',
      '-f',
      'status=success',
      '-f',
      'per_page=100',
      '--paginate',
      '--jq',
      '.workflow_runs[] | {head_sha,head_branch,event,status,conclusion,repository: .head_repository.full_name}',
    ],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
  );
  const runs: MainCiRun[] = response
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  if (!selectRetainedCommits([release], runs, repo).length) {
    throw new Error('The release has no successful main push CI.');
  }
  const selected = selectRetainedCommits(ancestors, runs, repo);
  if (ancestors.length && !selected.length) {
    throw new Error('No successful main push CI ancestors were found; refusing to omit retention.');
  }
  const assets = path.join(repositoryDir, 'dist', 'assets');
  await regularDirectory(path.join(repositoryDir, 'dist'));
  await regularDirectory(assets);
  for (const commit of selected) {
    git(repositoryDir, ['merge-base', '--is-ancestor', commit, release]);
    console.log(`Retaining frontend assets from verified main CI ancestor ${commit}`);
    const result = await buildHistoricalAssets(repositoryDir, commit, assets);
    console.log(`Verified ${result.files} historical assets; added ${result.added}.`);
  }
  console.log(`Frontend asset window: current build plus ${selected.length} verified ancestors.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) {
    console.error('Usage: node --import tsx scripts/retain-frontend-assets.ts <40-hex-release>');
    process.exitCode = 1;
  } else {
    await retainFrontendAssets(process.argv[2]!).catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
  }
}
