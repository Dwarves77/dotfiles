# Sprint 4 — Governing State

**Status:** opening draft for operator sign-off. Once approved, this doc is the contract. The phase-gate checklists in section 7 are hard stops, not advice.

**Predecessor:** [sprint3-status-2026-05-26.md](dispatches/sprint3-status-2026-05-26.md) — deprecated as of 2026-05-29 (see deprecation header).

---

## 0. How this doc is used (the two mechanisms)

This doc exists because (a) state docs die of neglect when updating them is separate from doing the work, and (b) memory loads at session start and doesn't re-fire at decision boundaries. The two mechanisms below are the point.

### 0.1 Update-at-the-moment-of-work discipline

The state table in section 3 is updated as the work happens — at the moment a commit lands, a DB write succeeds, or a dispatch closes. NOT batched at session end. NOT deferred to "I'll write it up later."

Concretely:
- A commit that closes part of a phase: same turn that runs `git commit`, append the commit hash + state change to section 3.
- A production DB write that mutates customer-visible state: same turn, append the write outcome to section 3.
- A dispatch close: same turn, mark the row COMPLETE with the exit-checklist tick (see 7).
- A new operator ruling: same turn, append to section 4 (decision log) with the ABSENCE/ADHERENCE tag.

The rule lives in the doc so it can be quoted back if I drift. If a turn closes a phase without updating this doc, that turn is incomplete.

### 0.2 Phase-gate precondition checklists

Every phase in section 7 has an entry checklist and an exit checklist. The items are concrete and verifiable, not "remember the rule." Each item is a thing I have to do or confirm BEFORE starting the phase, or BEFORE marking it done.

A failed precondition is a hard stop. I halt and surface to the operator. I do not improvise around it.

The checklists are how memory re-fires at decision boundaries instead of decaying after session start. The act of walking the checklist is the re-read.

There is also a universal pre-check that applies before any work action, not tied to a phase:

```
UNIVERSAL PRE-CHECK (apply before every work action):
[ ] Am I about to claim something about an item's identity, status, or content?
    -> If yes, DB lookup with the exact id/legacy_id before asserting.
       Memory pointer: feedback_runtime_validation_before_fix.md
[ ] Am I about to quote a budget or cap?
    -> If yes, re-read: lift-cap-not-target. Is this a cap (halt threshold) or
       a target (expected spend)? They are NOT the same number.
       Memory pointer: feedback_lift_cap_is_not_a_target.md
[ ] Am I about to write to customer-facing data, or spend more than $0.50?
    -> If yes, STOP. Surface to operator. No write or call without explicit gate.
[ ] Am I about to invoke a content-generation prompt on more than 3 items?
    -> If yes, audit prompt output against a sample first.
       Memory pointer: feedback_prompt_audit_before_scaled_runs.md
[ ] Does this action match a precedent rule I should re-read?
    -> If MEMORY.md lists a rule in this domain, open the rule file and read it
       BEFORE acting, even if I think I remember it.
```

The universal pre-check runs implicitly every turn. When I notice I missed one, I update this doc.

---

## 1. Architectural ruling (the invariant)

**Provenance is a hard data-model invariant, not a feature.** Revision 2 (2026-05-29) expands the invariant to claim-level FACT grounding + analysis labeling + active sourcing + human verification for CRITICAL/HIGH.

A row in `intelligence_items` is admissible to the active corpus only if ALL of:

1. **Validated source.** Non-null `source_id` -> tiered `sources` row, status active.
2. **Citation URL grounding.** Every URL resolves to `source_url`, `agent_run_searches.result_url`, or another `sources.url`.
3. **Claim-level FACT grounding.** Every FACT claim is span-grounded; the cited source's actual content contains the asserted fact. CRITICAL/HIGH items require Tier 1-2 per-claim grounding.
4. **Labeling discipline.** Every substantive claim labeled FACT, ANALYSIS, or LEGAL. ANALYSIS in recognized label syntax. LEGAL routes to confirmation callout or fails.
5. **Active sourcing — no bare facts, no extrapolation.** Every FACT either span-grounded to an authoritative source OR replaced by EXPLICIT GAP statement. Bare unsourced facts and silently-omitted required slots fail.
6. **Human verification (CRITICAL + HIGH only).** Items at top two priority tiers pass the gate to `provenance_status = 'pending_human_verify'`, NOT `'verified'`. Admin queue per-claim tick required before customer-visible.

Items without sections satisfy 2-5 vacuously. They satisfy criterion 1. CRITICAL/HIGH shells without claims still pass through pending-human-verify with a "no claims to verify" tick.

Failure on any criterion 1-5: `'quarantined'`. CRITICAL/HIGH pass without admin tick: `'pending_human_verify'`. Both not customer-visible.

**Customer-facing affordance (revision 2 NEW):** FACT-grounded content in default treatment with source-span accessible; ANALYSIS in visually distinct treatment; LEGAL in its own clear callout. Customer sees the difference between sourced facts they rely on directly vs analytical reading to weigh and take to counsel.

Full design in [docs/designs/source-provenance-model.md](designs/source-provenance-model.md).

---

## 2. Active phase

**ENTERING PHASE 1 (Block 1 — invariant landing + Vercel Workflow DevKit substrate + source-tier audit UI, ~51h, 19 tasks).** Revision 2.2 sign-off recorded 2026-05-29 (see section 4). Three open questions from revision 2 locked (slots, ANALYSIS labels, verification queue). Revision 2.1 substrate split locked. Revision 2.2 Phase 1.5 added with integrity-rule constraint on Haiku tier recommendations.

**Sequence (revision 2.2):** PRE-BLOCK-1 -> **Phase 1 / Block 1 (active)** -> HARD CHECKPOINT 1 -> **Phase 1.5 / source-tier audit + provisional triage (~148 sources, $0.75, operator-paced)** -> Phase 2 / Reconciliation (dry-run + HARD CHECKPOINT 2 + execute) -> Phase 3 / Block 1.5 (per-item authority floor) -> HARD CHECKPOINT 3 (binding cap + green-light) -> Phase 4 / Block 4 (gated generation + visual affordance + verification queue).

Workflow invocation prepared; runtime will generate the orchestration script and surface an approval card for operator review BEFORE Phase 1 executes.

---

## 3. State table (update at the moment of work)

> Update rule: a row gets a new entry the same turn the commit lands or the DB write succeeds. Do not batch.

### 3.1 Sprint 3 carry-over status (reconciled from commits since 2026-05-26)

The prior status doc (sprint3-status-2026-05-26.md) marked these dispatches PENDING/HOLD. Commit reconciliation since then:

