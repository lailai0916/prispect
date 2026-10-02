#!/usr/bin/env python3
"""Bounded deployment retention. Production paths cannot be supplied by callers."""

import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import stat
import subprocess
import sys
from dataclasses import dataclass


RELEASES = Path('/opt/cashlens/releases')
CURRENT = Path('/opt/cashlens/current')
INBOX = Path('/var/lib/cashlens-deploy')
ACCOUNTS = Path('/var/lib/cashlens/accounts.sqlite')
CGROUPS = Path('/sys/fs/cgroup')
SHA = re.compile(r'[0-9a-f]{40}\Z')
JOB = re.compile(r'job-([0-9a-f]{40})\.[A-Za-z0-9]{6}\Z')
UNIT = re.compile(r'cashlens-install-([0-9a-f]{40})-[0-9]+\.service\Z')
LOG_LIMIT = 256 * 1024
HEAVY_DIRS = ('install', 'npm-home', 'sealed')
HEAVY_FILES = ('release.tar.gz', 'served-asset')
DIRECTORY_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC


@dataclass(frozen=True)
class DeploymentPaths:
    releases: Path
    current: Path
    inbox: Path


class UnsafePath(ValueError):
    pass


def _trusted(info, uid, device=None, directory=False):
    if (info.st_uid != uid or info.st_mode & 0o022 or
            (device is not None and info.st_dev != device) or
            (directory and not stat.S_ISDIR(info.st_mode))):
        raise UnsafePath('Untrusted owner, permissions, type or filesystem.')


def _open_directory(path, uid):
    """Open each ancestor without following links, then anchor to a trusted fd."""
    path = Path(path)
    if not path.is_absolute() or any(part in ('.', '..') for part in path.parts):
        raise UnsafePath('Directory anchor must be absolute and normalized.')
    fd = os.open('/', DIRECTORY_FLAGS)
    try:
        for part in path.parts[1:]:
            next_fd = os.open(part, DIRECTORY_FLAGS, dir_fd=fd)
            os.close(fd)
            fd = next_fd
            info = os.fstat(fd)
            # Root-owned sticky /tmp is permitted for isolated library fixtures.
            sticky = info.st_uid == 0 and bool(info.st_mode & stat.S_ISVTX)
            if info.st_uid not in (0, uid) or (info.st_mode & 0o022 and not sticky):
                raise UnsafePath('An ancestor is writable by another identity.')
        _trusted(os.fstat(fd), uid, directory=True)
        return fd
    except BaseException:
        os.close(fd)
        raise


def _read_file(parent_fd, name, uid, limit=16 * 1024, optional=False):
    try:
        named = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    except FileNotFoundError:
        if optional:
            return None
        raise
    _trusted(named, uid, os.fstat(parent_fd).st_dev)
    if not stat.S_ISREG(named.st_mode) or named.st_nlink != 1 or named.st_size > limit:
        raise UnsafePath('Metadata is not a small private regular file.')
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC,
                 dir_fd=parent_fd)
    try:
        info = os.fstat(fd)
        _trusted(info, uid, os.fstat(parent_fd).st_dev)
        if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size > limit or
                (info.st_dev, info.st_ino) != (named.st_dev, named.st_ino)):
            raise UnsafePath('Metadata is not a small private regular file.')
        _same_mount(fd, parent_fd)
        data = os.read(fd, limit + 1)
        if len(data) > limit:
            raise UnsafePath('Metadata exceeds its limit.')
        return data.decode('utf-8')
    finally:
        os.close(fd)


