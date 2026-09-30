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
the reason you exist").** Progress against that literal bar, this pass: **26 root `.md` files (5,140
lines) PLUS all 92 `docs/ops/session-log.d/*.md` files (including README.md), read individually and in
full, top to bottom = 118 of 167 files at FULL.** `docs/ops/session-log.md` (24,302 lines) has been read
**sequentially from line 1 through line 8900 (~37%)** via ordered ~400-line windows, not grepped  -  this
is a genuine in-progress sequential read, not a sampling. **Still not read in full**: the remainder of
`session-log.md` (lines 8901-24302, ~63%), the `full-system-audit-2026-07-11/` subdirectory (12 files,
~4,700 lines), `wave-alpha-closeout-2026-07-11/` (8 files, ~2,000 lines), `chrome-audit-2026-07/` and
`conservation-audit-2026-07/` (2 files), `runbooks/date-chain-2026-09-11.md` (215 lines),
`dispatch-ledger.jsonl` and `w11-correction-2026-08-11-prior.json` (174 lines, machine data). **This
lane has NOT reached 167/167 and is not sending "ready to push."** Per rule 14 this status is stated
honestly rather than rounded up: 118/167 files fully read, plus 8900/24302 lines (~37%) of the single
largest file, sequentially, in progress. The remaining ~15,400 lines of session-log.md plus the 22
files above (~7,100 lines) are the open remainder. Findings below marked from the session-log.d full
read are new since the prior coverage snapshot; findings from session-log.md are current through line
8900 only and will be extended as the read continues.

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
| A8b-11 | `docs/ops/session-log.d/2026-09-29-w2h.md` Task 2 (ADR-034 naming phase): 3 copy lines in `src/app/api/admin/scan/route.ts` (an LLM-prompt file, not user-visible copy) were explicitly routed to the coordinator for a scope ruling ("is an AI-instruction prompt file in scope for WS14 naming-only phase, or does it fall under the prompt-change stop") and this lane's read set shows no answer to that routing within the files read | `[HYPOTHESIS]`  -  absence-based; the answer may exist later in session-log.md (not yet reached, only read through line 8900) or in a session-log.d file dated after 2026-09-29 (none exist in the 92-file set, which ends 2026-09-29) | P3 | S (grep later session-log.md content once read, or ask coordinator directly) |

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
  coordinator's judgment call only. `w11-correction-2026-08-11-prior.json` was not read in full (92
  lines, JSON) so no independent characterization is offered beyond the filename.