| Sprint 3 dispatch | State per stale doc (May 26) | Actual state per commits | Notes |
|---|---|---|---|
| A2 (signal_band + theme) | PARTIAL (commit 1 only) | COMPLETE | Commit 2 folded into 5f47fc3 (R-A+M-A callout fields) |
| A4 (trajectory schema + ingestion) | PENDING | COMPLETE | Migration 107 f63ee72, parser+RPC e77f46d, TrajectoryBars bdb335a, AGENT-WRITE-PLUMBING ab3e59f |
| A5 (intelligence_item_sections backfill) | PENDING | COMPLETE | A5.1 parser 6ead923, A5.2 backfill ab16214 (438 rows), A5.3 render c44415e, A5.4 Impact Assessment 640dbea, A5.5 Why-it-matters alignment 26ebea5, A5.6 close audit 81c8ca4. Plus 80-item URL-anchor backfill via 57673b4/028c957/832046f/92d742a (A5.4 sub-series). |
| A6 (regional_data_facts backfill) | PENDING | COMPLETE | A6.1 migration 3ea5fdd, A6.2 backfill eab64ac, A6.3a 44d537b, A6.3b 513c064, A6.4 close audit 8779487 |
| Group B (universal capabilities) | HOLD | Still HOLD | Per dispatch brief; not in Sprint 3 scope |
| Group C (multi-org, admin restructure, etc.) | HOLD | Still HOLD | Per dispatch brief |
| Group D (community thread urgency, etc.) | HOLD | Still HOLD | Per dispatch brief |

Sprint 3 closed for Group A. Sprint 4 picks up the provenance work and the unblocked Group B/C/D items per separate dispatch.

Out-of-band Sprint 3 work shipped during the same window:
- INGESTION-CLASSIFY-SOURCE-VS-REGULATION class fix (29f563a)
- Operations FactTable Anton-typography fix (61145ac)
- Priority dropdown reactivity fix (1f8cd1c)
- §15 SourcesList parser fix (c5b9894)
- Unified priority vocab + A5 affordance (4fd83b5)
- SF-2 part A INSERT (DB write, not commit) + part B AUTO-PROVISION (254cd9d)
- SF-2 seed-fallback rework (41503c0)
- PRIORITY-TAGGING dropdown stash (cd3bd5e)
- Moderate color token refresh (d99b7dc)

### 3.2 Sprint 4 Block work (revision 2 — Block 1 expanded for active sourcing + claim grounding + human verify)

| Phase | State | Commits / DB writes | Notes |
|---|---|---|---|
| PRE-BLOCK-1 (revision 2 docs) | IN PROGRESS | (this commit when written) | Revised 2026-05-29; awaiting operator sign-off on revision 2 |
| Block 1 — invariant landing + Vercel Workflow DevKit setup + source-tier audit UI (~51h, 19 tasks) | NOT STARTED | -- | Entry checklist 7.1; revision 2.2 spec; requires sign-off on Phase 1.5 add + task 1.15 |
| Phase 1.5 — source-tier audit + provisional-source triage (~$0.75 + ~90 min ticking) | NOT STARTED | -- | Revision 2.2 NEW phase between HC1 and Reconciliation; entry checklist 7.1.5; ~148 sources (73 seeded + 75 provisional from A6.2) |
| Reconciliation — 294 items | NOT STARTED | -- | Entry checklist 7.2; requires Block 1 COMPLETE + HC1 + Phase 1.5 COMPLETE so reconciliation runs against authoritatively-tiered sources |
| Block 1.5 — per-item authority floor (~2h) | NOT STARTED | -- | Entry checklist 7.3; ships after Reconciliation; folds in former Block 2 |
| Block 2 (removed in revision 2) | -- | -- | Folded into Block 1 task 7 system prompt update |
| Block 3 (removed in revision 2) | -- | -- | Folded into Block 1 task 7 system prompt update |
| Block 4 — gated generation + visual affordance + verification queue | NOT STARTED | -- | Entry checklist 7.6; HARD CHECKPOINT 3 before; requires binding cap + green-light THIS SESSION |

### 3.3 Corpus state (post-Option-C, post-2026-05-29 archive)

> Confirmed via DB query 2026-05-29 after the B-audit pull. The 64-and-214 split below is what's CURRENTLY ACTIVE PENDING reconciliation. It is NOT a count of verified survivors. Under strict criterion 2 (Reconciliation phase), most of the 64 sectioned items will quarantine for missing `agent_run_searches` logs — see the note at the end of section 8. The true post-reconciliation verified count surfaces at HARD CHECKPOINT 2.

| Set | Count | Status |
|---|---|---|
| Active D1 items pre-pull | 294 | -- |
| Pulled 2026-05-29 (B-audit fabrication) | 16 | `is_archived = true` (verified 16/16); 16 `integrity_flags` rows inserted with `created_by = 'b-audit-2026-05-29'` (verified) |
| Active D1 items post-pull | 278 | currently active, NOT YET reconciled against the invariant. Decomposed below. |
| Currently-active items with sections (Option C survivors, pending reconciliation) | 64 | `is_archived = false` right now. Block 1 Reconciliation will quarantine most under criterion 2 (missing `agent_run_searches` logs) regardless of citation cleanliness. |
| Currently-active items without sections (shells, pending reconciliation) | 214 | `is_archived = false` right now. Of these, ~135 have `source_id` -> tiered `sources` row and will pass invariant vacuously (criterion 2 vacuous). The other ~79 lack `source_id` (24) or some other criterion-1 failure. |
| Items lacking `source_id` (criterion 1 fail target) | 24 | will quarantine in Block 1 Reconciliation under criterion 1 |
| Items in `staged_updates` from Option C | 0 | none staged — Option C predates the gate |
| Items with `provenance_status = 'verified'` | 0 | column doesn't exist yet (Block 1 adds it) |
| Projected post-reconciliation verified count | ~135 | strict projection from section 6 of source-provenance-model.md; surfaces precisely at HARD CHECKPOINT 2 |

### 3.4 Audit artifacts

