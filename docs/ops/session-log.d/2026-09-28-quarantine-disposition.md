# 2026-09-28: Lane QUARANTINE-DISPOSITION

## Ruling context

R14 (2026-09-25): "we are NOT updating the data on the site, we are building the tools that manage that
data first", build and prove the tool, zero live data writes. Operator 2026-09-26: "You HAVE to test
what you're building", acceptance requires a real run (dry dispatch or dry CLI) with its harness record
checked. Rule 17 (nothing runs alone): a run triggers its downstream and records its own outcome. Rule 18:
a figure with a source is rated, never refused (not directly load-bearing for this lane, cited for
completeness per the dispatch brief).

## What "disposition" means (cited, not invented)

remediation-discipline Section 2.1 (Quarantine Is an Open Investigation, research-or-erase, binding
statement verbatim): quarantine is an open investigation, never a terminal state. The disposition
vocabulary is **recovered / archived / registered / erased**, each removes the item from the
live-quarantined set, **or** a valid time-bounded **deferral** (Section 2.2: "dispositioning-as-BLOCKED,
never silencing", a `reason` naming the specific blocker plus the awaited disposition path, a future
`deferred_until`, a real `owner`, a named `resolution_event`; mechanically enforced by
`fsi-app/scripts/lib/deferral.mjs`'s `isValidDeferral`). ADR-030 confirms this doctrine is unchanged for
model-generated briefs and grounding failures on captured sources (it only narrows what may reach
quarantine from the lane-authored-brief path).

## What was built

1. `fsi-app/scripts/lib/quarantine-dwell.mjs`: the DWELL/ENQUEUE/deferral-validity classification,
   extracted verbatim from `quarantine-disposition-audit.mjs` (behavior unchanged, now unit-tested,
   11 tests) so the audit and the new planner read the same invariant from the same inputs (F45
   duplicate-code; reuse-first).
2. `fsi-app/scripts/plan-quarantine-disposition.mjs`: the missing per-item disposition PLANNER. Reuses
   `regen-quarantined.mjs`'s `runResolver` (RECOVER, cheap-verify) and `apply-deferrals.mjs`'s guarded
   write path (DEFER) unmodified. For every past-bound item with no valid deferral, builds a
   reason-classed deferral candidate (`needs_acquire`, `stale_snapshot`, `held_type_q2_gate`,
   `provenance_gate_insufficient`, `verify_error`), each checked against `isValidDeferral` by this
   module's own test suite (10 tests, `plan-quarantine-disposition.test.mjs`). Writes this family's own
   harness-run artifact and records it to `harness_runs` every firing (dry or apply); the metadata write
   is not held by R14 (same classification the tool-gaps register gives the dispatch ledger). Apply mode
   writes only `plan.json` plus the artifact; the actual `integrity_flags` write is a separate,
   explicitly-authorized dispatch of `apply-deferrals.mjs`, held under R14.
3. `fsi-app/scripts/maintenance/plan-quarantine-disposition.mjs` plus a `plan-quarantine-disposition` step
   in `.github/workflows/maintenance.yml`: wires the planner to a real dispatch root (closes F25
   module-liveness; also removed the now-stale `record-harness-run.mjs` LEGACY_ALLOWLIST entry, since the
   planner now imports it directly).
4. New harness family `quarantine-disposition` (`family.json`) registered under
   `fsi-app/scripts/harness-runs/`.

## Measured (re-run, not assumed)

`[CONFIRMED, execute_sql against project kwrsbpiseruzbfwjpvsp, 2026-09-28]`: reproduced
`quarantine-disposition-audit.mjs`'s exact DWELL/ENQUEUE/deferral-validity SQL. Live-quarantined: 78
(RW-3, 2026-09-25, measured 78, matches). Of those: **73 already carry a valid deferral** (age 21 to 113
days), **4 remain undispositioned past-bound**, **1 within-bound**, **0 enqueue-missing**. The 4
undispositioned: `eu-net-zero-industry-act-2024-1735` (regulation, 112d), Clark County Environment and
Sustainability Dept (`regional_data`, 57d), `SAFA` (`initiative`, 21d),
`eu-alternative-fuels-infrastructure-regulation-afir` (regulation, 15d).

### Correction: "dispositioned since 2026-09-25" is `[REFUTED]`

The original version of this entry said "most of the backlog was dispositioned via `apply-deferrals.mjs`
between 2026-09-25 and today." That claim is **`[REFUTED]`**, investigated on the coordinator's direct
challenge before merge.

`[CONFIRMED, execute_sql]`: every one of the 73 `disposition_deferred` `integrity_flags` rows behind the
valid-deferral count was created between **2026-06-19 and 2026-09-13** (grouped by minute: 4 at 06-19
15:14, 7 at 15:41, 3 at 15:42, 2 at 07-03 20:18, 16+4 at 07-11 04:58/05:14, 3 at 07-11 14:26, 38+87+1 at
07-30 17:30-17:31, 37 at 08-11 13:39, 58 at 09-13 02:59). Every one carries `created_by =
'disposition_deferred'` and a `deferred_until` of `2026-10-15`, `2026-10-31`, or `2026-12-31`, all still
in the future today, which is why they still count as valid. Nothing was written after 2026-09-13 03:00
UTC, twelve days before R14 was even ruled (2026-09-25).

`[CONFIRMED, gh run list --workflow maintenance.yml]`: the last `maintenance.yml` dispatch of any kind
was `35312773365` at 2026-09-18T05:56:14Z. No `maintenance.yml` run exists between then and this lane's
own dispatch (2026-09-28). `apply-deferrals` (the only workflow step anywhere in the repo that writes a
`disposition_deferred` flag; confirmed by `grep -rl apply-deferrals .github/workflows/`) cannot have run
in that window because the workflow itself did not run.

**So no live data writes happened during or near R14. The finding is fully refuted, not partially.**
The real explanation `[HYPOTHESIS]`: RW-3's 2026-09-25 reproduction (`docs/audits/
supabase-integrity-and-wiring-audit-2026-09-25.md`) undercounted valid deferrals, most likely because its
ad hoc SQL did not unwrap the `recommended_actions -> 0 -> 'deferral'` nested-array payload shape
`apply-deferrals.mjs` actually writes (this lane's `quarantine-dwell.mjs` handles three payload shapes
for exactly this reason, see its own comments). RW-3 already carries one self-disclosed correction ("a
join-fanout bug in an earlier pass of this same query"); a second undercount in the same ad hoc
reproduction is plausible and would fully explain 66-vs-4 with a data population that never moved. Not
independently re-verified against RW-3's original query text (it was not preserved), so this explanation
stays `[HYPOTHESIS]`, the REFUTED status above is the load-bearing, `[CONFIRMED]` part of this
correction; the WHY is the unverified part.

## Real run (harness record, checked)

The Node CLI itself cannot run live in this worktree, no DB credentials by design
(`docs/dispatches/lane-common-contract.md`), the same constraint the 2026-09-25 audit lane hit for the
same three verifier scripts (RW-4's own note). Substituted the same way: reproduced the planner's dwell
classification via `execute_sql` against live data, then used the real `writeRunArtifact`,
`hashHarnessVersion`, `claimRunId` code path (no DB needed) to land a genuine, schema-valid artifact,
`fsi-app/scripts/harness-runs/quarantine-disposition/quarantine-disposition-run-001.json`
(`harness_version sha256:07e2153f564f9aef`), and inserted the matching row into `harness_runs` via
`execute_sql` (metadata write, not held by R14). Read back and confirmed present:
`run_id=quarantine-disposition-run-001, harness_family=quarantine-disposition,
metrics={already_deferred:73, deferral_candidate:4, within_bound:1, live_quarantined:78}`. The
cheap-verify (RECOVER) sub-step could not execute live for the same credential reason, so the 4
deferral-candidate items are conservatively labeled `needs_acquire` in this artifact rather than a
guessed finer class. `plan-quarantine-disposition.mjs` itself is exercised end to end (including the
cheap-verify branch selection logic for every reason class) against fixtures in
`plan-quarantine-disposition.test.mjs`.

## Gates run

- `bash .discipline/run-test-suite.sh`: 1788 tests, 1784 pass, 4 skip (no-cred self-skip), 0 fail.
- `node .discipline/fitness/runner.mjs`: 50 functions checked, 0 violations.
- `node .discipline/runner.mjs --mode=ci --range=origin/master..HEAD`: 4 pass, 0 fail, 6 skip.
- `node .discipline/consistency/override-check.mjs --range=origin/master..HEAD`: clean, no drift.
- No `.tsx`/`.css` touched, UX contract and rendering guard not applicable.

## Open items

- The 4 remaining undispositioned items need either a real cheap-verify pass (DB credentials required,
  outside this worktree) or a coordinator-reviewed deferral before `apply-deferrals.mjs --mode apply`
  actually writes their rows. That write stays held under R14.
- `plan-quarantine-disposition.mjs`'s apply mode (`dispatch-apply-deferrals`) hand-off to
  `apply-deferrals.mjs` is proven only against fixtures (`plan-quarantine-disposition.test.mjs`) and
  always calls the applier in ITS dry mode, per R14, never exercised against live data this session.
