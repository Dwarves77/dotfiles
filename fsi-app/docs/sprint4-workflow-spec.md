# Sprint 4 — Dynamic Workflow Spec (Revision 2)

**Status:** REVISION 2 spec for operator sign-off. Revision 2 strengthens Addition A to active sourcing, adds claim-level FACT grounding (Component 3), labeling discipline (Component 4), human verification for CRITICAL+HIGH (Component 6), span-check timeout policy (Component 7), and a customer-facing FACT/ANALYSIS/LEGAL visual affordance (Block 4 surface scope).

**Workflow is SPECC'd but NOT YET RUN.** Operator approves this doc + [sprint4-governing-state.md](sprint4-governing-state.md) (both at revision 2), then invokes the workflow.

**Companion contract:** [sprint4-governing-state.md](sprint4-governing-state.md) revision 2 — the state table, decision log, and phase-gate checklists the workflow executes against.

**How to invoke:** the operator sends a Claude Code prompt that includes the word `workflow` and points at this spec. Suggested invocation prompt in section 9 below. Claude Code runtime generates the orchestration script, shows the operator a script preview at the approval card.

---

## 0. Workflow design principles (binding)

1. **Doc is the contract.** The workflow reads `docs/sprint4-governing-state.md` section 3.2 (Sprint 4 Block work) at the start of each phase. It reads section 7 (phase-gate checklists) before starting a phase and before declaring it complete. It writes to section 3.2 the moment a phase produces a deliverable (commit, DB write, migration apply).
2. **Three HARD CHECKPOINTS.** The workflow STOPS and surfaces to the operator at three specific points. It does NOT auto-advance past these. They are tagged HARD_CHECKPOINT in the phase definitions.
3. **Auto-advance for non-destructive steps only.** Schema migrations, code commits, prompt patches, test runs — these auto-advance phase-to-phase if their exit checklist passes. Anything that mutates customer-facing data or spends money halts.
4. **Per-phase failure halts the workflow.** Failed exit checklist = halt, surface to operator with the specific failed item. No silent rollforward.
5. **Per-task budget caps.** Even non-destructive tasks have token caps. Block 1's heaviest task is ~3 hours of subagent reasoning; cap at $5 model spend per task. Reconciliation phase: $0 model spend (it's a script run). Block 4: separate cap declared at invocation time.
6. **No section-sign glyph in any output.** Per the `feedback_avoid_section_symbol` standing rule. UI labels keep it; chat/code/commits do not.

---

## 1. Workflow phases (revision 2: 4 phases, 3 hard checkpoints)

Revision 2 folds former Block 2 + Block 3 into Block 1 task 7 (system prompt update). Block 1.5 (per-item authority floor) ships after Reconciliation.

```
Phase 1: Block 1 — invariant landing (14 tasks, ~39h)             [auto-advance OK]
  ↓
HARD_CHECKPOINT 1: gate verification on a test item
  Operator confirms all 6 criteria fire correctly on synthetic test items
  ↓
Phase 2: Reconciliation — 294-item audit + quarantine             [auto-advance OK
                                                                   for dry-run only;
                                                                   HARD_CHECKPOINT 2
                                                                   before --execute]
  ↓
HARD_CHECKPOINT 2: quarantine list inspection (159 strict)
  Operator inspects exact list before writes execute
  ↓
Phase 3: Block 1.5 — per-item authority floor (3 tasks, ~2h)      [auto-advance OK]
  ↓
HARD_CHECKPOINT 3: binding cap + expected spend + green-light for generation
  Per lift-cap-not-target: cap and expected are SEPARATE numbers
  ↓
Phase 4: Block 4 — gated generation + visual affordance + verify  [no auto-advance;
                                                                   HALTS at any
                                                                   budget cap]
       Includes:
         - Customer-facing FACT/ANALYSIS/LEGAL visual affordance
         - 139-shell fill at ~$0.55/item under active sourcing
         - ~45-55 Option C archived items regenerated through new gate
         - CRITICAL/HIGH items route to pending_human_verify (admin queue)
         - MODERATE/LOW items go directly to verified
```

---

## 2. Phase 1 — Block 1 invariant landing (revision 2)

### Concurrency