| Artifact | Location | Run date |
|---|---|---|
| Option C URL-anchor backfill log | [fsi-app/scripts/.a5-sonnet-backfill.log](../scripts/.a5-sonnet-backfill.log) | 2026-05-29 |
| Part 1 audit script (B reachability) | [fsi-app/scripts/audit-optionc-reachability.mjs](../scripts/audit-optionc-reachability.mjs) | 2026-05-29 |
| Part 1 audit script (sources mapping) | [fsi-app/scripts/audit-optionc-sources.mjs](../scripts/audit-optionc-sources.mjs) | 2026-05-29 |
| Part 1 B audit report | C:/Users/jason/AppData/Local/Temp/optionc-b-audit.txt | 2026-05-29 |
| Part 1 C audit transcript | conversation 2026-05-29 (folded into source-provenance-model.md section 8) | 2026-05-29 |
| Provenance design doc | [docs/designs/source-provenance-model.md](designs/source-provenance-model.md) | 2026-05-29 |
| Fabricated items archive script | [fsi-app/scripts/flag-fabricated-items.sql](../scripts/flag-fabricated-items.sql) | 2026-05-29 |
| Fabricated items extractor | [fsi-app/scripts/extract-fabricated-items.mjs](../scripts/extract-fabricated-items.mjs) | 2026-05-29 |

### 3.5 Pending operator actions

| Item | Notes |
|---|---|
| Sign-off on this governing doc + workflow spec | RECORDED 2026-05-29 — see decision log entries in section 4 |
| Visual re-verify shipped Sprint 3 tracks | Carosledge.com — parser fix on a4, priority labels, A5 affordance, AUTO-PROVISION test. Tracked from prior sessions; still pending. |
| Trigger b2-runner regen pass (~6h, ~$23) | Held pending Block 1; would re-run as gated generation post-Block-1. |
| Triage 75 provisional sources from A6.2 backfill | Independent of provenance work; safe to do anytime. |

---

## 4. Decision log

> Append-only. Every operator ruling lands here the turn it's made, with the ABSENCE/ADHERENCE tag from the self-audit.

