#!/bin/sh
# final-push-tier.sh, sourced by fsi-app/.discipline/hooks/pre-push (lane GATE-PUSH-1, 2026-10-11).
# The ONE home for "is this push a CI-triggering (final) push, which files does the final tier lint, and how
# is ESLint run on them". A shell-level unit so a test can drive each function in a throwaway repository.
#
# WHY (amends ADR-040). The repository is private and Actions minutes are metered (2,000 a month, spending
# limit 0). A push whose tip commit carries no CI skip token starts a full PR run (about 25 runner-minutes);
# on 2026-10-11 three such pushes went red on defects a local check finds in seconds (two ESLint unused-variable
# warnings, an F45 duplicate-code violation, rule 024 on commit subjects). So a CI-triggering push runs the
# cheap tier locally first: step 3d (ESLint over the changed files) and step 3e (the fitness runner). A push
# whose tip carries a skip token (a WIP save-point push) runs neither, as before.
#
# The five tokens are the ones rule 024 (fsi-app/.discipline/rules/024-wip-commit-skips-ci.mjs) recognises,
# plus the `skip-checks: true` trailer it also recognises (GitHub honours it the same way).
#
# Every function returns a status and prints to stdout/stderr; none calls `exit`.

# pre_push_text_has_skip_token <text>: 0 when the text carries a CI skip token.
pre_push_text_has_skip_token() {
  printf '%s\n' "$1" | grep -Eiq '\[(skip ci|ci skip|no ci|skip actions|actions skip)\]|^skip-checks:[[:space:]]*true[[:space:]]*$'
}

# pre_push_resolve_final_push <ref-update lines>: sets FINAL_PUSH=true when at least one pushed ref's tip
# commit (subject and body) carries no skip token; false otherwise. A deleted ref (all-zero local sha), an
# empty push and an unreadable sha add nothing. Sets PUSHED_TIPS to the number of tips it inspected.
pre_push_resolve_final_push() {
  FINAL_PUSH=false
  PUSHED_TIPS=0
  while read -r _fp_lref _fp_lsha _fp_rref _fp_rsha; do
    [ -n "$_fp_lsha" ] || continue
    case "$_fp_lsha" in
      *[!0]*) ;;
      *) continue ;;
    esac
    _fp_msg="$(git log -1 --format=%B "$_fp_lsha" 2>/dev/null)" || continue
    [ -n "$_fp_msg" ] || continue
    PUSHED_TIPS=$((PUSHED_TIPS + 1))
    if ! pre_push_text_has_skip_token "$_fp_msg"; then
      FINAL_PUSH=true
    fi
  done <<EOF
$1
EOF
}

# pre_push_changed_lintable_files: one repo-root-relative path per line, the files under fsi-app/ that
# origin/master...HEAD adds or modifies and that ESLint is configured for (deleted files excluded).
pre_push_changed_lintable_files() {
  git diff --name-only --diff-filter=d origin/master...HEAD 2>/dev/null \
    | grep -E '^fsi-app/.*\.(js|jsx|mjs|cjs|ts|tsx)$'
  return 0
}

# pre_push_eslint_files <repo-root-relative path>...: ESLint with max-warnings 0 over exactly those files,
# the CI command (`npm run lint -- --max-warnings=0`) narrowed to the changed set. --no-warn-ignored keeps a
# file the config ignores from counting as a warning. xargs -s keeps the command line under the Windows limit.
pre_push_eslint_files() {
  printf '%s\n' "$@" | sed 's#^fsi-app/##' \
    | (cd fsi-app && xargs -s 6000 npm run --silent lint -- --max-warnings=0 --no-warn-ignored)
}
