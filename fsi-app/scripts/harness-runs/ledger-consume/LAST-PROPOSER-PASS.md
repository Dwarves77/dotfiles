# Last proposer pass — ledger-consume

Per `PROPOSER-RUNBOOK.md` §2's attestation format. `ledger-consume` now has **two** artifacts
(`ledger-consume-run-001`, `ledger-consume-run-002`); F28's rule (d) requires this file to name the
latest verbatim: **ledger-consume-run-002**.

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
