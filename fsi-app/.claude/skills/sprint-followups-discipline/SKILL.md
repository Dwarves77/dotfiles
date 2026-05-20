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

## Inference correction rule: when reconstruction surfaces evidence contradicting discovery

This rule was added 2026-05-19 after a discovery-doc inference (Stage 1 schema reconciliation Finding 5: "070 created 5 RPCs") was contradicted by evidence surfaced during reconstruction (git history showed 070 created 3 RPCs; the other 2 originated in 064 and 066). The reconstruction dispatch surfaced and corrected the inference rather than silently aligning the reconstruction to the discovery doc's expectation.

**Binding rule.** When a downstream dispatch (reconstruction, implementation, audit, or any synthesis that touches a previously-investigated surface) surfaces EVIDENCE that contradicts a PRIOR DISPATCH's INFERENCE, the downstream dispatch MUST:

1. Surface the contradiction explicitly in its report. Name the prior dispatch + inference + the contradicting evidence.
2. Correct the prior dispatch's doc with a clearly-marked postscript (e.g. "Correction YYYY-MM-DD") that preserves the original wrong claim for audit trail but states the corrected fact and cites the evidence source.
3. Cross-reference the correction from the downstream dispatch's own deliverable so future readers see the lineage.
4. DO NOT silently align the downstream work to the wrong inference. If the inference was "X is 5 things" and evidence proves "X is 3 things," ship the 3-thing version with the correction, not the 5-thing version.

This is the `environmental-policy-and-innovation` integrity rule applied to investigation work: no extrapolation, no preservation of an inference when contradicting evidence is in hand.

**Why this rule exists.** Without it, downstream dispatches reading a discovery doc treat its inferences as facts, propagating the wrong claim forward. A reconstruction that "matches what the discovery doc said" looks correct on paper but silently overrides the actual evidence with the prior dispatch's guess. The integrity rule requires evidence-grounded output; this rule extends that requirement to inter-dispatch synthesis.

**Worked example (the case that triggered this rule).**

Stage 1 schema reconciliation discovery (docs/sprint-1/schema-reconciliation-discovery-2026-05-18.md Finding 5) inferred that migration 070 created 5 RPCs, based on migration 071's header phrasing "5 row-set RPCs". The inference conflated 071's modification-scope (which COVERED 5 RPCs created across several migrations) with 070's creation-scope. The discovery doc explicitly labeled this as a "strong inference" but did not test it against git history.

D15 reconstruction dispatch (commit c85982d) recovered the original 070 file from git history (blob d51bccf at commit 651ae78, 308 lines). Original 070 created 3 RPCs: get_market_intel_items, get_research_items, get_operations_items. The other 2 RPCs (get_workspace_intelligence_dashboard, get_workspace_intelligence_listings) originated in migrations 064 and 066 respectively.

The reconstruction dispatch could have silently aligned: write a 070 file that creates all 5 RPCs to match the discovery doc's inference, treating the doc as authoritative. Instead, it surfaced the contradiction in its report, noted the lineage correctly in the reconstruction file's header, shipped the verbatim 3-RPC original from git history, and triggered this skill amendment to encode the precedent.

**How to apply.** When you read a discovery or audit doc as input to your dispatch, treat its inferences with the same skepticism you would treat any unverified claim. If your dispatch surfaces evidence (live DB state, git history, file content, runtime behavior) that contradicts a prior inference, apply this rule: surface, correct, cite, never silently align.

## Planning-doc rule: skill-closed scope is NOT an operator decision point

This rule was added 2026-05-18 after a Sprint 2 planning doc presented two decision points (D7 Research repositioning, D14 Map Facility toggle) where the relevant skill (`caros-ledge-platform-intent`) had already defined the page intent. The planning doc framed them as "operator chooses Option A vs Option B" when the skill's Section 3 and Section 4 had already closed the scope. Operator caught the contradiction; the discipline did not.

**Binding rule.** Operator decision points in planning docs MUST respect skill-defined scope. Skill-closed scope CANNOT be re-opened as a planning-layer decision. Concretely:

- If the platform-intent skill (Section 3) defines a customer-facing surface's intent (e.g., "Research is horizon-scan content with analytical or quantitative depth"), the build dispatch for that surface implements that intent. The planning doc does NOT present "should we build Research as horizon-scan or as something else?" as an operator decision.
- If a cross-cutting capability's scope is defined in the skill (e.g., "Map is a geographic visual layer over Regulations content"), the planning doc does NOT present "should we rescope Map to include Facility content?" as an operator decision.
- The operator's decision authority IS preserved over: build sequencing, build prerequisites, schema strategy options, build scope within a skill-defined intent (e.g., which Market Intel sources to add first), tactical-vs-strategic implementation paths.
- The operator's decision authority is NOT extended over: scope redefinition for surfaces or capabilities the skill has already defined.