Up to 8 parallel subagents. Phase has 14 tasks; tasks group in 6-8 parallel batches with dependencies.

### Entry checklist

Runs sprint4-governing-state.md section 7.1 entry checklist verbatim. Any failed item halts the phase.

### Tasks

Schema + function + trigger (criteria 1-6 infrastructure):

| # | Task | Component | Deliverable | Auto-test |
|---|---|---|---|---|
| 1.1 | Migration: `provenance_status` enum (incl. `pending_human_verify`), `provenance_verified_at`, `agent_run_searches` (with `result_content_excerpt`), `section_claim_provenance`, `item_type_required_slots` | All | Migration file | Apply; all columns + tables exist |
| 1.2 | Seed `item_type_required_slots`: for `regulation` (effective_date, primary_deadline, jurisdictional_scope, penalty_summary) | C3 | INSERT statements committed | DB query verifies seed rows |
| 1.3 | Validation function `validate_item_provenance` — all six criteria | C1-C6 | Migration file | Synthetic test cases for each criterion pass/fail per design doc 3b |
| 1.4 | Trigger `set_provenance_status` on `intelligence_items` + `intelligence_item_sections` + `section_claim_provenance`; branches to verified / pending_human_verify / quarantined | C6 | Migration file | Test INSERT exercises all three terminal states |

Generation pipeline instrumentation:

| # | Task | Component | Deliverable | Auto-test |
|---|---|---|---|---|
| 1.5 | `/api/agent/run` instrumentation: persist `agent_run_searches` + `result_content_excerpt`, parse `section_claim_provenance` payload from agent output, call validation, route on failure | C2, C3, C4 | Diff committed | `tsc --noEmit` clean; synthetic invocation writes rows |
| 1.6 | `b2-runner.mjs` + `sprint3-a5-sonnet-backfill.mjs` parallel updates | All | Diffs committed | `node --check` clean |
| 1.7 | System prompt update: source-or-explicit-gap contract + per-claim emission (FACT span, ANALYSIS label, LEGAL routing) + active-sourcing instructions + slot enforcement + Legal-Confirmation-Required callout + non-regulatory empty-{} (the latter two folded in from old Block 3) | C3, C4 | Diff committed | 3-item audit sample confirms contract takes effect; audit findings written to governing doc section 8 |
| 1.8 | Parser extension (`parse-output.ts`): extract `section_claim_provenance` payload + cross-link to `agent_run_searches` for source_id | C3, C4 | Diff committed | `tsc --noEmit` clean |

Reconciliation + view + admin UI:

| # | Task | Component | Deliverable | Auto-test |
|---|---|---|---|---|
| 1.9 | Reconciliation script `sprint4-provenance-reconcile.mjs` written; supports `--dry-run` (default) and `--execute` flags | -- | Script file | `node --check` clean |
| 1.10 | View `active_intelligence_items` (filters `provenance_status = 'verified'`); customer-facing fetcher cutover | -- | Migration + diff in `supabase-server.ts` | View returns 0 rows pre-reconciliation; fetcher type-checks |
| 1.11 | `staged_updates` UI extension: surface ungrounded URLs, unverified spans, unlabeled assertions, missing required slots, pattern-flagged legal conclusions | C2-C5 | Diff in admin StagedUpdates surface | Local render with synthetic staged rows for each failure mode |
| 1.12 | Admin verification queue at `/admin → Items pending verification`: per-claim source-span pre-display + tick mechanism | C6 | Diff in admin surface | Local render + tick test writes `verified_by` + `verified_at`; all-ticked CRITICAL/HIGH item flips to `'verified'` |
| 1.13 | Verification audit log (record + display verification history) | C6 | Diff | Query verifies log entries |
| 1.14 | Span-check timeout policy: 2-3 retries with exponential backoff; route to staging on exhaustion | C7 | Validation function logic | Test with mock unreachable URL routes claim to staging |

### Exit checklist

Runs sprint4-governing-state.md section 7.1 exit checklist verbatim (revision 2 expanded version).

### Deliverable

Commits pushed to master. State table row for Block 1 updated to COMPLETE with commit hashes. The trigger and validation function are LIVE in production; no items have `provenance_status` changed yet.