| Date | Ruling | Stated by operator | ABSENCE / ADHERENCE | Memory + doc pointer |
|---|---|---|---|---|
| 2026-05-28 | Do not use U+00A7 section-sign glyph in chat or new code; UI keeps it as legal notation | After §15 parser fix landed | ABSENCE — rule did not exist before | [feedback_avoid_section_symbol](~/.claude/projects/.../memory/feedback_avoid_section_symbol.md) |
| 2026-05-29 | Backfill scope churn: D1 active = `domain = 1 AND is_archived = false`, not item_type filter | Implicit through correction of 304 -> 88 -> 80 sequencing | ABSENCE — no canonical D1 definition document existed; this doc + corpus-axis memory together codify it | [project_caros_ledge_corpus_axis](~/.claude/projects/.../memory/project_caros_ledge_corpus_axis.md) |
| 2026-05-29 | Lift-cap ≠ target. Removing a budget ceiling does not authorize spending up to it. Quote expected spend separately from cap. | "We do not want to spend money when it's possible to not do so and get a good result." | ABSENCE — rule did not exist before | [feedback_lift_cap_is_not_a_target](~/.claude/projects/.../memory/feedback_lift_cap_is_not_a_target.md) |
| 2026-05-29 | Audit content-generation prompt output against a known-good standard on a sample BEFORE invoking workflows that write at scale | "If the prompt has an inference-as-fact flaw, this workflow propagates it across all of D1 in 25 minutes" | ABSENCE — rule did not exist before | [feedback_prompt_audit_before_scaled_runs](~/.claude/projects/.../memory/feedback_prompt_audit_before_scaled_runs.md) |
| 2026-05-29 | Workflow-first for future Caro's Ledge build dispatches; sequential subagent dispatch only for fundamentally serial work | "I want the future build of the entire site done this way" | ABSENCE — rule did not exist before | [feedback_caros_ledge_workflow_first](~/.claude/projects/.../memory/feedback_caros_ledge_workflow_first.md) |
| 2026-05-29 | Off-vertical reclassification is a Sprint 4 candidate; AI Act + Workflow 1 surfaced candidates feed the queue | Surfaced after Option C honest-empty AI Act items | ABSENCE — distinct from CORPUS-RECLASSIFY | [project_sprint4_off_vertical_reclassification](~/.claude/projects/.../memory/project_sprint4_off_vertical_reclassification.md) |
| 2026-05-29 | R28 wrong-URL precedent: verify item identity via DB before asserting | After I claimed r28 was UK SAF Mandate (wrong — UK SAF is `a4`; r28 is H2 Accelerate) | ADHERENCE — rule existed in `feedback_runtime_validation_before_fix`; I did not apply at the moment of claim | [feedback_runtime_validation_before_fix](~/.claude/projects/.../memory/feedback_runtime_validation_before_fix.md) |
| 2026-05-29 | Architectural ruling: provenance is a hard data-model invariant, not a feature | "A dataset within this app cannot exist without verified source and provenance information... This is a constraint on the data model, treat it as immutable going forward." | ABSENCE — codified by this doc + source-provenance-model.md | [source-provenance-model.md](designs/source-provenance-model.md) |
| 2026-05-29 | Enforce invariant at write/schema layer, not prompt | Same message | ABSENCE — codified by source-provenance-model.md section 3 | [source-provenance-model.md sections 3-4](designs/source-provenance-model.md) |
| 2026-05-29 | Accept strict 159 quarantine count; no refinements | Stated as the architectural ruling implies it; operator confirmed by listing as a decided ruling | New decision — answers section 10 open question of design doc | source-provenance-model.md section 6 |
| 2026-05-29 | Authority floor: Tier 1 OR Tier 2 satisfies CRITICAL/HIGH (not Tier 1 strict) | Confirmed by operator listing | New decision — answers section 10 open question of design doc | source-provenance-model.md section 5 component 3 |
| 2026-05-29 | Hide quarantined items entirely from customer surfaces; no placeholder | Confirmed by operator listing | New decision — answers section 10 open question of design doc | source-provenance-model.md section 6 |
| 2026-05-29 | `intelligence_items.source_id` enforced as NOT NULL in Block 1, not deferred | Confirmed by operator listing | New decision — answers section 10 open question of design doc | source-provenance-model.md section 4 |
| 2026-05-29 | Pull the 16 confirmed-fabrication items NOW; does not wait for governing doc | "Still ahead of all of it, NOW: pull the 16-of-19 confirmed-fabrication items." | Direct authorization of production write outside the standard flow | DB writes applied 2026-05-29 (see section 3.3, scripts/flag-fabricated-items.sql) |
| 2026-05-29 | SIGN-OFF on governing doc (sprint4-governing-state.md), with two fixes: renumber duplicate 3.3 headers, clarify line-133 the 64-and-214 split is currently-active-pending-reconciliation (not verified survivors) | "GOVERNING DOC — sign-off APPROVED. Two fixes: ..." (operator message 2026-05-29) | Operator approval; fixes folded in same turn (see corrected sections 3.3 + 3.4 + 3.5) | This doc, sections 3.3-3.5 corrected |
| 2026-05-29 | SIGN-OFF on workflow spec (sprint4-workflow-spec.md); 3-checkpoint placement and dry-run-then-checkpoint-then-execute on reconciliation explicitly approved | "WORKFLOW SPEC — sign-off APPROVED. The three hard checkpoints are correctly placed (gate-verify, quarantine-list-inspect, cap+green-light). The dry-run-then-checkpoint-then-execute structure on reconciliation is right..." (operator message 2026-05-29) | Operator approval | [sprint4-workflow-spec.md](sprint4-workflow-spec.md) |
| 2026-05-29 | Standing rule reiterated: approving the workflow spec is NOT approving the quarantine (HARD CHECKPOINT 2) or the generation spend (HARD CHECKPOINT 3); those gate separately when reached | "To be explicit on the standing rule: approving these two docs is NOT approving the quarantine (Hard Checkpoint 2) or the generation spend (Hard Checkpoint 3). Those gate separately when reached, as specified." | Operator clarification; not a new rule — restates the workflow spec section 7 + 8 contract | sprint4-workflow-spec.md sections 3, 7, 8 |
| 2026-05-29 | INVARIANT EXPANSION: the gate must distinguish FACTS (true to source, span-grounded), ANALYSIS (permitted; labeled), LEGAL (off-limits; routes to confirmation). Current design validates citations only, not claims. Phase 1 build held until claim-level grounding designed in. | "Our core selling point is accurate data and analysis. The standard is absolute: if the system fabricates ANYTHING, it has failed." (operator message 2026-05-29) | New direction — fundamental gate expansion | designs/source-provenance-model.md revision 2 |
| 2026-05-29 | Addition A strengthened to ACTIVE SOURCING: agent must search for authoritative source if it doesn't have one; if none found, emit EXPLICIT GAP statement; never bare assertion, never extrapolation | "If the agent doesn't already have a source for a FACT, it must go FIND an authoritative source that specifically supports that fact before stating it." (operator message 2026-05-29) | New direction — generation contract change, not just defensive validation | source-provenance-model.md section 5 Component 3 |
| 2026-05-29 | Addition A + B + D APPROVED for Block 1; Addition C (per-item authority floor) approved as Block 1.5 | Operator approval message 2026-05-29 | Sprint 4 scope decision | source-provenance-model.md section 7 (revised Block 1 task table) |
| 2026-05-29 | Tier scope for human verification: CRITICAL + HIGH both gate to `pending_human_verify` | "CRITICAL + HIGH, both gate to pending_human_verify before publish... the audit showed fabrication concentrates in HIGH/SECONDARY" | New ruling | source-provenance-model.md section 5 Component 6 |
| 2026-05-29 | Span-check timeout policy: 2-3 retries with backoff, then route to staging. NEVER accept because historically reachable. Timeout = UNVERIFIED. | "A timeout means the claim is UNVERIFIED, and unverified is not verified, so shipping it because the network hiccupped is the same failure with an excuse." | New ruling | source-provenance-model.md section 5 Component 7 |
| 2026-05-29 | Legal-interpretation block via pattern-match at validation with route-to-staging on flag. Accept false positives as the asymmetry. Prompt-only enforcement too weak for legal tier. | "A false positive is minor friction; a published legal conclusion the agent shouldn't have drawn violates my firmest standing rule." | New ruling | source-provenance-model.md section 5 Component 4 |
| 2026-05-29 | Customer-facing FACT/ANALYSIS/LEGAL visual affordance is REQUIRED and ships with first gated-generation pass (Block 4 scope) | "Analysis must be visibly labeled to the customer, not just internally. This is part of what we sell." | New ruling — surface scope | source-provenance-model.md section 5 Component 4 |
| 2026-05-29 | SIGN-OFF on revision 2: governing doc + workflow spec both APPROVED | "Both revised docs APPROVED at revision 2. Verified the six-criteria invariant, the active-sourcing + explicit-gap logic, the claim-provenance schema, the Block 2/3 fold-into-1.7, the four-phase structure with three checkpoints, the affordance-before-generation ordering, and the six HC3 pre-run probes. All faithful to the rulings. Internally consistent on cost ($0.55/item, max_uses=10, ~$104 expected, ~$150 cap)." | Operator approval | This doc revision 2 + workflow-spec revision 2 |
| 2026-05-29 | LOCKED DECISION (open question 1): same four required slots for ALL D1 item_types in Block 1: effective_date, primary_deadline, jurisdictional_scope, penalty_summary. The slot rule is "addressed," not "has a number." `penalty_summary` is satisfiable by an explicit-gap label where an instrument genuinely has no penalty provision (e.g., "no penalty provision in this instrument") — counts as addressed. Per-type customization deferred to Block 1.5 only if the uniform four prove wrong in practice. | "Same four for all D1 item_types in Block 1... Refinement: penalty_summary is satisfiable by an explicit-gap label where an instrument genuinely has no penalty provision. The slot rule is 'addressed,' not 'has a number.'" | New ruling, locked | source-provenance-model.md Component 3 (required slots) |
| 2026-05-29 | LOCKED DECISION (open question 2): ANALYSIS label syntax = CLOSED SET of four EXACT patterns; validation uses exact-match regex, NOT fuzzy matching. Approved patterns: `*Per the workspace's reading:*`, `*Analytical inference:*`, `*Industry interpretation:*`, `*Operational implication:*`. A near-miss phrase ("our reading suggests") FAILS as unlabeled. A fifth pattern later is a deliberate addition to the enumerated set, NEVER a fuzzy allowance. | "TIGHTENING: closed set, EXACT-match for the validation regex, NOT fuzzy. A near-miss phrase ('our reading suggests') fails as unlabeled. Fuzzy label matching reopens the inference-as-fact gap." | New ruling, locked — directly closes a vector for inference-as-fact drift | source-provenance-model.md Component 4 |
| 2026-05-29 | LOCKED DECISION (open question 3): verification queue is per-claim tick ONLY. NO batch-tick. The one efficiency is source span pre-displayed next to each claim so the reviewer isn't hunting. The tick stays per-claim with span in view. | "Bottlenecking is the point. No batch-tick, it enables rubber-stamping without reading, which is verification theater and defeats the reason CRITICAL/HIGH gate to human review." | New ruling, locked | source-provenance-model.md Component 6 |
| 2026-05-29 | RULING: Workflow substrate split. Claude Code Dynamic Workflows orchestrates the BUILD (Block 1 + Reconciliation + Block 1.5). **Vercel Workflow DevKit (workflow@4.2.5 stable) is the substrate for Phase 4 generation** — DurableAgent for active sourcing + RetryableError for span-check retries + createHook/resumeHook for the CRITICAL/HIGH human-verify gate. Block 1 effort grows ~39h to ~48h (4 new infrastructure tasks 1.0a-1.0d + integration touches in 1.5/1.6/1.12/1.14). | "Use Claude Code dynamic workflows to orchestrate the build... Use Vercel Workflow DevKit as the substrate for the actual generation pipeline... Worth the ~9h Block 1 growth." | New direction; substrate decision | sprint4-workflow-spec.md revision 2.1 |
| 2026-05-29 | Stability check on workflow@4.2.5: PASS. Latest stable, published 2026-05-22 (~7 days). Active weekly v4 release cadence through April-May 2026. v5 in beta (5.0.0-beta.8); we use v4 stable. Next.js compat: `@workflow/next` peerDep `>13` accepts 16.1.6. License Apache-2.0. Vercel-owned (first-party for our deploy platform). Residual unknown: Pro plan tier verification deferred to task 1.0d (`npx workflow inspect runs --backend vercel`). | "Before you build: confirm Vercel Workflow DevKit is production-stable... compatible with our current Next.js version + Vercel plan." | Operator-gated stability check | Bash verification 2026-05-29 |
| 2026-05-29 | SIGN-OFF on revision 2.1 with one refinement: Block 1 task 1.0c stub must include the STEP STRUCTURE (named steps with empty bodies), not just an empty function. Block 1 proves the step skeleton registers + checkpoints correctly via `npx workflow inspect run <runId>`; Block 4 fills logic into proven steps. | "include the STEP STRUCTURE (named steps: source-or-find, persist agent_run_searches, validate, route, the createHook/await/resume loop) with empty bodies, not just an empty function. Block 1 proves the step skeleton registers + checkpoints correctly; Block 4 fills logic into proven steps." | Operator approval + step-skeleton refinement | workflow-spec task 1.0c revised |
| 2026-05-29 | RULING reiterated: build orchestration stays Claude Code Dynamic Workflows; Vercel Workflow DevKit is the Phase 4 substrate ONLY, not the build orchestrator. | "Vercel Workflow DevKit is the Phase 4 substrate, not the build orchestrator — build orchestration stays Claude Code subagents per the substrate split." | Operator clarification | This doc + workflow spec |
| 2026-05-29 | Standing rule reiterated (third time): approving revision 2.1 is NOT approving quarantine (HC2) or generation spend (HC3). Those gate separately. | "Standing rule holds: approving this is NOT approving quarantine (HC2) or generation spend (HC3). Those gate separately." | Operator clarification | workflow-spec sections 4, 7, 8 |
| 2026-05-29 | FRAMING CORRECTION: there are no customers yet — pre-launch. "Customer view" throughout these docs means "launch corpus / publish surface." "Pulled from customer view" means "excluded from launch corpus." Nothing fabricated has reached a real user. This is pre-launch data hygiene, not live-harm remediation. The corpus we build the site on IS what we launch with — gate ensures born-verified during build-out; reconciliation cleans the 278 before they become launch content. The 16 archived items were excluded from launch corpus, not pulled from live customer view. | "Correction on framing: there are no customers yet. We're building the site now, pre-launch... This doesn't reduce the work — it sharpens the timing." | Framing correction; work + structure unchanged | This doc + design + workflow-spec (future-readers interpret "customer-visible" as "launch-corpus-visible") |
| 2026-05-29 | REVISION 2.2: Phase 1.5 source-tier audit + provisional-source triage added between HC1 and Phase 2 Reconciliation. ~148 sources (73 seeded + 75 provisional from A6.2). Haiku recommends `effective_tier` + confidence + rationale (~$0.75 total); operator ticks accept/override/flag; ambiguous tiers FLAGGED for operator, not guessed. Reconciliation then runs against authoritatively-tiered sources. Block 1 grows to 19 tasks ~51h (adds task 1.15 source-tier audit UI extension to ProvisionalReviewCard). | "Add it. Phase 1.5 source-tier audit between HC1 and Phase 2 reconciliation. Revision 2.2... If the floor (criterion 3) enforces against base_tier values we haven't verified, items pass the authority floor on mislabeled sources — structural fabrication." | New direction; pre-launch tier hygiene | source-provenance-model.md Component 1 + workflow-spec section 4.5 NEW |
| 2026-05-29 | Integrity rule applies to Phase 1.5: Haiku RECOMMENDS source tiers with rationale and confidence; it does NOT assert tier as fact. Operator tick is authority. Source whose correct tier is genuinely ambiguous gets FLAGGED for operator decision, not guessed. Same fact-vs-inference discipline as the briefs. | "the tier audit is itself subject to the integrity rule. Haiku RECOMMENDS a tier with rationale; it does not assert the tier as fact. The operator tick is the authority. A source whose correct tier is genuinely ambiguous gets flagged for me, not guessed." | New ruling | source-provenance-model.md Component 1 (Phase 1.5) |

