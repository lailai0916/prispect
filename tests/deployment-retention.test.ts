import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const helper = path.resolve('deploy/prune-deployments.py');
const fixture = String.raw`
import importlib.util, json, os, pathlib, sys
spec = importlib.util.spec_from_file_location('deployment_retention', sys.argv[1])
m = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = m
spec.loader.exec_module(m)
root = pathlib.Path(sys.argv[2])
uid = os.getuid()
releases = root / 'app' / 'releases'
releases.mkdir(parents=True, mode=0o700)
inbox = root / 'inbox'
inbox.mkdir(mode=0o700)
current = root / 'app' / 'current'
paths = m.DeploymentPaths(releases, current, inbox)
def sha(number): return f'{number:040x}'
def release(number, deployed=0, schema=2, failed=False, legacy=False):
    name = sha(number)
    item = releases / name
    item.mkdir(mode=0o700)
    (item / 'RELEASE.json').write_text(json.dumps({'commit': name}))
    (item / '.artifact-sha256').write_text('a' * 64)
    (item / 'AUTH_SCHEMA.json').write_text(json.dumps({'version': schema}))
    (item / 'runtime.js').write_text('rebuildable runtime')
    if not legacy: (item / '.deployed-at').write_text(str(deployed))
    if failed: (item / '.deployment-failed').write_text('failed')
    os.utime(item, (deployed, deployed))
    return item
def use_current(number):
    if current.is_symlink(): current.unlink()
    current.symlink_to(releases / sha(number))
def job(number, timestamp=None):
    name = f'job-{sha(number)}.{number % 1000000:06d}'
    item = inbox / name
    item.mkdir(mode=0o700)
    for directory in m.HEAVY_DIRS:
        (item / directory).mkdir(mode=0o700)
        (item / directory / 'large-rebuildable.bin').write_bytes(b'x' * 1024)
    for filename in m.HEAVY_FILES: (item / filename).write_bytes(b'x' * 1024)
    (item / 'npm-install.log').write_bytes(b'x' * (m.LOG_LIMIT + 100) + b'log-tail')
    for filename in ('source-manifest.json', 'served-index.html', 'assets.txt', 'exit-status'):
        (item / filename).write_text('retain diagnostic ' + filename)
    stamp = timestamp if timestamp is not None else number * 100
    os.utime(item, (stamp, stamp))
    return item
def prune(**kwargs):
    return m.prune(paths, expected_uid=uid, required_auth_schema=kwargs.pop('required_auth_schema', 2), **kwargs)
`;

