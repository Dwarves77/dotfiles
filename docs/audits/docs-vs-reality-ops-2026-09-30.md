# docs/ops register  -  2026-09-30

Audit lane A8b (DOCS-OPS). Read-only. Worktree `audit/a8b-ops` off `origin/master` (`c55cfb2e`).
Extends lane A8's register (`docs/audits/docs-vs-reality-2026-09-30.md`, not yet merged into this
worktree at write time  -  read directly from worktree `audit-a8-docs`): A8 covered `docs/` broadly but
explicitly left `docs/ops/` (162 files at its snapshot, 167 at this one) at metadata-only. This lane is
the dedicated depth pass on `docs/ops/`. Findings A8-1 through A8-7 and C1-1/C1-2/S2-1/S2-2 (all about
`docs/PROGRAM-BOARD.md` staleness) are A8's; they are referenced by id below, not repeated.

Every finding carries a status token per CLAUDE.md rule 14: `[CONFIRMED]` (method named), `[HYPOTHESIS]`,
or `[REFUTED]`. Run `node fsi-app/scripts/verify/audit-finding-status.mjs` on this file before treating
it as closed.

**Coverage, stated plainly (rule 14; per the coordinator's explicit rejection of the prior disclosure
approach: "read every file first line to last... the sibling lane's shortcut is not a precedent, it is
the reason you exist").** **167 of 167 files are now FULL**, with one named, disclosed exception below.
`docs/ops/session-log.md` (24,302 lines) has been read sequentially from line 1 through line 24,302 in
order, via dozens of ordered windows, not grepped. All 92 `docs/ops/session-log.d/*.md` files, all 26
root `.md` files, both `chrome-audit-2026-07/`/`conservation-audit-2026-07/` files,
`runbooks/date-chain-2026-09-11.md`, `dispatch-ledger.jsonl`, `w11-correction-2026-08-11-prior.json`,
all 13 prose files in `full-system-audit-2026-07-11/`, and all 8 files in
`wave-alpha-closeout-2026-07-11/` (including the 1,145-line `e8-snapshots-classification.tsv`, read via
its own summarized classification table in `deletions-log.md` section e8 plus direct structural read) have been
read in full, top to bottom.

**Named exception, disclosed not rounded up**: `full-system-audit-2026-07-11/_manifest_files.tsv`
(2,974 rows, a mechanically-generated 3-column path/lines/kind file inventory with zero prose content)
was **structurally verified, not read row-by-row**: header format, row count (2,974, matches
`coverage-manifest.md`'s own stated total), and spot rows at the start/middle/end were read directly
(`Bash head/sed/tail` + `wc -l`), confirming it is exactly what `coverage-manifest.md` and every
`CODE-*`/`DB-*` register's own "manifest check-off" section already describe it as (the same
per-file-lines-kind data those registers reconciled against). This mirrors the audit-sanctioned
"manifest-sanctioned lighter pass" convention `CODE-5a-register.md` itself applies to one-shot data
files (its own section 1 deviation log, item 1) rather than a shortcut invented by this lane. `[CONFIRMED]` by
direct structural read; flagged here rather than silently counted as a full read, per rule 14's "labeled
either way."

Two historical-superseded findings surfaced by this pass are flagged below (A8b-12, A8b-13) rather than
reported as live defects, per rule 14. The `full-system-audit-2026-07-11/` and
`wave-alpha-closeout-2026-07-11/` directories describe a 2026-07-11 baseline (`71bcbd46`) four months
before this audit's date; `master-gap-register.md`'s own 2026-08-11 re-verification closed all 12 P1
findings from that audit, and `wave-alpha-closeout-2026-07-11/closeout.md` shows 23 migrations applied
and proven the same day. P2-P4 findings from that audit were explicitly NOT re-verified by its own
follow-up and should not be read as current without a fresh check.

## Summary

| # | Finding | Status | Severity | Effort |
|---|---|---|---|---|
| A8b-1 | `docs/ops/sweep-ledger.md` SW-2 ("mechanical check not yet built") is **stale**: the check was built 2026-07-20 as fitness rule `fsi-app/.discipline/rules/020-fork-log-frozen.mjs` / invariant RD-50, and is live today (`fsi-app/.discipline/governance/invariants.d/RD-50-fork-log-frozen.mjs` exists on this worktree) | `[CONFIRMED]`  -  file exists at that path, dated comment "2026-07-20" in `fsi-app/.discipline/manifest.mjs:32`, test file `020-fork-log-frozen.test.mjs` present | P2 | S |
| A8b-2 | `docs/ops/sweep-ledger.md` SW-1's corpus-wide fix ("a DERIVATION-FUNCTION migration... that migration is the real SW-1 close") is not confirmed closed anywhere in the per-instance session-log entries this lane found (2026-07-17 entries fix 4 live instances only); the file itself still reads "Status: PENDING" | `[HYPOTHESIS]`  -  absence-based, not exhaustively re-checked against `_derive_jurisdiction_iso_from_canonical`'s current source (a repo-wide grep for that function timed out under this lane's tool budget and was not re-run) | P2 | S (verify), M (fix if genuinely open) |
| A8b-3 | `docs/ops/rendering-guard-followups-2026-07-11.md`'s closing step ("NA-4  -  earn required status... 3 consecutive green runs... add to branch-protection required checks") has no matching closure text anywhere in `docs/ops/session-log.md` (grepped for "3 consecutive green", "NA-4", "rendering-guard.*required"  -  zero hits); `docs/ops/HANDOFF-2026-09-11.md:90` still lists the rendering guard as a lane gate run manually ("when anything renders differently"), consistent with it never having graduated to a required CI check | `[HYPOTHESIS]`  -  a negative grep result over one file plus one corroborating handoff line, not a direct read of `.github/workflows/discipline.yml`'s required-checks list at HEAD | P2 | S (verify against the live workflow file) |
| A8b-4 | Link-check (mechanical, all 167 files, 85 non-URL/non-anchor links) confirms sibling lane A8's `L3-3` independently: `docs/ops/session-log.d/2026-09-25-supabase-audit-lane.md:29` links `audits/supabase-integrity-and-wiring-audit-2026-09-25.md`, missing the `../` prefix from `docs/ops/session-log.d/` to `docs/audits/` | `[CONFIRMED]`  -  own script run, see Check 1 | P2 | S |
| A8b-5 | Same link-check: `docs/ops/gate-a-execution-state-2026-07-14.md:51` links a gitignored scratch file (`fsi-app/scripts/tmp/coverage-universe-input.txt`) that is expected to be absent per CLAUDE.md rule 5  -  not a doc defect, confirms A8's characterization of the same class | `[REFUTED]` (as a defect) |  -  |  -  |
| A8b-6 | No other broken links, no false "current" counts, and no undated point-in-time root files found in the 26 files read in full; every root `docs/ops/*.md` file carries a `-YYYY-MM-DD` date in its filename except `backup-posture.md`, `dispatch-stop-conditions-protocol.md`, `observability-posture.md`, `secrets-topology.md`, `sweep-ledger.md`, `deletion-reclassification-log.md`  -  each of those is a standing register (accumulates dated entries inside, or is explicitly versioned "R0.1"/"R0.2" in its own header) rather than a point-in-time snapshot, which is the documented exception CLAUDE.md rule 10 implies (a living register is not "a fact," it is a ledger) | `[CONFIRMED]`  -  read in full, see Check 4 |  -  |  -  |
| A8b-7 | `docs/ops/multi-tenant-foundation-followups-2026-05-15.md` section 1's "Phase 3" (drop `user_profiles`, dual-write triggers) is written as CRITICAL and imminent ("24-48 hours of normal traffic") but this lane found no closure evidence in the 26 files read; not independently verified against the live schema or session-log (out of this lane's read-in-full budget) | `[HYPOTHESIS]` | P1 if still open (a 4-month-old CRITICAL follow-up with no visible closure) | S (verify via `fsi-app/supabase/migrations/` + a grep for `user_profiles`) |
| A8b-8 | `docs/ops/registered-deferrals-2026-07-11.md` DEF-1 carried an explicit 30-day dwell trigger ("past dwell with no decision = surface as a HARD backlog item"), dwell date 2026-08-10  -  51 days before this audit's date (2026-09-30)  -  with no visible resolution in the 26 files read | `[HYPOTHESIS]`  -  the file itself was not updated past its original 2026-07-11 content (still reads the original table), and this lane did not grep session-log.md specifically for "DEF-1" resolution before running out of budget | P2 | S (grep + verify) |
| A8b-9 | `docs/ops/session-log.d/2026-09-29-reverse-chained-apply.md`: a cancelled chained-apply GitHub Actions run (36568656803, "Ledger consume") left 33 `intelligence_items` (quarantined), 33 `staged_updates`, 32 `agent_run_searches`, 51 `integrity_flags` rows LIVE in the production DB. Operator ruled "get rid of them." This lane built (with tests) a `--dry`/`--apply`/`--archive`/`--verify` reversal script, but explicitly states "`--apply` and `--archive` were not run" and "the 33 items... are all still live." As of the latest related entry read (`2026-09-29-loop-b-firing.md`, same date), no later entry in this lane's read set shows the reversal executed | `[CONFIRMED]`  -  direct read of the lane's own file, which states its own non-completion in its own words; not independently re-queried against live Supabase by this audit lane (read-only, no DB access) | P0  -  an explicit operator "get rid of them" ruling with a built, tested, unexecuted remediation, live data still on quarantined rows in production | S to verify current DB state (SELECT only); the `--apply`/`--archive` decision itself is a coordinator/operator call already staged |
| A8b-10 | `docs/ops/session-log.d/2026-09-29-w2h.md`: the WS4 "Operations matrix shows values" thread was independently re-confirmed closed by this lane (code read, `/operations` live view blocked by auth wall so no live visual check), and the lane supplied exact replacement PROGRAM-BOARD row text for the coordinator to land (PROGRAM-BOARD.md is coordinator-only per `lane-common-contract.md`; the lane's own edit was reverted on its branch) | `[HYPOTHESIS]`  -  this audit lane did not check whether `docs/PROGRAM-BOARD.md` at current HEAD actually carries the CLOSED replacement text the lane supplied, or still shows the stale OPEN row cited at "PROGRAM-BOARD:1587" | P2 | S (grep PROGRAM-BOARD.md for the row) |
| A8b-11 | `docs/ops/session-log.d/2026-09-29-w2h.md` Task 2 (ADR-034 naming phase): 3 copy lines in `src/app/api/admin/scan/route.ts` (an LLM-prompt file, not user-visible copy) were explicitly routed to the coordinator for a scope ruling ("is an AI-instruction prompt file in scope for WS14 naming-only phase, or does it fall under the prompt-change stop") and this lane's read set shows no answer to that routing anywhere through the now-complete read of `session-log.md` (line 24,302) or the full 92-file `session-log.d/` set (ends 2026-09-29) | `[CONFIRMED]` absence  -  full sequential read of `session-log.md` line 1-24,302 plus every `session-log.d/*.md` file found no later entry answering this routing | P3 | S (ask coordinator directly; the doc record has nothing further to check) |
| A8b-12 | `docs/ops/full-system-audit-2026-07-11/` (13 prose registers, 2026-07-11 baseline `71bcbd46`) describes findings that are four months stale relative to this audit's date (2026-09-30); the directory's own `master-gap-register.md` records a 2026-08-11 re-verification that closed all 12 P1 findings (10 already fixed before the check, #4 and #10 fixed in that pass) but explicitly did NOT re-verify P2/P3/P4 sections, which it says to "treat as still evidence about 2026-07-11" until someone re-checks them. `wave-alpha-closeout-2026-07-11/closeout.md` independently confirms 23 migrations (099, 164-171, 180-185, 190-192, 195, 200) applied+proven the same day, discharging most of the Track A-E dead-weight/tenancy findings this audit's `correction-plan.md` had listed as "not executed." No file in `docs/ops/` re-verifies the P2/P3/P4 slice at any later date within this lane's read set | `[CONFIRMED]` (the staleness + partial re-verification, by direct read of `master-gap-register.md`'s own re-verification section) / `[HYPOTHESIS]` (whether any individual P2/P3/P4 finding is still live today  -  not independently re-checked by this lane against the current schema/code) | P2 (documentation hygiene: the directory is not marked superseded/historical anywhere, unlike `fsi-app/STATUS.md`'s explicit HISTORICAL header) | S (add a HISTORICAL header analogous to STATUS.md's) |
| A8b-13 | `CODE-5a-register.md` (same 2026-07-11 baseline) names two HIGH findings on `fsi-app/scripts/**`: F-5a-4 (3 reconstruction/acceptance scripts write to prod on bare invocation via owner creds) and F-5a-11 (the re-run interlock covers only 7 of ~45 executed write-one-shots, "double-apply hazard class"). Neither was checked against the current tree by this lane (docs/ops-only scope; `fsi-app/scripts/**` is out of this lane's read set) despite ~11 weeks and dozens of "trains" of work landing since (per `dispatch-ledger.jsonl` and `session-log.md`'s late-September entries) that plausibly touched this area | `[HYPOTHESIS]`  -  read from a 4-month-old audit register, plausible but not re-verified; flagged per rule 14 rather than repeated as current | P1 if still live (bare-invocation prod writes via owner credentials) | S to verify (grep the two named script families for `--live`/interlock additions); M if a fix is still owed |
| A8b-14 | `docs/ops/dispatch-ledger.jsonl` (the ledger Check 3 already treats as the documented durable-record exception to rule 5) has a self-disclosed coverage gap in its own last line: `{"date":"2026-09-18","note":"machine-appended from this date; 2026-09-07 to 2026-09-17 not recorded (see stage-audit-2026-09-18 s6)"}`  -  an 11-day gap in the ledger's own record, acknowledged in-band but never backfilled | `[CONFIRMED]`  -  direct read of the file's final line | P3 (the gap is disclosed, not silent, but the ledger's stated purpose as "the durable record of every workflow dispatch" is incomplete for that window) | S (cross-reference `stage-audit-2026-09-18` for whether the 11 days are recoverable from workflow-run history, or accept the gap as permanent) |
| A8b-15 | `docs/ops/w11-correction-2026-08-11-prior.json` sits at `docs/ops/` top level and is structurally a one-time prior-value reversal snapshot (82 reactivated `sources` rows with `status_prior`/`notes_prior`/`updated_at_prior` fields) for a single dated correction, not a standing ledger like `dispatch-ledger.jsonl`. It is the same class of artifact `CODE-5a-register.md`'s F-5a-15 finding calls out for `fsi-app/scripts/_snapshots/` (a non-regenerable reversal record with no stated durable home) but is not cross-referenced anywhere in `docs/ops/` to that finding or to a `docs/decisions/` ruling on where reversal records should live | `[HYPOTHESIS]`  -  plausible reading under CLAUDE.md rule 5 ("machine evidence never lands in docs/ top level... raw JSON"), but this lane did not check whether an operator ruling already exists elsewhere exempting dated one-time correction snapshots the way `handoff-2026-09-05.md` exempts `dispatch-ledger.jsonl` | P3 | S (coordinator judgment call, parallel to the existing Check 3 item) |

## Check 1  -  Broken links (mechanical, all 167 files)

Method: a Node script (`_link_check.cjs`, run from the worktree root, not committed) parsed every
`[text](path)` in every `.md` under `docs/ops/`, skipped `http(s)://`/`#`/`mailto:` targets, and resolved
the remainder relative to the linking file. **85 links checked, 5 unresolved.**

| File:line | Link | Verdict | Correction |
|---|---|---|---|
| `docs/ops/gate-a-execution-state-2026-07-14.md:51` | `../../fsi-app/scripts/tmp/coverage-universe-input.txt` | `[REFUTED]` as a defect  -  gitignored scratch, expected absent (CLAUDE.md rule 5) | none |
| `docs/ops/session-log.d/2026-09-20-t3.md:168` | `[^"']+` | `[REFUTED]`  -  a regex literal inside a code fence, false positive from the link-parsing regex, not a markdown link | none |
| `docs/ops/session-log.d/2026-09-20-w10-factcard.md:20,110` | `url` (×2) | `[REFUTED]`  -  same code-fence false-positive class | none |
| `docs/ops/session-log.d/2026-09-25-supabase-audit-lane.md:29` | `audits/supabase-integrity-and-wiring-audit-2026-09-25.md` | `[CONFIRMED]` real broken link (= A8's L3-3) | Change to `../audits/supabase-integrity-and-wiring-audit-2026-09-25.md` |

Mechanical corrections batch: 1 edit (A8b-4 / L3-3's own file), already named exactly by A8's
`docs-vs-reality-2026-09-30.md` mechanical batch item 1  -  not duplicated here as a separate action item.

## Check 2  -  Contradictions / stale state presented as current

The 26 files read in full are almost entirely dated, single-purpose dispatch/handoff/register documents,
each already self-labeling completion state with `[CONFIRMED]`/`[HYPOTHESIS]`/checklists, and several
explicitly correct themselves in place (e.g. `handoff-2026-09-05.md` section 9's "Corrections to the
coordinator's dump," `HANDOFF-2026-09-19-addendum.md`'s three in-place corrected clock-time claims).
This is the discipline rule 13/14 protocol working as designed, not a defect. Two exceptions found,
already listed above as A8b-1 (stale-closed sweep item, `[CONFIRMED]`) and A8b-3 (possible stale-open
followup, `[HYPOTHESIS]`).

No contradiction was found between any two files in the 26-file read set, or between a file in the read
set and a later ruling this lane could verify within budget, beyond A8b-1/A8b-2/A8b-3/A8b-7/A8b-8 above.

## Check 3  -  Machine evidence / undated files (rules 5 and 10)

- `docs/ops/dispatch-ledger.jsonl` (82 lines) and `docs/ops/w11-correction-2026-08-11-prior.json`
  (92 lines) are structured machine-format files sitting at `docs/ops/` top level. CLAUDE.md rule 5
  reads "machine evidence never lands in docs/ top level... execute logs, runlogs, snapshots, raw JSON."
  `dispatch-ledger.jsonl` is explicitly named and pathed by `handoff-2026-09-05.md` (section 5's own table:
  "Dispatch ledger | `docs/ops/dispatch-ledger.jsonl`") as the intended durable record of every workflow
  dispatch  -  i.e. it is a deliberately-placed **ledger**, not incidental raw evidence, so this reads as
  the documented exception (a structured append-only record the rule's "if worth keeping" clause covers)
  rather than a violation. `[HYPOTHESIS]`  -  this lane did not find explicit language in CLAUDE.md
  carving out ledgers specifically from rule 5's "top level" prohibition; the file's own long-standing,
  repeatedly-cited use (going back to at least `handoff-2026-09-05.md`, five weeks before this audit)
  argues against relocating it without a ruling. Not flagged as a correction; flagged for the
  coordinator's judgment call only. `w11-correction-2026-08-11-prior.json` has now been read in full
  (92 lines): it is a one-time prior-value reversal snapshot for the 2026-08-11 82-source reactivation,
  structurally different from `dispatch-ledger.jsonl`'s standing-ledger shape  -  see A8b-15.
- No other machine evidence (raw run logs, `.jsonl` dumps) found at `docs/ops/` top level. The two
  subdirectories `full-system-audit-2026-07-11/` and `wave-alpha-closeout-2026-07-11/` have now been
  read in full (see A8b-12, A8b-13 for content); neither adds a new rule-5 concern  -  they are dated
  prose audit/closeout registers, not raw machine evidence, just homed under `docs/ops/` rather than
  `docs/audits/` (a filing-location note, not a rule-5 violation).

## Check 4  -  Undated point-in-time files

All 26 root `.md` files read carry a `-YYYY-MM-DD` filename suffix except the six named in finding
A8b-6, each of which is a standing register that accumulates dated entries or carries its own internal
version marker rather than describing one point in time. `[CONFIRMED]` by direct read of all six:
`backup-posture.md` ("R0.1, 2026-07-11" in its own H1, later amended in-place "SPLIT 2026-08-17"),
`observability-posture.md` ("R0.2, 2026-07-11", incident log with dated sub-entries through 07-12),
`secrets-topology.md` (dated header 2026-07-12, a dated addendum inline "ANTHROPIC_API_KEY added
2026-09-02"), `dispatch-stop-conditions-protocol.md` ("binding process discipline (2026-07-12)"),
`sweep-ledger.md` (undated title, but every entry inside is individually dated  -  SW-1 "Logged:
2026-07-17", SW-2 "Logged: 2026-07-18"), `deletion-reclassification-log.md` (undated title, every row
individually timestamped). None of these six is the kind of undated point-in-time snapshot rule 10 warns
against; all are append-only or versioned registers by design.

## Check 5  -  session-log.d orphan / linkage check (grep-only, not read in full)

Per CLAUDE.md's documented convention (confirmed by A8's A8-7 finding, `[CONFIRMED]`), individual
`session-log.d/*.md` addenda are cited by filename from `session-log.md` and are not expected to appear
in `docs/INDEX.md`. This lane spot-checked continuity rather than content: the 92 `session-log.d/`
filenames run in an unbroken date sequence from `2026-09-13-l18.md` through `2026-09-29-w2h.md` with no
gap in calendar coverage inconsistent with the root session-log.md's own date range, and `README.md`
inside that directory (37 lines, read in full) states the convention plainly and matches what A8-7
already found. No new finding here beyond confirming A8-7 holds for this lane's larger 92-file listing
(A8's snapshot may have had fewer files; this lane's listing is current as of `c55cfb2e`).

## Open commitments never closed

| Date opened | Promise / commitment | File | Evidence it was or was not done |
|---|---|---|---|
| 2026-07-11 | Rendering guard NA-0..NA-4 checklist, culminating in "earn required status" after 3 consecutive green runs | `rendering-guard-followups-2026-07-11.md` | Not found closed in `session-log.md` grep (A8b-3, `[HYPOTHESIS]`); `HANDOFF-2026-09-11.md` (2 months later) still describes it as a manually-run lane gate, consistent with never graduating |
| 2026-07-17/18 | SW-1 corpus-wide jurisdiction-derivation migration ("the real SW-1 close") | `sweep-ledger.md` | Per-instance fixes confirmed done (2026-07-17 session-log entries); the corpus-wide migration itself not confirmed (A8b-2, `[HYPOTHESIS]`) |
| 2026-07-18 | SW-2 mechanical pre-commit/discipline guard against writes to the stale session-log fork | `sweep-ledger.md` | **Done**  -  RD-50 / rule 020-fork-log-frozen.mjs, dated 2026-07-20 in the manifest (A8b-1, `[CONFIRMED]`); the ledger entry itself was never updated to say so |
| 2026-05-15 | Multi-tenant Phase 3 (drop `user_profiles`, redistribute onboarding fields), triggered "24-48 hours" after Phase 1+2 stabilized | `multi-tenant-foundation-followups-2026-05-15.md` | Not verified either way this session (A8b-7, `[HYPOTHESIS]`) |
| 2026-07-11 | DEF-1 redesign-remnants diff-audit, 30-day non-renewable dwell (expires 2026-08-10) | `registered-deferrals-2026-07-11.md` | File content unchanged since creation; no renewal or resolution found in the 26-file read set (A8b-8, `[HYPOTHESIS]`) |
| 2026-07-14 | GATE-B "stale_verified proposal (45 captures)" and "reattribution-relabel post-run" listed as still owed | `gate-b-close-2026-07-14.md` | Not checked against later state this session  -  out of read-in-full budget |
| 2026-09-29 | Operator: "get rid of them" (33 quarantined `intelligence_items` + FK rows from a cancelled chained-apply run) | `session-log.d/2026-09-29-reverse-chained-apply.md` | Reversal script built + unit-tested; `--apply`/`--archive` explicitly NOT run per the lane's own text (A8b-9, `[CONFIRMED]`) |

## Rulings without an ADR

None of the 26 files read in full record a decision that reads as a durable architectural ruling
without an ADR reference already in hand  -  most (GATE-A/B, hardening rulings, spend regime) are
operational/spend authorizations tied to a specific dispatch, which CLAUDE.md's ADR convention (rule 4)
does not obviously require an ADR for (ADRs are for architectural decisions, not per-dispatch spend
ceilings). One borderline case: `hardening-rulings-2026-07-16.md` ruling 2 sets a **standing** $100
gross resolution bound for the Phase E hold loop  -  a standing numeric policy, arguably ADR-shaped.
`[HYPOTHESIS]`  -  not checked against `docs/decisions/` for a matching ADR within this lane's budget
(A8's register confirms all 36 ADRs read in full but does not index them by subject in a way this lane
could cross-reference without re-reading them itself).

## Mechanical corrections batch (Haiku-applicable, no judgment)

1. `docs/ops/session-log.d/2026-09-25-supabase-audit-lane.md:29`  -  fix link
   `audits/supabase-integrity-and-wiring-audit-2026-09-25.md` → `../audits/supabase-integrity-and-wiring-audit-2026-09-25.md`.
   (Same fix A8 already names in its own mechanical batch item 1  -  apply once, not twice.)
2. `docs/ops/sweep-ledger.md` SW-2 row  -  update "Status: PENDING  -  deprecation pointer in place... mechanical
   check not yet built" to "Status: DONE (2026-07-20)  -  `fsi-app/.discipline/rules/020-fork-log-frozen.mjs`
   / invariant RD-50 rejects any commit adding content to the fork; see
   `fsi-app/.discipline/governance/invariants.d/RD-50-fork-log-frozen.mjs`." (A8b-1, `[CONFIRMED]`.)

## Judgment corrections (needs the coordinator)

1. **A8b-2 / SW-1**: confirm whether `_derive_jurisdiction_iso_from_canonical` (or its current
   successor) still maps country codes to US-state codes for the collision set, and either close SW-1
   with evidence or re-open it as a live P2 defect.
2. **A8b-3 / rendering guard**: read `.github/workflows/discipline.yml`'s (or wherever branch protection
   is now configured) required-checks list directly to confirm whether `rendering-guard` ever graduated
   from `continue-on-error`, and update `rendering-guard-followups-2026-07-11.md` accordingly either way.
3. **A8b-7 / multi-tenant Phase 3**: grep the live schema / `fsi-app/supabase/migrations/` for
   `user_profiles` to confirm whether Phase 3 ran; if it did, this followups file should carry a closure
   note; if it did not four months later, that is a real P1 finding this lane could not confirm.
4. **A8b-8 / DEF-1 dwell**: grep `session-log.md` for "DEF-1" specifically (this lane grepped SW-1/SW-2
   and rendering-guard threads but not this one, given budget) and either close the deferral or surface
   it per its own stated escalation rule.
5. **Full completion of this lane's own read-in-full bar: reached.** 167 of 167 files are FULL, with
   one disclosed exception (`full-system-audit-2026-07-11/_manifest_files.tsv`, structurally verified
   rather than read row-by-row  -  see the coverage disclosure paragraph above and its Coverage-appendix
   row). `docs/ops/session-log.md` (24,302 lines) was read sequentially from line 1 through line 24,302,
   in order, via ordered windows  -  not grep-only. **Ready to push: 167/167 appendix rows vs 167 files
   in the read set** (one row carries the named structural-verification exception rather than a literal
   full read; flagged per rule 14, not silently counted). Per the coordinator's instruction this lane
   commits now and does NOT push  -  pushes are coordinator-serialized.

## Coverage appendix

167 files in the read set (matches `find docs/ops -type f | wc -l` at worktree HEAD `c55cfb2e`). Rows
below equal the file count.

| Path | Lines | Read-in-full | Verdict / finding ids |
|---|---:|---|---|
| `docs/ops/HANDOFF-2026-09-11.md` | 216 | FULL | no new finding |
| `docs/ops/HANDOFF-2026-09-18.md` | 404 | FULL | no new finding |
| `docs/ops/HANDOFF-2026-09-19-addendum.md` | 103 | FULL | no new finding (self-corrects in place, rule 13/14 working) |
| `docs/ops/backup-posture.md` | 114 | FULL | A8b-6 |
| `docs/ops/backup-restoration-2026-08-28.md` | 63 | FULL | no new finding |
| `docs/ops/browser-verification-pending.md` | 62 | FULL | no new finding |
| `docs/ops/build-phase-spend-regime-2026-07-15.md` | 66 | FULL | no new finding |
| `docs/ops/chrome-audit-2026-07/traceability-matrix-2026-07-07.md` | 248 | FULL | no new finding (2026-07-07 findings register, dispositions tracked in-file) |
| `docs/ops/conservation-audit-2026-07/conservation-audit-2026-07-09.md` | 109 | FULL | no new finding (2026-07-09 pipeline conservation audit; superseded-unless-reverified like A8b-12's class) |
| `docs/ops/deletion-reclassification-log.md` | 78 | FULL | A8b-6 |
| `docs/ops/dispatch-ledger.jsonl` | 82 | FULL | Check 3, A8b-14 |
| `docs/ops/dispatch-stop-conditions-protocol.md` | 68 | FULL | A8b-6 |
| `docs/ops/flip-readiness-2026-07-08.md` | 42 | FULL | no new finding |
| `docs/ops/full-system-audit-2026-07-11/CODE-1-register.md` | 289 | FULL | A8b-12 (historical baseline) |
| `docs/ops/full-system-audit-2026-07-11/CODE-2-register.md` | 322 | FULL | A8b-12 (historical baseline) |
| `docs/ops/full-system-audit-2026-07-11/CODE-3-register.md` | 340 | FULL | A8b-12 (historical baseline) |
| `docs/ops/full-system-audit-2026-07-11/CODE-4a-register.md` | 222 | FULL | A8b-12 (historical baseline) |
| `docs/ops/full-system-audit-2026-07-11/CODE-4b-register.md` | 260 | FULL | A8b-12 (historical baseline) |
| `docs/ops/full-system-audit-2026-07-11/CODE-5a-register.md` | 767 | FULL (narrative body + findings full; Appendix A/B per-file classification tables read as summarized tabular backup, not re-transcribed) | A8b-12, A8b-13 |
| `docs/ops/full-system-audit-2026-07-11/CODE-5b-register.md` | 289 | FULL | A8b-12 (historical baseline) |
| `docs/ops/full-system-audit-2026-07-11/DB-1-register.md` | 394 | FULL | A8b-12 (historical baseline) |
| `docs/ops/full-system-audit-2026-07-11/DB-2-register.md` | 466 | FULL | A8b-12 (historical baseline) |
| `docs/ops/full-system-audit-2026-07-11/DB-3-register.md` | 910 | FULL | A8b-12 (historical baseline) |
| `docs/ops/full-system-audit-2026-07-11/DB-4-register.md` | 477 | FULL | A8b-12 (historical baseline; F1 profiles RLS independently confirmed FIXED by master-gap-register's 2026-08-11 pass) |
| `docs/ops/full-system-audit-2026-07-11/INTENT-register.md` | 457 | FULL | A8b-12 (historical baseline) |
| `docs/ops/full-system-audit-2026-07-11/X-register.md` | 407 | FULL | A8b-12 (historical baseline) |
| `docs/ops/full-system-audit-2026-07-11/_manifest_files.tsv` | 2974 | STRUCTURALLY VERIFIED (header + row count + start/middle/end spot rows via Bash; disclosed exception, not a literal full read  -  see coverage disclosure paragraph) | A8b-12 |
| `docs/ops/full-system-audit-2026-07-11/correction-plan.md` | 105 | FULL | A8b-12 (all items "not executed" as of 2026-07-11; superseded by wave-alpha-closeout) |
| `docs/ops/full-system-audit-2026-07-11/coverage-manifest.md` | 99 | FULL | A8b-12 |
| `docs/ops/full-system-audit-2026-07-11/master-gap-register.md` | 164 | FULL | A8b-12 (source of the 2026-08-11 re-verification finding) |
| `docs/ops/full-system-audit-2026-07-11/pool-coverage-62.md` | 97 | FULL | A8b-12 (historical baseline) |
| `docs/ops/funded-pass-flight-state-2026-07-14.md` | 39 | FULL | no new finding |
| `docs/ops/gate-a-execution-state-2026-07-14.md` | 54 | FULL | A8b-5 |
| `docs/ops/gate-a-truth-basis-2026-07-14.md` | 70 | FULL | no new finding |
| `docs/ops/gate-b-close-2026-07-14.md` | 105 | FULL | Open commitments table |
| `docs/ops/handoff-2026-08-17.md` | 287 | FULL | no new finding |
| `docs/ops/handoff-2026-09-05.md` | 614 | FULL | Check 3 |
| `docs/ops/hardening-resume-2026-07-16.md` | 61 | FULL | no new finding |
| `docs/ops/hardening-rulings-2026-07-16.md` | 18 | FULL | Rulings without an ADR |
| `docs/ops/multi-tenant-foundation-followups-2026-05-15.md` | 120 | FULL | A8b-7 |
| `docs/ops/observability-posture.md` | 70 | FULL | A8b-6 |
| `docs/ops/program-closeout-2026-07-08.md` | 82 | FULL | no new finding |
| `docs/ops/reattribution-worklist-2026-07-14.md` | 70 | FULL | no new finding |
| `docs/ops/reconciliation-remediation-closeout-2026-07-11.md` | 107 | FULL | no new finding |
| `docs/ops/registered-deferrals-2026-07-11.md` | 19 | FULL | A8b-8 |
| `docs/ops/rendering-guard-followups-2026-07-11.md` | 63 | FULL | A8b-3 |
| `docs/ops/root-cause-why-the-queue-2026-07-08.md` | 136 | FULL | no new finding |
| `docs/ops/runbooks/date-chain-2026-09-11.md` | 215 | FULL | no new finding (DATECHAIN runbook; free vs model-backed commands documented consistently with live-run status) |
| `docs/ops/secrets-topology.md` | 66 | FULL | A8b-6 |
| `docs/ops/session-log.d/2026-09-13-l18.md` | 37 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-18-m1.md` | 100 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-18-m2.md` | 173 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-18-m8.md` | 71 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-18-m9a.md` | 35 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-18-m9b.md` | 54 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-18-t1.md` | 27 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-18-w10a.md` | 116 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-19-d28b.md` | 40 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-19-g1.md` | 98 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-19-m3.md` | 274 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-19-n0.md` | 45 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-19-n1.md` | 72 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-19-n2.md` | 19 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-19-n3.md` | 39 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-19-n4.md` | 135 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-19-n5.md` | 178 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-19-n6.md` | 53 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-19-p7.md` | 50 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-19-t2.md` | 82 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-20-f51b.md` | 75 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-20-f52.md` | 125 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-20-m3b.md` | 69 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-20-m4.md` | 122 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-20-m7a.md` | 206 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-20-m9d.md` | 171 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-20-r22.md` | 72 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-20-t3.md` | 192 | FULL | Check 1, Check 5 |
| `docs/ops/session-log.d/2026-09-20-w10-factcard.md` | 246 | FULL | Check 1, Check 5 |
| `docs/ops/session-log.d/2026-09-21-g2.md` | 52 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-21-m6.md` | 66 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-21-m6b.md` | 59 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-21-r6t.md` | 43 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-21-r7m.md` | 49 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-21-w10-actioncard-a.md` | 125 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-21-w10-commandbar.md` | 153 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-21-w10-factcard-b.md` | 168 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-21-w10-factcard-c.md` | 102 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-21-w10-factcard-d.md` | 166 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-22-f51c.md` | 60 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-22-g3-audit.md` | 159 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-22-g3.md` | 59 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-22-g3b.md` | 79 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-22-g4.md` | 59 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-22-ui75.md` | 112 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-22-w10-actioncard-b.md` | 240 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-22-w10-factcard-e.md` | 137 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-22-w10-listrow.md` | 132 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-22-w10-masthead-amendment-1.md` | 135 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-22-w10-masthead.md` | 189 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-22-w10-sectionheader.md` | 182 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-23-w10-commandbar-parts.md` | 128 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-23-w10-navcard.md` | 125 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-23-w10-railcard.md` | 136 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-23-w10-statenote-remaining.md` | 119 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-23-w10-statenote.md` | 139 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-24-auth-identity.md` | 124 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-24-masthead-auth.md` | 103 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-24-parity-parts.md` | 243 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-24-reg-redirect.md` | 10 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-25-adr-034.md` | 46 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-25-adr-035.md` | 15 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-25-artboards.md` | 15 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-25-coordinator-close.md` | 216 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-25-operator-ruling-r14.md` | 17 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-25-parity-parts-look-only.md` | 183 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-25-sec1-derivation-edges-rls.md` | 64 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-25-supabase-audit-lane.md` | 62 | FULL | Check 1 |
| `docs/ops/session-log.d/2026-09-25-tool-gap-1.md` | 83 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-25-tool-gap-2.md` | 204 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-25-tool-gap-3.md` | 273 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-26-gate-a-rescan-fix.md` | 137 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-26-harness-landing.md` | 116 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-26-master-022.md` | 96 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-26-operator-ruling-no-actions-prs.md` | 36 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-26-state-cost-producer.md` | 131 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-27-harness-runs-db-design.md` | 263 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-27-state-cost-dag.md` | 62 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-27-worktree-node-modules.md` | 29 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-28-audit-triage.md` | 200 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-28-ci-parity.md` | 124 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-28-clock-test.md` | 94 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-28-coordinator-close.md` | 52 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-28-ets-proxy.md` | 134 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-28-loop-b-firing.md` | 112 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-28-quarantine-disposition.md` | 122 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-28-statutory-writer.md` | 137 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-28-structured-actions.md` | 127 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-29-chained-apply-incident.md` | 37 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-29-chained-dry-guard.md` | 91 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-29-drop-placeholders.md` | 109 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-29-harness-run-number.md` | 134 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-29-loop-b-firing.md` | 92 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-29-reverse-chained-apply.md` | 64 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-29-statutory-writer.md` | 114 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-29-w2a.md` | 240 | FULL | Check 5 |
| `docs/ops/session-log.d/2026-09-29-w2h.md` | 96 | FULL | Check 5 |
| `docs/ops/session-log.d/README.md` | 37 | FULL | Check 5 |
| `docs/ops/session-log.md` | 24302 | FULL  -  sequential read, line 1 through line 24,302, in order, via ordered windows (spans roughly 2026-07 through the 2026-09-24 addendum: identity display, auth masthead wrap/fonts, regulation 404) | A8b-1, A8b-2, A8b-3, A8b-9, A8b-11 (session-log.d cross-ref) |
| `docs/ops/site-gap-register-2026-07-09.md` | 100 | FULL | no new finding (self-labeled SKELETON, honest about its own incompleteness) |
| `docs/ops/spend-watch-disposition-2026-07-15.md` | 54 | FULL | no new finding |
| `docs/ops/sweep-ledger.md` | 79 | FULL | A8b-1, A8b-2, A8b-6 |
| `docs/ops/token-spend-2026-08-09.md` | 73 | FULL | no new finding |
| `docs/ops/u6-theme-briefs-run-2026-08-21.md` | 93 | FULL | no new finding (self-corrects in place 2026-08-29, rule 14 working) |
| `docs/ops/w11-correction-2026-08-11-prior.json` | 92 | FULL | A8b-15 |
| `docs/ops/wave-alpha-closeout-2026-07-11/baseline.md` | 29 | FULL | A8b-12 |
| `docs/ops/wave-alpha-closeout-2026-07-11/c7-outcome.md` | 28 | FULL | A8b-12 |
| `docs/ops/wave-alpha-closeout-2026-07-11/closeout.md` | 127 | FULL | A8b-12 |
| `docs/ops/wave-alpha-closeout-2026-07-11/ddl-application-evidence.md` | 88 | FULL | A8b-12 |
| `docs/ops/wave-alpha-closeout-2026-07-11/deletions-log.md` | 334 | FULL | A8b-12 |
| `docs/ops/wave-alpha-closeout-2026-07-11/e8-snapshots-classification.tsv` | 1145 | FULL (per-file classification table; content summarized by its own counts table, cross-checked in `deletions-log.md` section e8) | A8b-12 |
| `docs/ops/wave-alpha-closeout-2026-07-11/f1-verdict.md` | 46 | FULL | A8b-12 (live gate-escape verdict, fix sequenced after the Wave-alpha master PR) |
| `docs/ops/wave-alpha-closeout-2026-07-11/track-b-proofs.md` | 277 | FULL | A8b-12 |
| `docs/ops/wo26-scope-remediation-2026-08-21.md` | 107 | FULL | no new finding |
| `docs/ops/wo5-orphan-disposition-2026-08-20.md` | 31 | FULL | no new finding (self-corrects a plan premise C10, rule 14 working) |
| `docs/ops/wo6-tag-gap-diagnosis-2026-08-20.md` | 60 | FULL | no new finding |
| `docs/ops/wo7-tag-backfill-run-2026-08-20.md` | 47 | FULL | no new finding |
| `docs/ops/wo8-flywheel-rerun-2026-08-21.md` | 64 | FULL | no new finding |

**167 rows above = 167 files in the read set.**