### 4.1 Drift pattern summary

Through the architectural ruling and the 4 open-question rulings: 11 absence rulings, 1 adherence ruling, plus 4 non-classified entries (the architectural ruling itself, the 4 open-question answers, the 2 sign-offs, and the standing-rule reiteration are not "drifts" in the absence/adherence sense — they are new direction, decisions, and explicit reinforcements respectively).

The 4-absence / 1-adherence ratio from my self-audit still describes the DRIFTS specifically. The one adherence failure (r28 URL claim) is the case where a memory rule existed and I did not re-read it at the moment of action — exactly the failure mode the universal pre-check in section 0.2 is built to catch.

---

## 5. Standing constraints (pointers, not copies)

The actual rules live in memory and CLAUDE.md. This section is the index — what to consult, when. Do not duplicate rule text here; the duplication is what lets drift open between copies.

### 5.1 Project-level

- [fsi-app/CLAUDE.md](../CLAUDE.md) — agent runtime contract, verification-before-authorization, code-vs-data state separation, reuse-before-construction, accordion-default-CLOSED, API security policy, integrity flags contract
- [fsi-app/.claude/skills/environmental-policy-and-innovation/SKILL.md](../.claude/skills/environmental-policy-and-innovation/SKILL.md) — brief format contract (14-section regulatory fact document + 4 non-regulatory formats)
- [docs/dispatches/sprint3-dispatch-brief.md](dispatches/sprint3-dispatch-brief.md) — Sprint 3 scope contract (closed)
- [docs/designs/source-provenance-model.md](designs/source-provenance-model.md) — Sprint 4 invariant design

### 5.2 Memory rules in force this sprint

Listed in priority order — the top items are most likely to fire during Sprint 4 work.