**If the planning author believes the skill's scope definition needs revision**, that goes through a skill-amendment dispatch with explicit operator authorization for skill modification (per `caros-ledge-platform-intent` SKILL.md Section "Authority Grant" / "You are NOT authorized to: Modify this skill's platform model framing without explicit operator authorization with strong-emphasis correction"). Skill revision is NOT a planning-layer decision option.

**How to apply when authoring a planning doc:**

1. For each candidate operator decision point you draft, identify the skill section(s) that touch the same scope.
2. If the skill closes the scope (states a binding answer), strike the decision point. Document the skill citation; surface the build dispatch as "implement per skill Section X" rather than "operator chooses".
3. If the skill leaves the scope open (silent, or explicitly defers to operator), the decision point is valid. Cite which skill section confirms operator discretion.
4. If the planning author believes the skill needs revision to enable a different scope, dispatch a skill amendment FIRST (with operator authorization) and ONLY THEN add the corresponding decision point to the plan. Do not present the rescope as a plan option.

**What this rule prevents.** Without this rule, planning docs accumulate "Option A vs Option B" decision points where Option B silently negates the skill's already-stated scope. The operator either (a) selects Option B and the build ships against an intent that contradicts the skill, or (b) catches the contradiction during review and the planning cycle restarts. Either path wastes the planning work.

**Worked example (the case that triggered this rule).**

Sprint 2 planning doc Build 8 (Research) presented:
- Option A: Research stays as editorial draft-staging queue
- Option B: Research becomes customer-facing horizon-scan destination

Per `caros-ledge-platform-intent` Section 3, Research is "horizon-scan content with analytical or quantitative depth." The skill closes the scope. There is no Option A to consider. The build dispatch is "implement Research per skill Section 3 horizon-scan destination framing." If the planning author believed editorial draft-staging should be a Research surface, that would require a skill amendment (operator-authorized) BEFORE the plan presents it as an option.

The corrective: revise the plan to retire Option A; surface Build 8 as a single-path implementation; if editorial draft-staging belongs somewhere, identify a different surface (admin chrome) and dispatch it separately.

## Sources-schema-touch precondition: verify existing consumer wiring before adding new consumers

