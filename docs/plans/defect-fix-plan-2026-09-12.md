# Defect fix plan, 2026-09-12 (W9 brief chain, Part 6 and Part 7)

Author: the coordinator (Fable). Operator ruling that produced this document, verbatim: "we need to pause so that you can build a plan to fix the defects, i dont want sonnet and haiku building the fixes on their own" and "a plan needs to be built to fix this by fable". Implementers execute the specifications below as written; a deviation is a report back, never a substitution.

Related: [brief-chain build plan](brief-chain-build-plan-2026-09-11.md), [ADR-030](../decisions/ADR-030-resolve-not-quarantine-and-every-item-dated.md), [lane common contract](../dispatches/lane-common-contract.md), [maintenance runbook](../runbooks/MAINTENANCE-RUNBOOK.md).

## 1. What this plan covers

The defects found on 2026-09-12 between the pause (RESUME STATE 3 in the W9 ledger) and this ruling. Every finding carries its status token per standing rule 14. Each defect gets: root cause, the fix at the source, the class fix that stops the family, the proof, and the lane that builds it. Nothing in this plan is dispatched until the operator says go.

State when the pause was called: #647 (6.2b) and #648 (7.4e) merged; the UK series-code reconcile applied (19 rows, read-back confirmed); 7.2 reviewed PASS and being pushed; 7.8 built and under review; 6.2c batch 002 committed (9 of 10); batch 001 lane writing; 7.5 stopped mid fix with one uncommitted edit in wt-brieffields-0911; 6.2d briefed, branch created, never dispatched.

## 2. The defects

### D1. The brief export cannot export a quarantined item, even by id [CONFIRMED]

Evidence: brief-export run 34717714753 asked for 20 ids and delivered 19; `export-corpus-for-extraction.mjs` (item scope, about line 332 to 343) ANDs `--ids` with `provenance_status = 'verified'`. Item 00a8c0d9 is quarantined, so the lane that exists to write the brief that re-grounds it never saw it.

Root cause: the `--ids` contract was written for the turn-request path (verified items only) and reused for brief export without revisiting the filter. The comment at that line already calls the filter a ticket.

Fix at the source (task 6.2d, `fsi-app/scripts/turns/export-corpus-for-extraction.mjs`):
- When `--ids` is given: select exactly those ids with `is_archived = false` and `provenance_status in ('verified', 'quarantined')`. The auto-selection paths (`--since`, the hollow and record selections of brief-export.yml) keep verified only.
- Each exported item carries `provenance_status`.
- Ids requested but not exported are listed in the summary object as `not_exported: [{ id, reason }]` with reason `archived` or `not_found`, and the workflow log line prints their count next to the last selected id.
- Tests (dependency injected, no database): a quarantined id named in `--ids` is exported; an archived id is refused with the reason listed; the auto-selection path still excludes quarantined items; the summary carries `not_exported`.
- `brief-export.yml`: the `ids` input description states that quarantined items are included when named. `record-briefs/README.md`: one paragraph, a quarantined export is written like any other and the apply with `allow_brief_overwrite` re-grounds it.

Class fix: the resolution path must reach every non-archived item. The test above is the guard; no further mechanism.

### D2. The provisional-source terminal status `promoted` is rejected by the live CHECK constraint [CONFIRMED]

Evidence (coordinator, live SQL): `provisional_sources_status_check` allows only `pending_review`, `confirmed`, `rejected`, `needs_more_data`. `src/app/api/admin/sources/promote/route.ts` writes `status: "promoted"` at two sites (lines 125 and 200 on master). Live counts: 489 pending_review, 6 confirmed, 2 needs_more_data, 0 promoted, 0 rows with `promoted_to_source_id`, last review 2026-05-06. The route's terminal write has never succeeded against this constraint. [HYPOTHESIS] the route inserts the `sources` row before the failing update, so an admin promote attempt may have left orphan `sources` rows; the fix lane counts them (`sources` rows whose registration note names a provisional id, or created by the route's actor, with no provisional row pointing at them) and reports the number before touching anything.

Root cause: the migration that added `promoted_to_source_id` did not widen the status CHECK, and nothing checks the vocabulary a writer uses against the vocabulary the database accepts. Task 7.5 copied the route's convention and would have failed on its first apply row.