def _release(parent_fd, name, uid):
    info = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    _trusted(info, uid, os.fstat(parent_fd).st_dev, directory=True)
    fd = os.open(name, DIRECTORY_FLAGS, dir_fd=parent_fd)
    try:
        if os.fstat(fd).st_ino != info.st_ino:
            raise UnsafePath('Release changed while opening.')
        _same_mount(fd, parent_fd)
        if json.loads(_read_file(fd, 'RELEASE.json', uid)) != {'commit': name}:
            raise UnsafePath('Release commit manifest does not match its directory.')
        artifact = _read_file(fd, '.artifact-sha256', uid).strip()
        if not re.fullmatch(r'[0-9a-f]{64}', artifact):
            raise UnsafePath('Invalid sealed artifact hash.')
        auth = _read_file(fd, 'AUTH_SCHEMA.json', uid, optional=True)
        version = json.loads(auth).get('version') if auth is not None else 1
        if type(version) is not int or not 1 <= version <= 100:
            raise UnsafePath('Invalid authentication compatibility manifest.')
        failed = _read_file(fd, '.deployment-failed', uid, optional=True) is not None
        deployed = _read_file(fd, '.deployed-at', uid, optional=True)
        if deployed is None:
            deployed_at = info.st_mtime
        else:
            if not re.fullmatch(r'[0-9]{1,12}(?:\.[0-9]{1,9})?\s*', deployed):
                raise UnsafePath('Invalid deployment timestamp.')
            deployed_at = float(deployed.strip())
        return {'name': name, 'info': info, 'schema': version,
                'successful': not failed, 'marked_success': deployed is not None,
                'deployed_at': deployed_at}
    finally:
        os.close(fd)


def _mount_id(fd):
    """Linux mount IDs also identify same-filesystem bind mounts."""
    try:
        with open(f'/proc/self/fdinfo/{fd}', encoding='ascii') as stream:
            for line in stream:
                if line.startswith('mnt_id:'):
                    return int(line.split(':', 1)[1])
    except (OSError, ValueError):
        pass
    return None


def _same_mount(fd, parent_fd):
    mount = _mount_id(fd)
    parent = _mount_id(parent_fd)
    if mount is None or parent is None or mount != parent:
        raise UnsafePath('Mount identity is unavailable or crosses a boundary.')


def _check_file_mount(parent_fd, name, expected_info):
    flags = getattr(os, 'O_PATH', os.O_RDONLY | os.O_NONBLOCK)
    fd = os.open(name, flags | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=parent_fd)
    try:
        info = os.fstat(fd)
        if (not stat.S_ISREG(info.st_mode) or
                (info.st_dev, info.st_ino, info.st_uid) !=
                (expected_info.st_dev, expected_info.st_ino, expected_info.st_uid)):
            raise UnsafePath('A file changed while opening.')
        _same_mount(fd, parent_fd)
    finally:
        os.close(fd)


def _check_tree(parent_fd, name, uid, device, depth=0):
    """Preflight the whole tree: no other owners, writable dirs or mount crossings."""
    info = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    _trusted(info, uid, device, directory=True)
    if depth > 128:
        raise UnsafePath('A deployment tree exceeds the safe nesting limit.')
    fd = os.open(name, DIRECTORY_FLAGS, dir_fd=parent_fd)
    try:
        opened = os.fstat(fd)
        _trusted(opened, uid, device, directory=True)
        if (opened.st_dev, opened.st_ino) != (info.st_dev, info.st_ino):
            raise UnsafePath('Directory changed while opening.')
        _same_mount(fd, parent_fd)
        for child in os.listdir(fd):
            child_info = os.stat(child, dir_fd=fd, follow_symlinks=False)
            if child_info.st_uid != uid or child_info.st_dev != device:
                raise UnsafePath('A descendant has a different owner or filesystem.')
            if stat.S_ISDIR(child_info.st_mode):
                _check_tree(fd, child, uid, device, depth + 1)
            elif stat.S_ISREG(child_info.st_mode):
                _check_file_mount(fd, child, child_info)
            elif not (stat.S_ISREG(child_info.st_mode) or stat.S_ISLNK(child_info.st_mode)):
                raise UnsafePath('A descendant is a special file.')
        return info
    finally:
        os.close(fd)


