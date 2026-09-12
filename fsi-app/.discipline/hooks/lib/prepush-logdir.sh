#!/bin/sh
# prepush-logdir.sh, sourced by fsi-app/.discipline/hooks/pre-push (D11, docs/plans/defect-fix-plan-
# 2026-09-12.md). Extracted into its own fragment so the directory-creation logic is a shell-level unit
# a test can drive directly, not embedded YAML/hook nothing exercises before a real push.
#
# THE DEFECT THIS FIXES [CONFIRMED, 2026-09-12]: the hook used to redirect every step's output to a FIXED
# path (/tmp/discipline-prepush-{c,t,inv,gate,tsc}.log) and `rm -f` each file once its step finished. One
# push per lane, lane preflights, and the coordinator's own gate runs all invoke this SAME hook
# concurrently by design, so two runs sharing the fixed path could clobber each other's log: a passing
# run's cleanup could delete a failing run's still-being-read log, printing "cannot open" instead of the
# real failing test output. The fix is ONE per-invocation directory (`mktemp -d`), never a fixed path.
#
# Usage: `. lib/prepush-logdir.sh` then call `pre_push_make_log_dir`. Sets PRE_PUSH_LOG_DIR on success
# (return 0); returns 1 and sets nothing on failure (the caller decides whether that is fatal). This
# fragment ONLY creates the directory: it does not install a cleanup trap, so a test can exercise
# creation in isolation from the real hook's own success/failure cleanup policy (see pre-push itself for
# that policy: removed on a clean exit, kept and its path printed on a failing one).
#
# Optional env: PRE_PUSH_LOG_DIR_PREFIX overrides the base directory (default "${TMPDIR:-/tmp}"), used
# by the test to point every invocation at a shared, disposable fixture directory instead of the real
# system temp dir.
pre_push_make_log_dir() {
  base="${PRE_PUSH_LOG_DIR_PREFIX:-${TMPDIR:-/tmp}}"
  dir=""
  if command -v mktemp >/dev/null 2>&1; then
    dir="$(mktemp -d "$base/discipline-prepush.XXXXXX" 2>/dev/null)"
  fi
  if [ -z "$dir" ]; then
    # mktemp unavailable or refused: fall back to a pid-qualified path under the same base. Two
    # invocations in the SAME process is not a real scenario (one hook run = one shell = one pid), so
    # this fallback is still collision-free for the case mktemp itself is missing.
    dir="$base/discipline-prepush-$$"
    mkdir -p "$dir" 2>/dev/null
  fi
  if [ ! -d "$dir" ]; then
    return 1
  fi
  PRE_PUSH_LOG_DIR="$dir"
  return 0
}
