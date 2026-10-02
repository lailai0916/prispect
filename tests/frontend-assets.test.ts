import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  mergeFrontendAssets,
  selectRetainedCommits,
  type MainCiRun,
} from '../scripts/retain-frontend-assets.ts';

async function fixture(
  run: (root: string, oldAssets: string, currentAssets: string) => Promise<void>
) {
  const root = await mkdtemp(path.join(tmpdir(), 'prispect-asset-retention-test-'));
  const oldAssets = path.join(root, 'old', 'assets');
  const currentAssets = path.join(root, 'current', 'assets');
  await Promise.all([
    mkdir(oldAssets, { recursive: true }),
    mkdir(currentAssets, { recursive: true }),
  ]);
  try {
    await run(root, oldAssets, currentAssets);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('an already opened client keeps its complete lazy dependency graph while current entry files remain exact', async () => {
  await fixture(async (root, oldAssets, currentAssets) => {
    const files = {
      'Method-Abcd1234.js': 'import "./math-Qwer9876.js"; import "./Method-Zxcv3456.css";',
      'math-Qwer9876.js': 'export const explanation = "original method";',
      'Method-Zxcv3456.css': '.method { color: white; }',
      'shared-Retain99.js': 'export const shared = true;',
    };
    for (const [name, contents] of Object.entries(files)) {
      await writeFile(path.join(oldAssets, name), contents);
    }
    await writeFile(path.join(currentAssets, 'shared-Retain99.js'), files['shared-Retain99.js']);
    await writeFile(
      path.join(currentAssets, 'index-Newabc12.js'),
      'import("./Method-Newdef34.js");'
    );
    await writeFile(
      path.join(currentAssets, 'Method-Newdef34.js'),
      'export const method = "current";'
    );
    const html = '<script src="/assets/index-Newabc12.js"></script>';
    await writeFile(path.join(root, 'current', 'index.html'), html);
    await writeFile(path.join(root, 'current', 'appearance-init.js'), 'current appearance');
    await writeFile(path.join(root, 'old', 'index.html'), 'obsolete HTML must not be copied');
    await writeFile(
      path.join(root, 'old', 'appearance-init.js'),
      'obsolete appearance must not be copied'
    );

    assert.deepEqual(await mergeFrontendAssets(oldAssets, currentAssets), { files: 4, added: 3 });
    for (const [name, contents] of Object.entries(files)) {
      assert.equal(await readFile(path.join(currentAssets, name), 'utf8'), contents);
    }
    assert.equal(await readFile(path.join(root, 'current', 'index.html'), 'utf8'), html);
    assert.equal(
      await readFile(path.join(root, 'current', 'appearance-init.js'), 'utf8'),
      'current appearance'
    );
    assert.equal(
      await readFile(path.join(currentAssets, 'Method-Newdef34.js'), 'utf8'),
      'export const method = "current";'
    );
    assert.deepEqual(await mergeFrontendAssets(oldAssets, currentAssets), { files: 4, added: 0 });
  });
});

test('a filename collision fails before copying any historical asset or replacing the current file', async () => {
  await fixture(async (_root, oldAssets, currentAssets) => {
    await writeFile(path.join(oldAssets, 'a-Newold12.js'), 'would otherwise be added');
    await writeFile(path.join(oldAssets, 'z-Samehash.js'), 'old bytes');
    await writeFile(path.join(currentAssets, 'z-Samehash.js'), 'current bytes');
    await assert.rejects(mergeFrontendAssets(oldAssets, currentAssets), /Different content/);
    assert.deepEqual(await readdir(currentAssets), ['z-Samehash.js']);
    assert.equal(
      await readFile(path.join(currentAssets, 'z-Samehash.js'), 'utf8'),
      'current bytes'
    );
  });
});

test('links and nested paths cannot pull external files into a release', async () => {
  await fixture(async (root, oldAssets, currentAssets) => {
    const privateFile = path.join(root, 'private-data');
    await writeFile(privateFile, 'private sentinel');
    await symlink(privateFile, path.join(oldAssets, 'stolen-Abcd1234.js'));
    await assert.rejects(mergeFrontendAssets(oldAssets, currentAssets), /unsafe or unhashed/);
    assert.deepEqual(await readdir(currentAssets), []);
    await rm(path.join(oldAssets, 'stolen-Abcd1234.js'));
    await mkdir(path.join(oldAssets, 'nested'));
    await assert.rejects(mergeFrontendAssets(oldAssets, currentAssets), /unsafe or unhashed/);
    assert.equal(await readFile(privateFile, 'utf8'), 'private sentinel');
  });
});

test('a destination link cannot redirect the write outside the release', async () => {
  await fixture(async (root, oldAssets, currentAssets) => {
    const privateFile = path.join(root, 'private-data');
    await writeFile(privateFile, 'private sentinel');
    await writeFile(path.join(oldAssets, 'shared-Abcd1234.js'), 'old public contents');
    await symlink(privateFile, path.join(currentAssets, 'shared-Abcd1234.js'));
    await assert.rejects(mergeFrontendAssets(oldAssets, currentAssets), /not a regular file/);
    assert.equal(await readFile(privateFile, 'utf8'), 'private sentinel');
    const sourceLink = path.join(root, 'linked-assets');
    await symlink(oldAssets, sourceLink);
    await assert.rejects(mergeFrontendAssets(sourceLink, currentAssets), /regular asset directory/);
  });
});

test('public unversioned files are rejected rather than overwriting current appearance or HTML', async () => {
  await fixture(async (_root, oldAssets, currentAssets) => {
    await writeFile(path.join(oldAssets, 'appearance-init.js'), 'obsolete appearance');
    await assert.rejects(mergeFrontendAssets(oldAssets, currentAssets), /unsafe or unhashed/);
    assert.deepEqual(await readdir(currentAssets), []);
  });
});

test('the three nearest first-parent ancestors require their own exact successful same-repository main push CI', () => {
  const sha = (number: number) => number.toString(16).padStart(40, '0');
  const run = (number: number, changes: Partial<MainCiRun> = {}): MainCiRun => ({
    head_sha: sha(number),
    head_branch: 'main',
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    repository: 'owner/prispect',
    ...changes,
  });
  const ancestors = Array.from({ length: 10 }, (_, index) => sha(10 - index));
  const runs = [
    run(2),
    run(1),
    run(3),
    run(4),
    run(5),
    run(6, { conclusion: 'failure' }),
    run(7, { event: 'pull_request' }),
    run(8, { status: 'in_progress' }),
    run(9, { repository: 'fork/prispect' }),
    run(10, { head_branch: 'feature' }),
    run(50), // A successful unrelated branch history never becomes an ancestor.
  ];
  assert.deepEqual(selectRetainedCommits(ancestors, runs, 'owner/prispect'), [
    sha(5),
    sha(4),
    sha(3),
  ]);
  assert.deepEqual(selectRetainedCommits([sha(5), sha(5), sha(4)], runs, 'owner/prispect'), [
    sha(5),
    sha(4),
  ]);
  assert.throws(() => selectRetainedCommits(['HEAD'], runs, 'owner/prispect'), /ancestor SHA/);
});
