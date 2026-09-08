#!/bin/bash
# Fold helper: cherry-pick -x, auto-resolving only the two classes the fold method already rules on:
#   - AUDIT-2026-09-07.md / results.json: never hand-merged, regenerated at the end (take one side).
#   - DEVIATION-LOG.md / session-log.md / package.json / migrations.md: additive unions.
# Anything else conflicting stops the run for a human decision.
set -u
cd /root/work/lanes/train62 || exit 1
for c in "$@"; do
  echo "=== $c"
  git cherry-pick -x "$c" >/dev/null 2>&1
  conflicted=$(git diff --name-only --diff-filter=U)
  if [ -z "$conflicted" ]; then
    if git rev-parse -q --verify CHERRY_PICK_HEAD >/dev/null 2>&1; then
      git -c core.editor=true cherry-pick --continue >/dev/null 2>&1
    fi
    echo "  clean"
    continue
  fi
  rest=""
  for f in $conflicted; do
    case "$f" in
      docs/design/handoff-2026-09-06/AUDIT-2026-09-07.md|fsi-app/.discipline/rendering/audit/results.json|docs/design/handoff-2026-09-06/built/*.png|docs/design/handoff-2026-09-06/screens/*.png)
        git checkout --theirs "$f" && git add "$f" && echo "  placeholder: $f" ;;
      docs/design/handoff-2026-09-06/DEVIATION-LOG.md|docs/ops/session-log.md|fsi-app/package.json|docs/inventories/migrations.md)
        python3 union.py "$f" >/dev/null && git add "$f" && echo "  union: $f" ;;
      *) rest="$rest $f" ;;
    esac
  done
  if [ -n "$rest" ]; then
    echo "  STOP, needs judgement:$rest"
    exit 2
  fi
  git -c core.editor=true cherry-pick --continue >/dev/null 2>&1 && echo "  resolved"
done
echo "ALL PICKED"
