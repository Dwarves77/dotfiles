# Last proposer pass — ledger-consume

Per `PROPOSER-RUNBOOK.md` §2's attestation format. `ledger-consume` now has **seven** artifacts
(`ledger-consume-run-001` through `-007`, the last five folded onto `train/wave48-2026-09-05` by
lane ASSEMBLE-48); F28's rule (d) requires this file to name the latest verbatim:
**ledger-consume-run-007**.

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
