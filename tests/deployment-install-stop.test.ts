import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('publisher keeps installer files until systemd confirms the unit and its children stopped', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'cashlens-install-stop-'));
  try {
    const bin = path.join(folder, 'bin');
    const cgroups = path.join(folder, 'cgroups');
    await mkdir(bin);
    await mkdir(path.join(cgroups, 'fixture.service', 'child'), { recursive: true });
    await writeFile(path.join(cgroups, 'cgroup.procs'), '123\n');
    await writeFile(path.join(cgroups, 'fixture.service', 'cgroup.procs'), '');
    await writeFile(path.join(cgroups, 'fixture.service', 'child', 'cgroup.procs'), '456\n');
    await writeFile(
      path.join(bin, 'systemctl'),
      `#!/usr/bin/env bash
if [[ "$1" == stop ]]; then exit "$TEST_INSTALL_STOP_STATUS"; fi
case "$2" in
  --property=ActiveState) printf '%s\\n' "$TEST_INSTALL_STATE" ;;
  --property=LoadState) printf '%s\\n' "$TEST_INSTALL_LOAD" ;;
  --property=ControlGroup) printf '%s\\n' "$TEST_INSTALL_CGROUP" ;;
  *) exit 1 ;;
esac
`,
      { mode: 0o755 }
    );
    const publisher = await readFile('deploy/ci-deploy.sh', 'utf8');
    const begin = publisher.indexOf('stop_install() {');
    const end = publisher.indexOf('\nprune_deployments() {', begin);
    assert.ok(begin > 0 && end > begin);
    const stopped = (stopStatus: number, state: string, load = 'loaded', cgroup = '') => {
      const result = spawnSync(
        'bash',
        [
          '-c',
          `job="$1"\ninstall_unit=fixture.service\n${publisher.slice(begin, end).replaceAll('/sys/fs/cgroup', cgroups)}\nif stop_install; then printf 'stopped:%s' "$install_unit"; else printf 'retained:%s' "$install_unit"; fi`,
          'stop-fixture',
          folder,
        ],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            TEST_INSTALL_STOP_STATUS: String(stopStatus),
            TEST_INSTALL_STATE: state,
            TEST_INSTALL_LOAD: load,
            TEST_INSTALL_CGROUP: cgroup,
          },
        }
      );
      assert.equal(result.status, 0, result.stderr);
      return result.stdout;
    };
    assert.equal(stopped(0, 'inactive'), 'stopped:');
    assert.equal(stopped(0, 'failed'), 'stopped:');
    assert.equal(stopped(5, 'inactive', 'not-found'), 'stopped:');
    assert.equal(stopped(1, 'active'), 'retained:fixture.service');
    assert.equal(stopped(0, 'deactivating'), 'retained:fixture.service');
    assert.equal(stopped(1, 'inactive'), 'retained:fixture.service');
    assert.equal(stopped(0, '', 'not-found'), 'retained:fixture.service');
    assert.equal(stopped(0, 'inactive', 'loaded', '/../../tmp'), 'retained:fixture.service');
    assert.equal(stopped(0, 'inactive', 'loaded', '/'), 'retained:fixture.service');
    assert.equal(stopped(0, 'inactive', 'loaded', '/fixture.service'), 'retained:fixture.service');
    await writeFile(path.join(cgroups, 'fixture.service', 'child', 'cgroup.procs'), '');
    assert.equal(stopped(0, 'inactive', 'loaded', '/fixture.service'), 'stopped:');
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('a successfully retried release replaces its failed marker with a verified deployment time', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'cashlens-release-success-'));
  try {
    await writeFile(path.join(folder, '.deployment-failed'), '1\n');
    await writeFile(path.join(folder, 'AUTH_SCHEMA.json'), '{"version":2}');
    const publisher = await readFile('deploy/ci-deploy.sh', 'utf8');
    const begin = publisher.indexOf('mark_release_success() {');
    const end = publisher.indexOf('\nfinish() {', begin);
    assert.ok(begin > 0 && end > begin);
    const result = spawnSync(
      'bash',
      ['-c', `release="$1"\n${publisher.slice(begin, end)}\nmark_release_success`, 'retry', folder],
      { encoding: 'utf8' }
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(await readFile(path.join(folder, '.deployed-at'), 'utf8'), /^\d+\n$/);
    await assert.rejects(readFile(path.join(folder, '.deployment-failed')), { code: 'ENOENT' });
    assert.equal(await readFile(path.join(folder, 'AUTH_SCHEMA.json'), 'utf8'), '{"version":2}');
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
