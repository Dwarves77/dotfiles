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
| Block 1 — invariant landing + Vercel Workflow DevKit setup + source-tier audit UI (~51h, 19 tasks) | **19/19 RUNTIME-VERIFIED — AT HARD CHECKPOINT 1 (awaiting operator review; NOT merged)** | `a6f0dbc..bc7f4db` (branch `sprint4/block-1-invariant-landing`; 32 ahead of master) | Verify-and-fix pass complete 2026-05-30. 1.0a-1.11 verified; 1.12/1.13/1.14/1.15 RUNTIME-VERIFIED this session, surfacing + fixing FOUR runtime bugs the tsc-clean write-ahead hid: (i) criterion-6 verification-unawareness reverted every CRITICAL/HIGH human-verify flip (blocked Component 6 entirely); (ii) VerificationQueue admin auth missing Bearer (would 401); (iii) span-check retry contract unpinned + non-exponential (vs the ruling); (iv) recommendSourceTier read-only-`sources` + `publisher` error-swallow (would 500 the seeded half of the Phase-1.5 pass). All fixed + committed (see decision log 2026-05-30 + 3.2.1). HC1 evidence: 8/8 invariant cases PASS (C1-C8); span-check throw PASS; step-skeleton checkpoints seen in live runs. MERGE-BASE RECONCILIATION (fold per operator): merge-base `0ff2f95`; master tip `1e5c380` ("record Block 1 pause at 9/19") is 1 commit NOT in the branch and it edits the SAME `sprint4-governing-state.md` — so a branch→master merge WILL conflict in this file. The branch version is AUTHORITATIVE (master's 9/19 note is stale; the branch carries 19/19). Resolve by taking the branch's governing-state content (or rebase the branch onto `1e5c380`, dropping its obsolete 9/19 edit). Recorded so the merge is not a surprise. Corpus additive-only intact: `verified=0` after sentinel cleanup, `unverified=657` untouched. |
| Phase 1.5 — source-tier audit + provisional-source triage (~$0.75 + ~90 min ticking) | NOT STARTED | -- | Revision 2.2 NEW phase between HC1 and Reconciliation; entry checklist 7.1.5; ~148 sources (73 seeded + 75 provisional from A6.2) |
| Reconciliation — 294 items | NOT STARTED | -- | Entry checklist 7.2; requires Block 1 COMPLETE + HC1 + Phase 1.5 COMPLETE so reconciliation runs against authoritatively-tiered sources |
| Block 1.5 — per-item authority floor (~2h) | NOT STARTED | -- | Entry checklist 7.3; ships after Reconciliation; folds in former Block 2 |
| Block 2 (removed in revision 2) | -- | -- | Folded into Block 1 task 7 system prompt update |
| Block 3 (removed in revision 2) | -- | -- | Folded into Block 1 task 7 system prompt update |
| Block 4 — gated generation + visual affordance + verification queue | NOT STARTED | -- | Entry checklist 7.6; HARD CHECKPOINT 3 before; requires binding cap + green-light THIS SESSION |

### 3.2.1 Block 1 RESUME NOTE (paused 2026-05-30 at 15/19)

**Branch:** `sprint4/block-1-invariant-landing` — write-ahead complete at `984bee5` (26 commits ahead of master; this resume-note commit may sit one or two doc-commits later, so run `git rev-parse HEAD` for the absolute latest). Tree clean, nothing pushed to master. The write-ahead commits `cdeebcb` (1.12+1.13), `03246b3` (1.14), `2505f1f` (1.15), `d73f343` (HC1) are all present in `git log`. **19/19 tasks CODE-COMPLETE:** 1.0a-1.11 verified; 1.12-1.15 WRITE-AHEAD (tsc-clean, marked UNVERIFIED-PENDING-RUNTIME). Resume via DIRECT main-thread execution (the Workflow runtime ignored prompt suppression; direct execution routes through the hook).

**Verified (15/19), commits `a6f0dbc..ce99fbe`:**
- Foundation (9): 1.0a `a6f0dbc`, 1.1 `c6f4920`, 1.2 `8c15c3b`, 1.3 `1d7a5ba`, 1.4 `4b1aefb`, 1.0b `8fb13e0`, 1.0c `11fbdaf`, 1.0d `bb3791f`, 1.5 `14ee359`.
- This session (6): 1.6 `b138cb8`, 1.7 `fe31ab1`, 1.8 `dca233d`, 1.9 `6cc3dad`, 1.10 `22230b1` (+fix `e4ff1f6`), 1.11 `ce99fbe` (1.11 render-verify still pending).
- Docs/spec: orphaned-cap HC3 precondition `1722e6a`; hook dormant→fail-open records `48a1f96`/`1f3dea0`; Component 8 corroboration proposal `2756eb1`.

**Write-ahead (4/19), tsc-clean but UNVERIFIED-PENDING-RUNTIME — do NOT treat as DONE:**
- 1.12+1.13 `cdeebcb` (verification queue + resumeHook tick; shared `verifyHookToken` makes the token byte-identical both sides; concurrent-hook shape is the highest-risk piece). **→ RUNTIME-VERIFIED 2026-05-30 (with a foundation fix).** Proven end-to-end on a sentinel CRITICAL item: 4 concurrent hooks suspended with deterministic tokens, 4 admin-queue ticks resumed them, item flipped pending_human_verify→verified, run completed. Surfaced + fixed the criterion-6 verification-unawareness bug that had blocked Component 6 entirely (see decision log 2026-05-30); also fixed VerificationQueue admin-auth (missing Bearer). Commit chain after `984bee5` (see latest `git log`).
- 1.14 `03246b3` (span-check timeout policy). **→ RUNTIME-VERIFIED 2026-05-30 (with a Component-7 fix).** The write-ahead diverged from the ruling: retry count was unpinned (relied on WDK default `maxRetries=3`) and backoff was a fixed `3s`, NOT exponential. Fixed in `spanCheckClaim`: `maxRetries` PINNED to 3 (don't depend on a default that a version bump could change) + EXPONENTIAL backoff (attempt² seconds) via `getStepMetadata().attempt`. A worker-secret probe (added + removed) against an unreachable URL proved at runtime: 4 attempts (1+3), inter-attempt gaps 1s/4s/9s (= attempt²), run ended FAILED on exhaustion = **FAIL SAFE** (no validated output escapes; the claim does not sail through). The staging ROUTE on exhaustion is deferred to Block 4 (needs `routeOnValidation`'s real body + `spanCheckClaim` wired into the generation path) — legitimate because Block 1 guarantees fail-safe, only the route waits.
- 1.15 `2505f1f` (tier-audit panel + recommendSourceTier + commit_tier_change). **→ RUNTIME-VERIFIED 2026-05-30 (with 2 fixes + 1 mount add).** Proven on sentinel sources: recommend-tier round-trip both kinds (seeded gov-primary + provisional trade-press, Haiku, integrity-honest — see fetchability note below), commit-tier-change SEEDED `base_tier` write PERSISTED (6→1, DB read-back, not `success:true`), provisional 409-defer. TWO runtime bugs found + fixed: (a) `recommendSourceTier` only read `sources` → 500 at its only (provisional) mount; now table-aware (falls back to `provisional_sources`). (b) the `sources` select referenced a non-existent `publisher` column → silent PostgREST error → false "not found" 500 on EVERY seeded source (the agent/run error-swallow class); dropped `publisher`, destructured + log the error. Without (b) the seeded half of the Phase-1.5 148-source pass would have 500'd. Plus a SEEDED mount added to SourceHealthDashboard's expanded SourceRow (the panel was provisional-only despite "reusable for seeded"; the seeded base_tier write-path now has a surface). PHASE-1.5 FETCHABILITY NOTE: recommendSourceTier grounds the tier on FETCHED content; the highest-authority sources (gov gazettes/federal registers) serve anti-bot/CAPTCHA block pages to automated fetches, so they return LOW-confidence/flagged recommendations — a chunk of the BEST sources will flag for operator review. This is the integrity rule working (don't assert tier from URL alone); do NOT misread "flagged" as "low quality."
- HC1 verify orchestrator `d73f343`.

**Additive-only re-proven live 2026-05-30:** `provenance_status` distribution = unverified=657 (NOTHING flipped); 3 new tables present (agent_run_searches, section_claim_provenance, item_type_required_slots); `active_intelligence_items` view = 0 rows (verified-only gate live); 3 `set_provenance_status` triggers.

**NEXT SESSION = VERIFY-AND-FIX (all code is written; this is a verify pass, not a write pass):**

**STEP 1 — FRESH SESSION, prove the hook FIRST (before any danger op).** Run the re-probe (the hook greps the COMMAND string, so the danger text must be in the command, not a script file):
- `echo "HOOK REPROBE: update intelligence_items"` → must visibly PROMPT
- `echo "HOOK REPROBE: reconcile --execute"` → must visibly PROMPT
Both prompt = hook live → mark §7.2 HOOK-PROOF VERIFIED. Either silent = hook still inert → corpus gate stays `--confirm-phase-2` only. (jq is NOT installed; the hook was rewritten jq-free + fail-CLOSED — see thread 1.)

**STEP 2 — dev server up; render + runtime verify the write-ahead. 1.12 tick is HIGHEST RISK — do it FIRST:**
- **1.12 tick (FIRST):** start a workflow for a sentinel CRITICAL/HIGH item with FACT claims; confirm it suspends; POST `/api/admin/verify-claim` per claim; verify `recordClaimVerification` wrote `verified_by`/`verified_at` and `flipToVerifiedIfAllTicked` flipped `pending_human_verify → verified`. WATCH the concurrent-hook (`Promise.all`) shape — if WDK rejects N concurrent hooks, fall back to sequential. Token is byte-identical via shared `verifyHookToken`. Per-claim tick ONLY (locked); no batch tick.
- **1.13:** confirm `verified_by`/`verified_at` render in the queue after a tick.
- **1.14:** throw already unit-verified (`node scripts/sprint4-114-spancheck-test.mjs`); runtime-verify the WDK retry loop → stage-on-exhaustion.
- **1.15:** recommend-tier round-trip (spends Haiku — Phase 1.5 pacing) + commit-tier-change `base_tier` write; render-verify `SourceTierAuditPanel` on a provisional AND a seeded source.
- **1.11 (carry-over):** render-verify the 6 SENTINEL staged rows (batch_id `SPRINT4_BLOCK1_SELFTEST_111`) in admin → Staged updates; then `node supabase/seed/sprint4-111-synthetic-staged.mjs --cleanup`.

**STEP 3 — HC1:** `node scripts/sprint4-hc1-verify.mjs` (runs 6 criteria + span-check now; prints exact commands for the 3 runtime also-confirms). Compile per-criterion report + hashes, reconcile this §3.2 ledger on the merge base, HALT for operator. Do NOT auto-advance to Phase 1.5; no merge to master without operator review.

**Open threads carried forward (do not lose):**
1. **Hook is fail-open-FIXED but UNPROVEN.** Root cause: `jq` not installed → the old hook always `exit 0` (allow) in every mode (see 7.2 + decision log 2026-05-30). Rewritten jq-free + fail-CLOSED in `~/.claude/settings.json`. It is NOT a working gate until OBSERVED force-asking in a FRESH session (mid-session reload failed twice). Re-probe `update intelligence_items` AND `reconcile --execute` in a clean session; both must visibly prompt.
2. **`--confirm-phase-2` holds the reconcile gate regardless of the hook** (task 1.9 self-gate). Until the hook is proven, EVERY danger op is gated only by manual confirm + this self-gate.
3. **DB-level guard elevated** to the real Phase-2 corpus-mutation protection candidate (7.2) — a command-string hook has four silent-failure points and one just fired.
4. **Component 8 (analysis-level corroboration / authority signal)** is a design PROPOSAL (`2756eb1`), Phase 4 / Intelligence Assistant scope, AWAITING operator sign-off — open question: who populates `primary_authority_key` (Phase 1.5 curation vs agent-at-grounding).

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
| 2026-05-29 | SIGN-OFF on revision 2.2: governing doc + workflow spec both APPROVED after the doc-fidelity sweep (workflow-spec header/status/section 2/section 9 + governing-state 7.1/7.6 reconciled to 19 tasks / ~51h / five phases incl. Phase 1.5; section 9 invocation corrected to the 2.2 form). Recorded as an explicit approval act rather than left inferred from the direction rulings at rows 215-216. | "Verified clean. Proof-of-clean quote correct, both 7.6 fixes applied, section 9 corrected to 2.2, decision log faithful. Sign-off on revision 2.2 — proceed to fire the corrected invocation." | Operator sign-off | This doc revision 2.2 + workflow-spec revision 2.2 (fidelity sweep commit 8315b24) |
| 2026-05-29 | DURABLE HC3 PRECONDITION (orphaned spend cap): the runner-level $30/$15 generation budget cap was orphaned by task 1.6's `start()` refactor (commit b138cb8) — `b2-runner.mjs` + `sprint3-a5-sonnet-backfill.mjs` no longer call Sonnet inline, so they no longer see model responses and cannot meter spend. The cap MUST be reconstituted IN the workflow substrate (DurableAgent / generation step) before any Phase 4 generation pass. Recorded as a binding entry-checklist item in section 7.6 (not just a session flag) so the HC3 binding-cap discipline is enforced by live code, not a stated number. | "harden it: record this as a durable HC3 precondition in the governing doc... a cap I declare at HC3 has to be enforced by something live in the code, not just a number I state." (operator message 2026-05-29) | Operator hardening ruling | This doc section 7.6 entry checklist; task 1.6 commit b138cb8 |
| 2026-05-29 | DORMANT-HOOK PRECONDITION (HC2/Phase-2): PreToolUse danger patterns `seed/apply-` and `reconcile.*--execute` were added to ~/.claude/settings.json mid-session but proved DORMANT — a probe command containing "reconcile --execute" did not force-ask, and the 116/117 apply did not fire the hook either. Claude-code-guide research says hooks hot-reload via file watcher with no review gate, but observed behavior contradicts that. Recorded as a binding 7.2 entry-checklist item: before Phase 2 --execute, make the patterns live (new session / open /hooks) and OBSERVE the probe force-ask once. A dormant hook is not a gate — worst exactly at corpus mutation. | "we PROVE the reconcile --execute hook fires... I am not running real reconciliation until I've seen its gate fire once. A dormant gate on the corpus-mutation step is worse than no gate." (operator message 2026-05-29) | Operator hardening ruling | This doc section 7.2 entry checklist |
| 2026-05-29 | GATE HOLE CLOSED (fromSeed bypass): task 1.10's customer read gate on `fetchIntelligenceItem` filtered the DB query to verified-only, but the `if (error || !row) return fromSeed()` fallback served ungated legacy static SEED content (the pre-provenance corpus) for any item-detail URL whose id matched a SEED entry — leaking around the gate. Fixed to FAIL CLOSED (return null/not-found) on the configured-DB path and on DB error; the offline/dev seed-only path (guarded by !isSupabaseConfigured) is unchanged. | "if unverified detail URLs silently serve old unverified SEED content, the gate isn't actually gating item detail — it's falling through to ungated legacy data." (operator message 2026-05-29) | Operator-surfaced gate hole; fixed same turn | src/lib/supabase-server.ts fetchIntelligenceItem |
| 2026-05-30 | HOOK WAS FAIL-OPEN (root cause of the dormant-gate finding; supersedes the bypass theory in the 2026-05-29 dormant-hook row): the PreToolUse Bash hook has been INERT since installation because `jq` is not installed on this machine. Its first line `cmd=$(jq -r ... 2>/dev/null); if [ -z "$cmd" ]; then exit 0` always emptied `cmd` and hit `exit 0` (ALLOW) on every command, in every permission mode — visible in /hooks, logically correct, but never reading a command and never able to ask. Proven via `jq --version` (not found) + hook simulation. FIXED via jq-free, fail-CLOSED rewrite (reads raw payload via `cat`, greps the danger set, ASKS when payload unreadable). LESSON: a gate visible in /hooks is not a firing gate; "applied"/"visible"/"logic correct" are each NOT "executing." Proof standard hardened: the hook earns "live" only by being OBSERVED firing in a FRESH session. DB-level guard elevated from backlog to a recorded Phase-2 protection candidate (§7.2) — a command-string hook has four silent-failure points and one just fired. | "the hook has been fail-OPEN the entire time because jq isn't installed... A gate that's visible in /hooks and allowing everything silently is the most dangerous failure mode there is — it looks like protection. The prove-not-trust instinct is exactly what caught it." (operator message 2026-05-30) | Operator ruling + root-cause finding | This doc section 7.2 (hardened HOOK-PROOF + DB-LEVEL GUARD items); ~/.claude/settings.json hook rewrite; [[project_sprint4_phase4_gating_required]] memory |
| 2026-05-29 | SEQUENCING CLARIFICATION (reconciles row 193): `intelligence_items.source_id` NOT NULL enforcement is NOT a Block 1 task — it lands as a distinct step POST-Phase-2-reconciliation. Technical reason: ~24 active D1 rows have null `source_id`; an `ALTER ... SET NOT NULL` during Block 1 would fail or force a mass-quarantine before reconciliation has assigned/quarantined them — flipping existing items' status ahead of HARD CHECKPOINT 2, which the operator's STOP condition forbids. Correct order: Block 1 adds `provenance_status` column + trigger (additive, nothing flips) -> Phase 2 reconciliation assigns status / quarantines null-source rows -> NOT-NULL enforcement lands once the corpus is clean. Row 193's "in Block 1, not deferred" is reconciled to mean "committed, not abandoned — lands as soon as reconciliation permits," NOT "executes during Block 1." design-doc section 3a annotated to match section 4 step 7; the `intelligence_item_sections.source_ids` NOT NULL/CHECK is likewise post-reconciliation. | "section 3a contains NOT-NULL + quarantine-existing operations that would flip existing items to quarantined during Block 1 — before reconciliation, before HC2, before I've seen the list... post-reconciliation is correct." (operator message 2026-05-29) | Operator sequencing ruling | design-doc section 3a + section 4 step 7; reconciles decision-log row 193 |
| 2026-05-30 | BINDING PHASE-2 REQUIREMENT (service-role-binding; supersedes the vague "Phase 2 needs a DB-level guard" backlog framing): the agent holds the service-role key from `.env.local`, which bypasses RLS and writes any row directly — bypassing the command-string hook, `--confirm-phase-2`, AND any script-level guard. Corpus mutation is therefore NOT gated from the agent; only the agent's voluntary routing through the sanctioned script gates it. Same 'gate not where the actor passes' class as the fail-open hook and fromSeed. The real fix is one of two, and Phase 2 corpus mutation MUST NOT proceed until one is in place: (a) RESTRICTED ROLE [preferred] — agent runs with a DB credential scoped to reads + sanctioned writes that structurally cannot flip `provenance_status` on existing rows; the service-role key is NOT in the agent's script environment, applied deliberately only for the sanctioned reconcile op by the operator. (b) DB-ENFORCED guard catching even service-role writes. Corroboration: the agent should NOT be able to demonstrate a corpus flip outside the sanctioned path even if instructed to. | "a DB guard the service-role key bypasses is just another gate I walk around... The requirement has to name what actually binds the credential I hold... Until (a) or (b) is in place, 'Phase 2 is gated' is true only by the agent's cooperation — which is not a gate." (operator message 2026-05-30) | Operator hardening ruling — binding precondition on Phase 2 corpus mutation | This doc section 7.2 DB-LEVEL GUARD item; [[project_sprint4_phase2_credential_binding]] memory |
| 2026-05-30 | TASK 1.12 RUNTIME BUG FOUND + FIXED — criterion-6 verification-unawareness in `validate_item_provenance`. **BLAST RADIUS (the reason this is a foundation fix, not a sentinel quirk): it blocked Component 6 ENTIRELY — NO CRITICAL/HIGH item could ever reach `verified` through the human-verify queue.** Root cause: criterion 6 hard-coded `recommended_status='pending_human_verify'` for every passing CRITICAL/HIGH item, with no notion of claim-verification state. The `set_provenance_status` trigger (115) re-runs the function on the admin-queue flip's `UPDATE intelligence_items SET provenance_status='verified'`, the function returned `pending_human_verify`, and the trigger REVERTED the flip in the same transaction. PROVEN AT RUNTIME (write-ahead bet paying off): sentinel CRITICAL item, 4 concurrent `Promise.all` hooks all ticked (4 `verified_at` written, run completed) — yet item STILL `pending_human_verify`; `validate()` returned `pending_human_verify` despite all 4 ticked. FIX (SQL-only, no TS change — the TS workflow/route/queue were correct): criterion 6 made verification-aware — CRITICAL/HIGH → `verified` IFF ≥1 FACT claim AND all FACT claims carry `verified_at`, else `pending_human_verify`. The ≥1 guard is load-bearing (a zero-claim shell must not flip on vacuous truth). The trigger now AGREES with the flip instead of reverting it (the function is the single source of truth the trigger consumes). PROVEN FIXED: 8/8 `apply-114` cases (C2 un-ticked CRITICAL still→pending_human_verify [no regression]; NEW C7 all-verified CRITICAL→verified; NEW C8 zero-claim shell→pending_human_verify) + sentinel end-to-end re-run FLIPPED (read-back: item `verified`, 4 claims stamped, run completed) + sentinel cleaned (corpus back to verified=0). ALSO FIXED in the same pass: `VerificationQueue.tsx` admin auth (plain `fetch` with no Bearer → would 401 in the real UI; now uses the established `createSupabaseBrowserClient().auth.getSession()` pattern). Pre-check before the function change: 0 items at `verified`, so the `CREATE OR REPLACE` could not re-grade anything live. | Operator approved after diagnosis-before-patch: "the trigger consumes the function, so the function is the single source of truth, so the verification logic belongs in the function. SQL-only, no TS change... Right call." (operator message 2026-05-30) | Operator-approved foundation-function fix; 1.12 + 1.13 RUNTIME-VERIFIED | migration 114 criterion 6; apply-114 cases C7-C8; src/components/admin/VerificationQueue.tsx; src/workflows/generate-brief.ts (flipToVerifiedIfAllTicked, unchanged) |
| 2026-05-30 | TASK 1.14 — Component-7 divergence found + fixed (caught by reading the WDK docs before claiming a runtime pass). The write-ahead span-check retry config did NOT match the operator's "2-3 retries with exponential backoff" ruling: the retry count was UNPINNED (relied on the WDK default `maxRetries=3`) and the backoff was a constant `retryAfter: "3s"` — NOT exponential. Fix (`spanCheckClaim`, generate-brief.ts): PIN `maxRetries=3` (a WDK default change must not be able to silently alter the retry contract — same invisible-drift class as the jq fail-open hook) + EXPONENTIAL backoff (`attempt² seconds`) from `getStepMetadata().attempt`. Runtime-verified via a temporary worker-secret probe on an unreachable closed-port URL (added + removed, nothing shipped): 4 attempts (1+3 retries), inter-attempt gaps 1s/4s/9s (= attempt²), run ended FAILED on exhaustion = **FAIL SAFE** (no validated result ever produced; the claim does not escape the gate). LOAD-BEARING: fail-safe is exactly what makes deferring the staging ROUTE to Block 4 legitimate — exhaustion does NOT fail open (which would be a Block-1 gate hole). Block-1/Block-4 split recorded: throw (unit) + pinned retries + exponential + fail-safe-on-exhaustion = Block 1 DONE; the staging ROUTE itself (`routeOnValidation` real body + wiring `spanCheckClaim` into the generation pipeline) = Block 4. | "A — pin maxRetries=3 + make backoff exponential + probe now; defer the staging ROUTE to Block 4... The probe must confirm exhaustion FAILS SAFE. If exhaustion fails open, stop and fix it in Block 1; don't defer it." (operator message 2026-05-30) | Operator-approved Block-1 fix + scope split | src/workflows/generate-brief.ts spanCheckClaim; node_modules/workflow/docs/foundations/errors-and-retries.mdx |
| 2026-05-30 | TASK 1.15 — two runtime bugs found + fixed + a seeded mount added (caught by driving the round-trip against real wiring before declaring a pass). (1) `recommendSourceTier` read only `sources`, but the panel's only mount is provisional (`provisional_sources`, a separate table) → 500 "not found" at its only mount; fixed TABLE-AWARE (sources, then provisional_sources fallback), symmetric with commit-tier-change's seeded/provisional split. (2) the `sources` select referenced a NON-EXISTENT `publisher` column → silent PostgREST error → null data → false "not found" 500 on EVERY seeded source (the agent/run error-swallow class, CLAUDE.md: "any .select() that destructures data without error is a code smell"); fixed by dropping `publisher` + destructuring/logging the error. WITHOUT (2) the SEEDED half of the Phase-1.5 148-source pass would have 500'd. (3) the panel was mounted ONLY for provisional despite "reusable for seeded" → added a SEEDED mount in SourceHealthDashboard's expanded SourceRow so the base_tier write-path has a surface + is render-verifiable. PROVEN: recommend both kinds (200, integrity-honest), commit-tier-change SEEDED base_tier PERSISTED 6→1 (DB read-back, not success:true), provisional 409-defer; both panels render. PHASE-1.5 FETCHABILITY NOTE: recommendSourceTier grounds the tier on FETCHED content; Tier-1 sources with anti-scraping (federalregister.gov) return CAPTCHA block pages → low-confidence/flagged recs — the BEST sources will often flag for operator review; "flagged" must NOT be misread as "low quality" (it is the integrity rule refusing to assert tier from URL alone). | Operator approved both fixes + (a) seeded mount: "(1) is ... completing the task ... (a), not (b) ... the seeded path is the load-bearing write path." (operator messages 2026-05-30) | Operator-approved Block-1 fixes + mount add | src/lib/sources/recommend-source-tier.ts (table-aware + publisher error-swallow); src/components/sources/SourceHealthDashboard.tsx (seeded mount) |

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
    AND workflow-spec section 2 revision 2.2: 19 tasks, ~51h total
    (4 Vercel Workflow DevKit infrastructure tasks 1.0a-1.0d added in
    revision 2.1; source-tier audit UI task 1.15 added in revision 2.2;
    the rest unchanged from revision 2).
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
    mode is the default. The script also self-gates `--execute` behind a
    second `--confirm-phase-2` key (task 1.9).
[ ] HOOK-PROOF (the hook is NOT a gate until OBSERVED firing in a FRESH SESSION).
    ROOT CAUSE (2026-05-30, definitive): the PreToolUse hook was fail-OPEN from
    installation because `jq` is NOT installed on this machine. Its first line
    `cmd=$(jq -r '.tool_input.command' 2>/dev/null); if [ -z "$cmd" ]; then exit 0`
    always emptied `cmd` and hit `exit 0` (ALLOW) on EVERY command, in EVERY
    permission mode. The hook was visible in /hooks and logically correct but
    INERT the entire time — the bypass-mode theory was a red herring. Proven by:
    `jq --version` -> command not found, and simulating the hook -> "cmd EMPTY ->
    exit 0 (ALLOW)". FIXED via jq-free, fail-CLOSED rewrite of the hook command
    in ~/.claude/settings.json (reads the raw payload via `cat`, greps it for the
    danger set, and ASKS when the payload can't be read instead of allowing).
    PROOF STANDARD (non-negotiable): "applied" is not "working"; "visible in
    /hooks" is not "firing"; "logic correct" is not "executing" — the hook had
    all three and did nothing. The hook earns "live" status ONLY by being OBSERVED
    force-asking IN A FRESH SESSION (mid-session reload proved unreliable twice
    here). Re-probe in a clean session on BOTH an old pattern ("update
    intelligence_items") AND "reconcile --execute"; both must visibly prompt.
    UNTIL THAT OBSERVATION: every danger operation (applies, reconcile --execute,
    destructive DDL) is treated as UNGATED by the hook and protected ONLY by
    manual confirmation + the reconcile script's --confirm-phase-2 self-gate
    (task 1.9), which holds regardless of the hook. Do NOT run real reconciliation
    until the hook has been seen to fire in a fresh session.
    RE-PROBE RESULT (fresh verify-and-fix session, resume after the 2026-05-30 pause):
    BOTH probes SILENT — `update intelligence_items` AND `reconcile --execute`
    produced NO permission prompt on the operator's screen. The jq-free rewrite is
    present on disk and its grep logic was PROVEN CORRECT in isolation (both danger
    payloads MATCH `update +intelligence_items` / `reconcile.*--execute`), so the
    failure is NOT the regex this time — it is at the harness/permission-mode layer.
    OBSERVED: the hook does NOT surface an `ask` on this Windows + `dontAsk` setup as
    configured. NOT OBSERVED: the toggle test (flip `dontAsk` off, re-probe, confirm a
    prompt then appears) was NOT run — so `defaultMode: "dontAsk"` is the LEADING
    SUSPECT, NOT a toggle-confirmed cause. Recording it as "definitively suppressing"
    would overstate what was observed. Secondary suspect: the `shell:"bash"` command
    hook may not be honored by the hook runner on this Windows session. Last session's
    cause (jq-absent fail-open) is distinct. CLASS CONCLUSION (remediation-discipline):
    the command-string PreToolUse hook has now failed across sessions for DIFFERENT
    reasons — treat it as PERMANENTLY UNRELIABLE for corpus-mutation gating here; the
    DB-LEVEL GUARD (next item) is the real Phase-2 protection. Making it reliable would
    require changing the operator's GLOBAL permission posture (a separate decision).
    HOOK-PROOF stays UNVERIFIED. The reconcile --confirm-phase-2 self-gate holds
    meanwhile. Do NOT treat the hook as a gate.
[ ] DB-LEVEL GUARD (Phase-2 design consideration, ELEVATED from backlog 2026-05-30):
    the command-string hook depends on the shell environment + an installed binary
    (jq) + the permission mode + a fail-closed default — four silent-failure points,
    one of which (jq) just took the gate down for an entire session while it
    appeared installed. Phase-2 corpus mutation should be protected by a DB-LEVEL
    guard (e.g. a restricted DB role for the reconcile path, or a pre-apply
    migration linter) that is enforced AT THE DATABASE regardless of session state,
    binaries, or permission mode — NOT solely the command-string hook, which has
    been directly observed failing silently while appearing installed. Scope this
    before relying on the hook as the sole Phase-2 protection. (Not scoped now;
    recorded so it isn't lost.)
    BINDING PHASE-2 REQUIREMENT (operator, 2026-05-30 — supersedes the vague
    "Phase 2 needs a DB-level guard" backlog framing, which does NOT close this
    because a guard the service-role key bypasses is just another gate the agent
    walks around):
    "The agent holds the service-role key (from .env.local), which bypasses RLS and
    writes any row directly — so it bypasses the command-string hook, --confirm-phase-2,
    and any script-level guard. Corpus mutation is therefore NOT gated from the agent;
    it is gated only by the agent routing through the sanctioned script voluntarily.
    Same 'gate not where the actor passes' class as the fail-open hook and fromSeed.

    The real fix is one of two, and Phase 2 corpus mutation MUST NOT proceed until one
    is in place:
    (a) RESTRICTED ROLE (preferred): the agent operates with a DB credential scoped to
        reads + sanctioned writes only, that structurally CANNOT flip provenance_status
        on existing rows. The service-role key is NOT present in the environment the
        agent runs scripts in; it is applied deliberately only for the specific
        sanctioned reconcile operation, by the operator, not sitting in .env.local for
        any node script to use. You can't bypass a gate with a credential you don't hold.
    (b) DB-ENFORCED guard that catches even service-role writes (harder — service-role
        is designed to bypass row controls; only viable if the flip can be constrained
        at the DB regardless of role, with the sanctioned path being the only satisfier).

    (a) is the honest answer. Until (a) or (b) is in place, 'Phase 2 is gated' is true
    only by the agent's cooperation — which is not a gate. The corroboration of this
    requirement is that the agent should NOT be able to demonstrate a corpus flip
    outside the sanctioned path even if instructed to."
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
[ ] Block 1 marked COMPLETE in state table (revision 2.2 ~51h scope);
    all 19 task exit checklist items ticked.
[ ] Block 1.5 (per-item authority floor) marked COMPLETE. In revision
    2.2 it is Phase 3 and runs BEFORE this checkpoint (HARD CHECKPOINT 3
    follows Phase 3), so it must already be done at Phase 4 entry — there
    is no deferred Block 4.5.
[ ] Reconciliation marked COMPLETE; quarantine count surfaced and
    operator-inspected at HARD CHECKPOINT 2.
[ ] Binding cost cap set, written into the workflow dispatch text, and
    captured in decision log section 4 THIS SESSION.
[ ] Phase 4 spend cap must be live IN the workflow (DurableAgent/generation
    step) before any generation pass — the runner's old $30/$15 cap was
    orphaned by the 1.6 start() refactor (b138cb8: b2-runner +
    sprint3-a5-sonnet-backfill no longer see model responses, so they can no
    longer meter spend) and must be reconstituted in the workflow substrate.
    Verify at HC3 before green-light. A cap declared at HC3 has teeth ONLY if
    something live in the code enforces it — confirm the enforcement exists,
    not just the number.
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

### 8.1 Task 1.7 prompt-audit findings (2026-05-29)

Live 3-item, non-persisting audit of the claim-level provenance contract added to `src/lib/agent/system-prompt.ts`. Harness: `scripts/sprint4-17-prompt-audit.mjs` (read-only DB + generate-and-inspect; nothing written). Sonnet 4.6, web_search max 4/item. Total spend $1.35 (+$0.12 prior no-search smoke ≈ $1.47, within the ≤$2 spec authorization).

| Item | Type/Priority | Verdict | Ledger contents |
|---|---|---|---|
| CARB Advanced Clean Fleets | regulation/HIGH | FAIL — no ledger | 0 rows (output truncated at 16k tokens before trailing blocks) |
| Diário Oficial da União (Brazil) | guidance/LOW | ALL PASS | 20 rows: 12 FACT (all grounded), 1 ANALYSIS, 3 LEGAL, 4 GAP; all 4 slots covered |
| edie portal | market_signal/LOW | FAIL — GAP inline form | 34 rows: 27 FACT (all grounded), 2 ANALYSIS, 2 LEGAL, 3 GAP |

**Contract takes effect (the auto-test's bar):** labeling discipline (ANALYSIS closed-set labels + LEGAL routing) PASSED on all 3 items; FACT grounding (span + source_id/url) PASSED on both items that emitted a ledger — 39 FACT claims total, every one grounded; item 2 is a clean full pass across all 8 checks. The invariant's core (born-labeled, born-grounded) is working.

**Finding 1 — trailing-block truncation (most serious).** Item 1 (regulation/HIGH, 56.9k-char brief) hit the audit harness's `max_tokens: 16000` and truncated before emitting the ledger OR the YAML — both are emitted last, so both are the first casualty. Partly an audit artifact (production b2-runner used `max_tokens: 24000`, not 16k), but it exposes a real risk on large regulation briefs. Mitigations: (a) prompt hardened with a MANDATORY-TRAILING-EMISSION rule (keep body tight, the ledger + YAML are required, a response that ends before both is a failed regeneration); (b) **HC3/Block-4 action: the workflow generation step must set `max_tokens` high enough (>= 24k, likely higher for regulation briefs) to fit body + ledger + YAML, and treat `stop_reason: "max_tokens"` as a failed regeneration, not a silent partial.** This is now a Block-4 generation-config requirement.

**Finding 2 — GAP inline-form inconsistency (minor).** Item 3 emitted 3 GAP records in the ledger but the prose lacked the exact `*Specific [...] not available from primary sources as of [date].*` form the criterion-5 check looks for. Mitigation: prompt hardened with a MATCHED-PAIR GAP rule (every ledger GAP must have a matching inline statement and vice versa).

**Re-verification deferred to HC3, by design (no re-spend now).** The hardened prompt is re-exercised by the HC3 pre-run probes already in checklist 7.6 — probe 3 (labeling), probe 4 (active-sourcing / explicit-GAP), probe 5 (slot enforcement) directly re-test these exact behaviors against live generation before any scaled run. The 1.7 audit confirmed the contract takes effect and surfaced the findings; HC3 closes the loop on the hardening. A single-item re-verify of the regulation case at 24k tokens (~$0.65) is available on operator request but not required to close 1.7.

---

## 9. References

- Design doc: [docs/designs/source-provenance-model.md](designs/source-provenance-model.md)
- Predecessor (deprecated): [docs/dispatches/sprint3-status-2026-05-26.md](dispatches/sprint3-status-2026-05-26.md)
- Sprint 3 scope contract: [docs/dispatches/sprint3-dispatch-brief.md](dispatches/sprint3-dispatch-brief.md)
- Self-audit (this session conversation, 2026-05-29) — the analysis that produced this doc's structure
- Memory index: ~/.claude/projects/.../memory/MEMORY.md
