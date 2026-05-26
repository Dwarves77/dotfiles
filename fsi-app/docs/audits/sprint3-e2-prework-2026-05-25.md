# Sprint 3 E2 — Skill cleanup prework: scope ambiguity surface

**Date:** 2026-05-25
**Status:** SCOPE AMBIGUITY. Holding for operator clarification before touching the rule.

---

## Dispatch brief language vs current skill state

The Sprint 3 dispatch brief Section 3 lists E2 as:

> "E2 | Skill cleanup | Sprint-followups-discipline 4 stale named rules (Dispatch-artifact commit-summary, Inventory-artifact emission, ADR cross-reference, Inventory consistency). Cleanup pass."

The v3 completion report tracked this as:

> "E2 Skill cleanup dispatch: sprint-followups-discipline 4 stale named rules retirement."

But reading `fsi-app/.claude/skills/sprint-followups-discipline/SKILL.md` directly, the named-rules state is:

### Already retired (line 190 of SKILL.md, "Post-slim engine state (2026-05-21)")

The 2026-05-21 slim refactor retired 12 named rules including the first three on the brief's list:

- ~~Dispatch-artifact commit-summary~~ — RETIRED 2026-05-21
- ~~Inventory-artifact emission~~ — RETIRED 2026-05-21
- ~~ADR cross-reference~~ — RETIRED 2026-05-21

Plus 9 others (Inference correction, Planning-doc, Sources-schema-touch precondition, Sweep-discipline, Source-credibility-model load-trigger, Remediation-discipline load-trigger, Batch-script resilience, Plan-skill hybrid, Verification-before-completion).

### Still active (line 214-230 of SKILL.md, "Inventory consistency rule")

> "This is the only named binding rule that survived the 2026-05-21 slim refactor (rule 014). The 2 surviving consistency checks (C3 migrations + C4 worktrees) both have documented real catches."

The rule has a runtime enforcement file at `fsi-app/.discipline/rules/014-inventory-consistency.mjs` invoked by the consistency runner. Documented catches:
- C3: migration 067 untracked on 2026-05-21
- C4: remediation-discipline worktree orphan on 2026-05-21

Both are real production-relevant catches, not ceremony.

## The ambiguity

The brief says "4 stale named rules" but only ONE rule (Inventory consistency) is still active. The other three have been retired since 2026-05-21.

Two possible interpretations of E2:

### Interpretation A — Document cleanup only

The brief means "scrub the historical mentions of the 3 retired rules + the way the Inventory consistency rule is currently described, all as housekeeping." No actual rule removal. Inventory consistency stays active.

- **Action:** clean up SKILL.md line 190 retirement-history section if it's verbose, polish the Inventory consistency section if it has cruft.
- **Risk:** none. Documentation-only change.

### Interpretation B — Retire Inventory consistency as well

The brief means literally "retire all 4 rules including the one that's still active." This would:

- **Action:** delete or mark-deprecated `fsi-app/.discipline/rules/014-inventory-consistency.mjs`, the consistency runner if no other rule invokes it, and remove the rule documentation from SKILL.md.
- **Risk:** real. Inventory consistency catches actual drift (migration tracking, worktree orphans). Retiring it removes ongoing protection. The 2 surviving C-checks both had catches inside their first 24 hours of life.

## Which is right?

**Interpretation A is my default reading** because:

1. The brief's language is "Cleanup pass" not "Retire all 4 rules" — cleanup implies housekeeping, not rule removal.
2. Inventory consistency has documented production catches; retiring it would be a substantive non-housekeeping action requiring stronger authorization than "cleanup."
3. Per operator standing rule: "No new fitness functions, ADRs, or discipline rules." The symmetric reading is also "no rule removal without explicit operator-stated correction" — the rule's removal isn't documented in the operator-stated v3 corrections section anywhere I can find.
4. The brief's listing of "Inventory consistency" alongside three already-retired rules suggests an inventory drift in the brief itself (the operator may have been listing rules-historically-present-in-the-skill rather than rules-still-active).

**But Interpretation B would be honest if the operator's intent is to remove all named binding rules and lean purely on operator review + verification-before-authorization for discipline.** That's a defensible engine-philosophy choice; it's just bigger than housekeeping.

## Recommended next step

Surface this to operator for clarification.

If Interpretation A: small commit cleaning up the SKILL.md line 190 retirement-history paragraph and tightening the Inventory consistency rule section. Low-impact docs-only change. Estimated 30 minutes of work. Could fold this into the next idle window.

If Interpretation B: needs separate audit on what depends on the consistency runner (does anything else invoke it besides rule 014?), then plan the removal as a real dispatch with retire-checklist + replacement plan for the drift catches. Estimated several hours and a separate decision artifact.

## Open question for operator

E2 Interpretation A (docs cleanup only) or Interpretation B (full Inventory consistency retirement)?

Holding E2 execution until verdict.
