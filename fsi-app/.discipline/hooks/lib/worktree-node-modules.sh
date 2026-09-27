#!/bin/sh
# worktree-node-modules.sh, the ONE home for "does this checkout have fsi-app/node_modules, and if it is
# a linked worktree, link it to the main checkout's shared install". Sourced by
# fsi-app/.discipline/hooks/post-checkout (auto-link on `git worktree add`) and by
# fsi-app/.discipline/hooks/pre-push (step 0b, fail fast). Also runnable directly, from any checkout:
#   sh fsi-app/.discipline/hooks/lib/worktree-node-modules.sh --link        link THIS worktree now
#   sh fsi-app/.discipline/hooks/lib/worktree-node-modules.sh --check       exit 1 + the fix if unusable
#   sh fsi-app/.discipline/hooks/lib/worktree-node-modules.sh --audit       list every worktree's link kind
#   sh fsi-app/.discipline/hooks/lib/worktree-node-modules.sh --repair-all  junction -> symlink, all worktrees
#
# DEFECT 1 [CONFIRMED 2026-09-25]: a new linked worktree has no fsi-app/node_modules (gitignored, so
# `git worktree add` never materialises it) and the lane contract forbids `npm install` in a lane. The
# pre-push fitness runner then reported F9 build-compiles, F10, F11 trust-tier-weights and F12
# moat-base-tier as violations (their selftests import npm deps), or hung. Four lanes hit it in one
# session; the coordinator linked each by hand with `mklink /J`.
#
# DEFECT 2 [CONFIRMED 2026-09-27, git 2.53.0.windows.1, reproduced in a throwaway repo and pinned by
# worktree-node-modules.test.mjs]: that hand fix, a directory JUNCTION, is destructive. Git for Windows
# reports a junction as a plain directory, so `git worktree remove` (with or without --force, with
# core.symlinks either way) recurses THROUGH it and empties the main checkout's shared install. `rm -rf`
# and Node's fs.rmSync unlink a junction safely; git does not.
#
# THE FIX: the link is a real directory SYMLINK on every platform, which is what
# docs/dispatches/lane-common-contract.md already says it is. Git lstat()s a symlink as a link and
# unlinks it; it never recurses into one. On Windows a symlink needs Developer Mode (or the
# SeCreateSymbolicLink privilege); without it this script FAILS CLOSED, naming that setting, and never
# falls back to a junction. Existing junctions are reported by --check/--audit and converted by
# --link/--repair-all (`rmdir` on a junction removes only the link, never its target).
#
# Every function returns a status and prints to stderr; none calls `exit`, so the post-checkout caller
# can treat a failed link as a warning (a checkout is never wedged by this) while pre-push is fatal.

WT_NM_SCRIPT="fsi-app/.discipline/hooks/lib/worktree-node-modules.sh"

wt_nm_is_windows() {
  case "$(uname -s 2>/dev/null)" in
    MINGW*|MSYS*|CYGWIN*) return 0 ;;
  esac
  return 1
}

wt_nm_winpath() {
  cygpath -w "$1" 2>/dev/null || printf '%s' "$1" | sed 's#/#\\#g'
}

# Windows cmd.exe with MSYS path rewriting disabled (so /J, /D, /AL stay switches).
wt_nm_cmd() {
  MSYS2_ARG_CONV_EXCL='*' cmd /c "$@"
}

# Absolute, forward-slash path of the main checkout (first entry of `git worktree list`).
wt_nm_main_checkout() {
  git worktree list --porcelain 2>/dev/null | sed -n '1s/^worktree //p'
}

# 0 inside a LINKED worktree (git-dir differs from git-common-dir), the zero-false-positive WHERE signal
# RD-19 worktree-isolation also uses.
wt_nm_is_linked_worktree() {
  gd="$(git rev-parse --path-format=absolute --git-dir 2>/dev/null)" || return 1
  gcd="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || return 1
  [ -n "$gd" ] && [ "$gd" != "$gcd" ]
}

# 0 when <dir> is a directory with at least one entry (following a link).
wt_nm_populated() {
  [ -d "$1" ] && [ -n "$(ls -A "$1" 2>/dev/null)" ]
}

# Prints one of: absent | dangling | junction | symlink | dir, for the path <p>.
wt_nm_link_kind() {
  p="$1"
  if [ ! -e "$p" ] && [ ! -L "$p" ]; then echo absent; return; fi
  if [ -L "$p" ] && [ ! -e "$p" ]; then echo dangling; return; fi
  if wt_nm_is_windows; then
    # MSYS's test -L is true for BOTH kinds, so ask the filesystem which reparse point it is.
    name="$(basename "$p")"
    kind="$(wt_nm_cmd dir /AL "$(wt_nm_winpath "$(dirname "$p")")" 2>/dev/null \
      | tr -d '\r' | sed -n "s/.*<\(JUNCTION\|SYMLINKD\|SYMLINK\)> *$name \[.*/\1/p" | head -1)"
    case "$kind" in
      JUNCTION) echo junction; return ;;
      SYMLINK*) echo symlink; return ;;
    esac
    echo dir; return
  fi
  if [ -L "$p" ]; then echo symlink; else echo dir; fi
}

# Remove the LINK at <p> (junction, symlink or dangling), never what it points at.
wt_nm_unlink() {
  if wt_nm_is_windows; then
    # rmdir on a directory reparse point deletes the reparse point only; it refuses a real,
    # non-empty directory, so a misdetected real install can never be emptied here.
    wt_nm_cmd rmdir "$(wt_nm_winpath "$1")" >/dev/null 2>&1 || rm -f "$1" 2>/dev/null
  else
    rm -f "$1"
  fi
  [ ! -e "$1" ] && [ ! -L "$1" ]
}

