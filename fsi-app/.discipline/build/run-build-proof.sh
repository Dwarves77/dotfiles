#!/bin/sh
# LOCAL WRAPPER for the build proof CI runs in .github/workflows/build-proof.yml (BUILDGATE,
# 2026-09-02, F34's named residual — see that workflow's own header for the full incident basis:
# PR #533's module-scope readFileSync reached every page and no gate before this one built the
# actual bundle). Run this before handing off any change that touches fsi-app/src/**,
# fsi-app/package*.json, or fsi-app/next.config.* — the same trigger paths the CI job watches.
#
# TWO BUNDLERS, IN ORDER. CI (and Vercel) run plain `next build` — Turbopack, the Next 16 default —
# against a REAL node_modules from `npm ci`, where Turbopack's project-root sandboxing never
# triggers. A lane worktree under /root/work/lanes/<lane>/ instead SYMLINKS fsi-app/node_modules to
# a shared install outside the worktree's own tree, which Turbopack refuses ("Symlink ... points out
# of the filesystem root"). fsi-app/next.config.ts's computeAppRoot() widens outputFileTracingRoot to
# cover exactly that case, so Turbopack now builds in a worktree too — this script tries it FIRST,
# matching CI exactly, and only falls back to `--webpack` (which dereferences the symlink instead of
# sandboxing to a root, so it was never affected) if Turbopack still fails for some other worktree-
# specific reason. Whichever bundler actually ran is named in the summary line.
#
# GREP CLASSES. A clean exit code from `next build` already fails the whole run on the class this
# gate exists for (a route.ts exporting a non-route symbol; a module-scope throw anywhere in the
# import graph). The grep below is a SECOND, human-legible signal for the two failure classes
# BUILDGATE was stood up to catch by name, so a scrollback skim finds the cause immediately instead
# of hunting through the full Next.js error dump:
#   - "is not a valid Route export field"  — Next's route-type validator (F34's residual class:
#     a route.ts exporting a pure function/constant instead of only handlers/config).
#   - "ENOENT" / "no such file or directory" — a module-scope filesystem read failing at build time,
#     the literal 2026-09-02 production-500 signature F34 exists to catch statically; this proves it
#     dynamically too.
# The grep is diagnostic only and never changes the exit code — `next build`'s own exit status is
# the gate.
#
# ENV. Placeholder Supabase envs, same values and same reasoning as the CI workflow (see its header):
# the client constructors assert non-null at build time; nothing is actually queried during a build
# because every data-reading path here is fail-soft and every route renders dynamic.

set -eu

cd "$(dirname "$0")/../.."   # fsi-app/.discipline/build -> fsi-app

export NEXT_TELEMETRY_DISABLED="${NEXT_TELEMETRY_DISABLED:-1}"
export NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-https://build-proof-placeholder.supabase.co}"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-build-proof-placeholder-anon-key}"

LOG="$(mktemp)"
trap 'rm -f "$LOG"' EXIT

echo "== build-proof: next build (Turbopack, matches CI/Vercel) =="
if npx next build 2>&1 | tee "$LOG"; then
  BUNDLER="Turbopack"
else
  echo ""
  echo "== build-proof: Turbopack failed in this worktree; falling back to next build --webpack =="
  echo "   (known worktree case: a symlinked node_modules Turbopack refuses even after the"
  echo "   outputFileTracingRoot widening in next.config.ts; webpack dereferences the symlink"
  echo "   and is unaffected — this is the documented fallback, not a silent pass)"
  if npx next build --webpack 2>&1 | tee "$LOG"; then
    BUNDLER="webpack (worktree fallback)"
  else
    echo ""
    echo "== build-proof: FAILED under both bundlers =="
    grep -nE "is not a valid Route export field|ENOENT|no such file or directory" "$LOG" \
      | sed 's/^/   [named class] /' || true
    exit 1
  fi
fi

echo ""
echo "== build-proof: PASSED (bundler: $BUNDLER) =="
if grep -qE "is not a valid Route export field|ENOENT|no such file or directory" "$LOG"; then
  echo "   NOTE: the named failure-class strings appeared in output despite a green exit code —"
  echo "   inspect the log; a passing build should not contain them:"
  grep -nE "is not a valid Route export field|ENOENT|no such file or directory" "$LOG" \
    | sed 's/^/   /'
fi
