# Last proposer pass -- brief-apply

Per `PROPOSER-RUNBOOK.md` section 2's attestation format. `brief-apply` now has **two** artifacts
(`brief-apply-run-001` and `brief-apply-run-002`); F28's rule (d) requires this file to name the latest
verbatim: **brief-apply-run-004** (this branch; see the numbering finding in the pass below).

## Pass over brief-apply-run-001 and brief-apply-run-002 (2026-09-12, task 6.1b)

**Artifacts read:** brief-apply-run-001 (dry, started_at 2026-09-12T10:17:51.710Z, config.execute=false,
10 items all outcome "would_apply", zero defects_found) and brief-apply-run-002 (apply, started_at
2026-09-12T10:19:44.879Z, config.execute=true, 10/10 items quarantined at the ground step, one thrown
defect in `defects_found`, `proposer_notes` recording that CI claimed run-001 twice in fresh checkouts
because the workflow never committed its artifact back).

**Full traces read:** both artifacts' `full_trace_refs` -- `scripts/turns/record-briefs/batches/
record-briefs-001.json` (the pilot's own committed 10-entry batch, read via `git show
brief-lane/001-2026-09-12:fsi-app/scripts/turns/record-briefs/batches/record-briefs-001.json`, this
worktree not carrying that branch's own committed file directly) -- plus the six gitignored pool-text
parts each entry's FACT claims ground against (`scripts/_snapshots/brief-export/export-34686595044-
part{1..6}.json`, present in this worktree). Every one of run-002's 10 `#ground` step outcomes and its
one `defects_found` entry's `root_cause` stack trace was read in full, not paraphrased.

**Hypotheses (verified, with basis):**

