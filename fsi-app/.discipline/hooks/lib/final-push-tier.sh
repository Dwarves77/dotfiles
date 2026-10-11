#!/bin/sh
# final-push-tier.sh, sourced by fsi-app/.discipline/hooks/pre-push (lane GATE-PUSH-1, 2026-10-11; HOOK-1 the same day).
# The ONE home for "is this push a CI-triggering (final) push, which files does step B lint, which unit tests does
# it run, and how are they run". A shell-level unit so a test can drive each function in a throwaway repository.
#
# WHY (amends ADR-040). The repository is private and Actions minutes are metered (2,000 a month, spending
# limit 0). A push whose tip commit carries no CI skip token starts a full PR run (about 25 runner-minutes);
# on 2026-10-11 three such pushes went red on defects a local check finds in seconds (two ESLint unused-variable
# warnings, an F45 duplicate-code violation, rule 024 on commit subjects). So a CI-triggering push runs the
# cheap tier locally first: step B (ESLint over the changed files and the unit tests of the changed test files)
# and step C (the memory gate). HOOK-1 dropped the fitness runner from the hook: a lane runs it itself (rule 17)
# and CI runs it again. A push whose tip carries a skip token (a WIP save-point push) runs neither.
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

# pre_push_changed_test_files: one repo-root-relative path per line, the unit tests step B runs: every *.test.mjs
# that origin/master...HEAD adds or modifies, plus, for each changed module (js, mjs, cjs, ts, tsx, sh) that is not
# itself a test, its sibling <stem>.test.mjs and the *.test.mjs files at or below the module's own directory that
# import it by name (an import specifier ending in /<stem> or /<stem>.<ext>). A name match, not an import graph:
# it can run a test that does not need to run, never skip the sibling test. npmtest and selftest files are not
# run here (they need the install or a named runner); CI runs them. Only files that exist are listed.
pre_push_changed_test_files() {
  _tf_changed="$(git diff --name-only --diff-filter=d origin/master...HEAD 2>/dev/null \
    | grep -E '^fsi-app/.*\.(js|mjs|cjs|ts|tsx|sh)$')"
  [ -n "$_tf_changed" ] || return 0
  {
    printf '%s\n' "$_tf_changed" | grep -E '\.test\.mjs$'
    printf '%s\n' "$_tf_changed" | grep -v -E '\.(test|npmtest|selftest)\.[a-z]+$' | while IFS= read -r _tf_f; do
      _tf_dir="${_tf_f%/*}"
      _tf_base="${_tf_f##*/}"
      _tf_stem="${_tf_base%.*}"
      printf '%s\n' "$_tf_dir/$_tf_stem.test.mjs"
      _tf_re="$(printf '%s' "$_tf_stem" | sed 's/[][.*^$+?(){}|\]/\&/g')"
      git grep -l -E -e "/${_tf_re}(\.[a-z]+)?[\"'\`]" -- "$_tf_dir/*.test.mjs" 2>/dev/null
    done
  } | sort -u | while IFS= read -r _tf_t; do
    [ -f "$_tf_t" ] && printf '%s\n' "$_tf_t"
  done
  return 0
}

# pre_push_run_changed_tests <repo-root-relative test path>...: the CI recipe of run-test-suite.sh narrowed to
# those files: run-explicit-tests.mjs (node:test's programmatic run, so a path is never re-parsed as a glob)
# with the no-npm sandbox import, the credential variables unset and FSI_NO_ENV_FILE=1, so a test sees the
# environment CI gives it. Runs in a subshell: nothing leaks into the hook's environment.
pre_push_run_changed_tests() {
  (
    _rt_vars="$(node --input-type=module -e "const m = await import('./fsi-app/scripts/lib/env-file.mjs'); console.log(m.CREDENTIAL_VARS.join(' '))" 2>/dev/null)" || _rt_vars=""
    for _rt_v in $_rt_vars; do unset "$_rt_v"; done
    FSI_NO_ENV_FILE=1
    export FSI_NO_ENV_FILE
    printf '%s\n' "$@" | tr '\n' '\0' \
      | node ./fsi-app/.discipline/lib/run-explicit-tests.mjs -- --import ./fsi-app/.discipline/lib/no-npm-sandbox.mjs
  )
}
