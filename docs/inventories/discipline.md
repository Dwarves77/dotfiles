# Discipline Engine Inventory

Catalog of the Rules-as-Code (RaC) discipline engine at `fsi-app/.discipline/` plus its enforcement integrations. Maintained per Layer 4 cross-skill consistency (rule 014).

## Status

**Slim engine, 2026-05-21** (post-audit slim refactor). Engine cut from 33 mechanisms to 8 plus 1 pre-push hook. The audit found that 25 mechanisms had zero documented bug catches in their lifetimes; 12 were structurally unable to catch what they claimed (dispatcher-controlled attestation strings, no-op extractors, wrong source-of-truth); the other 13 (the UNCERTAIN tier) had no enforceable review path outside Claude Code. All 25 + 4 UNCERTAINs were deleted in this dispatch.

Replaced with a **pre-push hook** (CI-parity gate) that runs the same 4 checks CI runs, locally, before push leaves the machine.

| Era | Commit | Deliverable |
|---|---|---|
| 0 | fab2e0e | Engine scaffold + 2 example rules |
| 1 | (parallel) | Rule modules for 001-007, 009, 010 |
| 2 | d6e26d2 | Manifest registers 11 rules; 211 tests |
| 3 | (parallel) | commit-msg hook + install script + CI workflow |
| 4 | c097b09 | REPO_ROOT class-fix + CI workflow + hook + inventory integration |
| OBS-59 | 510b637 | Bundle: getRepoRoot() + rule 012 (content-check layer) |
| Phase 1.5 | 9a95afb | Q2 base_tier + effective_tier consumer migration |
| Sprint Architecture | 2494a74 | Phase 4 fitness functions F1-F8 + dispatch UUID tracking |
| F9 hotfix | 5ed34fe | F9 build-compiles + type fixes |
| ADR System | cf03400 | 9 ADRs + 13th rule + audit ADR-Reference |
| Layer 4 | 8d42510 | 10 consistency checks + 14th rule + consistency runner |
| Rule 014 parser hotfix | 7d445a8 | rule 014 stderr scoping + drift detail |
| Rule 15 added + reverted | 40ac05d → 5e3ae41 | Post-push verification rule (ceremony without behavior change; reverted same day) |
| **Audit + slim** | **(this commit)** | **Deleted 25 mechanisms (12 rules + 5 fitness + 8 consistency) + 6 inventory files. Engine: 33 → 8. Added pre-push hook (CI-parity gate). Commit messages return to normal (no required trailers).** |

## Architecture (slim)

```
fsi-app/.discipline/
  README.md
  INSTALL.md
  manifest.mjs                    rule registry (2 rules)
  runner.mjs                      engine entry: commit-msg / ci / fixture modes
  install-hooks.mjs               idempotent installer for local hooks
  install-hooks.test.mjs
  runner.test.mjs
  hooks/
    commit-msg                    invokes runner.mjs --mode=commit-msg
    pre-push                      CI-parity gate (4 steps: untracked-critical, consistency, tests, tsc)
  lib/
    result.mjs                    PASS / FAIL / SKIP result shape
    context.mjs                   CheckContext builder + getRepoRoot()
    predicates.mjs                shared check helpers
    predicates.test.mjs
    adr-loader.mjs                ADR frontmatter loader (kept; ADRs themselves are kept docs)
    adr-loader.test.mjs
  rules/                          (2 rules; post-slim)
    012-hardcoded-user-path.mjs       + .test.mjs
    014-inventory-consistency.mjs     + .test.mjs
  fitness/                        (4 functions; post-slim)
    README.md
    manifest.mjs
    runner.mjs
    runner.test.mjs
    lib/
      glob.mjs
      result.mjs
      file-content.mjs
    functions/
      F2-admin-routes-isPlatformAdmin.mjs   + .test.mjs
      F6-migrations-numeric-ordering.mjs    + .test.mjs
      F8-client-server-tier-boundary.mjs    + .test.mjs
      F9-build-compiles.mjs                 + .test.mjs
  consistency/                    (2 checks; post-slim)
    README.md
    manifest.mjs
    runner.mjs
    lib/
      drift.mjs
      inventory-parser.mjs
    checks/
      C3-migrations-reality.mjs
      C4-worktrees-reality.mjs
  dispatch/                       (UUID tracking; kept for retrospectives)
    README.md
    start.mjs
    audit.mjs
    start.test.mjs
    audit.test.mjs

.github/workflows/
  discipline.yml                  GitHub Actions: validate-commits + tests + fitness-check
```

## Rule registry (post-slim production: 2)

