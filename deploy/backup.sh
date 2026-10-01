#!/usr/bin/env bash
set -euo pipefail
umask 077
exec 8>/run/lock/cashlens-backup.lock
flock 8
state_dir=/var/lib/cashlens
backup_dir=/var/backups/cashlens
if [[ ! -d "$state_dir" ]]; then
  echo 'CashLens state directory does not exist.' >&2
  exit 1
fi
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
was_active=false
if systemctl is-active --quiet cashlens; then
  was_active=true
fi
restore_service() {
  if [[ "$was_active" == true ]]; then
    systemctl start cashlens
  fi
}
trap restore_service EXIT
systemctl stop cashlens
backup_file="$(mktemp --suffix=.tar.gz "$backup_dir/$(date -u +%Y%m%dT%H%M%SZ).XXXXXX")"
tar -C "$state_dir" -czf "$backup_file" .
sha256sum "$backup_file" > "$backup_file.sha256"
echo "CashLens backup saved: $backup_file"
