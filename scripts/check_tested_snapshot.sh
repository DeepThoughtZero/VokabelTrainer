#!/usr/bin/env bash
# Stellt sicher, dass die Tests genau den Commit-Snapshot sehen, den Git verarbeitet.
set -Eeuo pipefail

MODE="${1:---staged}"
case "$MODE" in
  --staged|--head) ;;
  *)
    printf 'Aufruf: %s [--staged|--head]\n' "$0" >&2
    exit 2
    ;;
esac

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"

unstaged_files=$(git diff --name-only --)
untracked_files=$(git ls-files --others --exclude-standard)
staged_files=""
if [[ "$MODE" == "--head" ]]; then
  staged_files=$(git diff --cached --name-only --)
fi

if [[ -z "$unstaged_files" && -z "$untracked_files" && -z "$staged_files" ]]; then
  exit 0
fi

if [[ "$MODE" == "--staged" ]]; then
  printf 'Commit blockiert: Der getestete Arbeitsbaum muss dem vorgemerkten Commit-Snapshot entsprechen.\n' >&2
  printf 'Bitte alle beabsichtigten Änderungen mit git add vormerken oder übrige Änderungen vorher stagen/stashen.\n' >&2
else
  printf 'Push blockiert: Der getestete Arbeitsbaum muss exakt dem aktuellen HEAD entsprechen.\n' >&2
  printf 'Bitte Änderungen zuerst committen oder vor dem Push stagen/stashen.\n' >&2
fi

if [[ -n "$staged_files" ]]; then
  printf '\nVorgemerkte Änderungen:\n%s\n' "$staged_files" >&2
fi
if [[ -n "$unstaged_files" ]]; then
  printf '\nNicht vorgemerkte Änderungen:\n%s\n' "$unstaged_files" >&2
fi
if [[ -n "$untracked_files" ]]; then
  printf '\nNicht versionierte Dateien:\n%s\n' "$untracked_files" >&2
fi
exit 1
