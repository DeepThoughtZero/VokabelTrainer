#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

if [[ $# -eq 0 ]]; then
  set -- --full
fi

exec "$SCRIPT_DIR/scripts/verify.sh" "$@"
