---
id: ADR-005
title: Discipline enforcement layered architecture
status: accepted
date: 2026-05-20
scope:
  - "fsi-app/.discipline/"
  - "fsi-app/.claude/skills/"
  - "docs/decisions/"
  - "docs/inventories/"
  - ".github/workflows/discipline.yml"
supersedes: null
related:
  - ADR-009
---

## Context

A solo + AI-assisted development practice produces a high write rate against a single codebase. Without discipline scaffolding, the failure modes are predictable: convention drift (decisions live in docstrings or operator memory), test-passes-but-build-fails gaps (one layer of verification standing in for another), and silent re-violation of prior decisions when new work overlaps old surfaces.

Operator's articulated vision (Sprint Architecture conversation, 2026-05-20):

1. Skills aren't documented; they're mechanically applied to code.
2. Decisions aren't discussed; they're programmatically protected.
3. Inventories aren't generated; they're consistency-checked against reality.

Each line maps to a distinct enforcement layer. Each layer catches what the layer above cannot.

## Decision

Five-layer enforcement architecture, built in sequence:

**Layer 1: Attestation rules** (Sprint Foundation, landed)
- 11 binding rules + 1 content-check rule = 12 total in `fsi-app/.discipline/rules/`
- Pre-commit hook + CI workflow check commit message attestation lines (Loop-closure, Inventory-emission, Skill-loaded, etc.) and forbidden file content (rule 12: hardcoded user-home paths)
- Mechanism: `runner.mjs` with `--mode=commit-msg` (hook) or `--mode=ci` (workflow)

**Layer 2: Application fitness functions** (Sprint Architecture, landed)
- 9 fitness functions in `fsi-app/.discipline/fitness/` (F1-F9)
- Whole-repo scans of code patterns + the project's TypeScript compilation
- CI workflow runs `fitness-check` job; recommended exclusion from commit-msg hook by default (would slow commits)
- Mechanism: `fitness/runner.mjs` enumerates files per function spec, reads content, runs check

**Layer 3: Decision protection** (ADR system, this dispatch)
- ADRs in `docs/decisions/ADR-NNN-*.md` with YAML frontmatter (id, title, status, date, scope, supersedes, related)
- 13th binding rule cross-references commit's touched files against accepted ADRs' scope; requires `ADR-Reference: ADR-NNN` trailer for each intersecting ADR
- Override: `ADR-Override: ADR-NNN (rationale: ...)` trailer signals explicit contradiction; surfaces in audit
- Mechanism: ADR loader + `rules/013-adr-cross-reference.mjs`

**Layer 4: Cross-skill consistency check** (Layer 4 dispatch, landed)
- Inventories asserted against reality. Reality-scanner enumerates the codebase + skill definitions + ADR scope, compares to documented state in `docs/inventories/`, fails on drift.
- Inverts rule 11's "if you touched X, update X.md" direction with "scan reality, verify it matches X.md."
- Implementation: 10 C-checks at `fsi-app/.discipline/consistency/checks/` (C1 skills, C2 routes, C3 migrations, C4 worktrees, C5 env-vars, C6 cron-jobs, C7 decisions, C8 obs-status, C9 discipline manifest, C10 cross-skill refs).
- 14th binding rule (`fsi-app/.discipline/rules/014-inventory-consistency.mjs`) gates commits touching `docs/inventories/*.md` on the consistency runner exit 0.
- Override mechanism: `Consistency-Override: C-N (rationale: ...; remediation-deadline: YYYY-MM-DD)` trailer per the rule 13 override pattern.
- Audit script extension: `dispatch/audit.mjs` surfaces consistency overrides under "Consistency overrides (Layer 4; documented drift with remediation deadlines)".

**Layer 5: Observability** (deferred; future sprint)
- Dashboard surfacing override usage, bypass patterns, OBS state distribution, dispatch UUID audit aggregates
- Triggered by Phase 6 in Sprint Foundation dispatch language
- Not part of the customer-facing pre-requisite path

Customer-facing work (Build 8 Research and onward) resumes after Layer 4 (cross-skill consistency) lands. Layer 5 is deferred indefinitely and does not block customer builds.

**Note (2026-05-21 postscript A)**: a 15th binding rule (post-push verification) + ADR-010 were briefly added 2026-05-21 to formalize a verification-trailer requirement on every substantial commit. The rule attested to the parent commit's CI/Vercel state via trailers. After one dispatch using it, the operator + Claude review concluded the rule was ceremony rather than enforcement: it codified a habit (querying gh api after push) without changing behavior, since the gh api query was already happening and the trailer was a transcription of the query result. The rule + ADR-010 + this Layer 5 split were reverted; replaced with a behavioral commitment (proactive operator-facing CI-failure reporting). The original Layer 5 framing stands.

