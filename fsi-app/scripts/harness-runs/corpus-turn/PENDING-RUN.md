# Pending run — corpus-turn

F28's staleness-coupling rule (rule (c), `.discipline/fitness/functions/F28-harness-run-integrity.mjs`)
only fires for a family that already has ≥1 valid artifact (see `auditStalenessCoupling`'s own guard
clause — a family with zero valid artifacts is entirely rule (b)'s to report, not rule (c)'s). This marker
is the FIRST-RUN ACKNOWLEDGMENT rule (b) itself now accepts (2026-09-01, source-sweep registration): a
zero-artifact family whose `PENDING-RUN.md` pins the CURRENT governing hash is registered-and-pending, not
historyless — see F28's own header. It is written in the exact format `parsePendingRunHash` reads
(`harness_version at write time: `sha256:...``), the same shape `ledger-consume/PENDING-RUN.md` established
(copied here per this lane's own brief: "read how ledger-consume was registered ... and copy that shape").

**What this acknowledges:** `scripts/turns/consume-turn-requests.mjs` and `scripts/turns/
export-corpus-for-extraction.mjs` (this family's governing files, lane TURNREQ, 2026-09-04 — see
CONVENTION.md's `corpus-turn` entry) were registered (`ALLOWED_FAMILIES`, `GOVERNING_FILES`,
`CONVENTION.md`'s prose, and `.github/workflows/corpus-turn.yml`'s own artifact-emission step, added this
same lane) closing the 2026-09-04 wiring audit's finding: "`corpus_turn_requests` (migration 277) is filled
by a trigger and has 1,709 open / 0 consumed rows; `scripts/turns/consume-turn-requests.mjs` is its only
reader and has no caller" (B1 Gap #2), and "the `corpus-turn` harness family has zero run artifacts...not
registered in `scripts/harness-runs/governing-files.mjs` either" (B2 §1). This lane's environment has
**no Supabase credentials** (`.env.local` does not exist here) and **cannot dispatch a GitHub Actions
workflow** — the same ADR-023-class gap `source-sweep/PENDING-RUN.md` and `ledger-consume/PENDING-RUN.md`
each recorded for their own families at registration. No corpus turn could be executed here to produce a
genuine first artifact, and a placeholder one was deliberately not fabricated.

What WAS verified in this environment, and is not itself the pending run: `node --test` over
`consume-turn-requests.test.mjs` and `export-corpus-for-extraction.test.mjs` (the family's own pure
selection/export logic — bounds, ordering, `--ids` scoping, the `--mark-file` retire-exactly-this-snapshot
path) all green; `.discipline/fitness/runner.mjs` green with this family registered; the corpus-turn.yml
workflow YAML itself could not be executed here (no `act`/Actions runner in this sandbox), so its
end-to-end shape is reviewed, not run-tested, in this environment.

**harness_version at write time:** `sha256:8f05f6ea139d6d42`

**The planned run that supersedes this marker:** the first `corpus-turn-run-001.json`, self-emitted by
`.github/workflows/corpus-turn.yml`'s own "Record this turn's own harness-run artifact" step (added this
lane — every corpus-turn dispatch, dry or apply, writes one; "emission is CODE," the same posture
`run-mint-batch.mjs`/`run-extraction.mjs`/`screen-worklist.mjs` already hold for their own families) —
dispatched via `workflow_dispatch` with `mode: dry`, a `limit` (default 200 — see
`docs/runbooks/CORPUS-TURN-RUNBOOK.md`'s "First dispatch" section for the arithmetic), and `since` left
blank (ticket-queue selection, the default as of this lane). Per F28's reverse-audit (an artifact matching
this marker's recorded hash means "the planned run happened — delete the marker"), this file is deleted
the moment that first artifact lands and its `harness_version` matches the value above (or updated to a
new hash, per rule (c), if either governing file changes again before that first run lands).

**A residual named honestly, NOT resolved by this marker or this lane (write-set boundary):**
`scripts/turns/run-population-flywheel.mjs` (lane TANDEM's population-turn flywheel driver, outside this
lane's write set) still calls `writeLastTurnDate` from `scripts/turns/last-turn-date.mjs` after a
successful apply, for a purpose ("so a later corpus-turn dispatch's blank --since does not re-cover") that
no longer exists now that `corpus-turn.yml`'s default selection reads `corpus_turn_requests` instead of
that marker. That write is now a write with no reader (grep-confirmed — see `last-turn-date.mjs`'s own
header). Left for the coordinator: retiring that call, or giving the marker a new purpose, is a change to
a different lane's file.
