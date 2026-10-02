#!/usr/bin/env bash
set -euo pipefail
curl -fsS --retry 3 --retry-connrefused --retry-delay 1 --max-time 10 http://127.0.0.1:4317/api/health >/dev/null
usage=$(df --output=pcent /var/lib/cashlens | tail -1 | tr -dc '0-9')
if [[ "$usage" -ge 85 ]]; then
  echo "Prispect state disk usage is ${usage}%; review capacity and backup retention." >&2
  exit 1
fi
echo 'Prispect health and disk check passed.'
