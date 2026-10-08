#!/bin/sh
# tree-clean.sh, the ONE home for "a test suite leaves the working tree exactly as it found it"
# (lane TESTFIX-1, 2026-10-08; CLAUDE.md standing rule 15: a guard is proven by attack, not by presence).
#
# WHY. A test that writes a fixture to a path relative to the current directory, or into a repo-relative
# path, litters the real working tree. Two untracked files appeared in the main checkout on 2026-10-08
# (09:13) from a scratch attack script run from the wrong directory; the same class had already bitten
# the suite itself (GATE-5: a C3 fixture written into the real migrations directory raced F64). Nothing
# failed when it happened, so nothing was fixed. This turns the class into a red suite.
#
# CONTRACT. `git status --porcelain --untracked-files=all` is captured when a suite starts and again when
# it ends. Any line present at the end and absent at the start is a path the suite changed (an untracked
# file it left, a tracked file it modified or deleted), and the check fails, naming each one. A tree that
# was already dirty when the suite started stays tolerated: the comparison is relative to the start, so a
# developer's work in progress never reddens a local run. Gitignored paths are out of scope on purpose
# (scripts/tmp scratch, logs): they cannot reach a commit.
#
# Called by BOTH test-suite runners, so the CI "Discipline engine unit tests" job, the CI npm-deps step and
# the pre-push gate all inherit it from the same lines:
#   fsi-app/.discipline/run-test-suite.sh           (the no-npm suite)
#   fsi-app/.discipline/hooks/lib/run-npmtest-suites.sh   (the npm-deps suite)
#
# Usage (run from anywhere inside the working tree; the script moves to its top level):
#   sh tree-clean.sh snapshot <snapshot-file>   record the current status
#   sh tree-clean.sh verify <snapshot-file>     exit 1, naming the paths, if the status gained any line
# Exit: 0 clean, 1 the suite changed the tree, 2 usage or git error.

set -u

CMD="${1:-}"
SNAP="${2:-}"
if [ -z "$CMD" ] || [ -z "$SNAP" ]; then
  echo "tree-clean: usage: tree-clean.sh snapshot|verify <snapshot-file>" >&2
  exit 2
fi

TOP="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "tree-clean: not inside a git working tree" >&2; exit 2; }
cd "$TOP" || exit 2

# core.quotepath=off keeps non-ASCII path bytes readable in the report; the format is otherwise git's own.
tree_status() { git -c core.quotepath=off status --porcelain --untracked-files=all; }

case "$CMD" in
  snapshot)
    tree_status >"$SNAP" || { echo "tree-clean: git status failed" >&2; exit 2; }
    ;;
  verify)
    [ -f "$SNAP" ] || { echo "tree-clean: no snapshot at $SNAP (run snapshot first)" >&2; exit 2; }
    NOW="$SNAP.now"
    tree_status >"$NOW" || { rm -f "$NOW"; echo "tree-clean: git status failed" >&2; exit 2; }
    # Lines in NOW that are not, as whole lines, in SNAP. An empty SNAP has no patterns, so -v prints all.
    NEW="$(grep -vxF -f "$SNAP" "$NOW" || true)"
    rm -f "$NOW"
    if [ -n "$NEW" ]; then
      COUNT="$(printf '%s\n' "$NEW" | wc -l | tr -d ' ')"
      echo "tree-clean: FAIL, the suite changed $COUNT path(s) in the working tree. A test must write only to a" >&2
      echo "tree-clean: temp directory (fs.mkdtempSync(os.tmpdir())) and clean it up. Paths (git status code, path):" >&2
      printf '%s\n' "$NEW" | sed 's/^/tree-clean:   /' >&2
      exit 1
    fi
    echo "tree-clean: OK, the working tree is exactly as the suite found it"
    ;;
  *)
    echo "tree-clean: unknown command '$CMD' (expected snapshot or verify)" >&2
    exit 2
    ;;
esac
