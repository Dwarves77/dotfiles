# Discipline Engine Inventory

Catalog of the Rules-as-Code (RaC) engine at `fsi-app/.discipline/`. Maintained per the 11th binding rule (Inventory-artifact emission).

## Status

**Created 2026-05-20** (Sprint Foundation Wave 0 scaffold landing). The engine converts the 11 binding rules from `fsi-app/.claude/skills/sprint-followups-discipline/SKILL.md` from prose into executable specifications gating every commit on master.

## Architecture

```
fsi-app/.discipline/
  README.md              contract doc for rule authors
  manifest.mjs           rule registry (main session owns; agents do not modify)
  runner.mjs             engine entry: builds context, applies triggers, runs checks, prints results
  lib/
    result.mjs           PASS / FAIL / SKIP result shape
    context.mjs          CheckContext builder (commit-msg mode, ci mode, fixture mode)
    predicates.mjs       shared check helpers: commit-message lookups, file-pattern matching, composite predicates
    predicates.test.mjs
  rules/
    NNN-name.mjs         one module per binding rule, NNN = 001..011
    NNN-name.test.mjs    co-located unit tests
  runner.test.mjs        integration tests for the engine end-to-end
```

## Wave 0 deliverable (scaffold + 2 example rules)

| Component | Status |
|---|---|
| Engine (`runner.mjs`) | Landed |
| Predicate library (`lib/predicates.mjs`) | Landed |
| Result module (`lib/result.mjs`) | Landed |
| Context builder (`lib/context.mjs`) | Landed |
| Manifest (`manifest.mjs`) | 2 rules registered (008, 011) |
| Test suite | 65 tests, all passing |
| Rule 008 (Dispatch-artifact commit-summary) | Landed; pure message-pattern check |
| Rule 011 (Inventory-artifact emission) | Landed; composite message + file-coverage check |
| Rules 001-007, 009, 010 | Wave 1 (3 parallel agents) |
| Pre-commit hook | Wave 3 |
| CI workflow | Wave 3 |

## Rule registry (target state after Wave 2)

| ID | Name | Source skill section |
|---|---|---|
| 001 | Sweep-discipline | Sweep-discipline rule |
| 002 | Source-credibility load-trigger | Source-credibility-model load-trigger rule |
| 003 | Remediation-discipline load-trigger | Remediation-discipline load-trigger rule |
| 004 | Batch-script resilience | Batch-script resilience rule |
| 005 | Inference correction | Inference correction rule |
| 006 | Planning-doc | Planning-doc rule |
| 007 | Sources-schema-touch | Sources-schema-touch precondition |
| 008 | Dispatch-artifact commit-summary | Dispatch-artifact commit-summary rule (LANDED) |
| 009 | Plan-skill hybrid | Plan-skill hybrid rule |
| 010 | Verification-before-completion required | Verification-before-completion required rule |
| 011 | Inventory-artifact emission | Inventory-artifact emission rule (LANDED) |

## How to add a new rule (Wave 1 agent contract)

1. Create `rules/NNN-name.mjs` exporting a single `rule` object per the contract in `README.md`.
2. Create `rules/NNN-name.test.mjs` with trigger + check unit tests.
3. Do NOT modify `manifest.mjs`, `lib/`, `runner.mjs`, or other rule files. Main session integrates in Wave 2.
4. If you need a new predicate, surface in dispatch report; do not add to `lib/predicates.mjs` from a worktree.

## Test command

```bash
node --test fsi-app/.discipline/lib/*.test.mjs fsi-app/.discipline/rules/*.test.mjs fsi-app/.discipline/runner.test.mjs
```

Pre-commit hook + CI workflow (Wave 3) both invoke `runner.mjs` and inherit its exit-code contract:

- `0` = all applicable rules PASS or SKIP
- `1` = at least one rule FAIL
- `2` = engine error

## Maintenance trigger

Any dispatch that adds, removes, or restructures the discipline engine MUST update this inventory + emit `Inventory-emission: docs/inventories/discipline.md ...` line.

## Source files

- Engine: `fsi-app/.discipline/`
- Source-of-truth rules (prose): `fsi-app/.claude/skills/sprint-followups-discipline/SKILL.md`
- Rule manifest (executable): `fsi-app/.discipline/manifest.mjs`