# Create the directory symlink <link> -> <target>. Never a junction.
wt_nm_symlink() {
  if wt_nm_is_windows; then
    wt_nm_cmd mklink /D "$(wt_nm_winpath "$1")" "$(wt_nm_winpath "$2")" >/dev/null 2>&1
  else
    ln -s "$2" "$1"
  fi
}

wt_nm_symlink_denied_message() {
  echo "[worktree-node-modules] Windows refused to create a symlink. Enable Developer Mode (Settings > System > For developers), then run: sh $WT_NM_SCRIPT --link" >&2
  echo "[worktree-node-modules] A directory junction is NOT used as a fallback: git worktree remove recurses through a junction and empties the main checkout's fsi-app/node_modules." >&2
}

# In a linked worktree, make <top>/fsi-app/node_modules a symlink to the main checkout's install,
# replacing a junction or a dangling link. No-op (0) in the main checkout, when there is no fsi-app/,
# or when a symlink or a real per-worktree install is already there. Returns 1 when it should link but
# cannot (main has no install, or the OS refused the symlink); on a refused conversion the junction is
# put back, so this never leaves a worktree with less than it had.
wt_nm_ensure_link() {
  top="$(git rev-parse --show-toplevel 2>/dev/null)" || return 1
  [ -d "$top/fsi-app" ] || return 0
  wt_nm_is_linked_worktree || return 0
  link="$top/fsi-app/node_modules"
  kind="$(wt_nm_link_kind "$link")"
  case "$kind" in
    symlink|dir) return 0 ;;
  esac
  main="$(wt_nm_main_checkout)"
  target="$main/fsi-app/node_modules"
  if [ -z "$main" ] || ! wt_nm_populated "$target"; then
    echo "[worktree-node-modules] cannot link: main checkout has no fsi-app/node_modules ($target); run 'npm ci' in the main checkout's fsi-app first." >&2
    return 1
  fi
  if [ "$kind" != absent ]; then
    wt_nm_unlink "$link" || { echo "[worktree-node-modules] could not remove the existing $kind at $link" >&2; return 1; }
  fi
  if wt_nm_symlink "$link" "$target" && wt_nm_populated "$link"; then
    echo "[worktree-node-modules] linked fsi-app/node_modules -> $target (symlink)" >&2
    return 0
  fi
  if [ "$kind" = junction ]; then
    # Restore what the worktree had so its push still works; the hazard stays reported by --check.
    wt_nm_cmd mklink /J "$(wt_nm_winpath "$link")" "$(wt_nm_winpath "$target")" >/dev/null 2>&1
  fi
  if wt_nm_is_windows; then wt_nm_symlink_denied_message; else
    echo "[worktree-node-modules] failed to create symlink $link -> $target" >&2
  fi
  return 1
}

wt_nm_fix_command() {
  if wt_nm_is_linked_worktree; then echo "sh $WT_NM_SCRIPT --link"; else echo "(cd fsi-app && npm ci)"; fi
}

# 0 when this checkout's fsi-app/node_modules is usable AND safe to delete with its worktree. Otherwise
# prints the one-line fix and returns 1. pre-push step 0b calls this so a missing install is reported as
# itself, not as F9/F10/F11/F12 fitness violations.
wt_nm_require() {
  top="$(git rev-parse --show-toplevel 2>/dev/null)" || return 1
  [ -d "$top/fsi-app" ] || return 0
  kind="$(wt_nm_link_kind "$top/fsi-app/node_modules")"
  if [ "$kind" = junction ]; then
    echo "fsi-app/node_modules in this worktree is a junction, which git worktree remove would empty the shared install through: run sh $WT_NM_SCRIPT --link" >&2
    return 1
  fi
  if wt_nm_populated "$top/fsi-app/node_modules"; then return 0; fi
  echo "fsi-app/node_modules missing in this worktree: run $(wt_nm_fix_command)" >&2
  return 1
}

# One line per worktree: "<kind> <path>". Read-only.
wt_nm_audit() {
  git worktree list --porcelain | sed -n 's/^worktree //p' | while IFS= read -r wt; do
    [ -d "$wt/fsi-app" ] || continue
    echo "$(wt_nm_link_kind "$wt/fsi-app/node_modules") $wt"
  done
}

# Convert every linked worktree's junction to a symlink. Stops at the first refusal (a refusal on one
# means the OS setting is off for all of them).
wt_nm_repair_all() {
  rc=0
  junctions="$(wt_nm_audit | sed -n 's/^junction //p')"
  old_ifs="$IFS"; IFS='
'
  for wt in $junctions; do
    (cd "$wt" && wt_nm_ensure_link) || { rc=1; break; }
  done
  IFS="$old_ifs"
  remaining="$(wt_nm_audit | grep -c '^junction ')"
  echo "[worktree-node-modules] junctions remaining: $remaining" >&2
  [ "$rc" -eq 0 ] && [ "$remaining" -eq 0 ]
}

# Direct invocation only. When sourced, $0 is the sourcing hook and $1 is git's hook argument, so the
# basename test keeps a sourcing hook from ever reaching this dispatch.
if [ "$(basename "$0")" = "worktree-node-modules.sh" ]; then
  case "${1:-}" in
    --link) wt_nm_ensure_link && wt_nm_require; exit $? ;;
    --check) wt_nm_require; exit $? ;;
    --audit) wt_nm_audit; exit $? ;;
    --repair-all) wt_nm_repair_all; exit $? ;;
    *) echo "usage: sh $0 --link | --check | --audit | --repair-all" >&2; exit 2 ;;
  esac
fi
