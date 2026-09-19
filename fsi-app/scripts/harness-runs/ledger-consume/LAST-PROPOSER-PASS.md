# Last proposer pass — ledger-consume

Per `PROPOSER-RUNBOOK.md` section 2's attestation format. `ledger-consume` now has **ten** artifacts
(`ledger-consume-run-001` through `-010`); F28's rule (d) requires this file to name the latest
verbatim: **ledger-consume-run-010**.

## Proposer pass for ledger-consume-run-010 (2026-09-18, lane M2, leaked-state repair)

**Artifact read:** `ledger-consume-run-010.json` (`config.action:"consume"`, `mode:"plan"`, `limit:5`,
`harness_version:sha256:b1abea99a2de2d4e`) and its trace `traces/ledger-consume-run-010.result.json`, in
full.

**What moved the hash since run-009, and why this is a repair, not new work:** commit `e8e86f76` fixed a
pre-commit glyph violation (rule 022, no em/en dash) in `run-ledger-consume.mjs`'s `isApplyArmed` jsdoc
(one of this family's own governing files) AFTER `ledger-consume-run-009.json` had already been generated
and its hash recorded. The full fitness suite was re-run before that specific glyph edit, showed 0
violations, and was not re-run after it before the commit landed, so the commit shipped with run-009's
recorded `harness_version` (`sha256:d5d30df2b7a73d8d`) already stale against the actually-committed code
(`sha256:b1abea99a2de2d4e`). F28's own next run correctly caught this leaked state during the F39
correction that follows in this same session. This run repairs it: a fresh local plan-mode probe under
the TRUE final code, landed before, not instead of, the F39 fix's own gates, per "class fix must repair
leaked state" (restore state, not only the mechanism).

**What this run is, and is not:** the SAME shape as run-008/run-009, a bounded LOCAL verification probe
(`--mode plan --limit 5`, no `--verdicts`, no `--allow-api`). `discovered:5, fetched:0, classified:2,
promoted:0, skipped:3, capped:0, verdicts_owed:3` (read directly from the artifact), identical to
run-008/run-009's own numbers on the same 5-row window (the ledger has not moved between these three
local runs), not a new pattern.

**Proposal: none warranted.** `defects_found` is empty. This run's own role is limited to proving the
driver still executes cleanly and to giving F28 a current, honest artifact; the glyph fix itself was
already proven behavior-preserving by run-ledger-consume.test.mjs's unchanged 128 passing tests, both
before and after.

**Open, unchanged from run-008/run-009's passes:** whether a REAL `workflow_run`-chained dispatch fires
end to end. Out of this run's own read set; the coordinator's first real, armed chain firing is the
evidence that answers this.

**Basis:** `metrics`/`config` read directly from the committed artifact; the hash-drift account above is
read directly from `git log`/`git show` on `run-ledger-consume.mjs` across the two edits, not asserted
from memory.

**Family gates status:** green. `node --test fsi-app/scripts/turns/run-ledger-consume.test.mjs` (128
tests, unchanged by this repair) and `npx tsc --noEmit` pass on this tree.

---

## Proposer pass for ledger-consume-run-009 (2026-09-18, lane M2 correction)

**Artifact read:** `ledger-consume-run-009.json` (`config.action:"consume"`, `mode:"plan"`, `limit:5`,
`harness_version:sha256:d5d30df2b7a73d8d`) and its trace `traces/ledger-consume-run-009.result.json`, in
full.

**What moved the hash since run-008:** the coordinator's correction to the arming rule
(`isApplyArmed`/`resolveApplyGate` in `run-ledger-consume.mjs`, one of this family's own governing files)
and the new `metrics.verdicts_owed` field (`shapeConsumeResult`, same file). Both are prose/logic changes
inside the driver; `portal-harvest.ts` and `first-fetch-classify.ts` (the other two governing files) were
not touched by this correction.

**What this run is, and is not:** the SAME shape as run-008's own pass, a bounded LOCAL verification probe
(`--mode plan --limit 5`, no `--verdicts`, no `--allow-api`), run to prove the corrected driver still
executes end to end, not a production dispatch. `discovered:5, fetched:0, classified:2, promoted:0,
skipped:3, capped:0, verdicts_owed:3` (read directly from the artifact), consistent with the same
2-of-5 verdict-coverage shape run-008 measured on the identical 5-row window (the ledger has not moved
between the two local runs), not a new pattern.

**Proposal: none warranted for `run-ledger-consume.mjs`/`portal-harvest.ts` from this run's own
evidence.** `defects_found` is empty. The substantive change this correction made (arming now reads
`verdictsFilesCount` instead of `verdictsGiven`; `metrics.verdicts_owed` added) is proven by
`run-ledger-consume.test.mjs`'s own updated unit tests (`isApplyArmed`/`resolveApplyGate` composition,
`metrics.verdicts_owed` equals `without_verdict_skipped`) and `population-report.test.mjs`'s new tests
(`computeVerdictsOwed`, `loadCommittedVerdictedUrls`, `countCandidatesAwaitingVerdict`), not by this
plan-mode probe. This run's own role is limited to proving the corrected driver still runs cleanly.

