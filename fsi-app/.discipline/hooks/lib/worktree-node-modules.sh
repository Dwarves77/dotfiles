#!/bin/sh
# worktree-node-modules.sh, the ONE home for "can fsi-app's npm dependencies be resolved in this
# checkout, and if it is a linked worktree, make them resolvable from the main checkout's shared
# install, safely and with no special OS rights" (invariant RD-85). Sourced by
# fsi-app/.discipline/hooks/post-checkout (on `git worktree add`) and fsi-app/.discipline/hooks/pre-push
# (step 0b, self-heal then fail fast). Also runnable directly, from any checkout:
#   sh fsi-app/.discipline/hooks/lib/worktree-node-modules.sh --link        make THIS worktree resolve
#   sh fsi-app/.discipline/hooks/lib/worktree-node-modules.sh --check       exit 1 + the fix if not
#   sh fsi-app/.discipline/hooks/lib/worktree-node-modules.sh --audit       one line per worktree
#   sh fsi-app/.discipline/hooks/lib/worktree-node-modules.sh --repair-all  --link in every worktree
#
# DEFECT 1 [CONFIRMED 2026-09-25]: a new linked worktree has no fsi-app/node_modules (gitignored) and
# the lane contract forbids `npm install` in a lane, so the pre-push fitness runner reported F9, F10,
# F11 and F12 as violations (their selftests import npm deps), or hung. The coordinator hand-linked
# four lanes with `mklink /J <wt>\fsi-app\node_modules`.
# DEFECT 2 [CONFIRMED 2026-09-27, git 2.53.0.windows.1, pinned by worktree-node-modules.test.mjs]: that
# junction is destructive. Git for Windows treats a junction as a plain directory, so
# `git worktree remove` (forced or not) empties the MAIN checkout's install through it, the same class
# that destroyed it on 2026-05-20 (OBS-53). A real symlink is safe from git, but on Windows creating one
# needs Developer Mode or an admin-granted right, which a build must never depend on.
#
# THE DESIGN (no hazardous state, no special rights, one resolver):
# - NOTHING is created inside a worktree. The shared install is reached through ONE link BESIDE the
#   worktrees, `<main>/.claude/worktrees/node_modules` (the parent directory of the worktree, which must
#   sit inside the main checkout and be gitignored there). Node resolves packages by walking up parent
#   directories, so every worktree under that directory finds the install. `git worktree remove`
#   deletes only the worktree's own directory, so no remover can ever reach the shared install through
#   a worktree, whatever git, Windows or the app's cleanup does. Because the link is outside every
#   worktree, a plain junction is safe there, and a junction needs no Developer Mode and no admin.
# - Success is judged by what matters: does `next` resolve from <worktree>/fsi-app, asked of Node, never
#   by testing a literal path. Every consumer finds deps the same way (lib/resolve-dep.mjs; F59 fails CI
#   on a hard-coded fsi-app/node_modules path).
# - A junction found INSIDE a worktree (the old hand fix) is removed with `rmdir`, which deletes the
#   link and never its target; a real symlink inside a worktree is left alone (git unlinks it safely).
#
# Every function returns a status and prints to stderr; none calls `exit`, so post-checkout can treat
# a failure as a warning (a checkout is never wedged by this) while pre-push treats it as fatal.

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

# Windows cmd.exe with MSYS path rewriting disabled (so /J, /AL stay switches).
wt_nm_cmd() {
  MSYS2_ARG_CONV_EXCL='*' cmd /c "$@"
}

# Absolute, forward-slash path of the main checkout (first entry of `git worktree list`).
wt_nm_main_checkout() {
  git worktree list --porcelain 2>/dev/null | sed -n '1s/^worktree //p'
}

# Every linked worktree's path, one per line (main excluded).
wt_nm_linked_worktrees() {
  git worktree list --porcelain 2>/dev/null | sed -n 's/^worktree //p' | sed '1d'
}

# 0 inside a LINKED worktree (git-dir differs from git-common-dir), the zero-false-positive WHERE signal
# RD-19 worktree-isolation also uses.
wt_nm_is_linked_worktree() {
  gd="$(git rev-parse --path-format=absolute --git-dir 2>/dev/null)" || return 1
  gcd="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || return 1
  [ -n "$gd" ] && [ "$gd" != "$gcd" ]
}

# 0 when path $1 is $2 itself or inside it (case-insensitive on Windows, where paths are).
wt_nm_is_within() {
  p="$1"; d="$2"
  if wt_nm_is_windows; then
    p="$(printf '%s' "$p" | tr 'A-Z' 'a-z')"; d="$(printf '%s' "$d" | tr 'A-Z' 'a-z')"
  fi
  case "$p/" in "$d/"*) return 0 ;; esac
  return 1
}