- feedback_prompt_audit_before_scaled_runs — audit before any content-generation workflow
- feedback_lift_cap_is_not_a_target — budget caps are halt thresholds, not spend targets
- feedback_runtime_validation_before_fix — DB lookup before claiming item identity
- feedback_caros_ledge_workflow_first — workflow-shape new build dispatches
- feedback_avoid_section_symbol — chat/new-code no glyph; UI keeps it
- feedback_integrity_rule_absolute — no fabricated content even at the margin
- feedback_design_reference_protocol — read mockup before surface code
- feedback_production_surface_verification — DB green != customer-surface green
- feedback_environment_identity_via_screenshot — operator screenshot beats code-side inference for environment ID
- feedback_migration_file_discipline — data changes default to migration files
- feedback_brief_drift_precedent — mockup wins when dispatch language conflicts with canonical mockup
- feedback_drive_dispatch_surface_mismatches — raise alarm immediately on surface/dispatch mismatch
- feedback_websearch_before_source_identity — verify externally before flagging entries as hallucinated
- project_caros_ledge_corpus_axis — corpus completeness is a separate axis from feature work
- project_sprint4_off_vertical_reclassification — distinct from CORPUS-RECLASSIFY

### 5.3 Global

- [~/.claude/CLAUDE.md](~/.claude/CLAUDE.md) — Git Bash, no fluff, diagnose-before-fix, /done discipline
- ~/.claude/projects/.../memory/MEMORY.md — index of all memory entries

---

## 6. Open questions

None at sign-off time. The operator's most recent message answered all four open questions from the design doc (strict quarantine, Tier 1+2 floor, hide entirely, source_id NOT NULL).

Items that may surface during Sprint 4 land in section 8.

---

## 7. Phase-gate precondition checklists

> These are HARD STOPS. A failed precondition halts the phase. I surface to the operator. I do not work around it.

### 7.1 Block 1 — invariant landing (REVISION 2 — expanded for active sourcing + claim grounding + human verify)

**Entry checklist** (walk before starting any Block 1 work):

```
[ ] This doc has explicit operator sign-off on REVISION 2 recorded in
    section 4 of the decision log with date/quote.
[ ] feedback_runtime_validation_before_fix re-read in this session.
[ ] feedback_migration_file_discipline re-read in this session.
[ ] feedback_integrity_rule_absolute re-read in this session (the
    invariant builds on it; "anything fabricated = failure" is the bar).
[ ] feedback_prompt_audit_before_scaled_runs re-read in this session
    (prompt audit runs in Block 1 task 7 system prompt update).
[ ] CLAUDE.md "Verification Before Authorization" section re-read in
    this session.
[ ] Block 1 scope confirmed from source-provenance-model.md section 7
    AND workflow-spec section 2 revision 2.1: 18 tasks, ~48h total
    (4 Vercel Workflow DevKit infrastructure tasks 1.0a-1.0d added in
    revision 2.1; the rest unchanged from revision 2).
[ ] Vercel Workflow DevKit substrate confirmed for Phase 4 per decision
    log 2026-05-29: workflow@4.2.5 stable, Apache-2.0, Next.js peerDep
    >13 satisfied by 16.1.6.
[ ] All six criteria of the invariant understood and present in the
    plan: (1) validated source, (2) URL grounding, (3) claim FACT
    grounding + active sourcing, (4) labeling, (5) explicit-gap-for-
    missing-facts, (6) human verify for CRITICAL/HIGH.
[ ] Verified there is no in-flight Sprint 3 work that would conflict
    (state table 3.1 shows Sprint 3 dispatches COMPLETE except listed
    pending operator actions).
[ ] No customer-facing DB writes are planned in Block 1 (Block 1 is
    schema + functions + triggers + scripts + admin UI; data writes
    happen in Reconciliation phase).
[ ] No model calls cost more than $5 in any single subtask. Total
    Block 1 model spend estimate: ~$1-2 for prompt audit sample in
    task 7. Otherwise code-only.
```

**Exit checklist** (walk before marking Block 1 COMPLETE):