This rule was added 2026-05-19 after the D16 column-shadowing closure verification (commit 51321b4 family) surfaced a structural pattern: when migration 063 partially applied (2 columns shadowed and silently no-op'd, 12 columns applied cleanly), the audit confirming zero existing-consumer breakage on the shadowed columns explicitly excluded the 12 successfully-applied columns. Future builds (Build 7 Market Intel, Build 8 Research, Build 9 Operations, Build 11 Dashboard) all touch `sources` and will add new consumers of those columns. Verifying existing consumer wiring at the moment of new-consumer addition is the correct discipline, but scoping the verification inside any one build packet leaves the other builds exposed and lets the per-build verification scope keep drifting.

**Binding rule.** Any dispatch that touches the `sources` table OR adds a consumer of `sources` columns (read, write, filter, join, type definition) MUST, before adding the new consumer:

1. Identify the origin migration SQL for each `sources` column the dispatch touches (the migration that created the column AND any subsequent migration that altered its shape, constraints, or default).
2. Audit all current `src/` consumers of those columns and verify they assume the actual deployed shape, not the intended-at-some-point shape from a no-op'd migration, and not the proposed-but-unapplied shape from a draft migration.
3. Surface any consumer that assumes a different shape than the origin migration's deployed reality. Surface to the operator; do not silently refactor.
4. Only after the precondition audit reports clean (or after the operator decides on remediation scope for any non-clean findings) may the dispatch add its new consumer.

**What this precondition is NOT.**

- NOT a license to refactor existing consumers. The precondition gates ADDITIONS only. A consumer that exists and works against the actual schema, even if its assumption pattern is defensive or redundant, is out of scope.
- NOT a retroactive audit obligation. The precondition fires when a new consumer is being added; it does not require periodic re-audits of unchanging consumers.
- NOT a substitute for the integrity rule. Consumer wiring assumptions are documentary evidence; the actual deployed schema (live DB) is authoritative. If consumer code and origin migration agree but the live DB differs (migration applied incorrectly, manual schema drift), the live DB wins and a new migration captures the reconciliation.

**Worked example (the 12 columns from migration 063).**

The 12 columns from migration 063 that applied cleanly: `source_role`, `secondary_roles`, `scope_topics`, `scope_modes`, `scope_verticals`, `expected_output`, `classification_assigned_at`, `classification_observed_distribution`, `observed_correctness_count`, `last_observed_at`, `classification_confidence`, `classification_rationale`. These collectively introduce a 5-axis classification framework whose consumer wiring has not been audited as comprehensively as the shadowed `tier` and `jurisdictions` columns now have.

When Build 7 (Market Intel signal aggregation) dispatches and adds a consumer of, say, `source_role`, the precondition fires: read migration 063 to see the column's intended shape; grep `src/` for current `source_role` consumers; verify each one assumes the migration-063 shape rather than some other inferred shape. If any consumer assumes a different shape, surface to operator. Then add the Build 7 consumer.

When Build 8 (Research horizon-scan) dispatches and adds a consumer of `classification_confidence`, the precondition fires again with `classification_confidence` as the focus column. The audit pattern is the same: origin migration + current consumers + assumption-vs-reality check.

**Audit-pattern precedent.** The D16 closure verification (2026-05-19) demonstrated the audit pattern: parallel Explore-agent dispatches across four code-path families (classifier/scoring lib, API routes + server handlers, UI components + view pages, types/stores/scripts/workers/tests) with a tight per-agent contract (file:line + assumption + actual-vs-intended + works-or-breaks classification). Three sections per agent report: Correct / Suspect / Indeterminate. Synthesis in the parent dispatch as a coverage table. Future precondition audits should adopt the same pattern: parallel agents, narrow per-agent scope contract, three-section report shape, parent dispatch synthesis.

**How to apply.**

1. Before drafting the new consumer code, list every `sources` column the dispatch will touch (read, write, filter, join, or reference in a type definition).
2. For each column, identify its origin migration and read that migration in full.
3. Dispatch parallel read-only audit agents per the D16 precedent. Each agent gets a narrow code-path-family scope and the three-section report contract.
4. Synthesize the coverage table in your dispatch's pre-flight section, before the design content.
5. If the synthesis is clean, proceed with the new consumer addition. If the synthesis surfaces suspect or indeterminate findings, halt the new-consumer work, surface findings + suggested remediation scope, and wait for operator decision.

## Sweep-discipline rule: enumerate the full surface before claiming completeness

This rule was added 2026-05-19 after two recurring methodology failures in this session and a third confirmed by operator reference. The Build 6 admin-gating sweep (commit 6d18773) missed 13 admin routes that any authenticated user could hit, because the sweep enumerated only routes the dispatcher recalled rather than globbing the route surface. The subsequent 2026-05-19 code-level positive-test audit (dispatched after seeding jasonlosh@hotmail.com with `is_platform_admin=true`) found the 13 Build-6-missed routes but ALSO had two methodology errors of its own: it missed 4 additional ungated routes under the `src/app/api/admin/sources/[id]/*` pattern, AND it miscalled `recompute-trust` and `spot-check/recurring` as `requireAuth`-only based on directory location rather than file content (those routes intentionally gate via `x-worker-secret` for cron access). The Tier 2 hygiene sweep earlier in the same session exhibited the same pattern in the opposite direction: it went beyond the original scope brief and caught Phase-D leaks in surfaces not in the original brief; enumerate-first would have correctly included those leaks in the original brief instead of discovering them by accident. All three failures share one root cause: the sweep relied on recalled or pattern-matched scope rather than fully enumerating the surface family.

**Binding rule.** When running a sweep dispatch (security sweep, consistency sweep, audit, or any dispatch whose deliverable is "verify every item in a surface-family meets a criterion"), the dispatch MUST:

1. Identify the surface family being swept (route family, column family, constraint family, file pattern, schema element family). Name it precisely.
2. Enumerate the COMPLETE surface via Glob, schema query, or equivalent fully-enumerative method. Document the enumeration count and the criterion being checked in the dispatch's pre-flight report.
3. Verify each enumerated item against the audit criterion. Do not skip items because they "seem obviously fine" or "are unlikely to be wrong" — those exact intuitions are how Build 6 missed 13 routes and how the 2026-05-19 audit missed 4 more.
4. Surface ANY discrepancies between the enumeration and the original scope brief. Sweeps frequently expand scope (more items meet the audit criterion than the brief anticipated), correct scope (some items in the brief don't actually belong to the surface family), or relocate scope (items that look like they belong to one family actually belong to another, like the worker-secret cron routes that look like admin routes but gate differently). The dispatch report calls out the discrepancy explicitly.

**What this rule is NOT.**

- NOT a license to expand the FIX scope indefinitely. The enumeration bounds the verification work; the fix work remains bounded by what the dispatch is authorized to change. If enumeration surfaces ungated routes beyond what the operator authorized fixing, surface them and ask, do not auto-fix.
- NOT a requirement to fix everything found. The rule requires complete enumeration and complete verification. What to fix is a separate authorization decision.
- NOT applicable to design or implementation dispatches scoped to a specific change. A dispatch like "add a new column to sources" doesn't owe a sweep — only sweep-type dispatches owe enumerate-first discipline.
- NOT a substitute for the sources-schema-touch precondition or the inference-correction rule. Sweep-discipline complements them: enumerate-first prevents the same class of methodology failure from recurring across sweep-shaped dispatches.

**Worked example (the Build 6 → 2026-05-19 audit → Track B-code re-enumeration sequence).**

Build 6 admin-gating sweep (commit 6d18773) enumerated remembered admin routes and verified each calls `isPlatformAdmin`. The sweep was incomplete: 13 routes were missed because the dispatcher relied on recall rather than `Glob` of `src/app/api/admin/**/*.ts`. OBS-17 closed prematurely.

2026-05-19 code-level positive-test audit re-audited admin gating. It found the 13 routes Build 6 missed but had two methodology errors: (a) missed 4 additional ungated routes under `src/app/api/admin/sources/[id]/*` because its enumeration was incomplete in that subdirectory, (b) miscalled `recompute-trust` and `spot-check/recurring` as `requireAuth`-only based on directory location, not file content (they gate via `x-worker-secret` header, intentional for cron access).

Track B-code dispatch (commit 4c7b546) applied enumerate-first discipline: pre-flight Globbed `src/app/api/admin/**/*.ts` to produce a 28-route table, grepped each for `requireAuth` and `isPlatformAdmin`, and built a complete pass/fail matrix. The matrix correctly identified 15 PASS + 13 prior-audit-FAIL + 4 newly-discovered FAIL + 2 worker-secret OTHER. Net fix scope correctly bounded at 15 routes. The same enumerate-first move on Build 6 would have prevented the 13-route gap; the same move on the 2026-05-19 audit would have prevented the 4-route gap and the 2 miscalls.

**How to apply.**

Before any sweep dispatch starts, the dispatch brief lists:
1. The surface family being swept (e.g., "all routes under `src/app/api/admin/**`").
2. The enumeration method that will produce a complete list (e.g., "Glob `src/app/api/admin/**/*.ts`").
3. The criterion being checked (e.g., "does the route call `isPlatformAdmin` after `requireAuth`?").
4. The expected scope of fixes if applicable (e.g., "fix any route that calls `requireAuth` without `isPlatformAdmin`").

The pre-flight report documents the enumeration count and the criterion. The execution report documents the full pass/fail matrix and explicitly calls out any discrepancy between the enumeration and the original scope brief.

## Source-credibility-model load-trigger rule

This rule was added 2026-05-19 alongside the encoding of the source-credibility-model skill. Per the architectural conversation that produced the skill (decisions captured at `docs/sprint-2/source-credibility-model-decisions-2026-05-19.md`), the credibility model is binding on a wide range of dispatches but lives in its own skill rather than this discipline. This rule names which dispatches must load source-credibility-model so the credibility-model concerns are not skipped because the dispatcher forgot to add the skill to the load list.

**Binding rule.** Load `source-credibility-model` skill on any dispatch that:

1. Touches the `sources` table (read or write)
2. Touches `source_citations` or `intelligence_item_citations` edge tables
3. Modifies `tier`, `base_tier`, `effective_tier`, `tier_override`, `override_reason`, `override_date`, or `bias_tag*` columns on sources
4. Touches the candidate review surface (`canonical_source_candidates` table, admin canonical-sources review components, `/api/admin/canonical-sources/*` routes)
5. Modifies the Haiku recommend-classification endpoints (`canonical-sources/recommend-classification`, `sources/recommend-classification`)
6. Modifies the verification pipeline (`src/lib/sources/verification.ts`)
7. Adds or modifies customer-facing credibility signal rendering on any of the seven surfaces (Regulations, Research, Market Intel, Operations, Community, Map, Intelligence Assistant)
8. Changes the discovery loop (citation extraction in `src/app/api/agent/run/route.ts`, source resolution in any consumer, candidate promotion criteria)
9. Adds or modifies citation network scoring (`src/lib/trust.ts`), recency decay, or override semantics

**Enumerated route paths in scope (added 2026-05-20 alongside Sprint Architecture F7 fitness function).** Per F7's cross-reference check, the route paths below are part of the credibility-affected surface and any commit touching them must attest `Skill-loaded: source-credibility-model`. New routes that touch the sources table must be added here:

- `/api/admin/canonical-sources/decide` (candidate review write path)
- `/api/admin/canonical-sources/bulk-approve` (bulk candidate review)
- `/api/admin/canonical-sources/bulk-classify` (LLM bulk classification)
- `/api/admin/canonical-sources/recommend-classification` (Haiku recommendation)
- `/api/admin/sources/promote` (provisional → source promotion)
- `/api/admin/sources/all` (admin source registry listing)
- `/api/admin/sources/recommend-classification` (Haiku recommendation, sources)
- `/api/admin/sources/bulk-import` (admin bulk import)
- `/api/admin/sources/[id]/fetch-now` (admin operational)
- `/api/admin/sources/[id]/regenerate-brief` (admin operational, customer-output)
- `/api/admin/sources/[id]/visibility` (admin operational)
- `/api/admin/sources/[id]/pause` (admin operational)
- `/api/admin/sources/[id]/tier-override` (Q5 override write path)
- `/api/admin/integrity-flags` (admin/audit; reads sources via join)
- `/api/admin/recompute-trust` (Q6/Q7 daily trust recompute; worker-secret-gated)
- `/api/admin/q7-daily-recompute` (Q7 cron entry; worker-secret-gated)
- `/api/admin/spot-check/recurring` (scheduled spot-check; worker-secret-gated)
- `/api/admin/scan` (admin scan)
- `/api/sources` (public-facing sources listing)
- `/api/ask` (Intelligence Assistant; reads sources for credibility-context display)
- `/api/agent/run` (brief generation; citation propagation reads sources)
- `/api/data/fetch-source` (admin/internal source fetch)
- `/api/data/scan-all` (admin/internal scan)
- `/api/staged-updates` (admin staging surface)
- `/api/worker/check-sources` (scheduler)
- `/api/worker/drain-first-fetch` (first-fetch drain)

Load is mandatory, not advisory. Without the skill loaded, the dispatch cannot ground its credibility decisions in the canonical model and risks drift from the operator-approved framework.

**What this rule is NOT.**

- NOT a substitute for `sprint-followups-discipline` itself (this discipline still owes loop closure, DP compliance, and the sources-schema-touch precondition where applicable). The source-credibility-model load is ADDITIVE.
- NOT a requirement to apply every credibility-model element to every dispatch. The skill specifies which elements apply where. A small bugfix that touches a credibility-affected surface still loads the skill but applies only the relevant section.
- NOT a self-scanning mechanism. Option B (skills self-describe triggers; discipline scans frontmatter at dispatch start) was considered and rejected for one-skill-deployment cost. If the project adds 5+ domain skills with overlapping triggers, revisit.

**How to apply.** At dispatch brief authoring time, check the trigger list above against the dispatch's scope. If any trigger fires, add `source-credibility-model` to the skill load list in the brief. The dispatch's pre-work report names the skill as loaded.

**Worked example.** A Build 8 (Research horizon-scan) dispatch touches `sources` (reads for filtering), `intelligence_item_citations` (reads for citation count display), and customer-facing credibility signal rendering (Research surface per Q9: tier + bias tag + citation count + recency). Triggers 1, 2, and 7 fire. The dispatch brief loads source-credibility-model alongside sprint-followups-discipline, caros-ledge-platform-intent, and environmental-policy-and-innovation. The dispatch's design implements the Q9 Research signal set per source-credibility-model Section 8.

## Remediation-discipline load-trigger rule

This rule was added 2026-05-20 alongside the encoding of the remediation-discipline skill (`fsi-app/.claude/skills/remediation-discipline/SKILL.md`). The skill codifies the class-over-instance principle for remediation work and lives in its own skill rather than this discipline. This rule names which dispatches must load remediation-discipline so the class-over-instance lens is applied consistently at remediation scoping time, not after the fact.

**Binding rule.** Load `remediation-discipline` skill on any dispatch that:

1. Is framed as remediation, post-mortem, hotfix, or failure response
2. Is investigating a recurring pattern across multiple instances
3. Is extracting a primitive, library, or shared utility
4. Is adding a new binding rule to any discipline skill
5. Is scoping the response to a surfaced bug, regression, or production incident

Load is mandatory, not advisory. Without the skill loaded, the dispatch may default to instance-only patches without checking whether the failure is class-shaped. Section 3 of the skill provides the recognition criteria (4 signals + threshold rule) that determines class vs instance.

**What this rule is NOT.**

- NOT a requirement to apply the class-over-instance principle to every dispatch. Design and implementation dispatches that aren't responding to a failure don't owe class-vs-instance analysis. The skill is REMEDIATION-shaped.
- NOT a substitute for `sprint-followups-discipline` itself. Loop closure + DP compliance + sweep discipline + sources-schema-touch precondition all still apply.

**How to apply.** At dispatch brief authoring time, check the trigger list above against the dispatch's framing. If any trigger fires, add `remediation-discipline` to the skill load list. The dispatch's pre-work report names the skill as loaded and applies the recognition criteria (Section 3) to the failure being remediated.

**Worked example.** The Q4 batch failure (sources 21/22, Anthropic timeout + pg disconnect) triggered remediation. Operator framed Path (a) as instance-only patch initially. Loading remediation-discipline at scoping time would have surfaced the class-shape (recognition signals 2 + 4 fire) before the patch dispatch fired, leading directly to the bundled library-extraction dispatch instead of the patch-then-library sequence actually executed. Future remediation dispatches load this skill at scoping to make the class call upfront.

## Batch-script resilience rule

This rule was added 2026-05-20 as the codified instance of remediation-discipline's class fix for batch-script resilience (see remediation-discipline Section 7 worked example 1).

**Binding rule.** Any dispatch that creates or modifies a long-running batch script (>50 iterations, especially external API calls or persistent DB connections) MUST use the batch-primitives library at `fsi-app/scripts/lib/batch-primitives.mjs` OR document why it cannot.

Sample-only validation does NOT satisfy batch-robustness gates. The dispatch brief explicitly names the failure modes the sample WON'T reveal and confirms library primitives handle them:
- Retry-with-backoff on external API errors (timeouts, network, 429, 5xx) via `withRetry(fn, { isRetryable })`
- Reconnect-on-disconnect for persistent DB connections via `createPgPool` (Pool handles natively; no separate retry wrapper needed for the connection layer)
- Rate limit enforcement on external API calls via `withRateLimit`
- Per-iteration error isolation: one item's failure does NOT crash the whole batch (achieved via try/catch around the wrapped fn within the loop)
- Idempotency via `withIdempotency` so re-runs skip completed work
- Hook-based progress reporting via `createProgressReporter`

Triggered by OBS-51 (Q4 sources 21/22 failure: sample-scale validation passed; full-batch hit Anthropic timeout + pg disconnect immediately at source 21+22).

**What this rule is NOT.**

- NOT a requirement to use every primitive in every batch. A pure-SQL batch (e.g., Q7 daily recompute) doesn't need `withRetry` or `withRateLimit`. Use the primitives that match the batch's failure surface.
- NOT applicable to scripts that use Supabase client (`createClient` from `@supabase/supabase-js`) instead of `pg.Pool`. Supabase client manages its own connection lifecycle; library `createPgPool` doesn't apply. Surface that mismatch in the dispatch brief; future expansion of the library can address Supabase-client resilience separately.
- NOT a license to skip integration verification. Library primitives are unit-tested; consumer batches still owe smoke-test verification (--dry-run --limit N) before production runs.

**How to apply.** When a dispatch creates or modifies a batch script, the brief explicitly lists which library primitives are consumed and why each was chosen. The script imports from the library; inline retry/Pool/rate-limit/progress logic is anti-pattern (remediation-discipline Section 8 anti-pattern 5: reinventing primitives).

**Worked example.** Q4 batch script (`fsi-app/scripts/q4-bias-batch-assign.mjs`) consumes `isAnthropicRetryable` + `isPgRetryable` predicates from the library (full primitive migration deferred; v1 validates library consumption). Q7 daily batch script (`fsi-app/scripts/cron/q7-daily-recompute.mjs`) refactor deferred because it uses Supabase client not pg.Pool; the library doesn't fit cleanly. Both deferrals are documented in the script headers and tracked for follow-up.

## Dispatch-artifact commit-summary rule

This rule was added 2026-05-20 after the 3-axis skill audit found that OBS coverage tables and DP compliance sections are emitted in dispatch reports but do not surface in git commit artifacts. The skill's Output Format Requirement section prescribes the table format for dispatch reports; this rule adds a complementary requirement at the commit-artifact layer so loop-closure evidence is git-log auditable.

**Binding rule.** Every merge commit for a design or implementation dispatch on a Caro's Ledge sprint phase MUST include a one-line summary in the commit message body that states OBS coverage outcomes and DP compliance results. Format:

```
Loop-closure: OBS-N COVER; OBS-M DEFER; OBS-K NO ACTION; DP-1 PASS; DP-2 N/A
```

The full tables remain in the dispatch report (this is belt-and-suspenders, not a replacement). The dispatch report is authoritative for reasoning; the commit summary is the audit trail.

**What this rule is NOT.**

- NOT a requirement on intermediate commits in a feature branch. Only the merge commit (or final squashed commit) owes the summary.
- NOT a substitute for the OBS coverage table in the dispatch report. The table provides reasoning per OBS; the commit summary provides the outcome list.
- NOT applicable to dispatches that this skill does NOT apply to (investigation-only, hotfix, research-only, conversation-only). Those dispatches do not owe OBS coverage at all.

**How to apply.** When authoring a merge commit message for a dispatch this skill applies to, after the commit subject and body paragraphs, include a line beginning with `Loop-closure:` followed by the OBS outcome list and DP compliance list. `git log --grep="Loop-closure"` enumerates every dispatch that closed the loop.

**Worked example.** A Phase 7 triage UI design merge commit would include:

```
Phase 7 triage UI design

Adds third triage tab for all-rejected jurisdictions; inline source
metadata strip on every queue surface; canonical-replacement pickers.

Loop-closure: OBS-13 COVER; OBS-14 COVER; OBS-15 DEFER (Phase 6 dep);
  OBS-4/6/8/9/10/11/12 NO ACTION; OBS-7 DEFER (counsel); DP-1 PASS
```

Anchors the dispatch report to a single auditable commit-log line.

## Plan-skill hybrid rule

This rule was added 2026-05-20 after the 3-axis skill audit found `superpowers:writing-plans` and `superpowers:executing-plans` aspirational (no plan files exist in `fsi-app/docs/plans/`; major coordinations ran memory-driven via worktree naming and transcript). Calibrating skill load discipline to actual practice: plans required for multi-dispatch coordinations, memory-driven coordination acceptable for single or 2-dispatch work.

**Binding rule.** Load `superpowers:writing-plans` and `superpowers:executing-plans` on any coordination that spans 3+ dispatches (typical case: a multi-track work plan like Track A + Track B + Track C, or a multi-phase build like Q1 through Q10 of a credibility model rollout). For single-dispatch work or 2-dispatch sequences (e.g., one design dispatch + its implementation), memory-driven coordination via conversation transcript and worktree naming is acceptable.

**What "3+ dispatches" means:**

- Three or more separately-dispatched agent runs that share a common goal and need coordination between them
- Multi-track parallel work where the tracks compose into a single deliverable
- Multi-phase implementation where each phase has its own dispatch but the phases must sequence correctly

When a 3+ dispatch coordination is being scoped, the scoping conversation produces a plan file at `fsi-app/docs/plans/<date>-<coordination-name>.md` BEFORE the first dispatch fires. The plan file enumerates the dispatches, names dependencies, and surfaces decision points.

**What this rule is NOT.**

- NOT a requirement for single-dispatch design or implementation work. A single design dispatch + its single implementation dispatch is 2 dispatches; memory-driven is fine.
- NOT a requirement for hotfix sequences (typically 1 dispatch or 2 if a follow-up surfaces).
- NOT a requirement for investigation or audit dispatches (typically 1 dispatch; if the audit findings warrant a multi-dispatch remediation, the remediation phase triggers this rule for the remediation plan).
- NOT a substitute for `verification-before-completion` discipline (see next rule; verification applies regardless of dispatch count).

**How to apply.** At coordination-scoping time, count the dispatches the coordination will require. If 3+, draft a plan file in `fsi-app/docs/plans/` and use `superpowers:writing-plans` to structure it. The first dispatch's brief references the plan file. Subsequent dispatches load `superpowers:executing-plans` and check off completed steps. If a single-dispatch sequence later grows past 2 dispatches, retroactively author a plan file at that point.

**Worked example.** Track A + Track B + Track C parallel sweeps for an OBS-51 follow-up: 3+ dispatches with hard inter-dependencies (Track C waits on Tracks A+B findings). Plan file drafted before Track A fires. By contrast, a single Phase 7 triage UI dispatch + its implementation merge is 2 dispatches; memory-driven scoping is acceptable.

## Verification-before-completion required rule

This rule was added 2026-05-20 alongside the Plan-skill hybrid rule. Per operator nuance: verification-before-completion is universally valuable, not just for multi-dispatch work, so it does NOT bundle with the plan-skill hybrid framing.

**Binding rule.** Load `superpowers:verification-before-completion` on every dispatch regardless of size or count. Every claim of "complete" must cite the verification command(s) and the observed output before the dispatch report ends with that claim. Schema migrations applied, tests passed, branch merged, primitive extracted, UI rendered: each requires evidence.

**What this rule is NOT.**

- NOT a requirement to surface verification evidence in every commit message (that is covered by the Dispatch-artifact commit-summary rule for OBS/DP outcomes only).
- NOT a requirement to write tests where none exist (the skill is verification-before-completion, not test-driven-development; verification can be running existing tests, schema queries, smoke tests, observation of UI behavior).
- NOT a substitute for code review or operator approval (verification is the agent's owed evidence, not the final go/no-go).

**How to apply.** Before any dispatch report ends with a completion claim, the agent runs at least one verification command relevant to the change and surfaces the command + output in the report. Examples:

- Schema migration: `psql -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'sources';"` showing the new column landed
- Code change: `npx tsc --noEmit` showing zero errors, plus a smoke test if the change has runtime behavior
- Component edit: descriptive observation of the change in the running app, or screenshot
- Library extraction: `node -e "require('./lib/X').foo()"` showing the primitive works
- Branch merge: `git log -1 --format=%H` showing the merge commit lands

**Worked example.** A schema-migration dispatch that adds `sources.effective_tier` ends with: "Verification: ran `psql -c \"SELECT column_name, data_type FROM information_schema.columns WHERE table_name='sources' AND column_name='effective_tier';\"` returned `effective_tier | integer`, confirming column added. Triggered consumer code update at `src/lib/trust.ts:42`; ran `npx tsc --noEmit` returned zero errors, confirming no type-system breaks."

If a verification cannot be performed (e.g., production DB inaccessible from dispatch context), the dispatch surfaces the unverified claim explicitly and routes the verification to an operator-owned step. "Cannot verify in dispatch; operator to confirm via X" is acceptable; silent completion claim without verification is not.

## Inventory-artifact emission rule

This rule was added 2026-05-20 alongside the establishment of `docs/inventories/` as the canonical state-artifact directory. Sister to the Dispatch-artifact commit-summary rule (8th binding rule): that rule captures per-dispatch OBS/DP outcomes in commit messages; this rule captures cross-dispatch state inventories in operator-readable files so future dispatches don't re-spelunk the file tree to know what exists.

Triggered by the 3-axis skill audit (commit `383974e`) which produced a one-off `docs/skill-inventory.md` to fix immediate visibility but did NOT codify the discipline for the general pattern. Subsequent operator framing: "substantial dispatches should produce operator-readable artifacts" extends from skills to routes, migrations, worktrees, env vars, cron jobs, OBS status, components, and any future state-carrying surface where re-spelunking has compounding cost.

**Binding rule.** Every SUBSTANTIAL dispatch MUST update the relevant entry in `docs/inventories/<type>.md` AND include an `Inventory-emission:` line in the merge commit body. Format:

```
Inventory-emission: docs/inventories/<type>.md N entries added/changed/removed
```

When the dispatch touches multiple inventories, emit one line per inventory.

**What "substantial" means.** A dispatch is substantial if ANY of:

- Takes >30 min agent time
- Touches >5 files
- Ships a binding rule, primitive, or shared utility
- Ships a schema migration
- Adds/removes/significantly modifies a route, scheduled job, component, env var, worktree, or OBS entry
- Is itself a sprint-planning, audit, or remediation dispatch

Investigation-only and hotfix dispatches (the same ones this skill's "When to Apply" skips) do not owe inventory emission unless the investigation surfaces a new inventory-relevant entity.

**Inventory types (non-exhaustive; extensible).** The table below lists the inventory types identified through 2026-05-20. Stub files exist for the first 8 (load-bearing in the next 2-4 weeks); the remaining types are conceptually defined here as the complete-picture reference, with stub files landing when the first substantial dispatch touches the surface.

| Type | Canonical path | Updated when | Stub status |
|---|---|---|---|
| skills | `docs/inventories/skills.md` | A custom skill is added, modified, or archived | Populated (2026-05-20) |
| routes | `docs/inventories/routes.md` | An API route is added, removed, or its auth/method/purpose changes | Stub (2026-05-20) |
| migrations | `docs/inventories/migrations.md` | A migration file is added or applied; ledger backfilled | Stub (2026-05-20) |
| worktrees | `docs/inventories/worktrees.md` | A worktree is created or removed | Stub (2026-05-20) |
| env-vars | `docs/inventories/env-vars.md` | A new env var dependency is introduced | Stub (2026-05-20) |
| cron-jobs | `docs/inventories/cron-jobs.md` | A scheduled job is added, removed, or its schedule changes | Stub (2026-05-20) |
| obs-status | `docs/inventories/obs-status.md` | An OBS entry is added, reopened, or closed (aggregates the 8th rule's per-commit closures) | Stub (2026-05-20) |
| components | `docs/inventories/components.md` | A shared component is added or its props contract changes | Stub (2026-05-20) |
| schema | `docs/inventories/schema.md` | A table or view's columns/constraints change (distinct from migrations history; this captures CURRENT state) | Not yet created; stub lands on first schema-touching substantial dispatch |
| source-registry | `docs/inventories/source-registry.md` | Source population changes meaningfully (tier distribution, bias tag distribution, queue size shifts) | Not yet created; stub lands on first source-registry dispatch (e.g., next bias-batch re-tune or candidate-promotion run) |
| review-queues | `docs/inventories/review-queues.md` | Classifier output changes substantially or a queue retune lands | Not yet created; stub lands on next classifier or queue-management dispatch |
| plans | `docs/inventories/plans.md` | A multi-dispatch plan is authored, executed, or archived (per the 9th binding rule, Plan-skill hybrid) | Not yet created; stub lands on the next 3+ dispatch coordination |

New inventory types are added when a new state-carrying surface emerges. Adding a type is itself a substantial dispatch that updates this rule's table; creating a stub on first touch satisfies the discipline. The table is non-exhaustive by construction; the conceptual list keeps the rule honest about not-yet-complete coverage rather than pretending stub-presence equals comprehensive cataloging.

**Closure-line format.**

```
Inventory-emission: docs/inventories/skills.md +1 entry (new-skill-name)
Inventory-emission: docs/inventories/routes.md +3 entries, -1 entry (new admin routes; deprecated old endpoint)
Inventory-emission: docs/inventories/migrations.md +1 entry (098)
Inventory-emission: docs/inventories/<type>.md no changes  (when the dispatch touches the surface but no inventory entry changes)
```

`git log --grep="Inventory-emission"` enumerates every commit that touched inventory state.

**What this rule is NOT.**

- NOT a requirement to maintain inventories that don't yet exist. Stub files at `docs/inventories/<type>.md` mark intent; populated form happens when a substantial dispatch first touches the surface.
- NOT a substitute for the source-of-truth files themselves. Inventories are operator-readable mirrors; the actual route files / migration files / etc. remain canonical.
- NOT applicable to dispatches the parent skill skips (investigation-only, hotfix, research-only, conversation-only).
- NOT a requirement to update every inventory on every dispatch. Only inventories whose surface the dispatch actually touches.

**How to apply.** At dispatch-scoping time, the brief identifies which inventories the dispatch will touch. At dispatch-close, the agent updates the relevant inventory file(s) and emits one `Inventory-emission:` line per inventory in the merge commit body.

**Worked example.** This very commit. It codifies the Inventory-artifact emission rule and relocates `docs/skill-inventory.md` to `docs/inventories/skills.md` (establishing the directory) and creates 7 stub entries (routes, migrations, worktrees, env-vars, cron-jobs, obs-status, components). The commit body carries both a `Loop-closure:` line (per the 8th binding rule) AND `Inventory-emission:` lines (per this 11th binding rule), practicing both disciplines in the same commit that codifies the second.

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
