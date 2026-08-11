#!/usr/bin/env bash
# DEAD-CODE SWEEP — the operator-run half of the 2026-08-11 wiring census.
#
# Removes the 495 one-shot scripts enumerated in docs/audits/dead-code-manifest-2026-08-11.txt, then runs the
# full gate battery so the coupled follow-up work is REPORTED rather than remembered.
#
# WHY THIS IS A SCRIPT AND NOT ALREADY DONE. The session that built the census and the gates commits through
# the GitHub web UI, which deletes one file per commit; 474 of the 495 sit in directories that also contain
# LIVE files, so directory-delete is not available for them (attempting it once is how a 1,861-file directory
# briefly disappeared — see docs/ops/session-log.md 2026-08-11). Two push paths were checked and both are
# closed by policy, correctly: the session's git proxy refuses to inject a credential for this repository, and
# the repo's Actions token is set to read-only, which a workflow's `permissions:` block cannot exceed.
# Loosening a repo-wide security setting to perform a one-time deletion is the wrong trade, so it was not done.
# What remained achievable was making your step a single command with its own safety rails. This is that.
#
#   USAGE:  bash fsi-app/scripts/dead-code-sweep.sh            # dry run: verify + report, changes NOTHING
#           bash fsi-app/scripts/dead-code-sweep.sh --apply    # stage the deletions (does NOT commit)
#
# It never commits and never pushes. You review `git status`, then commit in your own words.
#
# WHAT HAPPENS AFTER, AND WHY THE BUILD GOING RED IS THE DESIGN. Four gates carry entries that exist ONLY to
# grandfather these files. Every one of those entries is stale-audited, so the moment the files leave, the
# gates name the exact entries to remove. That RED is the handoff signal, not a defect:
#
#   F15  spend-chokepoint      LEGACY_ALLOWLIST entries tagged reviewByPhase 'dead-code-sweep'
#                              plus SANCTIONED: 'fsi-app/scripts/lib/anthropic.mjs' — its only importers are
#                              on the manifest, so it loses every consumer here (see F25's entry for it)
#   F22  source-role-at-birth  16 region-population one-shots, all tagged 'dead-code-sweep'
#   F23  governed-surface      GAP_BASELINE 0/20/2/2 -> 0/0/0/0 (the ratchet REDs on improvement, by design)
#   F25  module-liveness       entries whose reviewByPhase is 'dead-code-sweep'
#   F14  producer-consumer     the ingestion_control_log terminal-sink entry loses its only writer
#
# The battery below prints all of it. Fix what it names, in the same commit as the deletion.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MANIFEST="$REPO_ROOT/docs/audits/dead-code-manifest-2026-08-11.txt"
APPLY="${1:-}"

cd "$REPO_ROOT"

[ -f "$MANIFEST" ] || { echo "FATAL: manifest not found at $MANIFEST"; exit 1; }

# ── Verify before touching anything ────────────────────────────────────────────────────────────────
# A manifest that has drifted from the tree is the one way this could delete the wrong thing. Every path is
# checked for existence AND for being git-tracked, and any drift aborts rather than proceeding on 494 of 495.
missing=0; untracked=0; total=0
while IFS= read -r path; do
  [ -z "$path" ] && continue
  total=$((total + 1))
  if [ ! -f "$path" ]; then echo "  MISSING (already gone?): $path"; missing=$((missing + 1)); continue; fi
  if ! git ls-files --error-unmatch "$path" >/dev/null 2>&1; then echo "  UNTRACKED: $path"; untracked=$((untracked + 1)); fi
done < "$MANIFEST"

echo "manifest paths: $total | missing: $missing | untracked: $untracked"

if [ "$missing" -gt 0 ] || [ "$untracked" -gt 0 ]; then
  echo
  echo "ABORT: the manifest no longer matches the tree. It was measured on 2026-08-11 against master e104ede."
  echo "Re-run the census before sweeping — deleting from a drifted manifest is how a live file gets caught up."
  exit 1
fi

# A manifest whose count moved silently is also drift. 495 is the measured figure, recorded in the census.
if [ "$total" -ne 495 ]; then
  echo "ABORT: manifest holds $total paths, expected 495 (docs/audits/wiring-census-2026-08-11.md §1)."
  exit 1
fi

if [ "$APPLY" != "--apply" ]; then
  echo
  echo "DRY RUN — nothing changed. All $total paths exist and are tracked."
  echo "Re-run with --apply to stage the deletions:  bash fsi-app/scripts/dead-code-sweep.sh --apply"
  exit 0
fi

# ── Apply ──────────────────────────────────────────────────────────────────────────────────────────
echo
echo "Staging $total deletions..."
xargs -a "$MANIFEST" git rm -q --
echo "Staged. NOT committed."

# ── Report the coupled work ────────────────────────────────────────────────────────────────────────
# Deliberately does not `set +e` around these: a gate that CRASHES is different from a gate that FAILS, and
# you want to see the difference. Each is run with its failure tolerated so the whole report prints.
echo
echo "════ GATE BATTERY — everything below names work to do in THIS commit ════"

run() { echo; echo "──── $1 ────"; shift; "$@" || true; }

run "fitness functions (expect F15/F22/F23/F25 to name stale entries)" \
  node fsi-app/.discipline/fitness/runner.mjs
run "invariant meta-gate" \
  node fsi-app/.discipline/governance/invariant-coverage.mjs
run "governed-surface coverage (expect the RATCHET message: lower GAP_BASELINE)" \
  node fsi-app/.discipline/governance/coverage-scan.mjs
run "proof suite (a proof whose module was deleted must be deleted with it)" \
  bash fsi-app/.discipline/run-test-suite.sh

echo
echo "════ NEXT ════"
echo "1. Fix every stale entry the battery named — that is the coupled work, and it belongs in this commit."
echo "2. Re-run the battery until green."
echo "3. git commit -m 'Dead-code sweep: remove 495 dead one-shot scripts (manifest in docs/audits)'"
echo "4. Delete this script — it is a one-time instrument and becomes dead code itself the moment it succeeds."
