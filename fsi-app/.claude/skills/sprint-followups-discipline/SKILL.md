---
name: sprint-followups-discipline
description: Sprint followup loop-closure discipline plus binding design-principle enforcement for Caro's Ledge phase and sprint work. Every design dispatch and implementation dispatch on any Caro's Ledge sprint sequence (Sprint 1, Sprint 2, future sprints) and any phase (5, 6, 7, 8, 9, 10, 11, future phases) MUST read TWO inputs: (1) the current sprint's followups doc (enumerate every open OBS entry, cover or defer with reasoning), and (2) `docs/design-principles.md` (verify the dispatch's design complies with every DP entry, binary yes/no). The dispatch report carries an OBS coverage table AND a DP compliance section. Without this discipline OBS entries become write-only and DP violations ship unnoticed; either way operator-experience friction compounds. Loads alongside domain-relevant skills (e.g. environmental-policy-and-innovation for intelligence_items work, frontend-design for UI work).
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

## Core Rule

Every design dispatch and every implementation dispatch on a Caro's Ledge sprint phase MUST close the loop on two inputs:

1. **The current sprint's followups doc** (e.g. `docs/sprint-1/followups.md`). The agent reads it in full, enumerates every open OBS entry, and for each one either incorporates the fix into the dispatch scope or explicitly defers with reasoning. The dispatch report carries an OBS coverage table.
2. **`docs/design-principles.md`** (the cross-sprint binding design principles registry). The agent reads every DP-N entry, applies each entry's compliance test to the dispatch's design, and reports binary compliance status. The dispatch report carries a DP compliance section.

No exceptions on either input. The followups doc covers what is in-flight; the design principles registry covers what is binding across sprints. A dispatch that closes the loop on OBS entries but ships a DP violation has failed half the discipline, and vice versa.

This is a loop-closure discipline, not a paperwork exercise. The operator captures findings during sprint execution as numbered OBS entries (OBS-1, OBS-2, ...) because they recur otherwise. The operator codifies cross-sprint axioms as DP entries (DP-1, DP-2, ...) because design dispatches otherwise rediscover and re-violate the same constraints. Without enforced loop closure on both, the entries become write-only and the operator-experience friction compounds across sprint sequences.

## Why the Skill Exists

Operator-observed findings during sprint execution are captured as numbered OBS entries in the current sprint's followups doc (e.g. `docs/sprint-1/followups.md`, `docs/sprint-2/followups.md`). The capture step is cheap and routine. The hard step is closing the loop in the next design or implementation dispatch that touches the relevant surface.

Concrete example from Sprint 1: OBS-14 captured that the triage UI lacks inline source metadata, forcing every triage decision into a multi-tab workflow. OBS-15 captured that briefs cite journal homepages without article-level source context (DOI, authors, abstract, publication date). Both findings have natural phase owners: OBS-14 belongs to Phase 7 (admin chrome and triage UI), OBS-15 belongs to Phase 6 (ingest wiring and brief generation) with a Phase 7 downstream consumer.

Without this skill's discipline:

- The Phase 6 design dispatch authors a brief-generation spec, ships, and never reads `docs/sprint-1/followups.md`. OBS-15 stays open. Sprint 2 inherits the same article-level source opacity. The operator surfaces the same finding again.
- The Phase 7 design dispatch scopes the triage UI based on the integrity-flag flow alone. OBS-13 (gate 7.2a all-rejected-jurisdictions rows), OBS-14 (inline source metadata), and the Phase-7-consumer half of OBS-15 all get missed. The triage UI ships, the operator opens it, the same friction recurs three different ways at once.

The skill prevents this. It enforces that every design or implementation dispatch on a phase explicitly addresses every open OBS, either by incorporating it or deferring it with reasoning that names the eventual owner.

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

The design principles registry lives at `docs/design-principles.md` (cross-sprint, not per-sprint). Path is fixed.

### Step 2: Read both inputs in full