**Open, unchanged from run-008's pass:** whether a REAL `workflow_run`-chained dispatch threads
`next_cursor` correctly, and whether the chained-apply pass (now self-arming on committed verdicts) fires
end to end and actually promotes a candidate for real. Out of this run's own read set; the coordinator's
first real, armed chain firing is the evidence that answers this.

**Basis:** `metrics`/`config` read directly from the committed artifact; the "identical window, not a new
pattern" claim is a direct field-by-field comparison against run-008's own recorded outcomes for the same
5 candidate ids, never asserted without the prior run's own numbers alongside it.

**Family gates status:** green. `node --test fsi-app/scripts/turns/run-ledger-consume.test.mjs
fsi-app/scripts/verify/population-report.test.mjs` (192 tests) and `npx tsc --noEmit` pass on this tree
(this lane's own report has the verbatim counts).

---

## Proposer pass for ledger-consume-run-008 (2026-09-18, lane M2)

**Artifact read:** `ledger-consume-run-008.json` (`config.action:"consume"`, `mode:"plan"`,
`limit:5`, `harness_version:sha256:696d58aee19a1566`) and its trace
`traces/ledger-consume-run-008.result.json`, in full.

**What this run is, and is not:** a bounded LOCAL verification probe (`--mode plan --limit 5`, no
`--verdicts`, no `--allow-api`), run per this lane's own brief item 6 ("run plan mode once locally,
and commit its artifact") to prove the driver still runs end to end after this lane's code change
(the retirement of `LEDGER_CONSUME_APPLY_ENABLED`, the new `--max-promote` cap, the
`upstream_run_id`/`max_promote` config fields, the `before`/`after` per_item fields). It is NOT a
production dispatch over new ledger territory and carries no new evidence about the family's walk
behavior (`next_cursor`, verdict coverage, fetch/classify counts) beyond what run-007's pass
already established: `discovered:5, fetched:0, classified:2, promoted:0, skipped:3, capped:0`,
consistent with the SAME 2-of-5 verdict-coverage shape run-007 measured at scale (386/400), not a
new pattern.

**Proposal: none warranted for `run-ledger-consume.mjs`/`portal-harvest.ts` from this run's own
evidence.** `defects_found` is empty, and this run's own purpose was confirmation, not discovery.
The substantive change this lane made (the max-promote cap, the constant's retirement) is proven by
`run-ledger-consume.test.mjs`'s own unit tests (`applyPromoteCap`, `ledgerStatusAfter`,
`parseArgs` `--max-promote` bounds) and the `ledger-consume.yml` golden tests, not by this plan-mode
probe. This run's own role is limited to proving the driver still executes cleanly post-edit.

**Open, unchanged from run-007's pass, item (b), still not re-verified:** whether a REAL
`workflow_run`-chained dispatch (as opposed to this lane's local probe) threads `next_cursor`
correctly and whether the newly-wired chained-apply pass (this lane's own `.github/workflows/
ledger-consume.yml` change) actually fires end to end. Out of this run's own read set (a local
plan-mode probe proves nothing about the GitHub Actions chain); the coordinator's first real apply
dispatch (this lane's own acceptance criterion "Run") is the evidence that answers this.

**Basis:** `metrics`/`config` read directly from the committed artifact; the "not a new pattern"
claim is a direct comparison against run-007's own `matched`/`fetched` ratio (386/400 vs 2/5),
never asserted without the prior run's own numbers alongside it.

**Family gates status:** green. `node --test fsi-app/scripts/turns/run-ledger-consume.mjs` (128
tests) and `npx tsc --noEmit` pass on this tree (this lane's own report has the verbatim counts).

---

## Proposer pass for ledger-consume-run-007 (2026-09-05, lane ASSEMBLE-48)

**Artifacts read:** ledger-consume-run-001 through ledger-consume-run-007, in `started_at` order
(001 2026-09-04T18:09:20Z through 007 2026-09-05T20:13:44Z — see the run-002 pass below for
001/002's own account, re-read in full here rather than taken on faith). Every artifact's
`metrics`, `config`, `defects_found` (empty on all seven) and `proposer_notes` read directly from
the committed JSON, not summarized from memory.

**Full traces read:** `traces/ledger-consume-run-00{1,2,3,4,5,6,7}.result.json` — all seven, each
diffed against its neighbors' `outcomes` arrays (by `ledgerId`/`url`), not just their `metrics`
totals.

**What runs 003-007 show, beyond the run-002 pass below:**

1. **The stationary-loop defect (run-002 pass, finding 1) repeated twice more, unfixed, before
   landing.** [CONFIRMED, traces] `ledger-consume-run-003` and `-004` are byte-identical (same 50
   `ledgerId`s, same `next_cursor`, same `disposition` per row, verdicts_file both
   `ledger-verdicts-001.json`) — the chained `workflow_run` dispatch re-consumed the exact same
   50-row window a second time between 2026-09-04T23:45 and 2026-09-05T00:15. The same pattern
   repeats for `-005`/`-006` (both `ledger-verdicts-002.json`, byte-identical outcome sets, run at
   01:11 and 02:09). Three generations of the identical defect (001/002, 003/004, 005/006) is
   stronger evidence than the original pass had that the chain's fixed `after=null` parameter, not
   the ledger's contents or the verdict batch in play, decides the window every time — exactly the
   run-002 pass's own diagnosis, not yet acted on for two more sweep cycles.

2. **`ledger-consume-run-007` closes finding 2 (the fetch spent before the skip decision) with a
   direct measurement, not a proposal.** [CONFIRMED] Build item W1.4 (lane LEDGER-CHAIN-2, landed
   before this fold — `PENDING-RUN.md`'s own re-pin note 9) shipped `buildClassifyGate`, the
   pre-fetch verdict lookup this pass's predecessor proposed in item (b). Run-007's own metrics
   prove it: `candidates: 400, matched: 386, fetched: 0` — every one of the 386 verdict-covered
   rows classified with **zero** page fetches, where run-003 (47 fetches for 50 candidates) and
   every earlier run paid a full fetch per row regardless of verdict coverage. `verdict_batches_read:
   2` also confirms item (a)'s auto-discovery half: both `ledger-verdicts-001.json` (30) and
   `ledger-verdicts-002.json` (356) were read from one blank `--verdicts` argument, not hand-named.

3. **The stationary-loop half of the original defect (finding 1) is NOT yet re-proven closed by a
   second run.** [HYPOTHESIS] Run-007 was a single hand dispatch (`mode=plan limit=400`, blank
   `verdicts_file`) starting from `after=null` by the coordinator's own deliberate choice (to reach
   all 386 already-verdicted candidates in one pass), not the `workflow_run`-chained path. Nothing
   in this family's history yet shows a SECOND chained (or hand) dispatch starting from run-007's
   own `next_cursor`
   (`{"firstSeenAt":"2026-07-19T21:01:06.24063+00:00","id":"68b9b28a-…"}`) rather than restarting at
   `after=null` — the exact repeat pattern findings 1 and this pass's own item 1 both name. The
   pre-fetch gate (item 2 above) makes a repeat of the OLD window cheap now (zero fetches instead of
   47-50), so a stationary loop would no longer waste HTTP calls the way it did for 001-006 — but it
   would still waste the classify-batch read and, more importantly, would never advance past the
   first verdict-covered window into the 14 `skipped-no-verdict` rows (or the 57,069 candidates past
   row 400) that are the actual remaining work. This is not yet measured either way; the next
   chained dispatch's own artifact is the evidence that closes or reopens finding 1 for good.

**Proposal:**

(a) None warranted for `run-ledger-consume.mjs`/`portal-harvest.ts`/`first-fetch-classify.ts`
    themselves this pass — every code-level proposal the run-002 pass made (items (a) and (b)) is
    now landed and measured working in run-007 (finding 2 above), and `defects_found` is empty
    across all seven artifacts.

(b) **Open, for the next dispatch, not a code proposal:** confirm `.github/workflows/ledger-consume.yml`'s
    `workflow_run` branch actually threads run-007's `next_cursor` into its next firing's `after`
    (or its own export-side `resolveExportAfter` equivalent for consume) rather than defaulting to
    `after=null` again — this pass could not verify this from the artifacts alone (the workflow
    file itself would need reading against the live chain, out of this pass's read set) and flags
    it explicitly rather than assuming re-pin note 9's fix covers the chained trigger the same way
    it covers a hand dispatch.

(c) The 14 `skipped-no-verdict` rows in run-007's own window, and the 57,069 candidates past row
    400 (per `PENDING-RUN.md`'s own live count), are the next real classification work — a
    `ledger-verdicts-003.json` batch over an `--export-candidates --with-text` pull starting at
    run-007's `next_cursor`, per the standing procedure re-pin notes 6-9 already established. Not a
    defect; the ordinary next step.

**Family gates status:** green — `node --test fsi-app/scripts/turns/run-ledger-consume.test.mjs`
and `fsi-app/src/lib/intake/portal-harvest.npmtest.mjs` (this family's own family gates, per
LEDGER-CHAIN-2's own test additions) pass on this tree; no code change this pass, nothing to gate.

**Basis:** run-003/004 and run-005/006's byte-identical `outcomes` arrays are read directly from
the committed trace JSON, not inferred from `metrics` alone (per §1 step 3's non-negotiable full-
trace read); run-007's `fetched: 0` is the standing metric moving in the direction LEDGER-CHAIN-2
predicted, measured rather than asserted (rule per CLAUDE.md 14/B4).

---

## Proposer pass for ledger-consume-run-002

**Artifacts read:** ledger-consume-run-001 (plan, GitHub Actions run 33904298664, 2026-09-04T18:09:20Z,
`workflow_run` from Source sweep #14, verdicts_file null, limit 50) and ledger-consume-run-002 (plan,
run 33905837796, 2026-09-04T18:26:27Z, `workflow_run` from Source sweep #15, verdicts_file null,
limit 50). Both read in full, with their `traces/*.result.json`.

**Also read (not artifacts of this family):** the two `--export-candidates --with-text` runs
(33902755838 without text, 33908401816 with text, 400 rows; branches `ledger-consume/<run>`, their
candidate files live under the gitignored `scripts/_snapshots/` and are not folded into trains) and
`scripts/turns/ledger-verdicts/ledger-verdicts-001.json` (30 entries after the coordinator's pruning
on 2026-09-04, see that commit).

**What the two runs show:**

1. **Run-001 and run-002 are byte-for-byte the same unit of work.** [CONFIRMED] Same 50 `per_item`
   ids (50/50 overlap), same `next_cursor`
   (`{"firstSeenAt":"2026-07-19T17:49:15.238467+00:00","id":"e609850e-…"}`), same metrics
   (`discovered 50, fetched 50, classified 0, without_verdict_skipped 50, est_usd 0`). Cause, by
   reading `.github/workflows/ledger-consume.yml` "Resolve dispatch parameters": a `workflow_run`
   trigger always runs `mode=plan, limit 50, after = null`. The chained run therefore re-walks the
   oldest 50 ledger rows every time a sweep completes, fetches all 50 pages again (50 HTTP fetches at
   `fetch_gap_ms 1000`, ~50 s), and skips all 50 for want of a verdict. Two runs, 100 fetches, zero
   information gained. This is the defect this pass records.

2. **The fetch is spent before the skip decision.** [CONFIRMED, traces] Every outcome reads
   `disposition: skipped, reason: classify failed: skipped-no-verdict …` AFTER `fetched: 50`. In plan
   mode with no verdicts file and no `--allow-api`, the runtime cannot classify anything, so the page
   fetch buys nothing: the same rows are fetched again by `--export-candidates --with-text`, which is
   the path that actually produces the text a session lane classifies.

3. **Verdict coverage of the chained window.** [CONFIRMED] 29 of the 50 ids in the chained window
   carry a verdict in `ledger-verdicts-001.json` (all 30 surviving entries are `portal` verdicts over
   real text; the 308 pruned entries were rated from access-wall shells and are not verdicts — see the
   LEDGER-WALLS lane, `src/lib/sources/access-wall.mjs`). The next chained run will pick the batch
   up automatically (the yml's newest-batch rule) and classify 29 of the same 50 for $0; the remaining
   21 are federalregister.gov / EUR-Lex rows that need the API/HTML transports LEDGER-WALLS shipped
   (`api-transport.mjs`, the `/TXT/HTML/` rewrite) before their text exists to rate.

**Defect found:** the `workflow_run` plan is a stationary loop (finding 1) that also pays a fetch it
cannot use (finding 2). Neither is a runtime bug in `run-ledger-consume.mjs`; both are the chain's
parameter choice.

**Proposal (for the next ledger-consume lane, not applied here):**

(a) The chained (`workflow_run`) run should do the work that moves the ledger: `--export-candidates
    --with-text` for the next unclassified window, keyset `--after` the last export's `next_cursor`
    (persist the cursor in the family's own artifact so the chain resumes rather than restarts), and
    consume (plan) only the rows a committed verdicts batch covers. Rows without a verdict are not
    fetched at all by the consume step — the export step is the one fetch.

(b) `mode=plan` without `--verdicts` and without `--allow-api` should short-circuit before
    `buildFetchDoc` (the verdict lookup is by URL and needs no page text), recording
    `fetched: 0, skipped: N` honestly. One code path, one fetch per candidate per window, ever.

(c) The first real consume: `mode=plan verdicts_file=scripts/turns/ledger-verdicts/ledger-verdicts-001.json
    limit=50` by hand once train 44 lands (LEDGER-WALLS on master), then the batch-002 export through
    the new transports. Apply stays behind `POPULATION_PAUSED` until T46.

**Basis:** two identical artifacts are the strongest possible evidence that the chain's fixed
parameters, not the ledger's contents, decided both runs; the fetch-before-skip ordering is read
directly from the runtime's trace output.