# 0 when fsi-app's dependencies resolve from <appdir>, asked of Node itself.
wt_nm_resolves() {
  command -v node >/dev/null 2>&1 || return 1
  node -e "require.resolve('next/package.json', { paths: [process.argv[1]] })" "$1" >/dev/null 2>&1
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

# Create the directory link <link> -> <target> OUTSIDE every worktree: a junction on Windows (no
# special rights), a symlink on POSIX.
wt_nm_make_link() {
  if wt_nm_is_windows; then
    wt_nm_cmd mklink /J "$(wt_nm_winpath "$1")" "$(wt_nm_winpath "$2")" >/dev/null 2>&1
  else
    ln -s "$2" "$1"
  fi
}

# Where the shared link for worktree <top> lives, printed; returns 1 (with the reason on stderr) when
# the worktree's parent directory is not a safe home for it: it must be inside the main checkout,
# gitignored there, and not inside any linked worktree.
wt_nm_shared_link_path() {
  top="$1"; main="$2"
  parent="$(dirname "$top")"
  if ! wt_nm_is_within "$parent" "$main" || [ "$parent" = "$main" ]; then
    echo "[worktree-node-modules] $top is outside $main/.claude/worktrees; create worktrees there (the repo convention) so they share the install." >&2
    return 1
  fi
  for wt in $(wt_nm_linked_worktrees | tr ' ' '\001'); do
    wt="$(printf '%s' "$wt" | tr '\001' ' ')"
    if wt_nm_is_within "$parent" "$wt"; then
      echo "[worktree-node-modules] $parent is inside another worktree ($wt); refusing to place the shared link there." >&2
      return 1
    fi
  done
  rel="${parent#"$main"/}/node_modules"
  if ! git -C "$main" check-ignore -q --no-index "$rel" 2>/dev/null; then
    echo "[worktree-node-modules] $main/$rel is not gitignored in the main checkout; refusing to create it." >&2
    return 1
  fi
  printf '%s/node_modules\n' "$parent"
}

# Make fsi-app's dependencies resolve in this linked worktree. No-op (0) in the main checkout, when
# there is no fsi-app/, or when they already resolve. Removes a junction inside the worktree. Returns 1
# when it cannot (the main checkout has no install, or the worktree is outside the main checkout).
wt_nm_ensure_link() {
  top="$(git rev-parse --show-toplevel 2>/dev/null)" || return 1
  [ -d "$top/fsi-app" ] || return 0
  wt_nm_is_linked_worktree || return 0
  intree="$top/fsi-app/node_modules"
  case "$(wt_nm_link_kind "$intree")" in
    junction|dangling)
      wt_nm_unlink "$intree" || { echo "[worktree-node-modules] could not remove the link at $intree" >&2; return 1; }
      echo "[worktree-node-modules] removed the junction at $intree (its target is untouched)" >&2
      ;;
  esac
  wt_nm_resolves "$top/fsi-app" && return 0
  main="$(wt_nm_main_checkout)"
  target="$main/fsi-app/node_modules"
  if [ -z "$main" ] || ! wt_nm_populated "$target"; then
    echo "[worktree-node-modules] the main checkout has no fsi-app/node_modules ($target); run 'npm ci' in the main checkout's fsi-app first." >&2
    return 1
  fi
  shared="$(wt_nm_shared_link_path "$top" "$main")" || return 1
  case "$(wt_nm_link_kind "$shared")" in
    absent) ;;
    dir)
      echo "[worktree-node-modules] $shared is a real directory, not the shared link; it shadows the main install. Remove or rename it." >&2
      return 1 ;;
    *)
      # A link that exists but does not make deps resolve is stale (the main install moved): replace it.
      wt_nm_unlink "$shared" || { echo "[worktree-node-modules] could not replace the stale link at $shared" >&2; return 1; } ;;
  esac
  if wt_nm_make_link "$shared" "$target" && wt_nm_resolves "$top/fsi-app"; then
    echo "[worktree-node-modules] fsi-app dependencies now resolve through $shared -> $target" >&2
    return 0
  fi
  echo "[worktree-node-modules] failed to make dependencies resolve through $shared -> $target" >&2
  return 1
}

wt_nm_fix_command() {
  if wt_nm_is_linked_worktree; then echo "sh $WT_NM_SCRIPT --link"; else echo "(cd fsi-app && npm ci)"; fi
}

# 0 when fsi-app's dependencies resolve in this checkout AND no junction sits inside it (git worktree
# remove would empty the shared install through one). Otherwise prints the one-line fix, returns 1.
wt_nm_require() {
  top="$(git rev-parse --show-toplevel 2>/dev/null)" || return 1
  [ -d "$top/fsi-app" ] || return 0
  if [ "$(wt_nm_link_kind "$top/fsi-app/node_modules")" = junction ]; then
    echo "fsi-app/node_modules in this worktree is a junction, which git worktree remove would empty the shared install through: run sh $WT_NM_SCRIPT --link" >&2
    return 1
  fi
  wt_nm_resolves "$top/fsi-app" && return 0
  echo "fsi-app dependencies do not resolve in this worktree: run $(wt_nm_fix_command)" >&2
  return 1
}

# One line per checkout: "<resolves|UNRESOLVED> <in-tree kind> <path>". Read-only.
wt_nm_audit() {
  git worktree list --porcelain | sed -n 's/^worktree //p' | while IFS= read -r wt; do
    [ -d "$wt/fsi-app" ] || continue
    if wt_nm_resolves "$wt/fsi-app"; then r=resolves; else r=UNRESOLVED; fi
    echo "$r $(wt_nm_link_kind "$wt/fsi-app/node_modules") $wt"
  done
}

# --link in every linked worktree that is unresolved or holds a junction. Reports what remains.
wt_nm_repair_all() {
  rc=0
  todo="$(wt_nm_audit | sed -n -e 's/^UNRESOLVED [a-z]* //p' -e 's/^resolves junction //p')"
  old_ifs="$IFS"; IFS='
'
  for wt in $todo; do
    (cd "$wt" && wt_nm_ensure_link) || rc=1
  done
  IFS="$old_ifs"
  bad="$(wt_nm_audit | grep -cE '^UNRESOLVED |^resolves junction ')"
  echo "[worktree-node-modules] checkouts still unresolved or holding a junction: $bad" >&2
  [ "$rc" -eq 0 ] && [ "$bad" -eq 0 ]
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
