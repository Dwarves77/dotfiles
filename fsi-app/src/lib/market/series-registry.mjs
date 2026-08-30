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
    implemented: false,
    cadence: "daily (ECB publishes ~16:00 CET on TARGET business days)",
    cadenceDays: null, // not decided — no producer in this lane
    sourceKey: null,
    sourceName: "European Central Bank — euro foreign exchange reference rates",
    sourceUrl: "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
    licenceStatus: "not evaluated — no producer in this lane",
    derivation: "observed",
    originClass: "official",
    producerScript: null,
    parserModule: null,
    notes:
      "Daily EUR reference rates against major currencies (USD, GBP, CNY, JPY, …). STUB ONLY: not built " +
      "in this lane. A future producer keys series under ecb-fx:* (e.g. ecb-fx:eur-usd), reference_period " +
      "= the rate date.",
  },
  {
    keyPrefix: "eia-v2",
    name: "US EIA v2 API (fuel/energy price series)",
    implemented: false,
    cadence: "varies by series — weekly for most petroleum products, per EIA's own release calendar",
    cadenceDays: null, // varies by series — not decided, no producer in this lane
    sourceKey: "eia", // NOTE: 'eia' IS already a registered data_sources row (US public domain, 17 USC 105)
                       // — unlike the other three stubs, a future producer here would NOT be FK-blocked.
    sourceName: "US Energy Information Administration — API v2",
    sourceUrl: "https://www.eia.gov/opendata/",
    licenceStatus: "registered (public.data_sources 'eia', permitted, US public domain) — no producer yet",
    derivation: "observed",
    originClass: "official",
    producerScript: null,
    parserModule: null,
    notes:
      "The likely eventual feed for the existing published_price_statistics WTI/Henry Hub/Jet Fuel rows " +
      "(see docs/plans/master-execution-plan-2026-08-17.md Appendix A — those 4 rows are hand-maintained " +
      "today, not EIA-fed). STUB ONLY: not built in this lane. A future producer keys series under " +
      "eia-v2:* mirroring EIA's own series ids (e.g. eia-v2:petroleum.wti-cushing).",
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