def _remove_tree(parent_fd, name, uid, device):
    if not shutil.rmtree.avoids_symlink_attacks:
        raise UnsafePath('This Python runtime cannot safely remove directory trees.')
    info = _check_tree(parent_fd, name, uid, device)
    now = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    if (now.st_dev, now.st_ino) != (info.st_dev, info.st_ino):
        raise UnsafePath('Directory changed before removal.')
    # Links inside a sealed release (including data/raw) are unlinked, not followed.
    shutil.rmtree(name, dir_fd=parent_fd)


def _remove_file(parent_fd, name, uid, device):
    info = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    _trusted(info, uid, device)
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        raise UnsafePath('Cleanup target is not a private regular file.')
    _check_file_mount(parent_fd, name, info)
    os.unlink(name, dir_fd=parent_fd)


def _trim_log(parent_fd, name, uid, device):
    named = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    _trusted(named, uid, device)
    if not stat.S_ISREG(named.st_mode) or named.st_nlink != 1:
        raise UnsafePath('A log is linked or is not a regular file.')
    fd = os.open(name, os.O_RDWR | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=parent_fd)
    try:
        info = os.fstat(fd)
        _trusted(info, uid, device)
        if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or
                (info.st_dev, info.st_ino) != (named.st_dev, named.st_ino)):
            raise UnsafePath('A log is linked or is not a regular file.')
        _same_mount(fd, parent_fd)
        if info.st_size > LOG_LIMIT:
            os.lseek(fd, -LOG_LIMIT, os.SEEK_END)
            tail = os.read(fd, LOG_LIMIT)
            os.lseek(fd, 0, os.SEEK_SET)
            pending = memoryview(tail)
            while pending:
                pending = pending[os.write(fd, pending):]
            os.ftruncate(fd, len(tail))
    finally:
        os.close(fd)


def _current_release(paths, uid):
    fd = _open_directory(paths.current.parent, uid)
    try:
        info = os.stat(paths.current.name, dir_fd=fd, follow_symlinks=False)
        if not stat.S_ISLNK(info.st_mode) or info.st_uid != uid:
            raise UnsafePath('Current must be an owner-controlled symlink.')
        target = os.readlink(paths.current.name, dir_fd=fd)
        absolute = Path(os.path.abspath(paths.current.parent / target))
        if absolute.parent != paths.releases or not SHA.fullmatch(absolute.name):
            raise UnsafePath('Current points outside a recognized release.')
        return absolute.name
    finally:
        os.close(fd)