Fix at the source, two tracks (standing rule 3):
- DDL, coordinator applies before the code merges: migration `317_provisional_sources_status_promoted.sql` (315 and 316 are the last tracked): drop and re-add `provisional_sources_status_check` with `promoted` added to the list. Nothing else changes; `rejected` stays the decline value.
- Code (task 7.5 fix round, in the same lane): `resolve-provisional-sources.mjs` and the shared `promote-provisional.ts` write `promoted` for an activated source (with `promoted_to_source_id`) and `rejected` for a declined one, with the reason in `reviewer_note`. A test asserts that every status literal the module can write is in the set the migration declares (the four existing values plus `promoted`), with a comment naming the constraint.

Class fix (D7 below): a tracked inventory of CHECK vocabularies with a drift verifier, so a writer that uses a value the database refuses fails a unit test before it fails in production.

### D3. The provisional-source worklist flag is written fresh every run [CONFIRMED by review]

Evidence: review-7.5.md; `resolve-provisional-sources.mjs` re-reads its own worklisted rows and inserts a new `integrity_flags` row per run instead of merging into the per-host `null-tier-host` flag.

Fix at the source: extract `planHostDecision(url, classTierForHostFn)`, `buildNullTierHostWrite(existingFlag, host, itemId, url, permanentClass)` and the constant `NULL_TIER_CREATED_BY = "null-tier-host"` from `resolve-cited-host-gate.mjs` (lines 69, 92 and 107 on master) into `src/lib/sources/null-tier-host-worklist.mjs`, names and signatures unchanged, their tests moved with them; `resolve-cited-host-gate.mjs` re-exports them so its callers do not change; both maintenance scripts import it; `resolve-provisional-sources.mjs` uses it for every unclassifiable host. Test: a second run over the same input inserts 0 flag rows and updates the existing per-host row's contribution list.

Class fix: one worklist mechanism, one module. The shared-writer ownership row for `integrity_flags` names the module.

### D4. The `sources` row reject path records no reason on the row [CONFIRMED by review]

Fix: `rejectSourcesRow` writes the decline reason into `notes` in the same form the other outcomes use (rule name, evidence, date); test asserts the note is present after a decline. The live `sources_status_check` allows only active, stale, inaccessible, provisional, suspended (no decline value), so a declined provisional `sources` row is set to `suspended` with the reason in `notes`; no DDL. The runbook section states this.

### D5. Dash and section-sign glyphs keep entering new prose [CONFIRMED]

