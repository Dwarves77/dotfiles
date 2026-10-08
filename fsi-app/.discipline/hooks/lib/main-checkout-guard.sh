#!/bin/sh
# Sourced by the pre-commit, pre-merge-commit and post-commit hooks (lane GATE-7, 2026-10-08).
# The WHERE signal of the worktree-isolation guard (RD-19), in plain shell, so the guard still decides when
# node is missing from PATH (a GUI git client with a minimal PATH; register attack A-H1-3, and `env -i`,
# A-H1-2). A linked worktree's git-dir is <common>/worktrees/<name>; in the main checkout the git-dir and
# the git-common-dir are the same path. The node runner (governance/worktree-isolation-hook.mjs) is the
# same verdict with the doctrine text and the firing-log line; this function is only the no-node fallback.

wt_in_main_checkout() {
  _wt_gd="$(git rev-parse --absolute-git-dir 2>/dev/null)" || return 1
  _wt_cd="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || return 1
  [ -n "$_wt_gd" ] && [ "$_wt_gd" = "$_wt_cd" ]
}
