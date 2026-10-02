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
# The independent production secret is required to restore factors and signed sessions.
[[ -f /etc/cashlens.env && ! -L /etc/cashlens.env ]] || { echo 'Production configuration is missing.' >&2; exit 1; }
[[ ! -e "$state_dir/configuration" ]] || { echo 'Reserved backup configuration path exists in state.' >&2; exit 1; }
config_stage="$(mktemp -d)"
trap 'rm -rf -- "$config_stage"; restore_service' EXIT
mkdir "$config_stage/configuration"
install -m 600 /etc/cashlens.env "$config_stage/configuration/cashlens.env"
tar -czf "$backup_file" -C "$state_dir" . -C "$config_stage" configuration
sha256sum "$backup_file" > "$backup_file.sha256"
echo "CashLens backup saved: $backup_file"
