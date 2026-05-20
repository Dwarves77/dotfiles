# Discipline Engine Inventory

Catalog of the Rules-as-Code (RaC) discipline engine at `fsi-app/.discipline/` plus its enforcement integrations. Maintained per the 11th binding rule (Inventory-artifact emission).

## Status

**Sprint Foundation complete (2026-05-20).** All 11 binding rules from `sprint-followups-discipline` are now executable specifications; every commit landing on master is gated by both a local `commit-msg` hook and a CI workflow.

| Wave | Commit | Deliverable |
|---|---|---|
| 0 | fab2e0e | Engine scaffold (runner, lib, manifest) + 2 example rules (008, 011) + 65 tests |
| 1 | (parallel agent work; integrated in Wave 2) | Rule modules for 001-007, 009, 010 (3 background agents in parallel worktree-style isolation) |
| 2 | d6e26d2 | Manifest registers all 11 rules; full test count 211 |
| 3 | (parallel agent work; integrated in Wave 4) | `commit-msg` hook + install script + GitHub Actions CI workflow |
| 4 | (current commit) | REPO_ROOT class-fix (3 files; removes hardcoded path), CI workflow simplification, hook + CI + inventory integration, 217 tests |

## Architecture

```
fsi-app/.discipline/
  README.md                       contract doc for rule authors
  INSTALL.md                      operator install + bypass docs
  manifest.mjs                    rule registry (11 rules)
  runner.mjs                      engine entry: commit-msg / ci / fixture modes
  install-hooks.mjs               idempotent installer for local hooks
  install-hooks.test.mjs          6 unit tests for the installer
  runner.test.mjs                 6 integration tests for the engine
  hooks/
    commit-msg                    POSIX shell hook; invokes runner.mjs --mode=commit-msg
  lib/
    result.mjs                    PASS / FAIL / SKIP result shape
    context.mjs                   CheckContext builder + getRepoRoot()
    predicates.mjs                shared check helpers
    predicates.test.mjs           39 predicate tests
  rules/
    001-sweep-discipline.mjs                       + .test.mjs (13 tests)
    002-source-credibility-load-trigger.mjs        + .test.mjs (16 tests)
    003-remediation-discipline-load-trigger.mjs    + .test.mjs (17 tests)
    004-batch-script-resilience.mjs                + .test.mjs (16 tests)
    005-inference-correction.mjs                   + .test.mjs (14 tests)
    006-planning-doc.mjs                           + .test.mjs (14 tests)
    007-sources-schema-touch.mjs                   + .test.mjs (18 tests)
    008-dispatch-artifact-commit-summary.mjs       + .test.mjs (10 tests)
    009-plan-skill-hybrid.mjs                      + .test.mjs (18 tests)
    010-verification-before-completion.mjs         + .test.mjs (19 tests)
    011-inventory-artifact-emission.mjs            + .test.mjs (13 tests)

.github/workflows/
  discipline.yml                  GitHub Actions: validate-commits + test-discipline-engine jobs
```

## Rule registry (production)

| ID | Name | Attestation line(s) checked | Source skill section |
|---|---|---|---|
| 001 | Sweep-discipline | `Sweep-enumeration: <surface> via <method> N items` | Sweep-discipline rule |
| 002 | Source-credibility load-trigger | `Skill-loaded: source-credibility-model` | Source-credibility-model load-trigger rule |
| 003 | Remediation-discipline load-trigger | `Skill-loaded: remediation-discipline` + `Class-vs-instance:` | Remediation-discipline load-trigger rule |
| 004 | Batch-script resilience | `Batch-resilience: <script> consumes ...` (per file) | Batch-script resilience rule |
| 005 | Inference correction | `Inference-correction: <claim> → <fact>` or no-op form | Inference correction rule |
| 006 | Planning-doc | `Planning-doc: skill-scope verified for ...` | Planning-doc rule |
| 007 | Sources-schema-touch | `Schema-touch-precondition: <columns>; origin-migration NNN; ...` | Sources-schema-touch precondition |
| 008 | Dispatch-artifact commit-summary | `Loop-closure: OBS-N ...; DP-N ...` | Dispatch-artifact commit-summary rule |
| 009 | Plan-skill hybrid | `Plan-file: <path>` (file must exist) | Plan-skill hybrid rule |
| 010 | Verification-before-completion | `Verification: ran <cmd>; observed <result>` | Verification-before-completion required rule |
| 011 | Inventory-artifact emission | `Inventory-emission: docs/inventories/<type>.md +N entries` | Inventory-artifact emission rule |

