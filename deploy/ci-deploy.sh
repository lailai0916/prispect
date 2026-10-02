#!/usr/bin/env bash
set -euo pipefail
umask 077
export PATH=/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export LC_ALL=C

fail() { printf '%s\n' "$*" >&2; exit 1; }
[[ "$(id -u)" -eq 0 ]] || fail 'This fixed publisher must run as root.'
[[ "$#" -eq 2 ]] || fail 'Expected commit and artifact hash.'
sha="$1"
artifact_hash="$2"
[[ "$sha" =~ ^[0-9a-f]{40}$ && "$artifact_hash" =~ ^[0-9a-f]{64}$ ]] || fail 'Invalid release identifiers.'

base=/opt/cashlens
releases="$base/releases"
current="$base/current"
source_data="$base/source-data"
inbox=/var/lib/cashlens-deploy
backup=/usr/local/sbin/cashlens-backup
healthcheck=/usr/local/sbin/cashlens-healthcheck
prune=/usr/local/sbin/cashlens-prune-deployments
[[ -d "$inbox" && ! -L "$inbox" && "$(stat -c %u "$inbox")" -eq 0 ]] || fail 'Root-owned inbox is required.'
[[ "$(stat -c %a "$inbox")" == 755 ]] || fail 'Inbox must have mode 0755.'
[[ -d "$releases" && ! -L "$releases" && "$(stat -c %u "$releases")" -eq 0 ]] || fail 'Root-owned releases directory is required.'
[[ -d "$source_data" && ! -L "$source_data" && "$(stat -c %u "$source_data")" -eq 0 ]] || fail 'Preinstalled root-owned source-data directory is required.'
for helper in "$backup" "$healthcheck" "$prune"; do
  [[ -f "$helper" && ! -L "$helper" && -x "$helper" && "$(stat -c %u "$helper")" -eq 0 ]] || fail 'Preinstalled root-owned executable helper is required.'
  [[ "$(stat -c %a "$helper")" == 755 ]] || fail 'Helper mode must be 0755.'
done
for service in cashlens-backup.service cashlens-health.service; do
  expected="$backup"
  [[ "$service" != cashlens-health.service ]] || expected="$healthcheck"
  systemctl show --property=ExecStart --value "$service" |
    python3 -c 'import re,sys; actual=re.findall(r"path=([^ ;]+) ;",sys.stdin.read()); sys.exit(0 if actual == [sys.argv[1]] else 1)' "$expected" ||
    fail 'Maintenance service must use its fixed preinstalled helper.'
done
exec 9>"$inbox/deploy.lock"
flock -n 9 || fail 'Another deployment is in progress.'
[[ -L "$current" ]] || fail 'An existing current release symlink is required for rollback.'
old_release="$(readlink -f "$current")"
[[ "$old_release" == "$releases/"* && -d "$old_release" ]] || fail 'Current release is outside releases.'

job="$(mktemp -d "$inbox/job-$sha.XXXXXX")"
artifact="$job/release.tar.gz"
install_tree="$job/install"
npm_home="$job/npm-home"
sealed="$job/sealed"
source_manifest="$job/source-manifest.json"
release="$releases/$sha"
switched=false
install_unit=""
release_created=false

# Auth migrations can accept new security state. Never return that database to an older binary.
database_auth_schema() {
  python3 - /var/lib/cashlens/accounts.sqlite <<'PY'
import pathlib, sqlite3, sys
path = pathlib.Path(sys.argv[1])
if not path.exists():
    print(1)
else:
    with sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=10) as db:
        exists = db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='cashlens_auth_migrations'").fetchone()
        row = db.execute("SELECT MAX(version) FROM cashlens_auth_migrations").fetchone() if exists else None
        print(row[0] if row and row[0] else 1)
PY
}

release_auth_schema() {
  python3 - "$1/AUTH_SCHEMA.json" <<'PY'
import json, pathlib, sys
path = pathlib.Path(sys.argv[1])
version = json.loads(path.read_text()).get("version") if path.exists() else 1
if type(version) is not int or version < 1 or version > 100:
    raise SystemExit("Invalid auth schema compatibility manifest.")
print(version)
PY
}