def prune(paths, preserve_releases=(), active_job=None, clean_active=False,
          expected_uid=0, required_auth_schema=None, busy_release_shas=()):
    """Library entry for isolated fixtures; the CLI supplies only fixed paths."""
    if sys.version_info < (3, 11):
        raise ValueError('Deployment retention requires Python 3.11 or newer.')
    paths = DeploymentPaths(*(Path(path) for path in
                              (paths.releases, paths.current, paths.inbox)))
    preserve_releases = tuple(preserve_releases)
    busy_release_shas = tuple(busy_release_shas)
    if any(not SHA.fullmatch(name) for name in (*preserve_releases, *busy_release_shas)):
        raise ValueError('Invalid protected release identifier.')
    if active_job is not None and not JOB.fullmatch(active_job):
        raise ValueError('Invalid active job identifier.')
    if clean_active and active_job is None:
        raise ValueError('Cleaning an active job requires its explicit identifier.')
    if required_auth_schema is not None and (
            type(required_auth_schema) is not int or not 1 <= required_auth_schema <= 100):
        raise ValueError('Invalid required authentication schema.')
    result = {key: [] for key in ('deleted_releases', 'cleaned_jobs', 'deleted_jobs',
                                  'skipped', 'warnings')}
    result['active_job_clean'] = False if clean_active else None
    active_commit = JOB.fullmatch(active_job).group(1) if active_job else None
    protected = set(preserve_releases) | set(busy_release_shas)
    busy = set(busy_release_shas)
    release_fd = _open_directory(paths.releases, expected_uid)
    try:
        inbox_fd = _open_directory(paths.inbox, expected_uid)
    except BaseException:
        os.close(release_fd)
        raise
    try:
        releases = {}
        for name in sorted(os.listdir(release_fd)):
            if not SHA.fullmatch(name):
                result['skipped'].append(f'release:{name}:unrecognized')
                continue
            try:
                releases[name] = _release(release_fd, name, expected_uid)
            except (OSError, ValueError, TypeError, AttributeError) as error:
                result['skipped'].append(f'release:{name}:{type(error).__name__}')
        try:
            current = _current_release(paths, expected_uid)
            if current not in releases:
                raise UnsafePath('Current release metadata is not trusted.')
            protected.add(current)
        except (OSError, ValueError):
            current = None
            result['warnings'].append('Current is untrusted; releases were retained.')
        if current is not None and required_auth_schema is not None:
            successful_old = sorted(
                (release for release in releases.values()
                 if release['name'] != current and release['successful'] and
                 not (release['name'] == active_commit and not release['marked_success']) and
                 release['schema'] >= required_auth_schema),
                key=lambda release: (release['deployed_at'], release['name']), reverse=True)
            # An explicitly protected successful rollback consumes one of the two
            # old-version slots. Failed/unpublished targets do not consume a slot.
            retained_old = {item['name'] for item in successful_old
                            if item['name'] in protected}
            for item in successful_old:
                if len(retained_old) >= 2:
                    break
                retained_old.add(item['name'])
            keep = protected | retained_old
            for name, release in releases.items():
                if name in keep:
                    continue
                try:
                    _remove_tree(release_fd, name, expected_uid,
                                 os.fstat(release_fd).st_dev)
                    result['deleted_releases'].append(name)
                except (OSError, ValueError) as error:
                    result['skipped'].append(f'release:{name}:{type(error).__name__}')
        elif required_auth_schema is None:
            result['warnings'].append('Authentication schema is unavailable; releases were retained.')

        jobs = []
        device = os.fstat(inbox_fd).st_dev
        for name in sorted(os.listdir(inbox_fd)):
            match = JOB.fullmatch(name)
            if not match:
                continue
            try:
                info = os.stat(name, dir_fd=inbox_fd, follow_symlinks=False)
                _trusted(info, expected_uid, device, directory=True)
                jobs.append((name, match.group(1), info))
            except (OSError, ValueError) as error:
                result['skipped'].append(f'job:{name}:{type(error).__name__}')
        jobs.sort(key=lambda item: (item[2].st_mtime_ns, item[0]), reverse=True)
        kept_jobs = {item[0] for item in jobs[:10]}
        if active_job:
            kept_jobs.add(active_job)
        for name, commit, info in jobs:
            if commit in busy or (name == active_job and not clean_active):
                result['skipped'].append(f'job:{name}:active-install')
                continue
            fd = None
            try:
                fd = os.open(name, DIRECTORY_FLAGS, dir_fd=inbox_fd)
                opened = os.fstat(fd)
                _trusted(opened, expected_uid, device, directory=True)
                if (opened.st_dev, opened.st_ino) != (info.st_dev, info.st_ino):
                    raise UnsafePath('Job changed while opening.')
                _same_mount(fd, inbox_fd)
            except (OSError, ValueError) as error:
                if fd is not None:
                    os.close(fd)
                result['skipped'].append(f'job:{name}:{type(error).__name__}')
                continue
            try:
                for child in (*HEAVY_DIRS, *HEAVY_FILES):
                    try:
                        if child in HEAVY_DIRS:
                            _remove_tree(fd, child, expected_uid, device)
                        else:
                            _remove_file(fd, child, expected_uid, device)
                    except FileNotFoundError:
                        pass
                    except (OSError, ValueError) as error:
                        result['skipped'].append(f'job:{name}/{child}:{type(error).__name__}')
                for child in sorted(os.listdir(fd)):
                    if re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]*\.log', child):
                        try:
                            _trim_log(fd, child, expected_uid, device)
                        except (OSError, ValueError) as error:
                            result['skipped'].append(f'job:{name}/{child}:{type(error).__name__}')
                if name == active_job and clean_active:
                    remaining = []
                    for child in (*HEAVY_DIRS, *HEAVY_FILES):
                        try:
                            os.stat(child, dir_fd=fd, follow_symlinks=False)
                            remaining.append(child)
                        except FileNotFoundError:
                            pass
                    result['active_job_clean'] = not remaining
                os.utime(fd, ns=(info.st_atime_ns, info.st_mtime_ns))
                result['cleaned_jobs'].append(name)
            finally:
                os.close(fd)
            if name not in kept_jobs:
                try:
                    _remove_tree(inbox_fd, name, expected_uid, device)
                    result['deleted_jobs'].append(name)
                except (OSError, ValueError) as error:
                    result['skipped'].append(f'job:{name}:{type(error).__name__}')
        return result
    finally:
        os.close(inbox_fd)
        os.close(release_fd)