## Operator install + use

```bash
# One-time install of the commit-msg hook into .git/hooks/
node fsi-app/.discipline/install-hooks.mjs

# List all rules
node fsi-app/.discipline/runner.mjs --list

# Validate a specific past commit (CI mode)
node fsi-app/.discipline/runner.mjs --mode=ci --commit=<sha>

# Validate every commit in a range
node fsi-app/.discipline/runner.mjs --mode=ci --range=origin/master..HEAD

# Bypass in a genuine emergency
git commit --no-verify   # leaves a detectable trail; Phase 6 surfaces bypass usage
```

## Test command

```bash
# All 217 discipline tests
node --test \
  fsi-app/.discipline/lib/*.test.mjs \
  fsi-app/.discipline/rules/*.test.mjs \
  fsi-app/.discipline/runner.test.mjs \
  fsi-app/.discipline/install-hooks.test.mjs
```

Test count by file:

| File | Tests |
|---|---|
| `lib/predicates.test.mjs` | 39 |
| `rules/001-sweep-discipline.test.mjs` | 13 |
| `rules/002-source-credibility-load-trigger.test.mjs` | 16 |
| `rules/003-remediation-discipline-load-trigger.test.mjs` | 17 |
| `rules/004-batch-script-resilience.test.mjs` | 16 |
| `rules/005-inference-correction.test.mjs` | 14 |
| `rules/006-planning-doc.test.mjs` | 14 |
| `rules/007-sources-schema-touch.test.mjs` | 18 |
| `rules/008-dispatch-artifact-commit-summary.test.mjs` | 10 |
| `rules/009-plan-skill-hybrid.test.mjs` | 18 |
| `rules/010-verification-before-completion.test.mjs` | 19 |
| `rules/011-inventory-artifact-emission.test.mjs` | 13 |
| `runner.test.mjs` | 6 |
| `install-hooks.test.mjs` | 6 |
| **Total** | **217** |

## Enforcement layers

| Layer | Where | When | Bypass |
|---|---|---|---|
| Local hook | `.git/hooks/commit-msg` (installed from `fsi-app/.discipline/hooks/commit-msg`) | Every `git commit` | `git commit --no-verify` (standard git) |
| CI workflow | `.github/workflows/discipline.yml` | Push to master + every PR targeting master | Cannot be bypassed locally; requires bypassing branch protection in GitHub |

CI is the safety net for local-bypass abuse. The Phase 6 dashboard (future sprint) will surface bypass patterns in audit reports.

## Maintenance triggers

| Change | Required inventory update |
|---|---|
| Add a rule | Append to `manifest.mjs`; add row to rule registry table above; add `+1 entry (rule NNN)` Inventory-emission |
| Modify an existing rule's check semantics | Update attestation column in rule registry table |
| Add a predicate | Update predicate library inventory in `README.md` |
| Modify the hook script | Update INSTALL.md if behavior changes |
| Modify CI workflow | Update Enforcement layers section if triggers or jobs change |

## Source files

- Engine: `fsi-app/.discipline/`
- Source-of-truth rules (prose): `fsi-app/.claude/skills/sprint-followups-discipline/SKILL.md`
- Local hook (installed copy): `.git/hooks/commit-msg`
- CI workflow: `.github/workflows/discipline.yml`
- Operator install procedure: `fsi-app/.discipline/INSTALL.md`
