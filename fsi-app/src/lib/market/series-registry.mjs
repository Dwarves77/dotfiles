// The market_series producer registry (WO-16 step 1 + step 5). ONE list naming every series this
// product intends to carry, its source and its cadence — whether or not a parser exists yet.
//
// WHY A REGISTRY, NOT FOUR SEPARATE "TODO: build me" COMMENTS. The master plan (docs/plans/
// master-execution-plan-2026-08-17.md, WO-16 step 1) names four series up front — EU Weekly Oil
// Bulletin, EEX EUA auctions, ECB FX, EIA v2 — and says "one producer per PR". A reader landing on this
// file should be able to see the whole intended surface in one place, not reconstruct it from which
// scripts/producers/market/*.mjs files happen to exist yet. `implemented: true` on an entry means a
// producer script exists and is wired to write series under that entry's key prefix; `implemented:
// false` is a documented stub — series_key + source + cadence, decision-ready for a future lane, never
// silently omitted (the WO-16 executor brief: "Stub the other three producers ONLY as a documented
// registry entry … do NOT build EEX/ECB/EIA parsers in this lane").
//
// keyPrefix is the series_key namespace a producer owns (market_series.series_key format CHECK:
// lower-case, colon/underscore/hyphen-separated). A producer never writes a series_key outside its own
// prefix — mirrors write-edges.mjs's origin-ownership discipline, at the namespace level instead of the
// per-row level, because (unlike item_cross_references) no two producers here ever compete for the same
// key: each series_key belongs to exactly one source by construction.
//
// PLAIN ESM, ZERO DEPENDENCIES. Importable by node --test with no npm deps, same constraint as every
// module under src/lib/contracts/.
//
// NOT A FIFTH ENTRY: refresh-published-price-statistics.mjs (WO-16 step 4, scripts/producers/market/
// refresh-published-price-statistics.mjs + src/lib/market/refresh-published-price-statistics.mjs) is a
// DERIVED, downstream step, not a market_series producer, and does not belong in MARKET_SERIES_PRODUCERS
// above. Checked before adding an entry here (Lane PROD, system-completion train, 2026-09-02): every
// consumer of this registry (series-board-view-model.mjs's buildSeriesBoard, and its own tests in
// src/__tests__/market-series-board-view-model.test.mjs) treats each entry as a market_series.series_key
// NAMESPACE OWNER — one keyPrefix, one group of series rows it and only it writes. The refresher does the
// opposite: it READS market_series (across whichever series an operator-ratified SERIES_ITEM_MAP names,
// today EMPTY) and WRITES published_price_statistics, a different table with a different shape entirely
// (WO-16.2 ruling, held in docs/plans/connection-redesign-and-build-scope-2026-08-29.md §4). It owns no
// series_key prefix and could not satisfy this registry's own field contract (sourceKey, cadence, a
// producerScript that "writes series under that entry's key prefix") without fabricating one. Adding it
// as a registry entry would misrepresent it to every reader of buildSeriesBoard as a sixth market_series
// namespace with zero rows, when it is not a market_series writer at all. See that script's own header
// for its actual shape and gate (an empty SERIES_ITEM_MAP, not ENABLED/kill-switch, is what stops it from
// writing today).

