# Last proposer pass -- brief-apply

Per `PROPOSER-RUNBOOK.md` section 2's attestation format. `brief-apply` now has **six** artifacts
(`brief-apply-run-001` to `brief-apply-run-006`); F28's rule (d) requires this file to name the latest
verbatim: **brief-apply-run-006**. Newest pass first.

## Pass over brief-apply-run-005 and brief-apply-run-006 (2026-09-16, batch 006, the first 49-item metered apply)

**Artifacts read:** brief-apply-run-005 (dry, run 35178608102, config.execute=false, briefs
scripts/turns/record-briefs/batches/record-briefs-006.json, 49 items all outcome "would_apply", zero
defects_found) and brief-apply-run-006 (apply, run 35178716211, config.execute=true, metrics.selected 49,
metrics.applied 48, metrics.quarantined 1, metrics.generate_failed 0, metrics.bytes_read 7784367,
metrics.io_budget_bytes 419430400, metrics.stop_reason null, unscoped_flywheel deriveObligations over 1318
forward events, revalidate applied true, zero defects_found). Both committed back to the branch by the
workflow (commits 65ef71ee and 8d30f369).

**Full traces read:** the committed record-briefs-006.json (49 entries), the run logs, the per_item step
records of run-006 (the one ground_failed entry: 1bb72c94-a196-4182-ad75-0f368b781841#ground, error
"validation failed [missing_required_slot]: penalty_summary, criterion 5, item_type regulation", then
#provenance-status quarantined), and the live database after the apply: brief_apply_runs row
brief-apply-run-006 (started 03:35:41Z, finished 03:41:34Z, bytes_read 7784367, items_applied 48), 48 items
brief-grade verified, 48 item_changelog rows detected_by record-briefs.

**Hypotheses (verified, with basis):**

1. **A 49-item apply on the resized tier costs about 7.4 MB of driver-visible reads and 5 minutes 18 s,
   with the disk idle before it.** The pre-flight pass line (the first ever printed) read busy 0.000 and
   0.0 MB/s over its 30 s sample; the run finished with no stop and no refusal. Basis: the run-006 log
   lines at 03:36:16 and 03:41:34 and the artifact metrics. The 2026-09-13 outage shape (a 49-item apply
   plus two corpus-wide length scans on the small tier) did not recur; the budget and cooldown held with
   room to spare, and the [HYPOTHESIS] thresholds (busy 0.5, 40 MB/s) have their first data point: an idle
   disk before an apply reads as zero, so a non-zero pre-flight sample means another reader is active.
2. **The pre-write validator does not mirror criterion 5 (required slots).** 1bb72c94's entry carried no
   penalty_summary claim; the validator accepted the file (run-005 dry: 49 would_apply) and the ground step
   quarantined the item, the exact "catch it after the cost" shape the D30 mirror exists to prevent for
   figures. Basis: run-006's per_item record and schema.mjs, whose only slot rule is that slot_key be a
   string or null. Batch 004b had no such item, so the gap was invisible until a regulation without a
   penalty claim came through.
3. **The quarantine is a type gap, not an author gap.** 1bb72c94 is Council Decision 84/358/EEC (the
   conclusion of the North Sea oil-pollution cooperation agreement), typed `regulation`; its one stored
   capture (CELEX 31984D0358, 20,023 chars) contains no penalty language at all (zero occurrences of
   "penalt"). For `regulation` the penalty_summary slot is HARD (no GAP, migrations 131/132/137), so no
   author can fill it honestly and the ground step must quarantine. Basis: a read of the item's own pool
   row and its type's slot list (effective_date, primary_deadline, jurisdictional_scope, penalty_summary).
   The disposition is a type decision for that item (a Decision concluding an agreement is not a
   penalty-bearing regulation), not a validator change and not a made-up claim.

**Proposal:** (a) a required-slot mirror in validateRecordBriefsFile: the driver already reads each item's
pool for the FACT-verbatim check; it can read item_type_required_slots (48 rows) and each batch item's
item_type once, pass them in, and the validator refuses an entry that lacks a claim (FACT or GAP where the
type allows a GAP) for any required slot, naming the slot, before any write. (b) an author pass on
1bb72c94's entry (penalty_summary from its pool) and a re-apply with allow_brief_overwrite. (c) keep the
budget at 400 MB and the cooldown at 30 minutes; record the pass line of every apply here.

**Family gates status:** GREEN on master fadc976f (lanes L21 to L24 merged today); this branch carries the
batch and the two committed-back artifacts only.

**Standing metric (PROPOSER-RUNBOOK.md section 3).** Schema-step refusals 0 of 49; ground-step quarantines
1 of 49 (criterion 5). Pre-flight sample before the apply: busy 0.000, 0.0 MB/s; bytes_read 7784367.


## Pass over brief-apply-run-003 and brief-apply-run-004 (2026-09-16, lane L23, the first metered applies after D32)

**Artifacts read:** brief-apply-run-003 (dry, started_at 2026-09-17T02:21:09Z, config.execute=false,
config.recordBriefsSchemaVersion rb1-2026-09-16.1, briefs scripts/turns/record-briefs/batches/record-briefs-004b.json,
10 items all outcome "would_apply", metrics.bytes_read 778746, metrics.io_budget_bytes 419430400,
metrics.stop_reason null, zero defects_found) and brief-apply-run-004 (apply, started_at 2026-09-17T02:22:40Z,
config.execute=true, 10 of 10 items generated with provenance_status verified, metrics.applied 10,
metrics.quarantined 0, metrics.generate_failed 0, metrics.bytes_read 2336238, metrics.stop_reason null,
metrics.last_item_id 16432987-a1e9-4da0-b883-282e92691e2f, unscoped_flywheel deriveObligations applied 42 of
1276 derived, revalidate applied true with the public-items tag and ten item tags, zero defects_found).
Both artifacts committed back to this branch by the workflow (commits e3946484 and 2146ab23).

**Full traces read:** both artifacts' full_trace_refs, the committed record-briefs-004b.json (10 entries, the
ten record-grade items batch 004 never reached), read together with the run logs (35174036050 and
35174140834) and the live database after the apply: brief_apply_runs row brief-apply-run-004 (finished
2026-09-17T02:25:44Z, bytes_read 2336238, items_applied 10), the ten items now brief-grade verified, ten
item_changelog rows change_type UPDATED detected_by record-briefs.

