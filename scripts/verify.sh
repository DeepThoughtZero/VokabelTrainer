#!/usr/bin/env bash
# Lokale Qualitätsprüfung. Es wird bewusst kein externer CI-Dienst benötigt.
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd -- "$SCRIPT_DIR/.." && pwd)
MODE="full"

usage() {
  cat <<'EOF'
Aufruf: ./scripts/verify.sh [--quick|--full|--with-stt]

  --quick     Schnelle statische Prüfungen und Node-Tests (Pre-Commit)
  --full      Zusätzlich Browser, alle 869 MP3s und vorhandenen STT-Bericht prüfen (Pre-Push)
  --with-stt  SPEACHES-Bericht lokal neu erzeugen und danach vollständig prüfen
EOF
}

if [[ $# -gt 1 ]]; then
  usage >&2
  exit 2
fi

case "${1:---full}" in
  --quick) MODE="quick" ;;
  --full) MODE="full" ;;
  --with-stt) MODE="with-stt" ;;
  -h|--help) usage; exit 0 ;;
  *) usage >&2; exit 2 ;;
esac

cd "$PROJECT_ROOT"

section() {
  printf '\n==> %s\n' "$1"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Fehlendes Programm: %s\n' "$1" >&2
    exit 1
  fi
}

section "Werkzeuge"
for command_name in git node python3 bash grep; do
  require_command "$command_name"
done
if [[ "$MODE" != "quick" ]]; then
  require_command ffprobe
fi

section "Repository-Hygiene"
git diff --check
git diff --cached --check

if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  printf '.env darf nicht versioniert sein.\n' >&2
  exit 1
fi

tracked_generated_files=""
while IFS= read -r tracked_file; do
  if [[ -e "$tracked_file" ]]; then
    tracked_generated_files+="${tracked_file}"$'\n'
  fi
done < <(git ls-files | grep -E '(^|/)(__pycache__/|[^/]+\.py[co]$|[^/]+\.tmp\.mp3$)' || true)
if [[ -n "$tracked_generated_files" ]]; then
  printf 'Generierte Cache- oder temporäre Dateien sind versioniert und vorhanden:\n' >&2
  printf '%s' "$tracked_generated_files" >&2
  exit 1
fi

conflict_markers=""
while IFS= read -r -d '' file; do
  matches=$(grep -nHIE '^(<{7}|={7}|>{7})( |$)' "$file" || true)
  if [[ -n "$matches" ]]; then
    conflict_markers+="${matches}"$'\n'
  fi
done < <(find . \
  \( -path './.git' -o -path './assets/audio' -o -path './pictures' \) -prune -o \
  -path './scripts/vocab_import/*.json' -prune -o \
  -type f -print0)
if [[ -n "$conflict_markers" ]]; then
  printf '%s' "$conflict_markers"
  printf 'Nicht aufgelöste Merge-Konfliktmarker gefunden.\n' >&2
  exit 1
fi

temporary_audio=$(find assets/audio -type f -name '*.tmp.mp3' -print -quit)
if [[ -n "$temporary_audio" ]]; then
  printf 'Temporäre Audio-Dateien gefunden.\n' >&2
  find assets/audio -type f -name '*.tmp.mp3' -print >&2
  exit 1
fi

section "Syntax"
while IFS= read -r -d '' file; do
  node --check "$file" >/dev/null
done < <(find js scripts tests -type f -name '*.js' -print0)

while IFS= read -r -d '' file; do
  bash -n "$file"
done < <(find . -type f -name '*.sh' \
  -not -path './.git/*' \
  -not -path './pictures/*' \
  -print0)

python3 - <<'PY'
import ast
from pathlib import Path

for folder in (Path("scripts"), Path("tests")):
    if not folder.exists():
        continue
    for path in sorted(folder.rglob("*.py")):
        ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
PY

section "Automatisierte Tests"
node --test tests/*.test.js
bash tests/check_staged_snapshot_test.sh

if [[ "$MODE" != "quick" ]]; then
  section "Browser-Smoke-Test"
  node scripts/browser_smoke_test.mjs
fi

if [[ "$MODE" == "with-stt" ]]; then
  section "SPEACHES-Rücktest"
  python3 scripts/verify_audio_speaches.py --course en-6 --workers "${SPEACHES_WORKERS:-2}"
fi

if [[ "$MODE" != "quick" ]]; then
  section "Audio-Integrität und STT-Nachweis"
  python3 scripts/check_audio_integrity.py --require-stt-clean
fi

printf '\n✅ Lokale Prüfung (%s) erfolgreich.\n' "$MODE"