| ID | Name | What it does | Evidence |
|---|---|---|---|
| 012 | Hardcoded user-home path | Content-check; rejects `C:\Users\` patterns and operator-specific home paths | Caught REPO_ROOT residual in runner.test.mjs that prior class-fix missed (510b637) |
| 014 | Inventory consistency | Gates inventory commits on the C-check runner passing | Caught migration 067 orphan via C3 (4a3d210) |

## Fitness function registry (post-slim production: 4)

| ID | Name | What it checks | Evidence |
|---|---|---|---|
| F2 | admin-routes-isPlatformAdmin | Every admin API route calls isPlatformAdmin | Encodes a 28-route sweep result so it cannot regress |
| F6 | migrations-numeric-ordering | Filename pattern + duplicate-number check | Surfaced 5 historical duplicates at creation (006/007 collisions) |
| F8 | client-server-tier-boundary | No `body.tier` assignment in client code near fetch/POST | Caught 2 real client-side violations (Phase 1.5 atomic refactor) |
| F9 | build-compiles | `tsc --noEmit` must pass | Closes the local-green/Vercel-red gap (OBS-64) |

## Consistency check registry (post-slim production: 2)

| ID | Name | What it checks | Evidence |
|---|---|---|---|
| C3 | migrations.md reality | Disk migrations == inventory entries | Caught migration 067 untracked (4a3d210) |
| C4 | worktrees.md reality | Live worktrees == inventory entries | Caught remediation-discipline orphan in CI (ae67887) |

## Pre-push hook (CI-parity gate)

Source: `fsi-app/.discipline/hooks/pre-push`. Runs on `git push`, BEFORE the push leaves the machine.

**Out-of-repo boundary, the trampoline (D19, defect-fix-plan-2026-09-12.md, lane L12, 2026-09-13).**
`.git/hooks/` lives OUTSIDE the tracked repo (it is not itself a versioned file), so the tracked hook
source above cannot run directly on `git push` -- something has to be installed there. Before this fix,
`install-hooks.mjs` copied the tracked hook byte-for-byte into `.git/hooks/<name>`; the copy had no
freshness check, so a merged change to the tracked hook silently did not take effect until an operator
remembered to re-run the installer (confirmed: an installed `pre-push` copy dated 2026-09-11 ran for two
days missing step 2b, the memory gate, and D11's own per-run log directory fix). **Fixed at the source:**
`install-hooks.mjs` now writes a small TRAMPOLINE to `.git/hooks/<name>` instead of a copy -- a three-line
POSIX `sh` script that resolves the pushing worktree's own top level at run time (`git rev-parse
--show-toplevel`, worktree-aware) and `exec`s the TRACKED hook from there, with the same arguments and
stdin passed straight through. The hook that actually runs is therefore always the branch's own tracked
file; a hook change takes effect on the very next push, with no re-install step. The installer now needs
to be run only once (after this lane merges) and again only when a NEW hook NAME is added -- never again
for an ordinary edit to an existing tracked hook's own logic. `fsi-app/.discipline/hooks/pre-push` carries
its own step 0, refusing to run at all unless `DISCIPLINE_HOOK_TRAMPOLINE` is set (the trampoline sets it;
a stale byte-for-byte copy left over from before this fix cannot), so a stale copy prints "stale hook
copy; run node fsi-app/.discipline/install-hooks.mjs" and exits 1 instead of silently running. A direct
invocation of the tracked file (the lane preflight, `docs/dispatches/lane-common-contract.md`) sets
`DISCIPLINE_HOOK_TRAMPOLINE=1` explicitly for the same reason. Only real git hook NAMES (`pre-push`,
`pre-commit`, `commit-msg`, and so on -- `KNOWN_GIT_HOOK_NAMES` in `install-hooks.mjs`) are installed; a
`*.test.mjs` or other non-hook file sitting in `fsi-app/.discipline/hooks/` is never a target (this is
what let L3's own `pre-push-tmpdir.test.mjs` get copied into `.git/hooks/` under the pre-D19 behaviour).

Several steps mirror the CI workflow (numbering below matches the hook's own step comments, including the lettered steps added after the original four):

0. **Stale-copy refusal** (D19): refuses immediately, before any other step, unless `DISCIPLINE_HOOK_TRAMPOLINE` is set in the environment.
1. **Untracked critical-surface gate**: `git ls-files --others --exclude-standard` against critical paths (migrations, routes, ADRs, inventories, discipline). Catches the migration-067 class (file on disk locally, missing in CI checkout).
2. **Consistency runner**: `node fsi-app/.discipline/consistency/override-check.mjs --prepush`. Catches C3/C4 drift, override-aware.
2b. **Memory gate, CI parity** (task 7.8, 2026-09-12; extended by D28, defect-fix-plan-2026-09-12.md, W9 lane L18): `node fsi-app/.discipline/governance/memory-gate.mjs --range=origin/master..HEAD`. Fails a range that touches code (`fsi-app/(src|supabase/migrations|scripts|.discipline)/`) without a `docs/ops/session-log.md` change, a `docs/PROGRAM-BOARD.md` change, or a `docs/ops/session-log.d/YYYY-MM-DD-<slug>.md` file in the same range, or a `.tsx`/`.css` change without an added "UX compliance" line in the session-log diff. `docs/ops/session-log.d/` (format and rule at `docs/ops/session-log.d/README.md`: one file per lane per day, never edit another lane's file) exists because every lane appending to the ONE `session-log.md` file made every rebase onto a master that had merged another lane's own entry conflict on it; the single file stays for coordinator entries. The SAME script also runs as the CI workflow's "Memory gate" step (`.github/workflows/discipline.yml`), so the two surfaces cannot silently disagree the way they did for PR #647 (task 6.2b): CI's inline shell duplicate had this check and pre-push did not.
3. **Discipline + fitness tests**: `node --test` on every test file in the engine (`run-test-suite.sh`, the same entrypoint CI's discipline-engine job uses). Catches rule/fitness regressions.
3b. **Invariant-coverage meta-gate**: `node fsi-app/.discipline/governance/invariant-coverage.mjs`. Fails a push if any skill invariant is neither mechanically enforced nor explicitly exempted.
3c. **Action-time skill-gate wiring**: `node fsi-app/.discipline/governance/check-pretooluse-wired.mjs`. Proves the out-of-repo PreToolUse gate (`~/.claude/settings.json`) is fully wired on the operator's own machine; skips cleanly when that file is absent.
4. **TypeScript compile**: `(cd fsi-app && npx tsc --noEmit)`. Catches F9/Vercel break class.

Bypass (use sparingly): `git push --no-verify`. Hook is fail-closed on missing-node (unlike commit-msg which is fail-open) since the whole point is to prevent the push-fail-fix loop.

## Operator install + use

```bash
# Install the trampolines into .git/hooks/ -- run once after D19 merges, and again only when a NEW hook
# name is added (never again for an ordinary edit to an existing tracked hook's own logic; see the
# trampoline note above).
node fsi-app/.discipline/install-hooks.mjs

