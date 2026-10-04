#!/usr/bin/env python3
"""Validate a trusted-checksum backup; optionally recover into a NEW private directory.

Never stop a service, load environment configuration or overwrite a live workspace.
Outputs counts only. This is an offline consistency check, not a production restore.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import sqlite3
import tarfile
import tempfile


class InvalidBackup(Exception):
    pass


def require(condition, message):
    if not condition:
        raise InvalidBackup(message)


def digest(file):
    value = hashlib.sha256()
    with file.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(chunk)
    return value.hexdigest()


def members(archive, max_members, max_bytes):
    entries = []
    seen = {}
    total = 0
    count = 0
    for member in archive:
        count += 1
        require(count <= max_members, 'Archive has too many entries')
        raw = member.name
        require(not raw.startswith('/') and '\\' not in raw and '\x00' not in raw,
                'Unsafe archive path')
        parts = PurePosixPath(raw).parts
        require('..' not in parts, 'Unsafe archive path')
        name = str(PurePosixPath(raw))
        require(member.isdir() or member.isreg(), 'Links and special files are forbidden')
        require(not member.sparse, 'Sparse entries are forbidden')
        if name == '.':
            require(member.isdir(), 'Invalid archive root')
            continue
        require(name not in seen, 'Duplicate archive entry')
        require(member.size >= 0, 'Invalid entry size')
        seen[name] = member.isdir()
        total += member.size
        require(total <= max_bytes, 'Archive exceeds expanded byte limit')
        entries.append((name, member))
    for name in seen:
        for parent in PurePosixPath(name).parents:
            if str(parent) in seen:
                require(seen[str(parent)], 'File and directory paths conflict')
    return entries, total


def extract(archive, entries, target):
    for name, member in entries:
        output = target / name
        output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        if member.isdir():
            output.mkdir(exist_ok=True, mode=0o700)
            continue
        fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'wb') as sink:
            source = archive.extractfile(member)
            require(source is not None, 'Missing archive content')
            remaining = member.size
            with source:
                while remaining:
                    chunk = source.read(min(1024 * 1024, remaining))
                    require(bool(chunk), 'Truncated archive content')
                    sink.write(chunk)
                    remaining -= len(chunk)
            sink.flush()
            os.fsync(sink.fileno())


def validate_state(target):
    database = target / 'accounts.sqlite'
    require(database.is_file(), 'Account database is missing')
    connection = sqlite3.connect(database.as_uri() + '?mode=ro', uri=True)
    try:
        connection.execute('PRAGMA query_only=ON')
        require(connection.execute('PRAGMA quick_check').fetchall() == [('ok',)],
                'Account database integrity check failed')
        require(not connection.execute('PRAGMA foreign_key_check').fetchall(),
                'Account database relationship check failed')
        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        require({'user', 'account', 'session', 'verification', 'cashlens_auth_migrations'} <= tables,
                'Unsupported account database schema')
        require(connection.execute('SELECT MAX(version) FROM cashlens_auth_migrations').fetchone()[0] == 2,
                'Unsupported authentication migration version')
        owners = {str(row[0]) for row in connection.execute('SELECT id FROM user')}
    finally:
        connection.close()
    require((target / 'auth-secret').is_file() or (target / 'configuration/cashlens.env').is_file(),
            'Authentication configuration is missing')
    workspaces = uploads = originals = orphan_files = 0
    users = target / 'users'
    if users.exists():
        for directory in users.iterdir():
            require(directory.is_dir() and directory.name in owners, 'Workspace owner is missing')
            state = json.loads((directory / 'workspace.json').read_text())
            require(isinstance(state, dict) and state.get('schemaVersion') == 1,
                    'Unsupported workspace schema')
            for field in ('materials', 'tasks'):
                require(isinstance(state.get(field), list), 'Invalid workspace collections')
            for field in ('uploads', 'inputs'):
                require(isinstance(state.get(field), dict), 'Invalid workspace collections')
            for field in ('companyRuns', 'decisions'):
                require(isinstance(state.get(field, []), list), 'Invalid workspace collections')
            material_by_id = {material['id']: material for material in state['materials']}
            require(len(material_by_id) == len(state['materials']), 'Duplicate material IDs')
            for upload_id, record in state['uploads'].items():
                require(re.fullmatch(r'[a-f0-9-]{36}', upload_id) and record.get('id') == upload_id,
                        'Invalid upload identifier')
                file = directory / 'uploads' / (upload_id + '.blob')
                require(file.is_file(), 'Retained original is missing')
                require(file.stat().st_size == record.get('bytes') and digest(file) == record.get('sha256'),
                        'Retained original size or hash differs')
                if record.get('materialId'):
                    material = material_by_id.get(record['materialId'])
                    require(material and material.get('uploadId') == upload_id and material.get('sha256') == record['sha256'],
                            'Adopted original relationship differs')
                    originals += 1
                uploads += 1
            for material in state['materials']:
                if material.get('uploadId'):
                    record = state['uploads'].get(material['uploadId'])
                    require(record and record.get('materialId') == material['id'],
                            'Material original relationship is missing')
            upload_dir = directory / 'uploads'
            if upload_dir.exists():
                orphan_files += sum(1 for file in upload_dir.iterdir()
                                    if file.is_file() and file.suffix == '.blob' and file.stem not in state['uploads'])
            workspaces += 1
    return {'accounts': len(owners), 'workspaces': workspaces, 'uploads': uploads,
            'adopted_originals': originals, 'unreferenced_blobs': orphan_files}


def fresh_destination(raw):
    target = Path(os.path.abspath(raw))
    forbidden = (Path('/var/lib/cashlens'), Path('/opt/cashlens'), Path('/var/backups/cashlens'))
    require(not any(target == root or root in target.parents for root in forbidden),
            'A production directory cannot be a recovery destination')
    require(not target.exists() and not target.is_symlink(), 'Recovery destination must not exist')
    require(target.parent.is_dir(), 'Recovery parent must already exist')
    for parent in (target.parent, *target.parent.parents):
        require(not parent.is_symlink(), 'Recovery ancestors cannot be links')
    target.mkdir(mode=0o700)
    return target


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('--sha256', required=True, help='Trusted SHA256 from an independently retained manifest')
    parser.add_argument('--extract-to', help='New isolated directory; never an existing or live workspace')
    parser.add_argument('--max-members', type=int, default=250000)
    parser.add_argument('--max-bytes', type=int, default=20 * 1024 ** 3)
    args = parser.parse_args()
    target = None
    try:
        require(args.max_members > 0 and args.max_bytes > 0, 'Invalid extraction limits')
        require(re.fullmatch(r'[0-9a-f]{64}', args.sha256) is not None, 'Invalid expected checksum')
        require(not args.archive.is_symlink() and args.archive.is_file(), 'Archive must be a regular file')
        # Hash and parse the SAME open file; avoid a named-file substitution between steps.
        with args.archive.open('rb') as file:
            actual = hashlib.file_digest(file, 'sha256').hexdigest()
            require(actual == args.sha256, 'Archive checksum differs')
            file.seek(0)
            with tarfile.open(fileobj=file, mode='r:gz') as archive:
                entries, size = members(archive, args.max_members, args.max_bytes)
                parent = Path(os.path.abspath(args.extract_to)).parent if args.extract_to else Path(tempfile.gettempdir())
                require(shutil.disk_usage(parent).free >= size + len(entries) * 8192 + 512 * 1024 ** 2,
                        'Insufficient space for isolated recovery')
                if args.extract_to:
                    target = fresh_destination(args.extract_to)
                    extract(archive, entries, target)
                    counts = validate_state(target)
                else:
                    with tempfile.TemporaryDirectory(prefix='prispect-backup-check-') as temporary:
                        target = Path(temporary)
                        extract(archive, entries, target)
                        counts = validate_state(target)
                    target = None
        print(json.dumps({'ok': True, 'entries': len(entries), 'expanded_bytes': size,
                          'isolated_recovery': bool(args.extract_to), **counts}))
    except (InvalidBackup, OSError, ValueError, KeyError, TypeError, sqlite3.Error, tarfile.TarError):
        # A failed new destination remains quarantined; never delete someone else's files.
        print(json.dumps({'ok': False, 'error': 'Backup validation failed; no existing state was overwritten',
                          'new_directory_may_be_partial': bool(args.extract_to and target is not None)}))
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