async function runFixture(source: string) {
  const folder = await mkdtemp(path.join(tmpdir(), 'prispect-deployment-retention-'));
  try {
    const result = spawnSync('python3', ['-c', fixture + source, helper, folder], {
      encoding: 'utf8',
      timeout: 20_000,
      maxBuffer: 1024 * 1024,
    });
    assert.equal(
      result.error,
      undefined,
      result.error?.message ?? 'Python fixture did not launch.'
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return JSON.parse(result.stdout.trim());
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

test('retention protects current, target and rollback while keeping only two compatible successful old releases', async () => {
  const result = await runFixture(String.raw`
release(1, 800)
release(2, 100)
release(3, 600)
release(4, 900, failed=True)
release(5, 500)
release(6, 1000, schema=1)
release(7, 1100, failed=True)
use_current(1)
result = prune(preserve_releases=[sha(2), sha(4)])
assert set(result['deleted_releases']) == {sha(5), sha(6), sha(7)}, result
assert {item.name for item in releases.iterdir()} == {sha(1), sha(2), sha(3), sha(4)}
assert current.readlink() == releases / sha(1)
print(json.dumps(result))
`);
  assert.equal(result.deleted_releases.length, 3);
});

test('successful markers outrank extraction mtimes and validated legacy releases use mtime without promoting failed candidates', async () => {
  const result = await runFixture(String.raw`
release(1, 1000)
release(2, 200)
release(3, 700, legacy=True)
marked = release(4, 500)
os.utime(marked, (2000, 2000))
release(5, 3000, failed=True)
use_current(1)
result = prune(preserve_releases=[sha(2)])
assert set(result['deleted_releases']) == {sha(4), sha(5)}, result
assert (releases / sha(3)).is_dir()
print(json.dumps(result))
`);
  assert.equal(result.deleted_releases.length, 2);
});

test('the current deployment target has not succeeded yet and does not consume a successful rollback slot', async () => {
  const result = await runFixture(String.raw`
release(1, 1000)
release(2, 900)
release(3, 800)
release(4, 2000, legacy=True)
use_current(1)
active = job(4)
result = prune(preserve_releases=[sha(2), sha(4)], active_job=active.name)
assert result['deleted_releases'] == [], result
assert {item.name for item in releases.iterdir()} == {sha(1), sha(2), sha(3), sha(4)}
print(json.dumps(result))
`);
  assert.equal(result.deleted_releases.length, 0);
});

test('rebuildable job trees disappear on every cleanup, logs are bounded and only ten stable diagnostic records remain', async () => {
  const result = await runFixture(String.raw`
release(1, 1000)
use_current(1)
for number in range(1, 15): job(number)
first = prune()
assert len(first['deleted_jobs']) == 4, first
for number in range(5, 15):
    item = inbox / f'job-{sha(number)}.{number:06d}'
    assert item.is_dir()
    assert all(not (item / name).exists() for name in (*m.HEAVY_DIRS, *m.HEAVY_FILES))
    assert (item / 'npm-install.log').stat().st_size == m.LOG_LIMIT
    assert (item / 'npm-install.log').read_bytes().endswith(b'log-tail')
    assert (item / 'exit-status').read_text() == 'retain diagnostic exit-status'
    assert (item / 'source-manifest.json').exists()
    assert (item / 'served-index.html').exists()
    assert (item / 'assets.txt').exists()
    assert item.stat().st_mtime == number * 100
job(15)
second = prune()
assert second['deleted_jobs'] == [f'job-{sha(5)}.000005'], second
assert len([item for item in inbox.iterdir() if m.JOB.fullmatch(item.name)]) == 10
print(json.dumps({'first': first, 'second': second}))
`);
  assert.equal(result.first.deleted_jobs.length, 4);
});

test('active and orphaned install units protect all matching jobs even when clean-active is requested', async () => {
  const result = await runFixture(String.raw`
release(1, 1000)
release(2, 200, failed=True)
use_current(1)
active = job(2)
for number in range(3, 15): job(number)
first = prune(active_job=active.name, clean_active=True, busy_release_shas=[sha(2)])
assert first['active_job_clean'] is False
assert (active / 'install').is_dir(), first
assert (releases / sha(2)).is_dir(), first
assert any('active-install' in reason for reason in first['skipped'])
second = prune(active_job=active.name)
assert (active / 'install').is_dir(), second
third = prune(active_job=active.name, clean_active=True)
assert third['active_job_clean'] is True
assert active.is_dir(), third
assert all(not (active / name).exists() for name in (*m.HEAVY_DIRS, *m.HEAVY_FILES))
assert (active / 'exit-status').exists()
print(json.dumps({'first': first, 'second': second, 'third': third}))
`);
  assert.ok(result.first.skipped.some((reason: string) => reason.includes('active-install')));
});

test('untrusted directories and symlink roots are retained and release links never reach user data, source originals or backups', async () => {
  const result = await runFixture(String.raw`
release(1, 1000)
use_current(1)
sentinels = []
for name in ('private-data', 'source-data', 'backups', 'configuration'):
    folder = root / name
    folder.mkdir()
    item = folder / 'sentinel'
    item.write_text(name + ' must survive')
    sentinels.append(item)
old = release(2, 100, failed=True)
(old / 'data').mkdir()
(old / 'data' / 'raw').symlink_to(root / 'source-data')
(old / 'private-link').symlink_to(root / 'private-data')
bad_manifest = release(3, 200)
(bad_manifest / 'RELEASE.json').write_text(json.dumps({'commit': sha(99)}))
missing_hash = release(4, 300)
(missing_hash / '.artifact-sha256').unlink()
bad_auth = release(5, 400)
(bad_auth / 'AUTH_SCHEMA.json').write_text('{"version":true}')
fifo = release(6, 500)
(fifo / 'RELEASE.json').unlink()
os.mkfifo(fifo / 'RELEASE.json')
linked = release(7, 600)
(linked / 'AUTH_SCHEMA.json').unlink()
(linked / 'AUTH_SCHEMA.json').symlink_to(sentinels[0])
(releases / sha(8)).symlink_to(root / 'backups')
(releases / 'manual-recovery').mkdir()
linked_job = inbox / f'job-{sha(9)}.abcdef'
linked_job.symlink_to(root / 'private-data')
(inbox / 'backups').mkdir()
item = job(10)
(item / 'install' / 'large-rebuildable.bin').unlink()
(item / 'install').rmdir()
(item / 'install').symlink_to(root / 'source-data')
result = prune()
assert not old.exists(), result
assert all((releases / sha(number)).exists() for number in range(3, 8))
assert (releases / sha(8)).is_symlink()
assert (releases / 'manual-recovery').is_dir()
assert linked_job.is_symlink()
assert (inbox / 'backups').is_dir()
assert (item / 'install').is_symlink()
for sentinel in sentinels: assert sentinel.read_text() == sentinel.parent.name + ' must survive'
print(json.dumps(result))
`);
  assert.equal(result.deleted_releases.length, 1);
  assert.ok(result.skipped.length >= 8);
});

test('unsafe owner, permissions, special files and mount boundaries abort removal before touching a candidate tree', async () => {
  const result = await runFixture(String.raw`
from types import SimpleNamespace
from unittest.mock import patch
release(1, 1000)
use_current(1)
unsafe = release(2, 100)
writable = unsafe / 'writable'
writable.mkdir(mode=0o777)
writable.chmod(0o777)
mount = release(3, 200)
mounted = mount / 'mounted'
mounted.mkdir()
(mounted / 'sentinel').write_text('mount must survive')
foreign = release(4, 300)
(foreign / 'foreign-owner').write_text('foreign content')
special = release(5, 400)
os.mkfifo(special / 'device-like')
os_stat = os.stat
def altered_stat(name, *args, **kwargs):
    info = os_stat(name, *args, **kwargs)
    if name in ('foreign-owner', 'mounted'):
        values = {key: getattr(info, key) for key in dir(info) if key.startswith('st_')}
        if name == 'foreign-owner': values['st_uid'] = uid + 1
        else: values['st_dev'] = info.st_dev + 1
        return SimpleNamespace(**values)
    return info
with patch.object(m.os, 'stat', altered_stat):
    first = prune()
assert set(item.name for item in releases.iterdir()) == {sha(n) for n in range(1, 6)}, first
assert (mounted / 'sentinel').read_text() == 'mount must survive'
inode = mounted.stat().st_ino
with patch.object(m, '_mount_id', lambda fd: 2 if os.fstat(fd).st_ino == inode else 1):
    second = prune()
assert mount.exists(), second
assert (mounted / 'sentinel').exists()
alias = root / 'release-alias'
alias.symlink_to(releases)
try:
    m.prune(m.DeploymentPaths(alias, current, inbox), expected_uid=uid, required_auth_schema=2)
except OSError:
    pass
else:
    raise AssertionError('A symlink anchor was accepted')
print(json.dumps({'first': first, 'second': second}))
`);
  assert.equal(result.first.deleted_releases.length, 0);
});

test('unknown live schema retains all releases but permits safe job cleanup, and linked logs are never truncated', async () => {
  const result = await runFixture(String.raw`
release(1, 1000)
release(2, 100, failed=True)
use_current(1)
item = job(1)
outside = root / 'external-log'
outside.write_bytes(b'p' * (m.LOG_LIMIT + 1000))
original = outside.read_bytes()
(item / 'linked.log').hardlink_to(outside)
result = prune(required_auth_schema=None)
assert (releases / sha(2)).exists(), result
assert not (item / 'install').exists()
assert outside.read_bytes() == original
assert (item / 'linked.log').read_bytes() == original
assert any('schema' in warning for warning in result['warnings'])
assert any('linked.log' in reason for reason in result['skipped'])
print(json.dumps(result))
`);
  assert.equal(result.deleted_releases.length, 0);
  assert.equal(result.cleaned_jobs.length, 1);
});

test('active cleanup fails closed for unsafe heavy targets, including unavailable mount IDs, and makes the CLI exit unsuccessfully', async () => {
  const result = await runFixture(String.raw`
from types import SimpleNamespace
from unittest.mock import patch
import contextlib, io
release(1, 1000)
use_current(1)
original_prune = m.prune
real_stat = os.stat
def fixture_prune(actual_paths, **kwargs):
    assert actual_paths == m.DeploymentPaths(m.RELEASES, m.CURRENT, m.INBOX)
    return original_prune(paths, expected_uid=uid, **kwargs)
def execute_cli(active):
    with patch.object(m.os, 'geteuid', lambda: 0), \
         patch.object(m, '_lock', lambda inherited: os.open(root / 'cli-lock', os.O_CREAT | os.O_RDWR, 0o600)), \
         patch.object(m, '_live_auth_schema', lambda: 2), \
         patch.object(m, '_busy_releases', lambda: set()), \
         patch.object(m, 'prune', fixture_prune), contextlib.redirect_stdout(io.StringIO()) as output:
        try:
            m.main(['--lock-fd', '9', '--active-job', active.name, '--clean-active'])
        except SystemExit as error:
            assert error.code == 1
        else:
            raise AssertionError('Unsafe active cleanup allowed publication to continue')
        value = json.loads(output.getvalue())
        assert value['active_job_clean'] is False
        return value
results = []
for number, reason in enumerate(('owner', 'permissions', 'mount-file', 'mount-job', 'unknown-mount'), start=20):
    active = job(number)
    if reason == 'owner':
        def foreign_stat(name, *args, **kwargs):
            info = real_stat(name, *args, **kwargs)
            if name == 'large-rebuildable.bin':
                values = {key: getattr(info, key) for key in dir(info) if key.startswith('st_')}
                values['st_uid'] = uid + 1
                return SimpleNamespace(**values)
            return info
        guard = patch.object(m.os, 'stat', foreign_stat)
    elif reason == 'permissions':
        (active / 'install' / 'writable').mkdir(mode=0o777)
        (active / 'install' / 'writable').chmod(0o777)
        guard = contextlib.nullcontext()
    elif reason == 'mount-file':
        inode = (active / 'release.tar.gz').stat().st_ino
        guard = patch.object(m, '_mount_id', lambda fd: 2 if os.fstat(fd).st_ino == inode else 1)
    elif reason == 'mount-job':
        inode = active.stat().st_ino
        guard = patch.object(m, '_mount_id', lambda fd: 2 if os.fstat(fd).st_ino == inode else 1)
    else:
        guard = patch.object(m, '_mount_id', lambda fd: None)
    with guard:
        value = prune(active_job=active.name, clean_active=True)
        assert value['active_job_clean'] is False, value
        results.append(execute_cli(active))
    assert (active / 'exit-status').exists()
missing_targets = job(30)
safe = prune(active_job=missing_targets.name, clean_active=True)
assert safe['active_job_clean'] is True
again = prune(active_job=missing_targets.name, clean_active=True)
assert again['active_job_clean'] is True, 'already absent heavy targets are a success'
print(json.dumps({'refusals': len(results), 'safe': safe['active_job_clean']}))
`);
  assert.equal(result.refusals, 5);
  assert.equal(result.safe, true);
});

test('file bind mounts and unknown mount identities cannot cause a log truncation outside its job', async () => {
  const result = await runFixture(String.raw`
from unittest.mock import patch
release(1, 1000)
use_current(1)
item = job(1)
log = item / 'bind-mounted.log'
log.write_bytes(b'outside data' * 30000)
before = log.read_bytes()
inode = log.stat().st_ino
with patch.object(m, '_mount_id', lambda fd: 2 if os.fstat(fd).st_ino == inode else 1):
    first = prune()
assert log.read_bytes() == before, first
assert any('bind-mounted.log' in value for value in first['skipped'])
with patch.object(m, '_mount_id', lambda fd: None):
    second = prune()
assert log.read_bytes() == before, second
assert any(item.name in value for value in second['skipped'])
print(json.dumps({'bindMountRejected': True, 'unknownMountRejected': True}))
`);
  assert.equal(result.bindMountRejected, true);
});

test('CLI accepts only fixed identifier flags, refuses non-root and shares the deployment lock without unlocking its parent', async () => {
  const result = await runFixture(String.raw`
import fcntl, subprocess
from unittest.mock import patch
for arguments in (
    ['--releases', str(root)], ['--protect-release', '../private-data'],
    ['--active-job', 'job-' + sha(1) + '.abcdef/../../private-data'],
    ['--lock-fd', '8'], ['--clean-active'], ['--prot', sha(1)]
):
    rejected = subprocess.run([sys.executable, sys.argv[1], *arguments], capture_output=True, timeout=5)
    assert rejected.returncode == 2, (arguments, rejected.stderr)
with patch.object(m.os, 'geteuid', lambda: 12345), patch.object(m, '_lock', side_effect=AssertionError('lock must not be opened')):
    try: m.main([])
    except SystemExit as error: assert error.code == 2
    else: raise AssertionError('Non-root CLI accepted')
original_open = m._open_directory
original_trusted = m._trusted
with patch.object(m, 'INBOX', inbox), \
     patch.object(m, '_open_directory', lambda target, expected: original_open(target, uid)), \
     patch.object(m, '_trusted', lambda info, expected, device=None, directory=False: original_trusted(info, uid, device, directory)):
    locked = m._lock()
    try:
        inherited = m._lock(locked)
        os.close(inherited)
        blocked = subprocess.run([sys.executable, '-c', 'import fcntl,sys; f=open(sys.argv[1],\u0022r+\u0022); fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)', str(inbox / 'deploy.lock')], capture_output=True)
        assert blocked.returncode != 0, 'child cleanup unlocked the publisher lock'
        wrong = os.open(root / 'wrong-lock', os.O_RDWR | os.O_CREAT, 0o600)
        try:
            try: m._lock(wrong)
            except m.UnsafePath: pass
            else: raise AssertionError('Unrelated inherited fd accepted')
        finally: os.close(wrong)
    finally: os.close(locked)
    available = m._lock()
    os.close(available)
    (inbox / 'deploy.lock').unlink()
    (inbox / 'deploy.lock').symlink_to(root / 'outside-lock')
    try: m._lock()
    except OSError: pass
    else: raise AssertionError('A symlink deployment lock was accepted')
print(json.dumps({'restricted': True, 'lockPreserved': True}))
`);
  assert.equal(result.lockPreserved, true);
});

test('production schema reading is read-only and queries migration metadata without retrieving account records', async () => {
  const result = await runFixture(String.raw`
import sqlite3
from unittest.mock import patch
database = root / 'accounts.sqlite'
with sqlite3.connect(database) as db:
    db.execute('CREATE TABLE cashlens_auth_migrations(version INTEGER PRIMARY KEY)')
    db.execute('INSERT INTO cashlens_auth_migrations VALUES(2)')
    db.execute('CREATE TABLE accounts(secret TEXT)')
    db.execute('INSERT INTO accounts VALUES(?)', ['PRIVATE_ACCOUNT_MUST_NOT_BE_READ'])
before = database.read_bytes()
queries = []
connect = sqlite3.connect
def tracked_connect(*args, **kwargs):
    db = connect(*args, **kwargs)
    db.set_trace_callback(queries.append)
    return db
with patch.object(m, 'ACCOUNTS', database), patch.object(m.sqlite3, 'connect', tracked_connect):
    assert m._live_auth_schema() == 2
assert database.read_bytes() == before
assert any('MAX(version)' in query for query in queries)
assert not any('FROM accounts' in query or 'PRIVATE_ACCOUNT' in query for query in queries)
with patch.object(m, 'ACCOUNTS', root / 'missing.sqlite'): assert m._live_auth_schema() == 1
linked = root / 'linked.sqlite'
linked.symlink_to(database)
with patch.object(m, 'ACCOUNTS', linked): assert m._live_auth_schema() is None
database.write_bytes(b'not a database')
with patch.object(m, 'ACCOUNTS', database): assert m._live_auth_schema() is None
print(json.dumps({'migrationOnly': True, 'readOnly': True}))
`);
  assert.equal(result.readOnly, true);
});

test('install detection protects failed and inactive units with residual descendants, unreadable groups and orphan cgroups', async () => {
  const result = await runFixture(String.raw`
from types import SimpleNamespace
from unittest.mock import patch
import subprocess
cgroups = root / 'cgroups'
slice_root = cgroups / 'system.slice'
slice_root.mkdir(parents=True)
(cgroups / 'cgroup.controllers').write_text('cpu memory')
def unit(number): return 'cashlens-install-' + sha(number) + '-999.service'
def group(number, processes='', descendant=None, missing_file=False):
    item = slice_root / unit(number)
    item.mkdir()
    if not missing_file: (item / 'cgroup.procs').write_text(processes)
    if descendant is not None:
        nested = item / 'child'
        nested.mkdir()
        (nested / 'cgroup.procs').write_text(descendant)
group(1, '12345\n')
group(2, '', descendant='54321\n')
group(4)
group(5, missing_file=True)
group(6, '77777\n')
group(7, '', descendant='')
states = {1: 'failed', 2: 'inactive', 3: 'active', 4: 'failed', 5: 'inactive', 8: 'failed', 9: 'inactive'}
def systemctl(arguments):
    if arguments[0] == 'list-units':
        output = '\n' + '\n'.join(unit(number) + ' loaded ' + state + ' dead description' for number, state in states.items()) + '\n\n'
        return SimpleNamespace(stdout=output)
    name = arguments[-1]
    if name == unit(9): raise subprocess.CalledProcessError(1, ['fixture-systemctl'])
    return SimpleNamespace(stdout=('/../../private-data' if name == unit(8) else '/system.slice/' + name))
original_open = m._open_directory
original_trusted = m._trusted
with patch.object(m, 'CGROUPS', cgroups), patch.object(m, '_systemctl', systemctl), \
     patch.object(m, '_open_directory', lambda target, expected: original_open(target, uid)), \
     patch.object(m, '_trusted', lambda info, expected, device=None, directory=False: original_trusted(info, uid, device, directory)):
    busy = m._busy_releases()
    assert busy == {sha(number) for number in (1, 2, 3, 5, 6, 8, 9)}, busy
    assert not m._cgroup_has_processes('/system.slice/' + unit(4))
    assert m._cgroup_has_processes('/system.slice/' + unit(2))
    with patch.object(m, '_systemctl', lambda arguments: SimpleNamespace(stdout='cashlens-install-invalid.service loaded failed dead')):
        try: m._busy_releases()
        except m.UnsafePath: pass
        else: raise AssertionError('An unknown unit name was accepted')
    (cgroups / 'cgroup.controllers').unlink()
    with patch.object(m, '_systemctl', side_effect=AssertionError('v1 must be refused before probing units')):
        try: m._busy_releases()
        except m.UnsafePath: pass
        else: raise AssertionError('Missing cgroup v2 controllers accepted')
    (cgroups / 'cgroup.controllers').symlink_to(root / 'private-cgroup-record')
    with patch.object(m, '_systemctl', side_effect=AssertionError('linked controllers must not be read')):
        try: m._busy_releases()
        except m.UnsafePath: pass
        else: raise AssertionError('Linked cgroup v2 controllers accepted')
    (cgroups / 'cgroup.controllers').unlink()
    (cgroups / 'cgroup.controllers').write_text('cpu memory')
    (cgroups / 'cgroup.controllers').chmod(0o000)
    with patch.object(m, '_systemctl', side_effect=AssertionError('unreadable controllers must be refused')):
        try: m._busy_releases()
        except m.UnsafePath: pass
        else: raise AssertionError('Unreadable cgroup v2 controllers accepted')
print(json.dumps({'busy': sorted(busy), 'descendantsProtected': True}))
`);
  assert.equal(result.busy.length, 7);
});
