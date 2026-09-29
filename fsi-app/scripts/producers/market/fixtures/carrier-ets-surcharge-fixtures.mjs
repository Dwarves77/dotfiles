// carrier-ets-surcharge-fixtures.mjs, fixture candidates + captures for the ETS-proxy producer's own
// tests AND for the --fixtures CLI dry run (R14 hold: no live carrier fetch, no live DB read/write).
//
// Deliberately spans FOUR different carriers and TWO trade lanes (CLAUDE.md rule 19,
// examples-are-not-scope): the producer must generalise across carriers, not anchor to one. Nothing here
// is a claim about a real carrier's live tariff, these are TEST fixtures shaped like a real ETS/FuelEU
// surcharge notice, not scraped content.

export const FIXTURE_CANDIDATES = [
  {
    carrierName: "Maersk",
    tradeLane: "Asia-North Europe",
    currency: "USD",
    value: "210",
    unit: "USD/FEU",
    effectivePeriod: "2026-10-01",
    surchargeType: "EU ETS",
    sourceUrl: "https://www.maersk.com/news/articles/ets-surcharge-notice-2026-10",
    span_text: "the EU ETS surcharge on Asia-North Europe services is USD 210 per FEU",
  },
  {
    carrierName: "MSC",
    tradeLane: "Asia-North Europe",
    currency: "USD",
    value: "195",
    unit: "USD/FEU",
    effectivePeriod: "2026-10-01",
    surchargeType: "EU ETS",
    sourceUrl: "https://www.msc.com/en/newsroom/ets-surcharge-oct-2026",
    span_text: "MSC will apply an EU ETS surcharge of USD 195 per FEU on Asia-North Europe trades from 1 October 2026",
  },
  {
    carrierName: "CMA CGM",
    tradeLane: "Asia-North Europe",
    currency: "USD",
    value: "230",
    unit: "USD/FEU",
    effectivePeriod: "2026-10-01",
    surchargeType: "EU ETS",
    sourceUrl: "https://www.cma-cgm.com/news/ets-surcharge-2026-10",
    span_text: "CMA CGM's EU ETS surcharge for Asia-North Europe is USD 230 per FEU as of 1 October 2026",
  },
  {
    // A different trade lane, proves the producer keys series by lane, not just by carrier.
    carrierName: "Hapag-Lloyd",
    tradeLane: "Transpacific",
    currency: "USD",
    value: "140",
    unit: "USD/FEU",
    effectivePeriod: "2026-10-01",
    surchargeType: "EU ETS",
    sourceUrl: "https://www.hapag-lloyd.com/en/press-and-media/ets-surcharge-transpacific-2026-10",
    span_text: "the ETS-related surcharge on Transpacific services is USD 140 per FEU, effective October 2026",
  },
  {
    // UNGROUNDED: span_text paraphrases rather than quoting its own capture, proves the refusal path.
    carrierName: "Evergreen",
    tradeLane: "Asia-North Europe",
    currency: "USD",
    value: "205",
    unit: "USD/FEU",
    effectivePeriod: "2026-10-01",
    surchargeType: "EU ETS",
    sourceUrl: "https://www.evergreen-line.com/news/ets-surcharge-2026-10",
    span_text: "Evergreen's carbon surcharge went up to about two hundred dollars",
  },
];

export const CAPTURES = {
  "https://www.maersk.com/news/articles/ets-surcharge-notice-2026-10":
    "Effective 1 October 2026, the EU ETS surcharge on Asia-North Europe services is USD 210 per FEU, " +
    "applied to all Maersk-operated vessels calling EU/EEA ports under the maritime phase-in.",
  "https://www.msc.com/en/newsroom/ets-surcharge-oct-2026":
    "MSC will apply an EU ETS surcharge of USD 195 per FEU on Asia-North Europe trades from 1 October 2026, " +
    "in line with the EU Emissions Trading System's maritime scope expansion.",
  "https://www.cma-cgm.com/news/ets-surcharge-2026-10":
    "CMA CGM's EU ETS surcharge for Asia-North Europe is USD 230 per FEU as of 1 October 2026.",
  "https://www.hapag-lloyd.com/en/press-and-media/ets-surcharge-transpacific-2026-10":
    "For Transpacific services, the ETS-related surcharge on Transpacific services is USD 140 per FEU, " +
    "effective October 2026, reflecting EU-bound leg exposure on select rotations.",
  // Evergreen's capture is real text, but deliberately does NOT contain its candidate's claimed span
  // verbatim, exercising the ungrounded-refusal path.
  "https://www.evergreen-line.com/news/ets-surcharge-2026-10":
    "Evergreen Line has updated its bunker and emissions-related surcharges for Q4 2026 sailings.",
};

export function fixtureFetchCapture(url) {
  const text = CAPTURES[url];
  if (!text) return Promise.resolve(null);
  return Promise.resolve({ text, retrieved_at: "2026-09-28T00:00:00Z" });
}
