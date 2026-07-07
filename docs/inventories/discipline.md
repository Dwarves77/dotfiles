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

Source: `fsi-app/.discipline/hooks/pre-push`. Installed by `install-hooks.mjs`. Runs on `git push`, BEFORE the push leaves the machine. Four steps mirror the CI workflow:

1. **Untracked critical-surface gate**: `git ls-files --others --exclude-standard` against critical paths (migrations, routes, ADRs, inventories, discipline). Catches the migration-067 class (file on disk locally, missing in CI checkout).
2. **Consistency runner**: `node fsi-app/.discipline/consistency/runner.mjs --quiet`. Catches C3/C4 drift.
3. **Discipline + fitness tests**: `node --test` on every test file in the engine. Catches rule/fitness regressions.
4. **TypeScript compile**: `(cd fsi-app && npx tsc --noEmit)`. Catches F9/Vercel break class.

Bypass (use sparingly): `git push --no-verify`. Hook is fail-closed on missing-node (unlike commit-msg which is fail-open) since the whole point is to prevent the push-fail-fix loop.

## Operator install + use

```bash
# One-time install of both hooks into .git/hooks/
node fsi-app/.discipline/install-hooks.mjs

# List all rules
node fsi-app/.discipline/runner.mjs --list

# Validate a specific past commit (CI mode)
node fsi-app/.discipline/runner.mjs --mode=ci --commit=<sha>

# Run pre-push checks manually (without pushing)
.git/hooks/pre-push

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
- Local hooks (installed copy): `.git/hooks/commit-msg`, `.git/hooks/pre-push`
- CI workflow: `.github/workflows/discipline.yml`
- Operator install procedure: `fsi-app/.discipline/INSTALL.md`

## Related

- [[ADR-005-discipline-enforcement-layered-architecture]] — the discipline-engine manifest / mechanism roster this ADR defines is tracked in the discipline inventory
- [[worktrees]] — C4 consistency check gates that live worktrees equal worktrees.md entries; it caught the remediation-discipline orphan in CI
- [[ADR-008-urgency-score-default]] — F4 fitness function (now retired) is tracked in the discipline inventory
- [[ADR-009-adr-system-architecture]] — rule 013 + adr-loader mechanism this ADR defines are tracked in the discipline inventory
- [[components]] — Fitness function F8 (client-server-tier-boundary) polices the body.tier assignment that CanonicalSourceReview sends — same tier-boundary contract
