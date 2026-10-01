#!/usr/bin/env bash
set -euo pipefail
export PATH=/usr/bin:/bin
export LC_ALL=C

command_text="${SSH_ORIGINAL_COMMAND-}"
if [[ ! "$command_text" =~ ^deploy\ [0-9a-f]{40}\ [0-9a-f]{64}$ ]]; then
  printf '%s\n' 'Only the fixed deploy command is allowed.' >&2
  exit 64
fi
read -r verb sha artifact_hash <<< "$command_text"
exec /usr/bin/sudo -n -- /usr/local/sbin/cashlens-ci-deploy "$sha" "$artifact_hash"