Read the entire followups doc, not just the entries the agent expects to be relevant. OBS entries cross-reference each other, and the agent's expectation of relevance is often wrong (OBS-14 in Sprint 1 is named "triage UI" but cross-references OBS-4 source-column tracking, OBS-13 jurisdictions gate, and OBS-9 classifier feedback loop, none of which sound like triage-UI scope at first reading).

Read every DP-N entry in `docs/design-principles.md`. DP entries are short and binding; there is no "if it sounds relevant" filter. A DP that does not apply to the dispatch's surface still gets a row in the DP compliance section ("Not applicable, reason: ...") so the reviewer can verify the agent read it.

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

"Partial compliance" is treated as Fail. DP entries are binary by construction (see `docs/design-principles.md` opening rules).

### Step 6: Emit the OBS coverage table AND the DP compliance section

Every in-scope dispatch report carries an OBS coverage table AND a DP compliance section. See the Output Format section below for the required structure of both.

## How to Cover vs How to Defer

### Acceptable cover

- The OBS describes a Phase 7 triage UI gap, and the current dispatch designs the Phase 7 triage UI. Incorporate the gap into the spec.
- The OBS describes a brief-generation context gap, and the current dispatch builds brief generation. Incorporate the gap into the implementation.
- The OBS describes a backfill rollback pattern, and the current dispatch designs a new backfill. Apply the pattern in the design.

### Acceptable deferral reasoning

- "Different design owner. OBS-15 (article-level source context) belongs to Phase 6 ingest wiring; the current dispatch is Phase 7 triage UI. Phase 6 design dispatch will own incorporation; Phase 7 will own the downstream display surface once Phase 6 lands."
- "Different sprint owner. OBS-9 (classifier feedback loop) is explicitly Sprint 2 scope per operator decision; the current Sprint 1 dispatch defers, no action."
- "Out of dispatch surface. OBS-7 (Norway Fjords instrument_type pending counsel) is a single-row UPDATE pending external input; no code or design action available to the current dispatch."
- "Blocked on prerequisite. OBS-X depends on OBS-Y being resolved first; OBS-Y is open and Deferred to a different phase; current dispatch cannot act."

### Unacceptable deferral reasoning

- "Forgot." Not a reason. The skill exists specifically to prevent this.
- "Didn't seem relevant." If the OBS appears in the followups doc and the dispatch touches the relevant surface, the relevance call must be substantive, not vibes.
- "Out of scope" without naming the actual owner. Every deferral names the next owner so the followups doc carries forward a routing assignment, not a punt.
- "Will get to it later" without naming the later dispatch. "Later" is not a routing assignment.

## Cross-Reference Rule

OBS entries cross-reference each other. When the dispatch report cites an OBS, it surfaces the OBS's existing cross-references so the design connectivity is preserved.

Example: a Phase 7 design dispatch covering OBS-14 (triage UI inline source metadata) surfaces OBS-14's cross-references in the coverage table: OBS-4 (source_column tracking from migration 082), OBS-13 (all-rejected-jurisdictions gate), OBS-9 (Sprint 2 classifier feedback loop). The Phase 7 designer then knows the triage UI scope intersects with the classifier feedback loop's eventual feedback path and with the gate 7.2a rows, and can design the UI to accommodate both rather than discovering the coupling at implementation time.

The cross-reference surfacing is the agent's job. The dispatch report does not need to act on every cross-reference, but it does need to display them so the design reviewer sees the graph the OBS already encodes.

## Handling New OBS Surfaced During Execution

