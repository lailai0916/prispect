#!/usr/bin/env bash
set -euo pipefail
umask 077

fail() { printf '%s\n' "$*" >&2; exit 1; }
[[ "$#" -eq 2 ]] || fail 'Usage: package-release.sh <40-hex-commit> <output.tar.gz>'
sha="$1"
output="$2"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || fail 'Release commit must be a full lowercase SHA.'
[[ "$(git rev-parse --verify HEAD)" == "$sha" ]] || fail 'Checkout does not match release commit.'
git diff --quiet "$sha" -- || fail 'Tracked checkout differs from release commit.'
[[ -f dist/index.html && -f package-lock.json ]] || fail 'Build dist and lockfile are required.'
[[ ! -e "$output" ]] || fail 'Output already exists.'

stage="$(mktemp -d)"
trap 'rm -rf -- "$stage"' EXIT
git archive --format=tar "$sha" | tar -xf - -C "$stage"
[[ ! -e "$stage/dist" ]] || fail 'dist must be a build output, not tracked source.'
cp -R dist "$stage/dist"
epoch="$(git show -s --format=%ct "$sha")"
python3 - "$stage" "$output" "$sha" "$epoch" <<'PY'
import gzip
import json
import os
import pathlib
import shutil
import sys
import tarfile

stage = pathlib.Path(sys.argv[1])
output = pathlib.Path(sys.argv[2]).resolve()
commit, epoch = sys.argv[3], int(sys.argv[4])
agent_config = stage / ".claude"
if agent_config.is_symlink():
    agent_config.unlink()
elif agent_config.exists():
    shutil.rmtree(agent_config)
blocked = {".git", ".cashlens", "node_modules", "work"}
for path in stage.rglob("*"):
    relative = path.relative_to(stage)
    if path.is_symlink() or not (path.is_file() or path.is_dir()):
        raise SystemExit("Release source contains a link or special file.")
    if any(part in blocked or (part.startswith(".env") and part != ".env.example")
           for part in relative.parts) or relative.parts[:2] == ("data", "raw"):
        raise SystemExit("Release contains an excluded path.")
(stage / "RELEASE.json").write_text(json.dumps({"commit": commit}, sort_keys=True) + "\n")

def metadata(info):
    info.uid = info.gid = 0
    info.uname = info.gname = ""
    info.mtime = epoch
    info.pax_headers = {}
    info.mode = 0o755 if info.isdir() or info.mode & 0o111 else 0o644
    return info

output.parent.mkdir(parents=True, exist_ok=True)
with output.open("xb") as stream:
    with gzip.GzipFile(filename="", mode="wb", fileobj=stream, mtime=0) as zipped:
        with tarfile.open(fileobj=zipped, mode="w", format=tarfile.PAX_FORMAT) as archive:
            for path in sorted(stage.iterdir()):
                archive.add(path, arcname=path.name, filter=metadata)
print(output)
PY
python3 - "$output" <<'PY'
import hashlib
import pathlib
import sys
path = pathlib.Path(sys.argv[1])
digest = hashlib.file_digest(path.open("rb"), "sha256").hexdigest()
path.with_name(path.name + ".sha256").write_text(digest + "\n")
print("Artifact SHA-256: " + digest)
PY
