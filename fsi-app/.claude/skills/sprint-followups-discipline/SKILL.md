---
name: sprint-followups-discipline
description: Sprint followup loop-closure discipline plus binding design-principle enforcement for Caro's Ledge phase and sprint work. Every design dispatch and implementation dispatch on any Caro's Ledge sprint sequence (Sprint 1, Sprint 2, future sprints) and any phase (5, 6, 7, 8, 9, 10, 11, future phases) MUST read TWO inputs: (1) the current sprint's followups doc (enumerate every open OBS entry, cover or defer with reasoning), and (2) `docs/design/design-principles.md` (and `docs/design/ux-laws.md`, DP-2) (verify the dispatch's design complies with every DP entry, binary yes/no). The dispatch report carries an OBS coverage table AND a DP compliance section. Without this discipline OBS entries become write-only and DP violations ship unnoticed; either way operator-experience friction compounds. Loads alongside domain-relevant skills (e.g. environmental-policy-and-innovation for intelligence_items work, frontend-design for UI work).
when_to_load:
  - "Every Caro's Ledge design dispatch (any sprint, any phase)"
  - "Every Caro's Ledge implementation dispatch (any sprint, any phase)"
  - "Sprint planning or sequencing dispatches that allocate scope across phases"
  - "Skill-load reviews and standing-rule updates that affect phase-dispatch defaults"
  - "Borderline cases (small refactors with design choices): default to load"
when_to_skip:
  - "Investigation-only dispatches (capture new OBS but no loop closure owed)"
  - "Hotfix dispatches scoped to a single defect with no design surface"
  - "Research-only dispatches with no design or implementation output"
  - "Conversation, status-check, and report-only dispatches"
---

# Sprint Followups Discipline

## Reference index

Everything not stated in this core moved verbatim, unreworded, to `references/`. Read the file whose trigger fires:
- `references/why-and-cover-vs-defer.md`: why the skill exists; how to judge a cover or a deferral (acceptable and unacceptable reasoning)
- `references/output-format-and-cross-reference.md`: writing the dispatch report: OBS coverage table and DP compliance section formats, cross-reference rule, new OBS found mid-dispatch
- `references/engine-state-and-secrets-consistency.md`: post-slim engine state (2026-05-21) and the secrets-topology consistency rule (SF-11)
- `references/anti-patterns-worktree-integration.md`: the anti-pattern list, worktree path convention, integration with the standing skill-load rule
- `references/worked-example.md`: one full worked example of a design dispatch report

BINDING: references/engine-state-and-secrets-consistency.md, read before changing the discipline engine or any named binding rule (section: Post-slim engine state)

## Core Rule

Every design dispatch and every implementation dispatch on a Caro's Ledge sprint phase MUST close the loop on two inputs:

1. **The current sprint's followups doc** (e.g. `docs/sprint-1/followups.md`). The agent reads it in full, enumerates every open OBS entry, and for each one either incorporates the fix into the dispatch scope or explicitly defers with reasoning. The dispatch report carries an OBS coverage table.
2. **`docs/design/design-principles.md` (and `docs/design/ux-laws.md`, DP-2)** (the cross-sprint binding design principles registry). The agent reads every DP-N entry, applies each entry's compliance test to the dispatch's design, and reports binary compliance status. The dispatch report carries a DP compliance section.

No exceptions on either input. The followups doc covers what is in-flight; the design principles registry covers what is binding across sprints. A dispatch that closes the loop on OBS entries but ships a DP violation has failed half the discipline, and vice versa.

This is a loop-closure discipline, not a paperwork exercise. The operator captures findings during sprint execution as numbered OBS entries (OBS-1, OBS-2, ...) because they recur otherwise. The operator codifies cross-sprint axioms as DP entries (DP-1, DP-2, ...) because design dispatches otherwise rediscover and re-violate the same constraints. Without enforced loop closure on both, the entries become write-only and the operator-experience friction compounds across sprint sequences.

## When to Apply

Apply this skill on:

- Design dispatches for any Caro's Ledge sprint phase (the canonical case: a "design Phase N" dispatch).
- Implementation dispatches for any Caro's Ledge sprint phase (the canonical case: a "build Phase N per the design doc" dispatch).
- Sprint planning or sequencing dispatches that allocate scope across phases.
- Skill-load reviews and standing-rule updates that affect phase-dispatch defaults.

Do NOT apply this skill on:

- Investigation-only dispatches (e.g. "audit the routing pipeline and report"). The investigation may surface new OBS entries, in which case capture them in the followups doc, but the skill's loop-closure obligation does not apply to dispatches whose deliverable is investigation rather than design or implementation.
- Hotfix dispatches scoped to a single defect (e.g. "the regulations index page is throwing on null jurisdiction"). The hotfix carries no design surface to attach OBS coverage to. If the hotfix surfaces a related OBS or clears one, note it; otherwise proceed.
- Research-only dispatches with no design or implementation output.
- Conversation, status-check, and report-only dispatches.

If the dispatch is borderline (e.g. a small refactor that also makes design choices), default to applying the skill. The cost of running the loop-closure check on a small dispatch is low; the cost of missing an OBS on a phase dispatch is high.

## What to Do

The skill imposes a six-step protocol on the in-scope dispatch:

### Step 1: Locate the current followups doc and the design-principles registry