**Note (2026-05-21 postscript B — engine slim refactor)**: an evidence-based audit of the engine (per-mechanism git-log search for catches + self-inflicted failures) found that 25 of 33 mechanisms had zero documented catches in their lifetimes and several were structurally unable to catch what they claimed. The operator authorized a slim refactor that cut the engine to the 8 mechanisms with documented real catches or non-negotiable invariants:

| Layer | What remains |
|---|---|
| Layer 1 (attestation rules) | Rule 012 hardcoded-user-home path + Rule 014 inventory consistency. Rules 001-011 + 013 deleted (zero catches in 23-24h lifetime; structurally same shape as the reverted rule 015). |
| Layer 2 (fitness functions) | F2 admin-routes-isPlatformAdmin + F6 migrations numeric ordering + F8 client-server tier boundary + F9 build compiles. F1/F3/F4/F5/F7 deleted (F1 migration complete + low regression risk; F4 mission accomplished via ADR-008; F5 bypassed spread/variable-only inserts; F7 generated 11 false-positives via fuzzy prose match; F3 invariant never threatened). |
| Layer 3 (decision protection) | ADRs remain at docs/decisions/. Rule 013 (ADR cross-reference trailer) deleted; ADR loader retained as a parsing helper. Cross-reference trailers no longer required. |
| Layer 4 (cross-skill consistency) | C3 migrations.md reality + C4 worktrees.md reality (both caught real drift in their 24h lifetime). C1/C2/C5/C6/C7/C8/C9/C10 deleted + their 6 derived inventory files removed (C5/C6 wrong source-of-truth; C10 self-documented as no-op; others zero catches). |
| Layer 5 (observability) | Unchanged; still deferred. |

Added in the same dispatch: a **pre-push hook** at `fsi-app/.discipline/hooks/pre-push` that runs 4 CI-parity checks locally before push (untracked critical-surface gate, consistency runner, discipline + fitness tests, tsc --noEmit). Closes the local-green/CI-red class that motivated rule 15 without requiring trailer ceremony.

Commit messages return to normal: subject + body, no required trailers. The audit script at `dispatch/audit.mjs` still parses historical trailer commits for retrospective queries; it gracefully degrades on commits without trailers (no longer expected on new commits).

Full audit rationale + per-item disposition at `docs/plans/dead-code-disposition-2026-05-21.md`.

## Consequences

- Each layer's failures are mechanical; each layer has its own gate (hook + CI for Layers 1+2+3; dedicated check for Layer 4).
- Drift across layers becomes visible at audit time: a dispatch UUID can be queried for "what skills loaded, what fitness functions ran, what ADRs were referenced, what inventories were updated."
- Layer 5 (observability) is the only deferred layer; customer-facing work doesn't wait for it.
- Total infrastructure cost before customer work resumes: ~4 days (Foundation + Architecture + ADR + Cross-skill consistency), per operator's explicit sequencing.

## Alternatives Considered

- **Single-layer (just attestation)**: rejected. Phase 1.5 demonstrated that attestation alone misses application-layer violations (F8 case) and verification-surface gaps (OBS-64 case).
- **All layers in one engine**: rejected per OBS-59 migration plan (attestation vs content vs application are conceptually distinct shapes; separate systems evolve cleaner).
- **Skip ADR system, codify decisions in skills**: rejected. Skills are platform-wide policy documents; ADRs are point-in-time decisions with potential to be superseded. Different lifecycles.
- **Five-layer (chosen) with Layer 5 deferred**: customer-value pressure is real; observability is value-additive but not gating; deferral is operator-acceptable per Sprint Architecture dispatch language.

## References

- Sprint Foundation dispatch + Sprint Architecture dispatch + ADR System dispatch (this dispatch)
- caros-ledge-platform-intent skill (Value Delivery Check rule that requires articulating customer-vs-infrastructure tradeoffs)
- sprint-followups-discipline SKILL.md (the 12 attestation rules + 13th rule from this dispatch)
- remediation-discipline SKILL.md (Signal 5 from Sprint Architecture)
- OBS-62 (worked example of mechanical-encoding-of-architectural-decision pattern)
- OBS-64 (worked example of verification-surface-gap pattern; F9 closure)