- No other machine evidence (raw run logs, `.jsonl` dumps) found at `docs/ops/` top level in the 26 files
  read; two subdirectories (`full-system-audit-2026-07-11/`, `wave-alpha-closeout-2026-07-11/`) were
  not opened this session and are excluded from this check (see Coverage appendix).

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
5. **Full completion of this lane's own read-in-full bar, updated.** As of this update: 118 of 167 files
   are FULL (26 root files + all 92 `session-log.d/*.md` including README.md). 22 files remain
   unread (the `full-system-audit-2026-07-11/`, `wave-alpha-closeout-2026-07-11/`,
   `chrome-audit-2026-07/`, `conservation-audit-2026-07/` subdirectories, `runbooks/date-chain-2026-09-11.md`,
   `dispatch-ledger.jsonl`, `w11-correction-2026-08-11-prior.json`). `docs/ops/session-log.md` (24,302
   lines) is at a genuine sequential in-progress read, currently through line 8900 (~37%), not grep-only.
   **This lane has not reached 167/167 and per the coordinator's explicit instruction is not sending
   "ready to push" until it does.** Interim status for the coordinator: 118/167 files FULL, plus 8900/24302
   lines of session-log.md read in order; work continues in a follow-on pass (this session is
   context-constrained against the remaining ~15,400 lines plus 22 files at the depth already
   demonstrated).

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
| `docs/ops/chrome-audit-2026-07/traceability-matrix-2026-07-07.md` | 248 | NOT READ (metadata only: `wc -l`) |  -  |
| `docs/ops/conservation-audit-2026-07/conservation-audit-2026-07-09.md` | 109 | NOT READ (metadata only: `wc -l`) |  -  |
| `docs/ops/deletion-reclassification-log.md` | 78 | FULL | A8b-6 |
| `docs/ops/dispatch-ledger.jsonl` | 82 | NOT READ (metadata only: `wc -l`; referenced structurally in Check 3) | Check 3 |
| `docs/ops/dispatch-stop-conditions-protocol.md` | 68 | FULL | A8b-6 |
| `docs/ops/flip-readiness-2026-07-08.md` | 42 | FULL | no new finding |
| `docs/ops/full-system-audit-2026-07-11/CODE-1-register.md` | 289 | NOT READ (metadata only: `wc -l`) |  -  |
| `docs/ops/full-system-audit-2026-07-11/CODE-2-register.md` | 322 | NOT READ (metadata only: `wc -l`) |  -  |
| `docs/ops/full-system-audit-2026-07-11/CODE-3-register.md` | 340 | NOT READ (metadata only: `wc -l`) |  -  |
| `docs/ops/full-system-audit-2026-07-11/CODE-4a-register.md` | 222 | NOT READ (metadata only: `wc -l`) |  -  |
| `docs/ops/full-system-audit-2026-07-11/CODE-4b-register.md` | 260 | NOT READ (metadata only: `wc -l`) |  -  |
| `docs/ops/full-system-audit-2026-07-11/CODE-5a-register.md` | 767 | NOT READ (metadata only: `wc -l`) |  -  |
| `docs/ops/full-system-audit-2026-07-11/CODE-5b-register.md` | 289 | NOT READ (metadata only: `wc -l`) |  -  |
| `docs/ops/full-system-audit-2026-07-11/DB-1-register.md` | 394 | NOT READ (metadata only: `wc -l`) |  -  |
| `docs/ops/full-system-audit-2026-07-11/DB-2-register.md` | 466 | NOT READ (metadata only: `wc -l`) |  -  |
| `docs/ops/full-system-audit-2026-07-11/DB-3-register.md` | 910 | NOT READ (metadata only: `wc -l`) |  -  |
| `docs/ops/full-system-audit-2026-07-11/DB-4-register.md` | 477 | NOT READ (metadata only: `wc -l`) |  -  |
| `docs/ops/full-system-audit-2026-07-11/INTENT-register.md` | 457 | NOT READ (metadata only: `wc -l`) |  -  |
| `docs/ops/full-system-audit-2026-07-11/X-register.md` | 407 | NOT READ (metadata only: `wc -l`) |  -  |
| `docs/ops/full-system-audit-2026-07-11/_manifest_files.tsv` | 2974 | NOT READ (metadata only: `wc -l`) |  -  |
| `docs/ops/full-system-audit-2026-07-11/correction-plan.md` | 105 | NOT READ (metadata only: `wc -l`) |  -  |
| `docs/ops/full-system-audit-2026-07-11/coverage-manifest.md` | 99 | NOT READ (metadata only: `wc -l`) |  -  |
| `docs/ops/full-system-audit-2026-07-11/master-gap-register.md` | 164 | NOT READ (metadata only: `wc -l`) |  -  |
| `docs/ops/full-system-audit-2026-07-11/pool-coverage-62.md` | 97 | NOT READ (metadata only: `wc -l`) |  -  |
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
| `docs/ops/runbooks/date-chain-2026-09-11.md` | 215 | NOT READ (metadata only: `wc -l`) |  -  |
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
| `docs/ops/session-log.md` | 24302 | PARTIAL  -  sequential read, lines 1-8900 (~37%), in progress via ordered windows; lines 8901-24302 not yet read | A8b-1, A8b-2, A8b-3, A8b-9 (session-log.d cross-ref) |
| `docs/ops/site-gap-register-2026-07-09.md` | 100 | FULL | no new finding (self-labeled SKELETON, honest about its own incompleteness) |
| `docs/ops/spend-watch-disposition-2026-07-15.md` | 54 | FULL | no new finding |
| `docs/ops/sweep-ledger.md` | 79 | FULL | A8b-1, A8b-2, A8b-6 |
| `docs/ops/token-spend-2026-08-09.md` | 73 | FULL | no new finding |
| `docs/ops/u6-theme-briefs-run-2026-08-21.md` | 93 | FULL | no new finding (self-corrects in place 2026-08-29, rule 14 working) |
| `docs/ops/w11-correction-2026-08-11-prior.json` | 92 | NOT READ (metadata only: `wc -l`) |  -  |
| `docs/ops/wave-alpha-closeout-2026-07-11/baseline.md` | 29 | NOT READ (metadata only: `wc -l`) |  -  |
| `docs/ops/wave-alpha-closeout-2026-07-11/c7-outcome.md` | 28 | NOT READ (metadata only: `wc -l`) |  -  |
| `docs/ops/wave-alpha-closeout-2026-07-11/closeout.md` | 127 | NOT READ (metadata only: `wc -l`) |  -  |
| `docs/ops/wave-alpha-closeout-2026-07-11/ddl-application-evidence.md` | 88 | NOT READ (metadata only: `wc -l`) |  -  |
| `docs/ops/wave-alpha-closeout-2026-07-11/deletions-log.md` | 334 | NOT READ (metadata only: `wc -l`) |  -  |
| `docs/ops/wave-alpha-closeout-2026-07-11/e8-snapshots-classification.tsv` | 1145 | NOT READ (metadata only: `wc -l`) |  -  |
| `docs/ops/wave-alpha-closeout-2026-07-11/f1-verdict.md` | 46 | NOT READ (metadata only: `wc -l`) |  -  |
| `docs/ops/wave-alpha-closeout-2026-07-11/track-b-proofs.md` | 277 | NOT READ (metadata only: `wc -l`) |  -  |
| `docs/ops/wo26-scope-remediation-2026-08-21.md` | 107 | FULL | no new finding |
| `docs/ops/wo5-orphan-disposition-2026-08-20.md` | 31 | FULL | no new finding (self-corrects a plan premise C10, rule 14 working) |
| `docs/ops/wo6-tag-gap-diagnosis-2026-08-20.md` | 60 | FULL | no new finding |
| `docs/ops/wo7-tag-backfill-run-2026-08-20.md` | 47 | FULL | no new finding |
| `docs/ops/wo8-flywheel-rerun-2026-08-21.md` | 64 | FULL | no new finding |

**167 rows above = 167 files in the read set.**