export const MARKET_SERIES_PRODUCERS = Object.freeze([
  {
    keyPrefix: "eu-oil-bulletin",
    name: "EU Weekly Oil Bulletin",
    implemented: true,
    cadence: "weekly (published Mondays for the prior week's national surveys)",
    cadenceDays: 7, // structured form of the cadence above, for the refresher's next-release estimate
    sourceKey: "ec_weekly_oil_bulletin",
    sourceName: "European Commission, DG ENER — Weekly Oil Bulletin",
    sourceUrl: "https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en",
    // REGISTERED 2026-08-30: source-licence.mjs gained the ec_weekly_oil_bulletin entry (CC BY 4.0,
    // Decision 2011/833/EU) and migration 258's data_source_seed was regenerated and applied — confirmed
    // live in public.data_sources this session. The FK no longer blocks a write.
    licenceStatus: "registered (public.data_sources 'ec_weekly_oil_bulletin', CC BY 4.0, Decision 2011/833/EU)",
    derivation: "observed",
    originClass: "official",
    producerScript: "scripts/producers/market/eu-weekly-oil-bulletin.mjs",
    parserModule: "src/lib/market/parsers/eu-weekly-oil-bulletin.mjs",
    notes:
      "EU-27/EU-wide average pre-tax prices for automotive fuels and heating/industrial oil products, " +
      "reported weekly by member-state administrations and compiled by the European Commission. The " +
      "product set this lane's parser recognises is documented in the parser module's own header.",
  },
  {
    keyPrefix: "eex-eua",
    name: "EEX EUA primary auctions",
    implemented: false,
    cadence: "primary auctions run most trading days (EU ETS calendar); results published same day",
    cadenceDays: null, // not decided — no producer in this lane
    sourceKey: null, // not yet registered — no producer, no licence check performed
    sourceName: "European Energy Exchange (EEX) — EU ETS primary auction results",
    sourceUrl: "https://www.eex.com/en/market-data/environmental-markets/auction-market/emission-spot-primary-market-auction",
    licenceStatus: "not evaluated — no producer in this lane",
    derivation: "observed",
    originClass: "official",
    producerScript: null,
    parserModule: null,
    notes:
      "EU Allowance (EUA) auction clearing price, per EU ETS Auctioning Regulation. STUB ONLY (WO-16 " +
      "step 5): not built in this lane. A future producer keys series under eex-eua:* (e.g. " +
      "eex-eua:eua-primary), reference_period = the auction date.",
  },
  {
    keyPrefix: "ecb-fx",
    name: "ECB euro foreign exchange reference rates",
    implemented: true,
    cadence: "daily (ECB publishes ~16:00 CET on TARGET business days)",
    cadenceDays: 1,
    // REGISTERED 2026-09-02 (Lane PROD, system-completion train, docs/plans/
    // system-completion-plan-2026-09-02.md §2 "Lane PROD"): supabase/migrations/281_data_sources_ecb.sql
    // inserts the 'ecb' row (redistribution='permitted', embeddable=true, verified_on NULL — see that
    // migration's own header for the [UNCONFIRMED] licence caveat and why it is a hand-written INSERT
    // rather than the sanctioned source-licence.mjs regenerated-block flow other entries here went
    // through). Once 281 is APPLIED to the live database this gate resolves; the producer's own two
    // runtime safety gates are independent of it (see producerScript's own header).
    sourceKey: "ecb",
    sourceName: "European Central Bank — euro foreign exchange reference rates",
    sourceUrl: "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
    // LICENCE BASIS: the ECB's standing published notice, "reproduction is permitted provided the source
    // is acknowledged" (https://www.ecb.europa.eu/home/disclaimer/html/index.en.html — the ECB's
    // legal/copyright notice). [UNCONFIRMED THIS SESSION, lane PROD, 2026-09-02] — sandbox egress to
    // every ecb.europa.eu host (www / data-api / sdw-wsrest) returned a 403 policy denial from the
    // agent-proxy this session; this citation is stated from the publisher's well-documented standing
    // notice, not from a fetch performed this session. Migration 281 registers the row on that basis
    // anyway (verified_on left NULL, blocker text carries the same caveat) — verify live (a GitHub
    // runner or browser fetch) and, if confirmed, a follow-up sets verified_on and adds the matching
    // entry to source-licence.mjs (see migration 281's own header for the SOURCE_LICENCES/data_sources
    // divergence this leaves open).
    licenceStatus:
      "registered by migration 281 (public.data_sources 'ecb' row, redistribution='permitted') — licence " +
      "text [UNCONFIRMED until a runner dry run reads the ECB notice], see note above",
    derivation: "observed",
    originClass: "official",
    producerScript: "scripts/producers/market/ecb-fx-producer.mjs",
    // No separate parser module: this lane's write set named exactly one new producer script, so
    // parseEcbFxXml lives inline in the producer file (fetch + parse + plan staged as separate functions
    // within it) rather than under src/lib/market/parsers/. Documented here so a reader does not go
    // looking for a file that was never in scope to create.
    parserModule: "scripts/producers/market/ecb-fx-producer.mjs",
    notes:
      "Daily EUR reference rates against the registry's own tracked set (USD, GBP, CNY, JPY) from the " +
      "ECB's eurofxref-daily.xml. UPDATED 2026-09-02 (Lane PROD): ENABLED flipped true in the producer " +
      "file (a reviewed-code-change, see its own header's REVIEWED-CHANGE LOG) and 'ecb' registered by " +
      "migration 281 — a write today is still blocked by the runtime kill switch alone: the " +
      "MARKET_PRODUCER_ECB_FX_ENABLED env switch defaults off in every environment until an operator " +
      "sets it for a specific dispatched --apply run (ADR-023 §4 gate 2, the fast-arm/fast-disarm split), " +
      "and migration 281 must actually be applied to the live database before the FK resolves. Series " +
      "keyed ecb-fx:eur-<ccy> (e.g. ecb-fx:eur-usd), reference_period = the rate date. EEX EUA and EIA " +
      "v2 remain undocumented/partially-documented stubs at different stages: EEX's auction data still " +
      "carries no open-reuse licence found (a licensed venue, not a free-and-clear source, and no " +
      "producer exists); EIA v2 has a BUILT producer (eia-v2-petroleum-spot-producer.mjs, see that " +
      "entry below) whose remaining gap is a GitHub Actions EIA_API_KEY secret an operator must " +
      "register, not a licence question — 'free' and 'keyless' were always different questions, and EIA " +
      "was always registered/free; the missing piece was the key and the workflow step, not the source.",
  },
  {
    keyPrefix: "eia-v2",
    name: "US EIA v2 API (fuel/energy price series)",
    // implemented: true SINCE 2026-09-01 (lane SURF): scripts/producers/market/
    // eia-v2-petroleum-spot-producer.mjs was built, fixture-tested (src/__tests__/
    // market-eia-v2-petroleum-spot-parser.test.mjs), against the SAME api_endpoint already on file for
    // the live "US EIA Petroleum Spot Prices" source (public.sources id
    // 6901afb7-32eb-4d94-afe7-ebb2e2f624eb — see the producer's own header). This registry entry itself
    // was left implemented:false when that producer shipped, which was stale (docs/plans/
    // system-completion-plan-2026-09-02.md §0 row 4 named this drift live: "series-registry.mjs says
    // eia-v2 implemented:false (stale)"). Corrected 2026-09-02 by Lane PROD (system-completion train) —
    // a mechanical registry-parity fix, no producer code changed.
    implemented: true,
    cadence: "varies by series — weekly for most petroleum products, per EIA's own release calendar",
    cadenceDays: 7, // weekly is the dominant cadence across the six products this producer's PRODUCTS
                     // vocabulary tracks (WTI, Brent, diesel, jet fuel, RBOB, propane) — see the
                     // producer's own header; not decided per-series (EIA's release calendar varies by
                     // exact series), but this is the honest single number for the refresher's estimate.
    sourceKey: "eia", // 'eia' IS a registered data_sources row (US public domain, 17 USC 105) — this
                       // producer's --apply is NOT FK-blocked (unlike ecb-fx before migration 281).
    sourceName: "US Energy Information Administration — API v2",
    sourceUrl: "https://www.eia.gov/opendata/",
    licenceStatus:
      "registered (public.data_sources 'eia', permitted, US public domain) — producer built and " +
      "fixture-tested; no workflow step exists yet because EIA_API_KEY is registered only as a " +
      "local-.env credential (.discipline/governance/secrets-registry.mjs TOPOLOGY), not a GitHub " +
      "Actions secret, and this repo's secrets-reference-audit fails the build on any workflow secret " +
      "reference not in WORKFLOW_SECRETS — see .github/workflows/producers.yml's own comment on the " +
      "'eia-v2-petroleum-spot' dispatch choice for the exact blocking check and what an operator must do.",
    derivation: "observed",
    originClass: "official",
    producerScript: "scripts/producers/market/eia-v2-petroleum-spot-producer.mjs",
    // No separate parser module, same posture as ecb-fx: fetch + parse are staged as functions inside
    // the one producer file rather than a second file under src/lib/market/parsers/.
    parserModule: "scripts/producers/market/eia-v2-petroleum-spot-producer.mjs",
    notes:
      "The likely eventual feed for the existing published_price_statistics WTI/Henry Hub/Jet Fuel rows " +
      "(see docs/plans/master-execution-plan-2026-08-17.md Appendix A — those 4 rows are hand-maintained " +
      "today, not EIA-fed). WTI, Brent, ultra-low-sulfur No.2 diesel, kerosene-type jet fuel, RBOB " +
      "regular gasoline and Mont Belvieu propane spot prices, keyed eia-v2:<product-slug>-<series-id> " +
      "mirroring EIA's own series ids (e.g. eia-v2:wti-crude-rwtc). Kill-switched OFF by default, same " +
      "three-gate shape as ecb-fx: the producer's own source-level ENABLED const is false (a " +
      "reviewed-code-change gate) AND the runtime MARKET_PRODUCER_EIA_V2_ENABLED env switch defaults " +
      "off AND (independently) no GitHub Actions workflow step exists to run it at all — see " +
      "licenceStatus above for exactly what blocks wiring that step.",
  },
]);

/** Look up a registry entry by its keyPrefix. Returns undefined if unknown. */
export function producerFor(keyPrefix) {
  return MARKET_SERIES_PRODUCERS.find((p) => p.keyPrefix === keyPrefix);
}

/** True iff `seriesKey` (the full "prefix:rest" key) belongs to a registered, implemented producer. */
export function isImplementedSeriesKey(seriesKey) {
  const prefix = String(seriesKey || "").split(":")[0];
  const entry = producerFor(prefix);
  return Boolean(entry && entry.implemented);
}

/** The producers actually wired to write today (implemented: true). */
export function implementedProducers() {
  return MARKET_SERIES_PRODUCERS.filter((p) => p.implemented);
}