Implementation dispatches frequently surface new findings (CHECK constraint not in the design's pre-flight, trigger interaction not modeled, pooler limit not anticipated, operator workflow gap visible only in production). When a new finding surfaces:

1. Add a new OBS entry to the current sprint's followups doc with the next available number. Format matches the existing entries: source line, phase line, priority line, narrative.
2. Cross-reference any related existing OBS entries.
3. Note the new OBS in the dispatch report's "OBS surfaced during this dispatch" section.
4. If the new OBS has a clear owner that is NOT the current dispatch, note the routing.

Implementation reports MUST surface new OBS even when no existing OBS required coverage. The capture is the loop's input; missing the capture step breaks the loop for the next dispatch.

## Output Format Requirement

### Design dispatch reports

Carry both an OBS coverage table AND a DP compliance section in the dispatch report, immediately after the dispatch summary and before the design content.

**OBS coverage table:**

| OBS | State | Decision | Cross-references | Reasoning |
|---|---|---|---|---|
| OBS-13 | Open | COVER | OBS-14, OBS-9, DP-1 | Phase 7 design scope; adding third triage tab for all-rejected-jurisdictions rows per option 1; triage tab itself DP-1 compliant. |
| OBS-14 | Open | COVER | OBS-4, OBS-13, OBS-9, DP-1 | Phase 7 design scope; spec adds inline source metadata strip on every queue surface per DP-1. |
| OBS-15 | Open | DEFER | OBS-14, OBS-9, DP-1 | Phase 6 ingest-wiring owner for field generation; Phase 7 design notes downstream consumer of article-level fields with DP-1 compliance binding once Phase 6 lands. |
| OBS-7 | Open | DEFER | (none) | External dependency (counsel review); no design action available. |
| OBS-11 | Implemented | NO ACTION | (none) | Bracket pattern landed in `phase-5-backfill.mjs`; current dispatch does not reopen. |

**DP compliance section:**

| DP | Compliance test | Result | Evidence or reasoning |
|---|---|---|---|
| DP-1 (Single-Pane Operator Review) | Can the operator complete every related decision and edit on this single item without leaving the current screen, form, or workflow? | PASS | Design § 3.2 (triage surface) inlines flag, source metadata strip with edit-in-place, decision controls, audit-note field, and audit trail on one screen. § 3.4 (all-rejected-jurisdictions tab) inlines the same controls plus a canonical-replacement picker. Zero tab switches in any documented operator workflow. |

If a DP fails, the section MUST say so and the dispatch redesigns before report submission. If a DP is not applicable, state the reason ("no operator-surface scope in this dispatch", "no actions to consolidate; read-only display").

### Implementation dispatch reports

Carry an OBS coverage table and a DP compliance section with the same structure, plus a separate "OBS surfaced during this dispatch" section listing any new entries:

```
## OBS Surfaced During This Dispatch

- **OBS-N: [title]**, captured at `docs/sprint-N/followups.md`. Source: [where it surfaced]. Owner: [phase or sprint]. Cross-references: [related OBS].
```

### Sprint planning or sequencing dispatches

Carry the coverage table for OBS entries the planning decision affects. Use the Decision column to surface scope assignments rather than per-OBS implementation moves.

## Post-slim engine state (2026-05-21)

The discipline engine was slim-refactored on 2026-05-21 (commit landing this dispatch). The named-binding-rules block that lived in earlier versions of this skill (Inference correction, Planning-doc, Sources-schema-touch precondition, Sweep-discipline, Source-credibility-model load-trigger, Remediation-discipline load-trigger, Batch-script resilience, Dispatch-artifact commit-summary, Plan-skill hybrid, Verification-before-completion, Inventory-artifact emission, ADR cross-reference) was retired. Those rules prescribed commit-message trailers (`Loop-closure:`, `Skill-loaded:`, `Verification:`, `Plan-file:`, `ADR-Reference:`, `Inventory-emission:`, `Sweep-enumeration:`, `Inference-correction:`, `Planning-doc:`, `Schema-touch-precondition:`, `Batch-resilience:`, `Class-vs-instance:`) which the engine cannot mechanically verify against code. Per the operator's published 5e3ae41 revert rationale: ceremony rather than enforcement.

**What remains active:** the core loop-closure protocol (OBS coverage table + DP compliance section in the dispatch report) and the Inventory consistency rule.

**The remaining discipline-engine surface (post-slim):**

| Rule / function / check | What it enforces |
|---|---|
| Rule 012 (hardcoded user-home path) | Content scan; rejects `C:\Users\` / `/home/jason/` etc in code files |
| Rule 014 (inventory consistency) | Gates commits touching `docs/inventories/*.md` on the C-check runner passing |
| F2 (admin-routes-isPlatformAdmin) | Every admin API route must call isPlatformAdmin |
| F6 (migrations numeric ordering) | Migration filename pattern + no duplicate numbers |
| F8 (client-server tier boundary) | No `body.tier` / `body.base_tier` / `body.effective_tier` assignment in client code near a fetch/POST |
| F9 (build compiles) | `tsc --noEmit` must pass |
| C3 (migrations.md reality) | Disk migrations == inventory entries |
| C4 (worktrees.md reality) | Live worktrees == inventory entries |
| Pre-push hook | Runs the four CI-parity checks locally before push (untracked critical-surface gate, consistency runner, tests, tsc) |

**Behaviors no longer enforced mechanically** but preserved as recommended methodology in this skill body (Anti-Patterns section + worked examples):
- Sweep-first discipline (glob/schema query before verification) — methodology only
- Skill-load attestation for source-credibility / remediation-discipline — load the skills when the conditions apply; attestation trailer is no longer required
- Plan-skill hybrid (3+ dispatch coordination plan file) — author the plan when the coordination warrants it; no Plan-file trailer required
- Loop-closure / Inventory-emission / Verification trailers — write them when they add audit trail value; no longer engine-enforced

## Inventory consistency rule

This is the only named binding rule that survived the 2026-05-21 slim refactor (rule 014). The 2 surviving consistency checks (C3 migrations + C4 worktrees) both have documented real catches.

**Binding rule.** Any commit on master modifying `docs/inventories/*.md` files MUST satisfy the consistency runner (2 C-checks). The runner verifies that inventories match codebase reality: every claimed entity exists, every existing entity is claimed, no orphans, no drift.

**Override.** `Consistency-Override: C-N (rationale: <non-empty text>; remediation-deadline: YYYY-MM-DD)` trailer per failing check. The remediation-deadline must be a future date. Override surfaces in audit; recurring overrides on the same check indicate deeper issue.

**Implementation.** Rule code at `fsi-app/.discipline/rules/014-inventory-consistency.mjs`. The rule invokes the consistency runner (`fsi-app/.discipline/consistency/runner.mjs`) and asserts exit 0 OR documented overrides for each failing check.

**The 2 remaining C-checks**:
- C3 migrations.md reality (caught migration 067 untracked on 2026-05-21)
- C4 worktrees.md reality (caught remediation-discipline worktree orphan on 2026-05-21)

New C-checks land at `fsi-app/.discipline/consistency/checks/CN-name.mjs`; manifest registration in `fsi-app/.discipline/consistency/manifest.mjs`. Add only when a real bug class justifies the addition; the 8 removed C-checks (C1, C2, C5, C6, C7, C8, C9, C10) had zero catches in their 24-hour lifetime.

**Worked example.** A commit adding a new migration at `fsi-app/supabase/migrations/099_*.sql` triggers C3 if the file exists on disk but is not listed in `docs/inventories/migrations.md`, OR if the inventory lists a migration filename that does not exist on disk (the migration 067 case). Rule 014 invokes the runner; runner reports C3 drift; rule 014 fails with the C3 missing-claim or orphan-claim message. Operator either updates the inventory (fixes the drift; runner passes) OR adds `Consistency-Override: C3 (rationale: <text>; remediation-deadline: <date>)`.

## Anti-Patterns

These behaviors mean the skill was loaded but not followed:

- **Reading followups.md or design-principles.md without acting on it.** The dispatch report does not include the OBS coverage table or the DP compliance section. The agent has done the read but not the discipline. Equivalent to not loading the skill at all.
- **Claiming "no relevant OBS" or "DP-N does not apply" without listing what was reviewed.** "I read the followups doc and none applied" is not a discharge. The coverage table lists every OBS the agent read, even Implemented or Cleared ones, so the reviewer can verify the relevance call. The DP compliance section lists every DP, with reasoning even for "not applicable", so the reviewer can verify the agent read it.
- **Treating Implemented or Cleared OBS as still open.** A coverage table that asks for design action on OBS-1 (cleared three sprints ago) wastes review attention. Read the state annotations before assigning action.
- **Deferring an OBS without naming the next owner.** "Deferred to a future dispatch" is a punt, not a routing. Every deferral names the receiving phase, sprint, or skill domain so the followups doc accumulates a routing graph rather than a backlog.
- **Deferring a DP failure.** DP entries are binding cross-sprint axioms and cannot be deferred. A DP failure means redesign or HALT, never defer.
- **Accepting "partial DP compliance".** DP compliance is binary by construction. "Mostly compliant" or "compliant in the common path" are failures.
- **Adding new OBS entries without cross-references.** New entries that don't link to related existing OBS or relevant DP entries break the cross-reference graph. The next dispatch reading the doc loses the connectivity context.
- **Authoring new DP entries without operator authorization.** The agent may surface candidate principles in followups OBS entries or in dispatch reports, but does not add a new DP-N to `docs/design-principles.md` without operator authorization (see the authorship rule in the registry).
- **Skipping the skill on "small" dispatches.** A small dispatch that touches a phase surface still owes loop closure. The skill applies by dispatch type (design or implementation on a phase), not by perceived scope size.

## Worktree path convention

When a dispatch (this discipline or any other) creates a git worktree, the worktree path MUST be under `C:/Users/jason/dotfiles/.worktrees/wt-<dispatch-name>` (i.e., inside the repo at `.worktrees/`). This is the path that `superpowers:finishing-a-development-branch` (FaDB) recognizes as eligible for automatic cleanup in its Step 6 provenance check.

DO NOT create worktrees as siblings to the repo root (`C:/Users/jason/dotfiles-wt-<name>`). That convention bypasses FaDB's provenance check; FaDB will refuse to clean those worktrees because it treats them as host-managed. Stale worktrees accumulate.

This convention was added 2026-05-20 after operator audit found 22+ stale worktrees at sibling-path convention. Cleanup script at `fsi-app/scripts/cleanup-merged-worktrees.mjs` handles the historical bulk cleanup of sibling-path worktrees; going-forward worktrees follow the `.worktrees/` convention so FaDB Step 6 handles cleanup automatically on dispatch completion.

When writing a dispatch brief that instructs an agent to set up a worktree, use:

```
git -C C:/Users/jason/dotfiles worktree add C:/Users/jason/dotfiles/.worktrees/wt-<dispatch-name> -b feat/<branch-name> master
```

NOT:

```
git -C C:/Users/jason/dotfiles worktree add C:/Users/jason/dotfiles-wt-<dispatch-name> -b feat/<branch-name> master
```

## Integration With the Standing Skill-Load Rule

This skill loads alongside, not instead of, domain-relevant skills. On a Phase 6 brief-generation dispatch, the agent loads `environmental-policy-and-innovation` (governs brief content rules) AND this skill (governs OBS loop closure). On a Phase 7 triage UI dispatch, the agent loads `frontend-design` (governs UI patterns) AND this skill. Skill load is additive, not exclusive.

The integrity rule from `environmental-policy-and-innovation` applies here too: the OBS coverage table's reasoning is grounded in what the OBS entry actually says, not in what the agent infers from the title. If the OBS entry has thin content and the agent cannot ground the cover/defer decision in the entry's substance, surface the gap to the operator rather than inventing a justification.

## Worked Example

Suppose a Phase 7 design dispatch reads `docs/sprint-1/followups.md` and finds the following open OBS entries:

- OBS-4: source_column tracking (migration 082) (Implemented)
- OBS-6: severity vocabulary 'replacement' (Q5 amendment history) (Implemented)
- OBS-7: Norway Fjords instrument_type pending counsel (Open, external dependency)
- OBS-8: OBS-2 broader audit deferred (Deferred to Sprint 1 follow-up dispatch)
- OBS-9: Classifier feedback loop Sprint 2 pre-decisions (Deferred to Sprint 2)
- OBS-10: Drift event rate monitoring post-Phase-7 (Open, post-Phase-7 monitoring)
- OBS-11: Rollback trigger-bracket gap (Implemented)
- OBS-12: Bulk SQL CTE pattern (Implemented as canonical pattern)
- OBS-13: Gate 7.2a all-rejected-jurisdictions rows (Open, Phase 7 dependency)
- OBS-14: Triage UI inline source metadata (Open, Phase 7 owner)
- OBS-15: Briefs article-level source context (Open, Phase 6 owner with Phase 7 consumer half)

The Phase 7 design dispatch's coverage table:

| OBS | State | Decision | Cross-references | Reasoning |
|---|---|---|---|---|
| OBS-4 | Implemented | NO ACTION | (none) | Migration 082 shipped; Phase 7 UI consumes source_column without reopening. |
| OBS-6 | Implemented | NO ACTION | (none) | History of Q5 amendment; no Phase 7 surface. |
| OBS-7 | Open | DEFER | (none) | External dependency (counsel review); no Phase 7 design action. Routing remains operator-initiated UPDATE post-review. |
| OBS-8 | Deferred | NO ACTION | (none) | Standalone Sprint 1 follow-up dispatch owner; not Phase 7. |
| OBS-9 | Deferred | NO ACTION | OBS-14, OBS-15 | Sprint 2 owner. Phase 7 design notes that triage decisions captured today feed Sprint 2 loop input. |
| OBS-10 | Open | DEFER | (none) | Post-Phase-7 monitoring; operator-dashboard task after Phase 7 ships. Phase 7 design notes the dashboard hook point. |
| OBS-11 | Implemented | NO ACTION | (none) | Backfill-script-level pattern; no Phase 7 surface. |
| OBS-12 | Implemented | NO ACTION | (none) | Backfill canonical pattern; no Phase 7 surface. |
| OBS-13 | Open | COVER | OBS-14, OBS-9, DP-1 | Phase 7 design adds third triage tab for items with all-rejected jurisdictions. Option 1 from OBS-13's recommendation set; no new schema. The new tab itself is DP-1 compliant. |
| OBS-14 | Open | COVER | OBS-4, OBS-13, OBS-9, DP-1 | Phase 7 design adds inline source-metadata strip on every queue surface (integrity flags, PJR, IR, and the new all-rejected tab) per DP-1. |
| OBS-15 | Open | DEFER | OBS-14, OBS-9, DP-1 | Phase 6 owns the article-level field generation; Phase 7 design reserves an inline display slot in the brief-detail view and notes the field contract dependency on Phase 6. Phase 7 display half is DP-1 binding once Phase 6 lands. |

The same dispatch's DP compliance section:

| DP | Compliance test | Result | Evidence or reasoning |
|---|---|---|---|
| DP-1 (Single-Pane Operator Review) | Can the operator complete every related decision and edit on this single item without leaving the current screen, form, or workflow? | PASS | Design § 3.2 (integrity flag triage surface) inlines flag, agent brief, source metadata strip with edit-in-place fields, decision controls, audit-note text field, and audit trail on one screen. § 3.3 (PJR triage) and § 3.4 (all-rejected-jurisdictions tab) inline the equivalent controls plus canonical-replacement pickers. Zero tab switches in any documented operator workflow. Article-level brief context (OBS-15 deferred half) noted as a Phase 6 dependency that will enable full DP-1 compliance on the brief-detail surface once Phase 6 ships. |

This pair tells the operator: every OBS was read, three were covered (13, 14, and the Phase 7 half of 15's display), the rest were deferred to named owners or noted as no-action, the cross-references are preserved so the design reviewer can follow the graph, and the cross-sprint binding design principle (DP-1) was verified as satisfied by the design.

If the Phase 7 implementation dispatch later surfaces a CHECK constraint failure on the new triage decision table, the implementation report adds OBS-17 to the followups doc and cites it in the "OBS surfaced during this dispatch" section. The next Phase 7 hotfix or Sprint 2 design dispatch picks up OBS-17 from the doc on its own loop-closure pass.

## Skill Load Confirmation

When this skill loads on a dispatch, the agent's pre-work report states:

- That this skill loaded
- The followups doc path the agent will read (e.g. `docs/sprint-1/followups.md`)
- That the agent will read `docs/design-principles.md` as the cross-sprint DP registry
- The dispatch type (design, implementation, or sprint planning) and how the skill applies

If any of these cannot be stated cleanly, HALT and surface the ambiguity to the operator before proceeding.
