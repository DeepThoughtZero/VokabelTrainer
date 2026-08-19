#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd -- "$SCRIPT_DIR/.." && pwd)

cd "$PROJECT_ROOT"
git config --local core.hooksPath .githooks
printf '✅ Lokale Git-Hooks aktiviert: Pre-Commit=quick, Pre-Push=full.\n'