**Hypotheses (verified, with basis):**

1. **The driver-visible pool bytes are a small fraction of what an apply reads.** run-003 measured 0.74 MB
   for the ten pools in the pre-check and run-004 2.2 MB with the re-read estimate, against a 400 MB
   budget; yet the 2026-09-13 outage was a 49-item apply of the same shape. Basis: the artifact metrics
   above, the D32 evidence (54,662 edge requests in fifteen minutes during that apply), and the driver's own
   header naming the pipeline's generate and ground reads as unobservable from the driver. The budget on
   driver-visible bytes will rarely trigger; the pre-flight disk sample is the guard that can.
2. **The pre-flight passed silently.** The run-004 log shows a 31 s gap between "10 item(s) selected" and
   "io budget = 400 MB" where the two disk samples ran, and no line with the measured busy fraction or
   read throughput, so the three [HYPOTHESIS] thresholds could not be calibrated from this run. Basis: the
   log lines' own timestamps (02:22:42 and 02:23:13) and the absence of any "pre-flight" line.
3. **The numeric-figure mirror refused provenance pointers, not wrong figures.** The dry run over batch 004
   before this lane (run 35154461843) refused the file whole on 260 mirror errors; every one was a slot tag,
   a legal locator, an instrument title or a dotted dateline. Basis: the per-error classification in this
   lane's session-log entry and the 260 to 0 result on the ten-item cut after the helper landed.

**Proposal:** Hypotheses 2 and 3 are implemented in this same lane (the pre-flight logs its numbers on a
pass; figureCheckText strips the pointer classes; tests pin both). Hypothesis 1 is proposed, not
implemented: meter the pipeline's own pool reads (generate and ground read result_content through the
canonical pipeline) so bytes_read describes the apply, not the driver's pre-check, and drop the
PIPELINE_POOL_REREADS estimate once the real number exists; until then, calibrate --io-busy-max and
--io-read-mbps-max from the pass lines of the next applies and keep the 30-minute cooldown.

**Family gates status:** GREEN on this branch: `record-briefs.test.mjs` 77/77, `io-preflight.test.mjs` 33/33,
`apply-record-briefs.test.mjs` 67/67, `npx tsc --noEmit` clean; the pre-push hook (with step 3d, the fitness
runner) passed on the push that carried run-003/run-004's own fixes.

**Standing metric (PROPOSER-RUNBOOK.md section 3), first real measurement.** Validation-refusal rate at the
schema step versus ground-step quarantine rate: over the ten items of run-003/run-004, schema refusals 0
(after the pointer fix; 260 before it, all false), ground quarantines 0 of 10 applied. The metric to watch
next is the pre-flight pass line's busy fraction and read MB/s per apply, recorded here from run-005 on.

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