### Cost

~$1-2 model spend (3-item prompt audit sample in task 1.7). Subagent reasoning budget: $5 per task, $70 total cap across phase.

---

## 3. HARD CHECKPOINT 1 — Gate verification (revision 2 expanded)

After Phase 1 deliverable lands, workflow halts. Operator confirms each of the six criteria fires correctly on synthetic test items:

1. **Criterion 1 (source validity)**: test item with valid source_id + tiered source -> validation passes criterion 1.
2. **Criterion 2 (URL grounding)**: test item with ungrounded URL -> validation fails, routes to staging with `ungrounded_urls` payload.
3. **Criterion 3 (FACT span + per-claim tier floor)**: test item with FACT claim whose `source_span` doesn't appear in source content -> fails. Same item but with verified span and Tier 1-2 source -> passes for CRITICAL/HIGH.
4. **Criterion 4 (labeling)**: test item with ANALYSIS-tagged span but no label syntax -> fails. Same item with proper `*Per the workspace's reading: ...*` wrap -> passes. Unlabeled "the workspace is required to" assertion -> fails.
5. **Criterion 5 (active sourcing + slots)**: test item missing `effective_date` slot -> fails. Test item with bare unsourced fact -> fails. Test item with explicit GAP statement -> passes.
6. **Criterion 6 (human verify)**: test CRITICAL item passing 1-5 lands at `pending_human_verify`, NOT `verified`. Customer view does not include it. Admin queue surfaces it. Reviewer ticks; item flips to `verified`. Customer view now includes it.

Also confirms:
- `agent_run_searches` is populated by a test `/api/agent/run` invocation.
- `section_claim_provenance` rows are created per emitted claim.
- Span-check timeout retries fire on a mock unreachable URL.

Operator types `proceed` (or equivalent) to advance. Workflow halts; does not poll.

---

## 4. Phase 2 — Reconciliation

### Concurrency

Reconciliation is a single script run, no parallelism needed at the workflow level. 1 subagent.

### Entry checklist

Runs sprint4-governing-state.md section 7.2 entry checklist verbatim.

### Tasks

| # | Task | Deliverable | Auto-test |
|---|---|---|---|
| 2.1 | Write `scripts/sprint4-provenance-reconcile.mjs` that walks all 294 active D1 items and calls `validate_item_provenance(item_id)` for each, gathering pass/fail with per-item failure reasons. Output: a JSON report `/tmp/sprint4-reconcile-dryrun.json` + console summary. NO writes. | Script file + dry-run report | Script committed, `node --check` clean |
| 2.2 | Dry-run the script. Output: count of items per status, sample failure reasons, list of all items projected to quarantine. | Updated dry-run report | Report exists; sample matches expectations from the design doc projection (~159 quarantine) |

### HARD_CHECKPOINT 2 — 159-quarantine list inspection

After Phase 2 dry-run, workflow halts. Operator inspects the list of items projected to quarantine. Operator explicitly authorizes the script to run in `--execute` mode.

### Tasks (post-checkpoint)

| # | Task | Deliverable | Auto-test |
|---|---|---|---|
| 2.3 | Run reconciliation script with `--execute` flag. Sets `provenance_status` on all 294. Inserts `integrity_flags` for each quarantined item with reason. | Production DB write | Verified by post-write query: all 294 items have non-null `provenance_status`; quarantine count matches the dry-run number |
| 2.4 | Update `sprint4-governing-state.md` section 3.3 with post-reconciliation counts (verified vs quarantined) | Commit | State table reflects the actual numbers |

### Exit checklist

Runs sprint4-governing-state.md section 7.2 exit checklist verbatim.

### Cost

$0 model spend. Write volume: 294 UPDATE statements + ~159 INSERT statements via single script run.

---

## 5. Phase 3 — Block 1.5 per-item authority floor (revision 2: was Block 2)

### Concurrency

Up to 3 parallel subagents.

### Entry checklist

Runs sprint4-governing-state.md section 7.3 entry checklist verbatim.

### Tasks