Evidence: 7.4e added 7 (fixed in its round), 7.5 added 36 across nine files, 7.2 added 4 (a sanitiser's character class, ruled acceptable). The check is a byte count the coordinator runs by hand; no rule enforces it.

Root cause: the rule lives in the coordinator's dispatch text, not in the discipline engine.

Class fix, discipline rule 022 (`fsi-app/.discipline/rules/022-no-dash-glyphs.mjs` plus test): fails a commit when an added line contains U+2014, U+2013 or U+00A7, unless (a) the file path is under `fsi-app/scripts/turns/record-briefs/batches/`, a `fixtures` directory, or `docs/archive/`, or (b) the line carries the marker `glyph:verbatim` (a fixture string or a regex character class that must contain the glyph; the marker is the disclosure). Wired like the other rules (pre-commit, `runner.mjs --mode=ci`, the rules inventory). The rule replaces the manual byte check in the lane contract.

### D6. Session-log entries were missing from three lanes and the hook did not catch it [CONFIRMED]

Evidence: #647 red at CI's memory gate; 7.4e and 7.5 ranges also lacked the entry; the pre-push hook has no memory-gate step.

Fix: task 7.8 (built on lane/w9-7.8-2026-09-12, commit 27ea8296, under review): one script both CI and the hook run. Lands after review under this plan's gate order; no new work.

Review outcome (review-7.8.md, CONDITIONAL FAIL, two parity deviations) and the fix specification:
- [CONFIRMED] on a pull_request event where the memory gate fails, the original shell exited before evaluating the UX-compliance check; the new script evaluates both and prints both errors, with the same exit code. Ruling: keep the new behaviour (a lane sees every failure at once); document it in the script header and in the discipline.yml comment above the step as a deliberate change from the inline shell. No code change.
- [CONFIRMED] the UX-compliance message replaced the original single ellipsis glyph (U+2026) with three periods. Fix: restore the original glyph so the message is byte-identical (U+2026 is not in the banned set).
- One commit, tests re-run, preflight re-run, report appended; then the review is re-run on that commit.


### D7. Lanes cannot see the live schema and copy conventions from code that is itself wrong (the D2 class) [CONFIRMED]

Class fix, one discipline lane:
- A read-only maintenance step `schema-vocabulary-inventory` (maintenance.yml, dry only) dumps every list-valued CHECK constraint on public tables (`select conrelid::regclass, conname, pg_get_constraintdef(oid) from pg_constraint where contype = 'c' and connamespace = 'public'::regnamespace and pg_get_constraintdef(oid) ~ 'ANY \(ARRAY'`; about 200 constraints across about 90 tables on 2026-09-12, the coordinator holds the first dump) to `fsi-app/docs/inventories/db-check-constraints.json` and commits it back on its own branch the way run artifacts are committed.
- A unit test `check-vocabulary.test.mjs` scans `scripts/maintenance/*.mjs`, `scripts/turns/*.mjs`, `src/app/api/**/route.ts` and `src/lib/**/*.{ts,mjs}` for object literals that set a column carrying a CHECK in the inventory (`status`, `provenance_status`, `discovered_via`, `archive_reason`, and every other column the inventory names) and fails when a literal value is not in that column's allowed set. Dynamic values are skipped, never guessed.
- A data-audit-lane verifier compares the tracked inventory with the live constraints and reports drift (exit 2 without credentials).

### D8. The local rendering guard reports 112 failures while CI's rendering guard is green [HYPOTHESIS]

Evidence: review-7.5.md reproduced the 112 in a full local run, none touching the 7.5 change; CI on #647 and #648 passed the rendering guard.

Investigation before any fix (read-only, one Sonnet agent, a finding not a change): run the guard the way CI runs it (same command, same build, same browser flags) and diff the failure list; classify each failure as environment (fonts, viewport, missing build) or real. The finding lands in `docs/audits/rendering-guard-local-vs-ci-2026-09-12.md` with status tokens. A fix is planned only after the finding.

### D9. Jurisdiction proposals have nowhere to land [CONFIRMED, decision owed]

Evidence: 7.2 declines every jurisdiction proposal with the architectural gate named (`sources.jurisdictions` holds the region-bucket vocabulary three surfaces read; the classifier's ISO values have no column). The close is valid under ADR-030. The information is still discarded.

Decision for the operator: add `sources.jurisdictions_iso text[]` (a migration, coordinator applied) and let 7.2's rule adopt into it, or keep declining. Recommendation: add the column; the classifier already produces the values and the decline note names exactly this gap.

## 3. Lanes, order and gates

| Lane | Contents | Worktree | Precondition |
|---|---|---|---|
| L0 (coordinator) | Migration for D2 applied live; then D9 if ruled | none | operator go |
| L1 7.5 fix round | D2 code, D3, D4, the 36 glyphs, the session-log entry with a UX compliance block; resume from the stopped tree (one uncommitted edit in `admin-stat-tiles-smoke.mjs`) | wt-brieffields-0911 | L0's migration applied |
| L2 6.2d | D1 | wt-part3-0911 (branch exists) | none |
| L3 discipline | D5 rule 022, D7 inventory step, test and verifier | a freed worktree | none; lands before L1 and L2 push so their ranges are checked by the rule |
| L4 7.8 | D6, review then push | wt-eudecision-0911 | review PASS |
| L5 investigation | D8 finding | read-only | none |

Order of pushes (serial, each through the hook): L4, L3, L2, L1. Then: brief-export for 00a8c0d9 alone, the batch-002 lane writes its tenth brief, brief-apply with `allow_brief_overwrite` for batches 001 and 002, the three 7.2 dry runs one at a time, then their applies, then the 7.5 dry runs and applies.

Every lane: the lane contract, the Wiring preflight, tests for every refusal, findings labeled, the report in the W9 ledger folder, review by a Sonnet reviewer, coordinator gate run before the push.

## 4. What stays as it was

Task 7.2's code (reviewed PASS) is not reopened. The batch-001 brief-writing lane continues. 7.3 residue, 7.4d, 7.6, 7.7 and the 211 undateable items remain owed as listed in the ledger and are not defects of this plan.

## 5. Standing rule from this ruling

Operator, 2026-09-12, verbatim: "this should be your rule going forward, fable builds the plans to fix when a problem arises, and sonnet and haiku fix based on the plan." Applied from here on: a Critical or Important finding, or a CI red not explained by a known marker re-pin, stops the implementer; the coordinator writes the fix plan (root cause, fix at the source, class fix, proof, lane, order); lanes are dispatched only against that plan.