The followups doc lives at `docs/sprint-N/followups.md` where N is the active sprint number. The agent derives N from dispatch context (sprint number in the brief, branch name like `feat/sprint-N-...`, or the most recent sprint directory under `docs/`). If multiple sprints have followup docs, read the one matching the dispatch's sprint. If a sprint number cannot be derived, HALT and ask the operator before proceeding.

The design principles registry lives at `docs/design/design-principles.md` (and `docs/design/ux-laws.md`, DP-2) (cross-sprint, not per-sprint). Path is fixed.

### Step 2: Read both inputs in full

Read the entire followups doc, not just the entries the agent expects to be relevant. OBS entries cross-reference each other, and the agent's expectation of relevance is often wrong (OBS-14 in Sprint 1 is named "triage UI" but cross-references OBS-4 source-column tracking, OBS-13 jurisdictions gate, and OBS-9 classifier feedback loop, none of which sound like triage-UI scope at first reading).

Read every DP-N entry in `docs/design/design-principles.md` (and `docs/design/ux-laws.md`, DP-2). DP entries are short and binding; there is no "if it sounds relevant" filter. A DP that does not apply to the dispatch's surface still gets a row in the DP compliance section ("Not applicable, reason: ...") so the reviewer can verify the agent read it.

### Step 3: Enumerate every open OBS and classify it

For each OBS entry, classify it into one of four states:

- **Open.** No resolution noted on the entry. Default state.
- **Implemented.** Code shipped, migration applied, or design document published that closes the finding. The entry carries an "Implemented" note with a PR or commit reference. Treat as not requiring further action UNLESS the current dispatch would reopen the finding (e.g. a refactor that strips out the implementation).
- **Cleared.** Determined to be a non-issue, superseded by another OBS, or rendered moot by upstream changes. The entry carries a "Cleared" note with reasoning. Treat as not requiring further action.
- **Deferred.** Explicitly punted to a later sprint or phase with a named owner. The entry carries a "Deferred to [owner]" note. Treat as not requiring action in the current dispatch UNLESS the current dispatch IS the named owner.

Open and Deferred-to-this-owner entries require action in the dispatch. Implemented and Cleared entries do not, but listing them in the coverage table shows the agent read them and made a deliberate non-action call.

### Step 4: For each open OBS, decide cover or defer

For each open OBS, the agent decides:

- **Cover.** The current dispatch's scope incorporates the fix. The dispatch's deliverable (design spec, implementation, PR) addresses the finding. Cite the OBS in the dispatch deliverable so the connection is reviewable.
- **Defer with reasoning.** The current dispatch is the wrong owner for this OBS. The dispatch report names the OBS, the actual owner (a different phase, a different sprint, a different skill domain), and the reasoning. Update the OBS entry in the followups doc with a "Deferred to [owner]" note so the next dispatch reading the doc sees the assignment.

### Step 5: Apply each DP's compliance test to the dispatch's design

For each DP-N entry in the registry, apply the entry's compliance test (a binary yes/no question stated in the DP entry) to the current dispatch's design.

- **Pass.** The dispatch's design satisfies the DP. Note the specific design element that proves compliance (a section reference, a UI element, a workflow description).
- **Fail.** The dispatch's design violates the DP. STOP and redesign. A DP failure is not a deferral candidate; DP entries are binding cross-sprint axioms and cannot be punted to a later dispatch. If the dispatch cannot be reshaped to comply, HALT and surface the conflict to the operator.
- **Not applicable.** The dispatch surface does not engage the DP (e.g. a Phase 6 ingest-wiring dispatch has no operator-surface scope, so DP-1 "Single-Pane Operator Review" is not applicable). State the reason. "Not applicable" without reasoning is treated as Fail.

"Partial compliance" is treated as Fail. DP entries are binary by construction (see `docs/design/design-principles.md` (and `docs/design/ux-laws.md`, DP-2) opening rules).

### Step 6: Emit the OBS coverage table AND the DP compliance section

Every in-scope dispatch report carries an OBS coverage table AND a DP compliance section. See the Output Format section below for the required structure of both.

## Inventory consistency rule

This is the only named binding rule that survived the 2026-05-21 slim refactor (rule 014). The 2 surviving consistency checks (C3 migrations + C4 worktrees) both have documented real catches.

**Binding rule.** Any commit on master modifying `docs/inventories/*.md` files MUST satisfy the consistency runner (2 C-checks). The runner verifies that inventories match codebase reality: every claimed entity exists, every existing entity is claimed, no orphans, no drift.

**Override.** `Consistency-Override: C-N (rationale: <non-empty text>; remediation-deadline: YYYY-MM-DD)` trailer per failing check. The remediation-deadline must be a future date. Override surfaces in audit; recurring overrides on the same check indicate deeper issue.

**Implementation.** Rule code at `fsi-app/.discipline/rules/014-inventory-consistency.mjs`. The rule invokes the consistency runner (`fsi-app/.discipline/consistency/runner.mjs`) and asserts exit 0 OR documented overrides for each failing check.

## Skill Load Confirmation

When this skill loads on a dispatch, the agent's pre-work report states:

- That this skill loaded
- The followups doc path the agent will read (e.g. `docs/sprint-1/followups.md`)
- That the agent will read `docs/design/design-principles.md` (and `docs/design/ux-laws.md`, DP-2) as the cross-sprint DP registry
- The dispatch type (design, implementation, or sprint planning) and how the skill applies

If any of these cannot be stated cleanly, HALT and surface the ambiguity to the operator before proceeding.