can_restore_release() {
  local live_schema previous_schema
  live_schema="$(database_auth_schema)" || return 1
  previous_schema="$(release_auth_schema "$1")" || return 1
  [[ "$previous_schema" -ge "$live_schema" ]]
}

probe() {
  "$healthcheck" >"$job/health.log" 2>&1 || return 1
  curl -fsS --max-time 5 http://127.0.0.1:4317/ >"$job/served-index.html" || return 1
  cmp -s "$release/dist/index.html" "$job/served-index.html" || return 1
  python3 - "$release/dist/index.html" >"$job/assets.txt" <<'PY' || return 1
from html.parser import HTMLParser
import pathlib
import re
import sys
class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = set()
    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key in ("href", "src") and value and value.startswith("/assets/"):
                if not re.fullmatch(r"/assets/[A-Za-z0-9._/-]+", value) or ".." in value.split("/"):
                    raise ValueError("Unsafe built asset URL.")
                self.paths.add(value)
p = Assets()
p.feed(pathlib.Path(sys.argv[1]).read_text())
if not p.paths or len(p.paths) > 100:
    raise SystemExit("Built HTML has no usable asset references.")
print("\n".join(sorted(p.paths)))
PY
  while IFS= read -r asset; do
    curl -fsS --max-time 5 "http://127.0.0.1:4317$asset" >"$job/served-asset" || return 1
    cmp -s "$release/dist$asset" "$job/served-asset" || return 1
  done <"$job/assets.txt"
}

stop_install() {
  [[ -n "$install_unit" ]] || return 0
  local stopped=false active_state load_state control_group remaining_processes
  if systemctl stop "$install_unit" >>"$job/install-stop.log" 2>&1; then
    stopped=true
  fi
  active_state="$(systemctl show --property=ActiveState --value "$install_unit" 2>/dev/null || true)"
  load_state="$(systemctl show --property=LoadState --value "$install_unit" 2>/dev/null || true)"
  control_group="$(systemctl show --property=ControlGroup --value "$install_unit" 2>/dev/null || true)"
  if [[ "$stopped" != true && "$load_state" != not-found ]]; then
    return 1
  fi
  [[ "$active_state" == inactive || "$active_state" == failed ]] || return 1
  if [[ -n "$control_group" ]]; then
    [[ "$control_group" =~ ^/[A-Za-z0-9_.@:/-]+$ && "$control_group" != *..* ]] || return 1
    if [[ -e "/sys/fs/cgroup$control_group/cgroup.procs" ]]; then
      remaining_processes="$(find "/sys/fs/cgroup$control_group" -type f -name cgroup.procs -exec cat -- {} +)" || return 1
      [[ -z "$remaining_processes" ]] || return 1
    fi
  fi
  install_unit=""
}

prune_deployments() {
  local previous_sha="${old_release##*/}"
  local arguments=(--lock-fd 9 --active-job "${job##*/}" --protect-release "$sha")
  if [[ "$previous_sha" =~ ^[0-9a-f]{40}$ ]]; then
    arguments+=(--protect-release "$previous_sha")
  fi
  "$prune" "${arguments[@]}" "$@" >>"$job/cleanup.log" 2>&1
}

cleanup_job() {
  [[ -z "$install_unit" ]] || return 1
  # No lifecycle process can still write a tree that is about to be removed.
  chown -hR root:root "$job"
  chmod 700 "$job"
  prune_deployments --clean-active
}

mark_release_success() {
  date -u +%s >"$release/.deployed-at"
  rm -f -- "$release/.deployment-failed"
}