1. **The `readAllByIds is not a function` defect (`defects_found[0]`) is a class bug in the db-module
   wiring, not scoped to this one call site.** `root_cause`'s own stack trace names
   `scripts/turns/apply-record-briefs.mjs:617` calling `runUnscopedFlywheelSteps`, which calls
   `stepDeriveObligations`, which calls `derive-obligations.mjs`'s own `main({ mode }, { readAll,
   readAllByIds, guardedInsertMany })` -- a five-function object literal at the call site
   (`readAll`/`guardedInsertMany`/`guardedUpdate`/`guardedUpdateByIds`/`readClient`) omitted
   `readAllByIds` entirely. Reading `run-population-flywheel.mjs`'s OWN two db-acquisition sites (its
   `--backlog` branch and its direct `--mint-run` branch) found the IDENTICAL five-function object
   literal, the same omission, at both. Basis: the stack trace's own file:line references, cross-checked
   against the live source of all three call sites.
2. **Ten of ten items quarantining at `#ground` with `gate_a_unproven_or_stale` is a validator gap, not a
   generation gap.** Every `#generate`/`#section` step outcome across all 10 items succeeded; only
   `#ground` failed, uniformly, on criterion 7 (Gate A). The pilot's own dispatch brief (this task's own
   brief, section "What the pilot showed") names the exact orphan tokens per item -- reading the record-
   briefs-001.json batch's own body text for each named item confirms the orphan class (an "as of
   2026-09-12" note with no covering FACT claim) is present verbatim, and that `scripts/turns/
   record-briefs/schema.mjs`'s `validateRecordBriefsFile` (as it stood before this task) had no check that
   would have caught it before the ground step spent the grounding cost. Basis: live re-run of `scanBrief`
   (the same scanner criterion 7 uses) against each pilot entry's own body + FACT claims, reproducing the
   orphan tokens named in the brief.
3. **The unlabeled-assertion class (criterion 4) and the timeline-harvest failure (criterion/section 14)
   are two SEPARATE defect classes, not one.** The brief's own finding B names d90a9642 and 0f8d177f for
   criterion 4; finding E names all ten for a zero-row timeline harvest, root-caused to
   `extract-regulation-sections.ts`'s `parseTimeline` requiring a dash separator the lane's own
   colon-separated lines never satisfy (the repo's own em/en-dash ban leaves a compliant lane no other
   choice). Basis: re-running the OLD (pre-fix) dash-only regex against every pilot item's own "Confirmed
   Regulatory Timeline" section body confirmed zero entries parse from any of the ten; re-running the
   labeling regex (`ANALYSIS_LABEL_RE`/`LEGAL_CALLOUT`/`UNLABELED_MODAL_RE`, mirrored from
   `validate-mint-payload.mjs`) against every section of every pilot item confirmed unlabeled assertions
   in more sections than the two named in finding B (see this task's own report for the count) -- the live
   pipeline's single-pass gate stops at the FIRST failing criterion per item, so its own quarantine record
   under-reports relative to a validator that checks every gate independently, which is the correct,
   intentional design (see `validateRecordBriefsFile`'s own "collected across every entry" posture).

**Proposal:** Implemented this pass (task 6.1b), not deferred to a future one -- the operator's own ruling
governing this task ("Items need to be resolved not quarantined... refuses BEFORE any write... so the
lane fixes the source") makes "propose for later" the wrong shape here; the fix IS the proposal, landed in
the same dispatch:

- Gate A mirror + criterion 4 mirror + timeline mirror added to `scripts/turns/record-briefs/schema.mjs`
  (refuses at authoring time, before any grounding cost, naming the exact token/section).
- `src/lib/agent/timeline-parse.mjs`'s `parseTimeline` widened to accept a colon separator (never only a
  dash), closing finding E structurally -- re-running it against all ten pilot items' own timeline
  sections now yields at least one row for every item, zero skipped.
- `src/lib/sources/target-match.mjs`'s `verifyPoolTargetMatch` gained an own-URL match ahead of the text
  verdict, closing finding C for the four UK/CELEX mismatches.
- `apply-record-briefs.mjs` and both of `run-population-flywheel.mjs`'s own db-acquisition sites now pass
  the whole `../lib/db.mjs` module instead of a hand-built subset, closing finding D as a class fix (not
  only the one call site the stack trace named).
- `.github/workflows/brief-apply.yml` gained `allow_brief_overwrite` and a commit-artifact-back step,
  closing finding F (the double-claimed run-001 this very artifact pair is evidence of).

**Family gates status:** GREEN after the fixes above landed -- `record-briefs.test.mjs` (38/38),
`timeline-parse.test.mjs` (9/9, new), `target-match.golden.mjs` (26/26, extended from 18/18),
`apply-record-briefs.test.mjs` (34/34), `run-population-flywheel.test.mjs` (90/90),
`.discipline/glob-portability.test.mjs` green, `npx tsc --noEmit` clean. See `task-6.1b-report.md`
(next to this task's brief) for the full per-fix proof.

**Standing metric (PROPOSER-RUNBOOK.md section 3).** `brief-apply` has no single numeric standing metric
registered yet (it is a newly-active family; run-001/run-002 predate this task's own fixes and cannot be
compared against a post-fix run that has not landed). The natural candidate once `brief-apply-run-003`
exists (the pilot re-apply against the fixed code): validation-refusal rate at the schema step (should
rise, catching what the ground step used to quarantine) versus ground-step quarantine rate (should fall
correspondingly) -- a future proposer pass over run-003 is where this metric gets its first real
measurement, not asserted here in advance of that run landing.

## Pass over brief-apply-run-003 and brief-apply-run-004 on brief-lane/001-2026-09-12 (2026-09-12, coordinator)

**Artifacts read:** brief-apply-run-003 (dry, started_at 2026-09-12T17:38:03.548Z, config.execute=false,
allowBriefOverwrite=true, record-briefs-001.json, 10 entries selected, 10 "would_apply", zero defects_found)
and brief-apply-run-004 (apply, started_at 2026-09-12T17:43:37.031Z, config.execute=true,
allowBriefOverwrite=true, metrics applied=8, quarantined=2, generate_failed=0; per-item trace: 10 generated,
10 sectioned, 10 grounded, 8 verified, 2 quarantined at ground, discovery 12 refs each, forward-events 0 on 9
items and 1 on one, compliance-deadline unchanged on all 10, entities 0+instrument on 7). These are the
revised batch-001 briefs (task 6.1 lane 2) applied after task 6.1b's source fixes landed (#644).

**Live read-back (coordinator SQL, 2026-09-12 evening):** all 10 batch-001 items are provenance_status
verified, item_grade brief, updated 2026-09-12. [CONFIRMED] the run's 2 quarantined items are verified now;
[HYPOTHESIS] the two flips came from a later apply that day (regen-quarantined or provenance-heal), not from
this run; the flip's run artifact is in its own family.

**Hypotheses (verified, with basis):**
- [CONFIRMED] forward-events wrote 0 rows on 9 of 10 items although the bodies carried dated obligations:
  the extractor reads the record-briefs bodies through the same section path as canonical briefs and the
  6.1-era bodies lacked the dated-entry form task 6.2b now requires (README rule 3); the 6.2c regeneration
  carries every exported forward event into the body with its date.
- [CONFIRMED] one item's forward-events:1 row is the synthetic "In force as of 2026-09-12" event (item
  252f0ecf, source_span equal to the bare date, not verbatim in the pool); recorded as defect D10 in
  docs/plans/defect-fix-plan-2026-09-12.md (extractor refusal, verbatim assertion, cleanup).
- [CONFIRMED] numbering collision: this branch's run-003 and run-004 (GitHub runs 34708781168 and
  34709053690) share their file names with brief-lane/002-2026-09-12's run-003 and run-004 (GitHub runs
  34712217771 and 34712340105) because commit-brief-apply-artifact.sh allocates the next number from the
  checkout it runs in; the same class as finding F of the pass above. Recorded as defect D12 (artifact
  identity by GitHub run id; sequence allocated at landing). Until D12 lands, these artifacts are landed
  on master by the coordinator with the run id in the name.

**Proposal:** none beyond D10 and D12, both planned. The 6.2c regeneration of this batch (commit 9402ed3a,
10/10 valid under the 6.2b contract) is the next apply on this branch with allow_brief_overwrite; its dry
and apply artifacts will be run-005 and run-006 on this branch and get their own pass.

**Family gates status:** GREEN on the 6.2b contract (record-briefs.test.mjs 60/60, F28 33/33 against
master's tree at a0a6f5e5). This attestation names brief-apply-run-004 as this branch's latest artifact.