| # | Task | Deliverable | Auto-test |
|---|---|---|---|
| 3.1 | Update `src/lib/agent/system-prompt.ts` with per-item authority floor rule + `authority_floor_breach` JSON flag for items where no Tier 1-2 source can be found at all | Diff committed | `tsc --noEmit` clean |
| 3.2 | Extend `validate_item_provenance` function with per-item floor check (mostly redundant with C3's per-claim floor; catches edge cases) | Migration file | Apply; synthetic test items confirm CRITICAL/HIGH item with no Tier 1-2 source anywhere returns floor breach |
| 3.3 | Add `source_issue` category filter to `PlatformIntegrityFlagsView` admin queue | Diff committed | Local render confirms test integrity_flag of category `source_issue` surfaces under the filter |

### Exit checklist

Runs sprint4-governing-state.md section 7.3 exit checklist verbatim.

### Cost

$0 model spend.

---

## 6. (Removed in revision 2) Phase 4 — Block 3 prompt patches in-gate

The two prompt patches (legal-confirmation callout, non-regulatory empty-{}) now ship as part of Block 1 task 1.7 system prompt update. Their auto-test (3-item audit sample) is part of that task's exit criteria.

---

## 7. HARD CHECKPOINT 3 — Generation cap + green-light (revision 2)

After Phase 3 (Block 1.5) lands, workflow halts. Operator confirms:

1. The Block 1 task 1.7 audit report shows the system prompt contract taking effect on the sample (FACT spans, ANALYSIS labels, GAP statements, Legal Confirmation Required callouts, non-regulatory empty-{} for fraud-alert-like sources).
2. All 6 pre-run probes in section 7.6 of governing doc are runnable in Phase 4 entry.
3. Operator declares a BINDING cost cap for Phase 4 (e.g. `$150`, `$200`).
4. Operator declares the EXPECTED spend SEPARATELY (per `lift-cap-not-target` — these are different numbers). Expected ~$104 at $0.55/item across ~190 items; cap should be higher.
5. Operator gives explicit green-light THIS SESSION (not a prior session). Workflow does NOT proceed without this.

---

## 8. Phase 4 — Block 4 gated generation + visual affordance (revision 2)

### Concurrency

Up to 16 parallel subagents in the generation sub-phase. Hard wall-time cap (5 min per item).

### Entry checklist

Runs sprint4-governing-state.md section 7.6 entry checklist verbatim. The most consequential gate. Includes all 6 pre-run probes (URL grounding, FACT span grounding, labeling discipline, active-sourcing contract, slot enforcement, CRITICAL/HIGH human-verify routing).

### Tasks

Customer-facing affordance (ships BEFORE generation begins):

| # | Task | Deliverable | Auto-test |
|---|---|---|---|
| 4.1 | Build FACT/ANALYSIS/LEGAL visual affordance: source-span tooltip/popover on FACT; visually distinct treatment (tint or italic body convention) + `Analysis` tag on ANALYSIS; clear callout box on LEGAL | `src/components/regulations/sections/` diffs | Local render with synthetic claims of each kind shows visible distinction |

Generation:

| # | Task | Deliverable | Auto-test |
|---|---|---|---|
| 4.2 | 6 pre-run probes per entry checklist; each must pass | Probe reports | All 6 pass; if any fails, halt |
| 4.3 | Identify target population: 139 EMPTY shells + 45-55 Option C archived items (operator-authorized for regen) | Target list | List committed to state table; count documented |
| 4.4 | Run gated generation. Per item: Sonnet 4.6 + web_search (max_uses=10 to support active sourcing), URL-anchor mode + active-sourcing contract. `agent_run_searches` + `section_claim_provenance` logged. Validation gate routes per criterion 1-5 outcome. CRITICAL/HIGH passing-gate items go to `pending_human_verify`; MODERATE/LOW go to `verified` directly. | Production DB writes | Per-item: gate-pass MODERATE/LOW writes to `intelligence_items` with `provenance_status='verified'`; gate-pass CRITICAL/HIGH writes with `'pending_human_verify'`; gate-fail writes to `staged_updates` with failure payload |
| 4.5 | Halt at cap. Workflow checks cumulative cost before each generation call; halts cleanly if cap reached. | Halt report or completion report | Cap not exceeded; halt graceful |

Verification queue activation (operator-paced, NOT auto-advance):

| # | Task | Deliverable | Auto-test |
|---|---|---|---|
| 4.6 | CRITICAL/HIGH items at `pending_human_verify` surface in admin queue. Workflow does NOT process verification; operator reviewer does that out-of-band. Workflow reports the count of pending-verify items at completion. | Yield report | Yield report includes pending_human_verify count |

### Exit checklist

Runs sprint4-governing-state.md section 7.6 exit checklist verbatim. Includes: write yield report to sprint4-governing-state.md section 3.3 the same turn the workflow completes.

### Cost

Per operator decision at Hard Checkpoint 3. Expected ~$104 at $0.55/item × ~190 items (139 shells + ~50 regens). Recommended cap ~$150.

---

## 9. Invocation prompt (revision 2)

When ready to start the workflow, paste this prompt verbatim:

```
Run a workflow that executes the Sprint 4 REVISION 2 spec at
fsi-app/docs/sprint4-workflow-spec.md against the contract at
fsi-app/docs/sprint4-governing-state.md (revision 2).

Four phases with three hard checkpoints (former Blocks 2 + 3 folded
into Block 1 task 1.7 system prompt update):
  Phase 1: Block 1 invariant landing (14 tasks, schema + function +
    trigger + agent_run_searches with result_content_excerpt +
    section_claim_provenance + item_type_required_slots +
    /api/agent/run instrumentation + parser extension + system prompt
    update with active-sourcing contract + reconciliation script +
    view cutover + staged_updates UI + admin verification queue +
    audit log + span-check timeout policy; ~$1-2 model spend for
    3-item prompt audit sample in task 1.7)
  HARD CHECKPOINT 1: gate verification on synthetic test items for
    all 6 criteria + admin verification queue tick mechanism
  Phase 2: Reconciliation (dry-run, then HARD CHECKPOINT 2 for
    159-quarantine list inspection, then --execute)
  Phase 3: Block 1.5 per-item authority floor (3 tasks, auto-advance)
  HARD CHECKPOINT 3: binding cap + expected spend SEPARATELY (per
    lift-cap-not-target) + operator green-light THIS SESSION for
    Phase 4
  Phase 4: Block 4 gated generation + customer-facing FACT/ANALYSIS/
    LEGAL visual affordance + verification-queue activation. Per-item
    cost ~$0.55 (active sourcing raises web_search budget and output
    tokens). Expected ~$104; cap recommended ~$150.

At each phase entry: read sprint4-governing-state.md section 7 entry
checklist for that phase; halt if any item fails.

At each phase exit: read sprint4-governing-state.md section 7 exit
checklist; halt if any item fails. Update sprint4-governing-state.md
section 3.2 with the deliverable (commits, DB writes) the same turn
they land.

Do NOT auto-advance past the three HARD CHECKPOINTS. Halt and surface
to operator each time.

Concurrency: up to 8 subagents in Phase 1, 1 in Phase 2, 3 in Phase 3,
16 in Phase 4. Hard wall-time cap of 5 min per subagent task.

Budget: ~$1-2 model spend in Phase 1 (prompt audit). $0 in Phases 2-3.
Phase 4 binding cap set at HARD CHECKPOINT 3 before it runs.
```

After the workflow approval card surfaces, hit `View raw script` first to inspect the orchestration the runtime generated.

---

## 10. What this workflow does NOT do

- Does not generate the JS script ahead of time (the runtime does that on invoke; this spec is what the runtime generates against).
- Does not run Phase 5 without a checkpoint-confirmed cap + green-light.
- Does not write to the production DB without a successful validation gate. Even reconciliation writes go through the trigger that the same migration creates — defense in depth.
- Does not roll forward silently on any phase failure. Halt + surface.
- Does not poll or sleep. Hard checkpoints are operator-driven re-invocations, not timers.

---

## 11. References

- Contract: [sprint4-governing-state.md](sprint4-governing-state.md)
- Design: [designs/source-provenance-model.md](designs/source-provenance-model.md)
- Workflow docs (Anthropic): https://code.claude.com/docs/en/workflows
- Predecessor stale status: [dispatches/sprint3-status-2026-05-26.md](dispatches/sprint3-status-2026-05-26.md)