finish() {
  status="$?"
  trap - EXIT INT TERM
  if [[ -n "$install_unit" ]]; then
    if ! stop_install; then
      printf '%s\n' 'Installation unit could not be confirmed stopped; its temporary files are retained.' >&2
    fi
  fi
  if [[ "$status" -ne 0 && "$switched" == true ]]; then
    if can_restore_release "$old_release"; then
      printf '%s\n' 'Deployment failed; restoring a compatible previous release.' >&2
      rollback_link="$base/.current-rollback-$$"
      ln -s "$old_release" "$rollback_link"
      mv -Tf "$rollback_link" "$current"
      systemctl restart cashlens >"$job/rollback.log" 2>&1 || true
      "$healthcheck" >>"$job/rollback.log" 2>&1 || true
    else
      printf '%s\n' 'Deployment failed after an auth schema barrier. Old-binary rollback refused; state preserved for compatible recovery.' >&2
      systemctl stop cashlens >"$job/rollback.log" 2>&1 || true
    fi
  fi
  if [[ "$status" -ne 0 && "$release_created" == true && -d "$release" && ! -L "$release" ]]; then
    printf '%s\n' "$status" >"$release/.deployment-failed"
  fi
  if [[ -d "$job" ]]; then
    chown -hR root:root "$job" || true
    chmod 700 "$job" || true
    printf '%s\n' "$status" >"$job/exit-status"
    if [[ -z "$install_unit" ]]; then
      cleanup_job || printf '%s\n' 'Deployment file cleanup needs attention; inspect cleanup.log.' >&2
    else
      prune_deployments || printf '%s\n' 'Deployment file cleanup needs attention; inspect cleanup.log.' >&2
    fi
  fi
  printf 'Deployment diagnostics: %s\n' "$job"
  exit "$status"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Free obsolete installation trees before receiving another full package.
prune_deployments || printf '%s\n' 'Pre-deployment cleanup needs attention; inspect cleanup.log.' >&2

# Read the SSH stream with a byte/time limit before opening the archive.
python3 -c '
import hashlib, pathlib, signal, sys
signal.alarm(120)
target, expected = pathlib.Path(sys.argv[1]), sys.argv[2]
digest, size = hashlib.sha256(), 0
with target.open("xb") as output:
    while True:
        block = sys.stdin.buffer.read(1024 * 1024)
        if not block:
            break
        size += len(block)
        if size > 100 * 1024 * 1024:
            raise SystemExit("Compressed package exceeds 100 MiB.")
        digest.update(block)
        output.write(block)
signal.alarm(0)
if size == 0 or digest.hexdigest() != expected:
    raise SystemExit("Package hash verification failed.")
' "$artifact" "$artifact_hash"

mkdir "$install_tree"
# Archive links, special files, duplicate paths and forbidden paths are rejected.
python3 - "$artifact" "$install_tree" "$sha" "$source_manifest" <<'PY'
import hashlib
import json
import pathlib
import shutil
import sys
import tarfile
archive_path, destination, commit = sys.argv[1], pathlib.Path(sys.argv[2]), sys.argv[3]
def digest(path):
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()
blocked = {".git", ".cashlens", ".claude", ".ssh", "node_modules", "work"}
with tarfile.open(archive_path, "r:gz") as archive:
    members, seen, expanded = [], set(), 0
    for member in archive:
        members.append(member)
        if len(members) > 30000:
            raise SystemExit("Too many archive members.")
        raw = member.name.rstrip("/")
        path = pathlib.PurePosixPath(raw)
        if (not raw or len(raw) > 4096 or path.is_absolute() or raw != str(path)
                or any(p in (".", "..") for p in path.parts)
                or "\\" in raw or any(ord(c) < 32 or ord(c) == 127 for c in raw)
                or raw in seen or not (member.isdir() or member.isreg())):
            raise SystemExit("Unsafe or duplicate archive member.")
        if (any(p in blocked or (p.startswith(".env") and p != ".env.example") for p in path.parts)
                or path.parts[:2] == ("data", "raw")):
            raise SystemExit("Forbidden archive member.")
        seen.add(raw)
        expanded += member.size
        if member.size < 0 or expanded > 256 * 1024 * 1024:
            raise SystemExit("Expanded package exceeds 256 MiB.")
    for member in members:
        target = destination / member.name.rstrip("/")
        if member.isdir():
            target.mkdir(parents=True, exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            source = archive.extractfile(member)
            with target.open("xb") as output:
                shutil.copyfileobj(source, output)
            target.chmod(0o755 if member.mode & 0o111 else 0o644)
manifest = json.loads((destination / "RELEASE.json").read_text())
if manifest != {"commit": commit}:
    raise SystemExit("Commit manifest does not match request.")
for required in ("package.json", "package-lock.json", "server/index.ts", "dist/index.html"):
    if not (destination / required).is_file():
        raise SystemExit("Missing required runtime file.")
baseline = {}
for path in destination.rglob("*"):
    relative = str(path.relative_to(destination))
    if path.is_file():
        baseline[relative] = {
            "type": "file", "sha256": digest(path), "size": path.stat().st_size,
            "executable": bool(path.stat().st_mode & 0o111)
        }
    else:
        baseline[relative] = {"type": "directory"}
pathlib.Path(sys.argv[4]).write_text(json.dumps(baseline, sort_keys=True))
PY

if [[ -e "$release" || -L "$release" ]]; then
  [[ -d "$release" && ! -L "$release" && "$(stat -c %u "$release")" -eq 0 ]] || fail 'Existing release is not sealed.'
  [[ -f "$release/.artifact-sha256" && "$(cat "$release/.artifact-sha256")" == "$artifact_hash" ]] || fail 'Existing commit has a different package hash.'
  if [[ "$old_release" == "$release" ]] && probe; then
    mark_release_success
    printf 'Release %s is already current and healthy.\n' "$sha"
    exit 0
  fi
else
  mkdir "$npm_home"
  chown -R cashlens-deploy:cashlens-deploy "$install_tree" "$npm_home"
  # The parent must be traversable, but never writable by the install identity.
  chmod 711 "$job"
  install_unit="cashlens-install-$sha-$$.service"
  systemd-run --quiet --wait --pipe --collect --unit="$install_unit" \
    --property=User=cashlens-deploy --property=Group=cashlens-deploy \
    --property=NoNewPrivileges=true --property=KillMode=control-group \
    --property=TimeoutStopSec=10 --property=RuntimeMaxSec=600 \
    --property=ProtectSystem=strict --property=ProtectHome=true \
    --property=PrivateTmp=true --property=PrivateDevices=true \
    --property="ReadWritePaths=$install_tree $npm_home" \
    --property="WorkingDirectory=$install_tree" \
    --setenv="HOME=$npm_home" --setenv=PATH=/usr/local/bin:/usr/bin:/bin \
    /usr/local/bin/npm ci --omit=dev --no-audit --no-fund >"$job/npm-install.log" 2>&1
  # --wait completes after the unit stops; KillMode removes remaining install children.
  stop_install || fail 'Installation unit is still active; cannot seal or remove its files.'
  chmod 700 "$job"
  chown -hR root:root "$install_tree"
  chmod 700 "$install_tree"
  # Lifecycle hooks may install dependencies, but may not change archived source/dist.
  python3 - "$install_tree" "$source_manifest" <<'PY'
import hashlib
import json
import pathlib
import stat
import sys
root = pathlib.Path(sys.argv[1])
expected = json.loads(pathlib.Path(sys.argv[2]).read_text())
def digest(path):
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()
actual = {}
for path in root.rglob("*"):
    relative = path.relative_to(root)
    if relative.parts[0] == "node_modules":
        continue
    info = path.lstat()
    key = str(relative)
    if stat.S_ISREG(info.st_mode):
        if key not in expected or info.st_size != expected[key].get("size"):
            raise SystemExit("Lifecycle hook changed archived file size or added a file.")
        actual[key] = {
            "type": "file", "sha256": digest(path), "size": info.st_size,
            "executable": bool(info.st_mode & 0o111)
        }
    elif stat.S_ISDIR(info.st_mode):
        actual[key] = {"type": "directory"}
    else:
        raise SystemExit("Lifecycle hook changed an archived path type.")
if actual != expected:
    raise SystemExit("Lifecycle hook changed archived source/dist or added a non-dependency path.")
PY
  # Copy to a fresh root-only tree. Never publish the install tree or follow its links.
  mkdir "$sealed"
  python3 - "$install_tree" "$sealed" <<'PY'
import os
import pathlib
import shutil
import stat
import sys
from collections import Counter
source, target = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
inode_names = Counter()
for folder, _, files in os.walk(source, followlinks=False):
    for name in files:
        item = pathlib.Path(folder) / name
        info = item.lstat()
        if stat.S_ISREG(info.st_mode):
            inode_names[(info.st_dev, info.st_ino)] += 1
count = size = 0
for folder, directories, files in os.walk(source, followlinks=False):
    relative = pathlib.Path(folder).relative_to(source)
    destination = target / relative
    destination.mkdir(parents=True, exist_ok=True)
    for name in directories + files:
        item = pathlib.Path(folder) / name
        output = destination / name
        info = item.lstat()
        count += 1
        if count > 200000:
            raise SystemExit("Too many installed files.")
        if stat.S_ISLNK(info.st_mode):
            rel = item.relative_to(source)
            link = os.readlink(item)
            if (rel.parts[0] != "node_modules" or pathlib.Path(link).is_absolute()
                    or not item.resolve().is_relative_to(source)):
                raise SystemExit("Installed link escapes runtime tree.")
            output.symlink_to(link)
        elif stat.S_ISDIR(info.st_mode):
            output.mkdir(exist_ok=True)
        elif stat.S_ISREG(info.st_mode):
            if inode_names[(info.st_dev, info.st_ino)] != info.st_nlink:
                raise SystemExit("Installed hard link has a name outside the runtime tree.")
            size += info.st_size
            if size > 1024 * 1024 * 1024:
                raise SystemExit("Installed tree exceeds 1 GiB.")
            fd = os.open(item, os.O_RDONLY | os.O_NOFOLLOW)
            with os.fdopen(fd, "rb") as incoming, output.open("xb") as outgoing:
                if not stat.S_ISREG(os.fstat(incoming.fileno()).st_mode):
                    raise SystemExit("Installed file changed type.")
                shutil.copyfileobj(incoming, outgoing)
            output.chmod(0o755 if info.st_mode & 0o111 else 0o644)
        else:
            raise SystemExit("Installed tree has a special file.")
PY
  printf '%s\n' "$artifact_hash" >"$sealed/.artifact-sha256"
  [[ ! -e "$sealed/data/raw" ]] || fail 'Raw report path was supplied by package.'
  mkdir -p "$sealed/data"
  ln -s "$source_data" "$sealed/data/raw"
  chown -hR root:cashlens "$sealed"
  find "$sealed" -type d -exec chmod 750 {} +
  find "$sealed" -type f -perm /111 -exec chmod 750 {} +
  find "$sealed" -type f ! -perm /111 -exec chmod 640 {} +
  # Maintenance services use fixed preinstalled helpers, not archive scripts.
  mv "$sealed" "$release"
  release_created=true
fi

# Remove the duplicate dependency tree and npm cache before backup and health checks.
cleanup_job || fail 'Temporary deployment files could not be safely cleaned.'

# Validate against the live database before switching even on manual redeployment.
target_auth_schema="$(release_auth_schema "$release")" || fail 'Release authentication manifest is invalid.'
live_auth_schema="$(database_auth_schema)" || fail 'Live authentication schema cannot be read.'
[[ "$target_auth_schema" -ge "$live_auth_schema" ]] || fail 'Release cannot read the current authentication schema.'

# Execute only the preinstalled helper, never a script from the received archive.
"$backup" >"$job/backup.log" 2>&1
next_link="$base/.current-next-$$"
ln -s "$release" "$next_link"
mv -Tf "$next_link" "$current"
switched=true
systemctl restart cashlens >"$job/restart.log" 2>&1
for attempt in $(seq 1 12); do
  if probe; then
    mark_release_success
    switched=false
    printf 'Release %s deployed and verified against its built HTML/assets.\n' "$sha"
    exit 0
  fi
  sleep 2
done
fail 'Release health or built-asset verification failed.'