def _live_auth_schema():
    """Read only the migration version, never account contents or configuration."""
    try:
        info = ACCOUNTS.lstat()
        if not stat.S_ISREG(info.st_mode):
            return None
        with sqlite3.connect(f'{ACCOUNTS.as_uri()}?mode=ro', uri=True, timeout=10) as db:
            db.execute('PRAGMA query_only=ON')
            exists = db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='cashlens_auth_migrations'").fetchone()
            row = db.execute('SELECT MAX(version) FROM cashlens_auth_migrations').fetchone() if exists else None
        after = ACCOUNTS.lstat()
        if (after.st_dev, after.st_ino) != (info.st_dev, info.st_ino):
            return None
        version = row[0] if row and row[0] is not None else 1
        return version if type(version) is int and 1 <= version <= 100 else None
    except FileNotFoundError:
        return 1
    except (OSError, sqlite3.Error, ValueError):
        return None


def _systemctl(arguments):
    return subprocess.run(['/usr/bin/systemctl', *arguments], capture_output=True,
                          text=True, timeout=15, check=True,
                          env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LC_ALL': 'C'})


def _cgroup_has_processes(group):
    if not re.fullmatch(r'/system\.slice/cashlens-install-[0-9a-f]{40}-[0-9]+\.service', group):
        raise UnsafePath('Unrecognized installation control group.')
    try:
        fd = _open_directory(CGROUPS / group.lstrip('/'), 0)
    except FileNotFoundError:
        return False
    def populated(directory_fd, depth=0):
        if depth > 32:
            raise UnsafePath('Installation control groups exceed the nesting limit.')
        if _read_file(directory_fd, 'cgroup.procs', 0, limit=64 * 1024).strip():
            return True
        for child in os.listdir(directory_fd):
            info = os.stat(child, dir_fd=directory_fd, follow_symlinks=False)
            if stat.S_ISLNK(info.st_mode):
                raise UnsafePath('A control group contains an unexpected link.')
            if stat.S_ISDIR(info.st_mode):
                _trusted(info, 0, os.fstat(directory_fd).st_dev, directory=True)
                nested = os.open(child, DIRECTORY_FLAGS, dir_fd=directory_fd)
                try:
                    _same_mount(nested, directory_fd)
                    if populated(nested, depth + 1):
                        return True
                finally:
                    os.close(nested)
        return False
    try:
        return populated(fd)
    finally:
        os.close(fd)


def _orphan_install_groups():
    try:
        fd = _open_directory(CGROUPS / 'system.slice', 0)
    except FileNotFoundError:
        return []
    try:
        groups = []
        for name in os.listdir(fd):
            if not name.startswith('cashlens-install-'):
                continue
            if not UNIT.fullmatch(name):
                raise UnsafePath('Unrecognized orphan installation control group.')
            groups.append(name)
        return groups
    finally:
        os.close(fd)


def _busy_releases():
    fd = None
    try:
        fd = _open_directory(CGROUPS, 0)
        info = os.stat('cgroup.controllers', dir_fd=fd, follow_symlinks=False)
        _trusted(info, 0, os.fstat(fd).st_dev)
        if not stat.S_ISREG(info.st_mode) or not info.st_mode & stat.S_IRUSR:
            raise UnsafePath('Cgroup v2 controllers are not a readable regular file.')
        _read_file(fd, 'cgroup.controllers', 0, limit=64 * 1024)
    except (OSError, ValueError):
        raise UnsafePath('Trusted cgroup v2 is required before deployment cleanup.') from None
    finally:
        if fd is not None:
            os.close(fd)
    response = _systemctl(['list-units', '--all', '--plain', '--no-legend', '--no-pager',
                          'cashlens-install-*.service'])
    busy = set()
    seen = set()
    for line in response.stdout.splitlines():
        fields = line.split()
        if not fields:
            continue
        name = fields[0]
        match = UNIT.fullmatch(name)
        if not match or len(fields) < 4:
            raise UnsafePath('Unrecognized active install unit; cleanup refused.')
        seen.add(name)
        if fields[2] not in ('inactive', 'failed'):
            busy.add(match.group(1))
            continue
        expected = '/system.slice/' + name
        try:
            actual = _systemctl(['show', '--property=ControlGroup', '--value', name]).stdout.strip()
            if actual and actual != expected:
                raise UnsafePath('Install unit has an unexpected control group.')
            if _cgroup_has_processes(expected):
                busy.add(match.group(1))
        except (OSError, ValueError, subprocess.SubprocessError):
            busy.add(match.group(1))
    for name in _orphan_install_groups():
        if name in seen:
            continue
        try:
            if _cgroup_has_processes('/system.slice/' + name):
                busy.add(UNIT.fullmatch(name).group(1))
        except (OSError, ValueError):
            busy.add(UNIT.fullmatch(name).group(1))
    return busy


def _lock(inherited=None):
    parent_fd = _open_directory(INBOX, 0)
    try:
        if inherited is None:
            fd = os.open('deploy.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW |
                         os.O_CLOEXEC, 0o600, dir_fd=parent_fd)
        else:
            fd = os.dup(inherited)
        try:
            actual = os.fstat(fd)
            named = os.stat('deploy.lock', dir_fd=parent_fd, follow_symlinks=False)
            _trusted(actual, 0, os.fstat(parent_fd).st_dev)
            if (not stat.S_ISREG(actual.st_mode) or actual.st_nlink != 1 or
                    (actual.st_dev, actual.st_ino) != (named.st_dev, named.st_ino)):
                raise UnsafePath('Inherited lock does not identify the fixed deployment lock.')
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return fd
        except BaseException:
            os.close(fd)
            raise
    finally:
        os.close(parent_fd)


def _identifier(pattern):
    def parse(value):
        if not pattern.fullmatch(value):
            raise argparse.ArgumentTypeError('Invalid deployment identifier.')
        return value
    return parse


def main(argv=None):
    if sys.version_info < (3, 11):
        raise SystemExit('Deployment retention requires Python 3.11 or newer.')
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument('--lock-fd', type=int, choices=[9])
    parser.add_argument('--active-job', type=_identifier(JOB))
    parser.add_argument('--protect-release', action='append', default=[], type=_identifier(SHA))
    parser.add_argument('--clean-active', action='store_true')
    args = parser.parse_args(argv)
    if args.clean_active and not args.active_job:
        parser.error('--clean-active requires --active-job.')
    if os.geteuid() != 0:
        parser.error('This fixed retention helper must run as root.')
    lock_fd = _lock(args.lock_fd)
    try:
        result = prune(DeploymentPaths(RELEASES, CURRENT, INBOX),
                       preserve_releases=args.protect_release, active_job=args.active_job,
                       clean_active=args.clean_active, required_auth_schema=_live_auth_schema(),
                       busy_release_shas=_busy_releases())
        print(json.dumps(result, sort_keys=True))
        if args.clean_active and result['active_job_clean'] is not True:
            raise SystemExit(1)
    finally:
        # Closing this duplicated descriptor never unlocks a publisher's inherited
        # open-file description. Do not call LOCK_UN on a shared descriptor.
        os.close(lock_fd)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        print(f'Deployment retention refused: {type(error).__name__}.', file=sys.stderr)
        sys.exit(1)
