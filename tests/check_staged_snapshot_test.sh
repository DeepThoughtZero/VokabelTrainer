#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
CHECK_SCRIPT="$PROJECT_ROOT/scripts/check_tested_snapshot.sh"
TEST_ROOT=$(mktemp -d -t vokabelzombie-hook-test.XXXXXXXX)
trap 'rm -rf -- "$TEST_ROOT"' EXIT

init_repository() {
  local directory="$1"
  mkdir -p "$directory"
  git -C "$directory" init -q
  git -C "$directory" config user.email tests@example.invalid
  git -C "$directory" config user.name 'Hook Tests'
  printf 'initial\n' > "$directory/tracked.txt"
  git -C "$directory" add tracked.txt
  git -C "$directory" commit -qm initial
}

fully_staged="$TEST_ROOT/fully-staged"
init_repository "$fully_staged"
printf 'staged\n' > "$fully_staged/tracked.txt"
git -C "$fully_staged" add tracked.txt
(cd "$fully_staged" && "$CHECK_SCRIPT" --staged)

partially_staged="$TEST_ROOT/partially-staged"
init_repository "$partially_staged"
printf 'staged\n' > "$partially_staged/tracked.txt"
git -C "$partially_staged" add tracked.txt
printf 'unstaged\n' > "$partially_staged/tracked.txt"
printf 'untracked\n' > "$partially_staged/untracked.txt"
if (cd "$partially_staged" && "$CHECK_SCRIPT" --staged) >/dev/null 2>&1; then
  printf 'Teilweise vorgemerkter Arbeitsbaum wurde fälschlich akzeptiert.\n' >&2
  exit 1
fi

clean_head="$TEST_ROOT/clean-head"
init_repository "$clean_head"
(cd "$clean_head" && "$CHECK_SCRIPT" --head)
printf 'staged\n' > "$clean_head/tracked.txt"
git -C "$clean_head" add tracked.txt
if (cd "$clean_head" && "$CHECK_SCRIPT" --head) >/dev/null 2>&1; then
  printf 'Vom HEAD abweichender Arbeitsbaum wurde fälschlich akzeptiert.\n' >&2
  exit 1
fi

printf 'Hook-Snapshot-Tests OK: staged, teilweise staged und sauberer HEAD.\n'