# List all rules
node fsi-app/.discipline/runner.mjs --list

# Validate a specific past commit (CI mode)
node fsi-app/.discipline/runner.mjs --mode=ci --commit=<sha>

# Run pre-push checks manually (without pushing), through the installed trampoline
.git/hooks/pre-push

# Run pre-push checks manually against the TRACKED file directly (bypasses the trampoline, so the
# stale-copy guard's own marker variable must be set explicitly -- D19):
DISCIPLINE_HOOK_TRAMPOLINE=1 sh fsi-app/.discipline/hooks/pre-push

# Bypass in a genuine emergency
git commit --no-verify
git push --no-verify
```

## What changed in the slim refactor (audit-driven deletions)

**Deleted 12 attestation rules** (rules 001-011 + 013): all attested behavior the engine could not verify. Zero documented catches across 33 hours live (rules 001-011) or 24 hours (rule 013). Same shape as the reverted rule 015. Operator's 5e3ae41 revert rationale ("ceremony rather than enforcement") applied uniformly.

**Deleted 5 fitness functions** (F1, F3, F4, F5, F7): F1's migration is complete and the deprecated column is renamed (low regression risk). F3 protects an invariant that has never been threatened (51 lines for a never-fire defense). F4 already forced ADR-008's decision (mission accomplished). F5 bypasses spread + variable-only inserts which are the realistic shape of brief-gen code, defeating its own purpose. F7 generates 11 false-positives via fuzzy prose matching.

**Deleted 8 consistency checks** (C1, C2, C5, C6, C7, C8, C9, C10): C1's regex too permissive (any mention anywhere passes). C2 zero catches; inventory was atomically bootstrap-populated. C5/C6 use the wrong source-of-truth (env vars + crons live in Vercel dashboard / vercel.json itself). C7 duplicates ADR-loader's frontmatter validation. C8 trivially satisfied by listing each OBS once. C9 has nothing to verify when the engine is frozen. C10 is **self-documented as "currently a no-op"** in its own file (lines 86-88).

**Deleted 6 inventory files** (skills.md, routes.md, env-vars.md, cron-jobs.md, decisions.md, obs-status.md): each was the data source for one of the deleted C-checks. Without an enforcement check, the inventory has no automated maintenance and becomes stale documentation that misleads more than it informs.

**Kept (8)**: rule 012, rule 014, F2, F6, F8, F9, C3, C4 — every one has a documented real catch in git log, plus the pre-push hook as the new top-level gate.

**Total removed**: ~6,000 LOC (mechanism files + their tests + inventory files).

## Source files

- Engine: `fsi-app/.discipline/`
- Local hooks (installed trampoline, D19 -- never a copy of the tracked hook's own content): `.git/hooks/commit-msg`, `.git/hooks/pre-push`
- CI workflow: `.github/workflows/discipline.yml`
- Operator install procedure: `fsi-app/.discipline/INSTALL.md`

## Related

- [ADR-005-discipline-enforcement-layered-architecture](../decisions/ADR-005-discipline-enforcement-layered-architecture.md) — the discipline-engine manifest / mechanism roster this ADR defines is tracked in the discipline inventory
- [worktrees](./worktrees.md) — C4 consistency check gates that live worktrees equal worktrees.md entries; it caught the remediation-discipline orphan in CI
- [ADR-008-urgency-score-default](../decisions/ADR-008-urgency-score-default.md) — F4 fitness function (now retired) is tracked in the discipline inventory
- [ADR-009-adr-system-architecture](../decisions/ADR-009-adr-system-architecture.md) — rule 013 + adr-loader mechanism this ADR defines are tracked in the discipline inventory
- [components](./components.md) — Fitness function F8 (client-server-tier-boundary) polices the body.tier assignment that CanonicalSourceReview sends — same tier-boundary contract
