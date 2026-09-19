#!/usr/bin/env bash
# lane-gate-cloud.sh <worktree-root>   (repo copy of the cloud coordinator's gate wrapper, session 2026-09-18/19)
# Usage: LANE_GATE_SP=<scratchpad> bash fsi-app/scripts/coordinator/lane-gate-cloud.sh <worktree-root>
# The locked push gate for lanes in this cloud container (coordinator session 2026-09-18, handoff ruling 1A.7:
# lanes run the push gate themselves, once, last, as ONE background task, never polled; one hook run at a time).
# What it does, in order:
#   1. waits for the container's single gate lock (a directory; a dead holder is reclaimed);
#   2. refuses (exit 4) if the branch is behind origin/master, so nothing stale is ever pushed;
#   3. pushes the branch with -u, never with force (a branch already on origin is updated by merging master in, never by rebasing), through the installed pre-push trampoline (the tracked hook runs there:
#      the full CI-parity gate); the push happens only if every step passes;
#   4. prints the gate's step lines and the exit code, and names the full log.
set -u
WT="${1:?usage: lane-gate.sh <worktree-root>}"
SP="${LANE_GATE_SP:?set LANE_GATE_SP to the ONE coordinator scratchpad folder of this container; every lane and the coordinator must share it or two runners can collide (docs/ops/HANDOFF-2026-09-18.md section 7)}"
LOCK="$SP/hook.lock"
NAME="$(basename "$WT")"
LOG="$SP/gate-$NAME.log"

waited=0
until mkdir "$LOCK" 2>/dev/null; do
  if [ -f "$LOCK/pid" ] && ! kill -0 "$(cat "$LOCK/pid" 2>/dev/null)" 2>/dev/null; then
    echo "gate: reclaiming a stale lock held by dead pid $(cat "$LOCK/pid")"
    rm -rf "$LOCK"
    continue
  fi
  sleep 20
  waited=$((waited + 20))
  if [ "$waited" -ge 5400 ]; then
    echo "gate: gave up waiting on $LOCK after 90 minutes (holder pid $(cat "$LOCK/pid" 2>/dev/null))"
    exit 3
  fi
done
echo $$ > "$LOCK/pid"
trap 'rm -rf "$LOCK"' EXIT
echo "gate: lock taken after ${waited}s"

cd "$WT" || { echo "gate: worktree $WT missing"; exit 2; }
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git fetch --quiet origin || { echo "gate: fetch failed"; exit 2; }
if ! git merge-base --is-ancestor origin/master HEAD; then
  echo "gate: branch $BRANCH is behind origin/master ($(git rev-parse --short origin/master)); rebase first, then run this once more"
  exit 4
fi
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "gate: worktree has uncommitted tracked changes; commit or drop them first"
  git status --porcelain --untracked-files=no | head -20
  exit 4
fi

echo "gate: pushing $BRANCH through the pre-push hook (log: $LOG)"
: > "$LOG"
git push -u origin "$BRANCH" >> "$LOG" 2>&1
rc=$?
grep -E '^\[discipline pre-push\]|^error:|^fatal:|^remote: error|\bFAIL\b' "$LOG" | tail -40
echo "gate exit: $rc (branch $BRANCH, head $(git rev-parse --short HEAD), full log: $LOG)"
exit $rc