```
VERCEL WORKFLOW DEVKIT INFRASTRUCTURE (revision 2.1 tasks 1.0a-1.0d):
[ ] `workflow@^4.2.5`, `@workflow/ai@^4.1.2`, `@workflow/next@^4.0.6`
    installed in `fsi-app/package.json`; lockfile committed.
[ ] `withWorkflow` wired in Next.js setup; `npx workflow health`
    returns OK in dev.
[ ] `src/workflows/generate-brief.ts` scaffolded with FULL STEP
    SKELETON, empty bodies (operator refinement 2026-05-29). Named
    steps registered: `sourceOrFindForClaim`, `persistAgentRunSearches`,
    `validateItemProvenance`, `routeOnValidation`. Workflow body
    contains the createHook/await/resume loop scaffold for per-claim
    verification with deterministic token `verify-${itemId}-${claimId}`.
    Real logic fills in Block 4. `tsc --noEmit` clean.
    Verification: `start(generateBriefWorkflow, [testItemId])` returns
    real `runId`; `npx workflow inspect run <runId>` shows each named
    step as a checkpoint (proves the skeleton registers + durably
    checkpoints correctly).
[ ] Vercel plan tier confirmed for Workflow DevKit production:
    `npx workflow inspect runs --backend vercel --project <project>`
    returns the project's runs list (empty is OK; non-error response
    is what matters).

SCHEMA + FUNCTION + TRIGGER (criteria 1-6 infrastructure):
[ ] Migration applied: `provenance_status` enum (incl.
    `pending_human_verify`), `provenance_verified_at`,
    `agent_run_searches` (with `result_content_excerpt`),
    `section_claim_provenance`, `item_type_required_slots`. Columns
    and tables verified via DB query.
[ ] Required slots seeded for `regulation` item_type: effective_date,
    primary_deadline, jurisdictional_scope, penalty_summary. Verified
    via DB query.
[ ] Function `validate_item_provenance` exists; all six criteria
    implemented. Synthetic test cases pass:
    [ ] Item with valid source_id + grounded URLs + span-grounded
        FACT claims + labeled ANALYSIS + slots satisfied AND priority
        MODERATE returns `valid: true`, status: 'verified'.
    [ ] Same item but priority CRITICAL returns `valid: true`, status:
        'pending_human_verify'.
    [ ] Item with bare unsourced fact returns `valid: false`,
        failure list includes the offending claim.
    [ ] Item with ANALYSIS-tagged span but no label syntax returns
        `valid: false`.
    [ ] Item with LEGAL-pattern in regulatory subject prose (e.g. "the
        workspace is required to") with no callout wrap returns
        `valid: false`.
    [ ] Item missing required slot (e.g., no effective_date FACT or GAP
        row) returns `valid: false`.
[ ] Trigger `set_provenance_status` fires on INSERT/UPDATE of
    `intelligence_items`, `intelligence_item_sections`, or
    `section_claim_provenance`; verified via test insert sequences.

GENERATION PIPELINE INSTRUMENTATION:
[ ] `/api/agent/run` instrumentation persists `agent_run_searches`
    rows including `result_content_excerpt`; verified via a test
    invocation + DB query.
[ ] `/api/agent/run` parses `section_claim_provenance` payload from
    agent output (FACT / ANALYSIS / LEGAL / GAP claims with spans);
    verified via a synthetic agent response.
[ ] `b2-runner.mjs` and `sprint3-a5-sonnet-backfill.mjs` updated with
    parallel instrumentation; `node --check` clean.
[ ] System prompt update committed including: source-or-explicit-gap
    contract, per-claim emission contract, active-sourcing instructions,
    slot enforcement awareness, ANALYSIS label patterns, LEGAL routing.
[ ] Parser extension (`parse-output.ts`) committed; `tsc --noEmit`
    clean.
[ ] Prompt audit on a 3-item sample run BEFORE marking task 7
    complete; audit shows the new contract takes effect (FACT spans,
    ANALYSIS labels, GAP statements where appropriate). Findings
    documented in section 8 of this doc.

VIEW + STAGED + ADMIN VERIFY UI:
[ ] View `active_intelligence_items` created and filters to
    `provenance_status = 'verified'`; verified via DB query.
[ ] Customer-facing fetcher (`src/lib/supabase-server.ts`) cuts over
    to the view; verified via code review + tsc.
[ ] `staged_updates` UI extension surfaces: ungrounded URLs,
    unverified spans, unlabeled assertions, missing required slots,
    pattern-flagged legal conclusions. Verified via local render with
    synthetic staged rows for each failure mode.
[ ] Admin verification queue at `/admin → Items pending verification`
    surfaces CRITICAL/HIGH pending items with per-claim source-span
    pre-display + tick mechanism. Verified via local render with
    synthetic pending item.
[ ] Tick mechanism updates `section_claim_provenance.verified_by` +
    `verified_at`; verified via DB query after a test tick.
[ ] When all FACT claims for a CRITICAL/HIGH item are ticked, item
    flips to `'verified'` and becomes customer-visible. Verified via
    test sequence.

RECONCILIATION SCRIPT (ready for Phase 2, not run in Phase 1):
[ ] Reconciliation script `sprint4-provenance-reconcile.mjs` written
    and reviewed; supports `--dry-run` (default) and `--execute`
    flags. `node --check` clean.

TIMEOUT POLICY:
[ ] Span-check fetch logic in validation function implements 2-3
    retries with exponential backoff; on exhaustion routes the claim
    to `staged_updates`, never accepts as verified.

CORPUS STATE:
[ ] No items have had `provenance_status` changed yet (Reconciliation
    is Phase 2; Block 1 only puts the column there with default
    'unverified').

PUSH + DOC UPDATE:
[ ] All commits pushed; state table 3.2 updated with hashes the turn
    the commits landed.
[ ] Decision log appended with any rulings made during Block 1.
```

### 7.2 Reconciliation — 294-item audit

**Entry checklist:**

```
[ ] Block 1 marked COMPLETE in state table; exit checklist all ticks.
[ ] Reconciliation script `sprint4-provenance-reconcile.mjs` written and
    reviewed.
[ ] Script's UPDATE statement is gated by an `--execute` flag; a dry-run
    mode is the default.
[ ] feedback_runtime_validation_before_fix re-read.
[ ] feedback_lift_cap_is_not_a_target re-read — this phase does NOT
    spend model budget, but the principle that "no operation without an
    explicit cap" applies to write volume too. Expected write count: 294
    UPDATE statements + ~159 integrity_flags inserts.
[ ] Operator green-light for the reconciliation run captured in section 4
    with date/quote.
[ ] Backup verification: confirmed Supabase has automatic point-in-time
    recovery enabled (default for projects on Pro plan).
```

**Exit checklist:**

```
[ ] All 294 items have a `provenance_status` value set; 0 rows with
    status `'unverified'`.
[ ] Quarantine count matches projection (~159 strict ± 1-2 from churn);
    discrepancy logged if >5.
[ ] View `active_intelligence_items` created and returns the projected
    ~135 row count.
[ ] All 159 quarantined items have an `integrity_flags` row recording
    the cause; verified via JOIN query.
[ ] Customer-facing reads switched to the view; verified by running the
    Kanban listing fetch against the view.
[ ] State table 3.2 updated with the post-reconciliation counts the turn
    the script finishes.
```

### 7.1.5 Phase 1.5 — Source-tier audit + provisional-source triage (revision 2.2 NEW)

**Entry checklist:**

```
[ ] Block 1 COMPLETE; HARD CHECKPOINT 1 passed.
[ ] Block 1 task 1.15 (source-tier audit UI extension) is live in
    the admin surface; verified by local render.
[ ] feedback_integrity_rule_absolute re-read.
[ ] feedback_lift_cap_is_not_a_target re-read — Phase 1.5 expected
    ~$0.75 Haiku; cap recommended $5 as safety ceiling.
[ ] Operator confirms readiness to tick ~148 sources at operator
    pace (~90 min if averaging 35 seconds per source).
```

**Exit checklist:**

```
[ ] All ~148 sources have been ticked: accept / override / flag.
[ ] Sources with tick `accept` have `sources.base_tier` updated to
    `recommended_tier`; verified via DB query.
[ ] Sources with tick `override` have `sources.base_tier` updated
    to operator-typed value; verified via DB query.
[ ] Provisional sources with tick `accept` are promoted via
    `/api/admin/sources/promote`; verified by appearance in `sources`.
[ ] Sources with tick `flag` have an `integrity_flags` row of
    category `source_issue`, status `open`; verified via DB query.
[ ] Yield report committed to section 8 of this doc: counts of
    accept / override / flag; list of Haiku-operator disagreements;
    list of flagged-ambiguous sources.
[ ] No item in `intelligence_items` has had its `provenance_status`
    changed in Phase 1.5 (item-level changes happen in Phase 2
    Reconciliation, which runs against the now-corrected tiers).
```

### 7.3 Block 1.5 — per-item authority floor (revision 2: was Block 2)

**Entry checklist:**

