# inaccessible-triage family

Moved from `CONVENTION.md` (lane N2, 2026-09-19); meaning unchanged from the original prose, em dashes
and section signs replaced per pre-commit rule 022.

`inaccessible-triage` (registered by lane M8, 2026-09-18, closing the 2026-09-18 stage audit's S1
finding that the acquisition-ladder run over `sources WHERE status='suspended'`
(`scripts/sources/inaccessible-triage.mjs`) left no committed artifact, only an ephemeral GitHub Actions
upload of its per-source dossiers): an eleventh shape, whose "runs" are a triage pass over the suspended
pool, re-probe the declared primary, a bounded $0/no-LLM alternative search, same-floor qualification
against the source's own `base_tier`, never a mint, a screen round, an enumeration walk, a ledger
consume, a change-detection chain, a propagation drain, a corpus turn, nor a brief apply. Per
this family's own registration-order convention (never a family folded into an existing one just because
it seemed similar), this is NOT filed under `source-sweep`: it discovers no candidate URLs, writes nothing
to `portal_link_candidates`, and does not walk a register/feed/sitemap, its only DB mutation is
`sources.fetch_status`/`fetch_status_at` (migration 147) on the SAME suspended rows it read, the
opposite direction of every source-sweep walker's own write.

**inaccessible-triage's standing metric** (build plan S2's "measurement, not assertion," per family):
*ladder outcome mix per run*, of the suspended sources a run triaged, how many `recovered` (the
declared primary is reachable again), how many found an `alternative_found` (a bounded alternative that
clears the source's own authority floor), and how many stayed `still_inaccessible` (the honest terminal,
never a silent write-off; every triaged source gets a dossier regardless of outcome), plus
`skipped_time_budget`/`errored`, so a proposer reading this family's history sees how much of the
suspended pool the ladder actually reached versus how much a bounded dispatch had to leave for the next
one, the acquisition-ladder counterpart to `source-sweep`'s candidates-discovered-per-walk.
