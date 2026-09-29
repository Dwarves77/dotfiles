# Last proposer pass, carrier-ets-proxy

Per `PROPOSER-RUNBOOK.md` section 2's attestation format. `carrier-ets-proxy` has three artifacts on this
branch (`-004`, `-005`, `-007`, all lane ETS-PROXY, 2026-09-28); F28's rule (d) requires this file to name
the latest verbatim: **carrier-ets-proxy-run-012**.

## Pass of 2026-09-28 (lane ETS-PROXY, first family + two refactor re-stamps)

**Artifacts read:** carrier-ets-proxy-run-004 (first real run, before a Maersk fixture-span bug fix),
carrier-ets-proxy-run-005 (after fixing the Maersk fixture's `span_text` to be a genuine verbatim
substring of its capture, this is the run the F45 duplicate-code extraction below is compared against),
carrier-ets-proxy-run-012 (after extracting the shared `rate-source-by-class.mjs` /
`r14-held-producer-cli.mjs` / `verbatim-grounding.mjs` modules into this family's own governing-file set).

**Metrics [CONFIRMED, read from carrier-ets-proxy-run-012.json]:** `candidates: 5, refused_ungrounded: 1
(Evergreen, paraphrased span), refused_unrated_source: 0, to_create: 4, to_update: 0,
skipped_no_reference_period: 0, proxy_bands_built: 1, authored: 1, skippedAlready: 3, insufficientHistory:
0, unitMismatch: 0, refused: 0, unknownMethod: 0, errored: 0`. `-005` and `-007` carry byte-identical
metrics [CONFIRMED, `diff`], the F45 extraction (this lane's own resolveSource/buildRunArtifact/main()
shell moved into shared modules) is a pure refactor, re-verified by re-running the same fixtures.

**Full traces read:** `-007`'s own `full_trace_refs` (the fixture module) and its `per_item` array (5
entries: 4 `candidate_built`, 1 `refused_ungrounded`).

**Proxy band [CONFIRMED]:** the 2026-10-01 period's 4-carrier band is low=140/point=202.5/high=230, real
observed min/median/max across Maersk (210), MSC (195), CMA CGM (230), Hapag-Lloyd (140), never a fake
band, matching decision 1/2's "never blended without a range."

**Hypotheses (considered; none warranted beyond this lane's own session log):** the open question this
family exists to answer, can carbon-cost-per-feu.mjs's GAP.NO_CARBON_PRICE close from this producer's
output, is answered YES by a dedicated integration test
(`scripts/producers/market/carrier-ets-surcharge-producer.test.mjs`, "integration: the ETS-proxy band
feeds carbon-cost-per-feu's carbonPrice input"), not by this harness artifact alone (the artifact proves
the producer's own plan/downstream-DAG seam; the carbon-cost integration is a separate consumer this
family does not itself write to). The next genuine proposer pass belongs after R14 lifts and a real
carrier-notice fetch/apply path is authored and reviewed, no hypothesis is warranted from fixture runs
alone about live carrier pricing.

**Re-stamp note (same pass):** run-008 is a further re-stamp, identical metrics to run-007, after fixing house-style dash glyphs (rule 022) introduced in this lane's own prose comments; not a new finding.

**Re-stamp note (same pass):** run-012 is a further re-stamp, identical metrics, after the coordinator-directed makeResolveSource factory follow-up (F45 to 0); not a new finding.
