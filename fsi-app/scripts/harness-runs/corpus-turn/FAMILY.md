# corpus-turn family

Moved from `CONVENTION.md` (lane N2, 2026-09-19); meaning unchanged from the original prose, em dashes
and section signs replaced per pre-commit rule 022.

`corpus-turn` (lane TURNREQ, 2026-09-04, closing the 2026-09-04 wiring audit's B1 Gap #2 / B2 section 1:
"the corpus-turn harness family has zero run artifacts... not registered in
`scripts/harness-runs/governing-files.mjs` either"), registered over the two scripts this lane gave
corpus-turn's own real selection/export logic for the first time, `scripts/turns/consume-turn-requests.mjs`
(bounded, oldest-first selection over the `corpus_turn_requests` ticket queue migration 277's trigger
fills; ONE "what changed" mechanism now, replacing the `last-turn-date.mjs` marker
`.github/workflows/corpus-turn.yml` used to compute a default `--since` from) and
`scripts/turns/export-corpus-for-extraction.mjs` (extended this lane with `--ids` so the corpus file
`run-extraction.mjs` consumes is built from exactly that selection): an eighth shape, whose "runs" are one
`.github/workflows/corpus-turn.yml` dispatch, select tickets, discover connections, extract + apply
forward events, recluster the whole corpus, and (on apply) retire exactly the tickets processed, through
the guarded path, only after every one of those writes succeeded, never a mint, a screen round, an
enumeration walk, nor a drain of the propagation outbox. Unlike every other family with a canonical
`run-*.mjs` entry point, corpus-turn's orchestrator is the GitHub Actions workflow itself
(`.github/workflows/corpus-turn.yml` chains scripts already governed by OTHER families,
`discover-for-items.mjs`, and `forward-events`'s own `run-extraction.mjs`, alongside the two files this
family's own `family.json` lists). See CORPUS-TURN-RUNBOOK.md for the full turn shape and
`scripts/harness-runs/corpus-turn/PENDING-RUN.md` for why this family starts at zero artifacts (no live
dispatch was possible from the authoring environment, the same posture `ledger-consume`'s own
`PENDING-RUN.md` recorded at its own registration, copied here).

**corpus-turn's standing metric** (build plan section 2's "measurement, not assertion," per family):
*tickets consumed per dispatch*, of the open `corpus_turn_requests` tickets a run selected
(`metrics.tickets_selected`, bounded by `--limit`), how many were successfully turned AND retired
(`metrics.consumed`, apply mode only, a dry run always reports `false`, honestly, since it marks
nothing), plus *forward events extracted this turn* (`metrics.forward_events_extracted`, read back from
the SAME turn's own `forward-events` family artifact this dispatch produced, never a fresh count), the
corpus-turn-family counterpart to `ledger-consume`'s disposition-mix-per-run: a proposer pass reading this
family's history sees backlog drawdown (1,709 open at registration, 2026-09-04) alongside what each turn
actually connected, never one without the other.
