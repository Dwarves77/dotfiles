# ledger-consume family

Moved from `CONVENTION.md` (lane N2, 2026-09-19); meaning unchanged from the original prose, em dashes
and section signs replaced per pre-commit rule 022.

`ledger-consume` (Lane CONSUME, system-completion plan, 2026-09-02), registered over
`scripts/turns/run-ledger-consume.mjs` and the two library modules it gives a production runtime to for
the first time: `src/lib/intake/portal-harvest.ts`'s `consumePortalCandidates` (the READER half of the
portal-deep-link slice, `persistPortalCandidates`, the WRITER half of the same file, already had a
runtime via the scheduled check-sources crawl and, separately, `source-sweep` above) and
`src/lib/llm/first-fetch-classify.ts` (the Haiku content-gate classifier it calls, included because it is
this family's only spend-bearing call, routed through the spend chokepoint's `spendMessage`, see
`spend-client.ts`, which is what leaves the `agent_runs` row per call now, not this family's driver): a
seventh shape, whose "runs" CONSUME candidate rows the `portal_link_candidates` ledger already holds
(never discover new ones, that is `source-sweep`'s job), classify each through the live entity gate, and
precompute a chokepoint disposition per candidate (`would_mint`/`would_reject` in plan mode, READ-ONLY
but NOT free, since classify still spends; `promoted`/`rejected` in apply mode, which stays structurally
disarmed by a source constant, see that file's header, until an operator reviews and flips it).

**ledger-consume's standing metric**: *disposition mix per run*, of the candidates a run consumed
(`discovered`), how many were `fetched`, how many reached `classified`, and of those how many resolved to
a promoted-like disposition (`would_mint`/`promoted`/`exists`) versus a rejected-like one
(`would_reject`/`rejected`/`not_an_item`) versus `skipped` (an inconclusive fetch or classify, never
counted as a rejection; see `portal-harvest.ts`'s own `fetchOk` discipline), the consume-family
counterpart to `source-sweep`'s candidates-discovered-per-walk. Paired with `est_usd_total` (every
classify call's real cost, and `input_tokens_total`/`output_tokens_total`, every call's real token
counts, read back from `FirstFetchClassifyResult`, which the spend chokepoint populates per call; the
`agent_runs` row itself is written once, by `spendMessage`/`recordSpendCall` in `spend-client.ts`, not by
this driver, see `run-ledger-consume.mjs`'s header), so a proposer reading this family's history sees
yield and spend together, never one without the other.