```
[ ] Block 1 + Reconciliation marked COMPLETE.
[ ] feedback_integrity_rule_absolute re-read — per-item floor enforces
    the integrity rule at the priority level.
[ ] System prompt change reviewed against SKILL.md for contradiction.
[ ] Test case prepared: a CRITICAL D1 item with no Tier 1-2 source.
    Expected: agent emits `authority_floor_breach: true` flag-and-stop
    rather than filling from secondary sources.
[ ] Confirmed that per-claim authority floor (already in Block 1
    Component 3) covers most cases; per-item floor is the edge-case
    backstop.
```

**Exit checklist:**

```
[ ] System prompt update committed; per-item floor rule visible in
    system-prompt.ts.
[ ] `validate_item_provenance` extended with per-item floor check;
    verified via DB query against test item.
[ ] Test item with no Tier 1-2 source returns `authority_floor_breach`
    failure; integrity flag created with category `source_issue`.
[ ] Admin queue filter on `source_issue` category surfaces the test
    flag; verified via local render.
```

### 7.4 (REMOVED in revision 2) Block 2 — folded into Block 1 task 7 system prompt update

### 7.5 (REMOVED in revision 2) Block 3 — folded into Block 1 task 7 system prompt update

The two prompt patches (legal-confirmation callout, non-regulatory empty-{} rule) now ship as part of Block 1's system prompt update. They are not a standalone block.

### 7.6 Block 4 — generation under the gate (revision 2: customer affordance + active sourcing + human verify)

**Entry checklist** (most consequential gate in Sprint 4):

```
[ ] Block 1 marked COMPLETE in state table (revision 2 ~39h scope); all
    14 task exit checklist items ticked.
[ ] Block 1.5 (per-item authority floor) either marked COMPLETE or
    operator confirms it's deferred to Block 4.5.
[ ] Reconciliation marked COMPLETE; quarantine count surfaced and
    operator-inspected at HARD CHECKPOINT 2.
[ ] Binding cost cap set, written into the workflow dispatch text, and
    captured in decision log section 4 THIS SESSION.
[ ] EXPECTED cost separate from cap, also captured. Per
    feedback_lift_cap_is_not_a_target: cap is the halt threshold, not
    the spend target. Expected ~$0.55/item; 139 shells + ~50 regens =
    ~$104. Cap recommended ~$150.
[ ] Operator green-light for the generation run captured in decision
    log section 4 THIS SESSION (not a prior session).
[ ] feedback_lift_cap_is_not_a_target re-read.
[ ] feedback_prompt_audit_before_scaled_runs re-read.
[ ] feedback_integrity_rule_absolute re-read — the operator's standard
    is "anything fabricated = failure"; this Block ships generation
    against that standard.

GATE LIVE-VERIFICATION (no probes pass = no Phase 5 start):
[ ] Pre-run probe 1 (URL grounding): single test gen item; verifies
    `agent_run_searches` populated AND every section URL traces back.
[ ] Pre-run probe 2 (FACT span grounding): same item; verifies each
    FACT claim's span exists in the cited source content.
[ ] Pre-run probe 3 (labeling discipline): same item; verifies ANALYSIS
    is labeled, no unlabeled strong-modal assertions, LEGAL routes
    correctly.
[ ] Pre-run probe 4 (active-sourcing contract): given a synthetic item
    whose source_url doesn't contain a specific penalty figure, agent
    either finds an authoritative Tier 1-2 source that does OR emits
    an EXPLICIT GAP statement. Verifies the source-or-gap rule fires.
[ ] Pre-run probe 5 (slot enforcement): synthetic item missing
    `effective_date` slot routes to `staged_updates` with the missing-
    slot failure surfaced.
[ ] Pre-run probe 6 (CRITICAL/HIGH human-verify): pass-gate CRITICAL
    item lands at `pending_human_verify`, NOT `verified`. Customer view
    does NOT include it.
[ ] Customer-facing FACT/ANALYSIS/LEGAL visual affordance built and
    rendering correctly: FACT claims in default treatment with source-
    span accessible; ANALYSIS visually distinct; LEGAL in own callout.
[ ] Workflow runtime preflight: Claude Code v2.1.154+ confirmed,
    Dynamic workflows toggled on in /config.
```

**Exit checklist:**

```
[ ] All targeted items have a generated brief OR an honest empty / gap-
    labeled / floor-breach / staged record.
[ ] No item with `provenance_status NOT IN ('verified')` was published
    to the `active_intelligence_items` view (CRITICAL/HIGH items must
    pass admin verification queue to reach 'verified').
[ ] Cost remained inside the cap; if not, halted at cap and surfaced
    to operator before continuing.
[ ] Yield report written into section 3.3 of this doc the turn the
    workflow completes: items COMPLETE, items GAP, items SHELL,
    items in `pending_human_verify`, items in `staged_updates`,
    items in `quarantined`.
[ ] Decision log section 4 updated with workflow completion entry.
[ ] Customer-facing affordance live: spot-checks confirm fact and
    inference visibly differ on rendered regulation detail pages.
```

---

## 8. Notes and follow-ups (append-only, lightweight)

Open issues that surface during work go here. Not in lieu of memory entries — these are notes, not rules.

| Date | Note |
|---|---|
| 2026-05-29 | The 2 Australian CCA items archived under fabrication flags include many `(AbortError: This operation was aborted)` URL timeouts. Some may resolve with longer timeout. A retry with 60s timeout is a cheap follow-up that could restore items if the underlying URLs are real. |
| 2026-05-29 | 64 of the 80 Option C items have sections but were NOT in the 19 B-audited subset. Their s15 URLs were not reachability-checked. Two paths: extend B audit to all 64 (~$0, ~30 min), or roll into Block 1 reconciliation which will quarantine them automatically under strict criterion 2. The reconciliation path is the design intent; the extended B audit is optional comfort. |
| 2026-05-29 | The 3 CLEAN items from the B audit (sdir.no fjord, Canada CFR, TCEQ Texas) are NOT pulled. They remain active. They will face Block 1 reconciliation along with the rest of the corpus; their s15 URLs are reachable but the items still fail criterion 2 if `agent_run_searches` is required (which it is). They will quarantine in reconciliation; their `integrity_flag` will note "no fabrication detected; quarantine due to missing search log only" so the remediation path is lightweight (script-only restore as `verified_post_hoc`). |

---

## 9. References

- Design doc: [docs/designs/source-provenance-model.md](designs/source-provenance-model.md)
- Predecessor (deprecated): [docs/dispatches/sprint3-status-2026-05-26.md](dispatches/sprint3-status-2026-05-26.md)
- Sprint 3 scope contract: [docs/dispatches/sprint3-dispatch-brief.md](dispatches/sprint3-dispatch-brief.md)
- Self-audit (this session conversation, 2026-05-29) — the analysis that produced this doc's structure
- Memory index: ~/.claude/projects/.../memory/MEMORY.md
