// state-cost-facts-fixtures.mjs, fixture candidates + captures for the state-cost-facts producer's own
// tests AND for a future --fixtures CLI run. Deliberately spans TWO different states, TWO different
// dimensions, and TWO different institution classes (a state government host and an unclassified host),
// per CLAUDE.md rule 19 (examples-are-not-scope): the producer must generalise, not anchor to one state
// or one cost type. Nothing here is invented data for a real jurisdiction beyond what is needed to
// exercise the producer's own logic, these are TEST fixtures, not a claim about live California/New
// York law.

// Fixture stand-in for the live `regions` table (id + code only, the two columns this producer's
// region-resolution step reads). Not a live read, the CLI's --fixtures/dry path never touches the DB.
export const FIXTURE_REGIONS = [{ id: "region-us-fixture-id", code: "US" }];

export const CAPTURES = {
  "https://www.dir.ca.gov/dlse/faq_minimumwage.htm":
    "California's minimum wage is $16.00 per hour for all employers, effective January 1, 2026, per " +
    "Labor Code Section 1182.12.",
  "https://www.tceq.texas.gov/permitting/air/testing (fixture)":
    "Texas industrial electricity rates averaged 8.4 cents per kWh in the most recent reporting period.",
  "https://up.codes/wa-energy-notes":
    "Washington industrial electricity averaged 6.9 cents per kWh in the most recent reporting period.",
  // No capture registered for the New York candidate's OWN claimed span, it reuses the CA capture
  // deliberately, so grounding is exercised against text that is real but does not contain the NY span.
};

export const FIXTURE_CANDIDATES = [
  {
    state_code: "US-CA",
    state_label: "California",
    region_code: "US",
    dimension: "labor_markets",
    fact_label: "State minimum wage",
    value: "16.00",
    unit: "USD/hour",
    trend: "up",
    effective_date: "2026-01-01",
    statute_citation: "Cal. Labor Code section  1182.12",
    source_url: "https://www.dir.ca.gov/dlse/faq_minimumwage.htm",
    source_name: "California Department of Industrial Relations",
    span_text: "California's minimum wage is $16.00 per hour for all employers, effective January 1, 2026",
  },
  {
    // A DIFFERENT dimension (operational_cost, not labor_markets) and a DIFFERENT state, proves the
    // producer is not anchored to one dimension either.
    state_code: "US-TX",
    state_label: "Texas",
    region_code: "US",
    dimension: "operational_cost",
    fact_label: "Industrial electricity rate",
    value: "8.4",
    unit: "cents/kWh",
    trend: "flat",
    effective_date: "2026-06-01",
    statute_citation: null,
    source_url: "https://www.tceq.texas.gov/permitting/air/testing (fixture)",
    source_name: "Texas Commission on Environmental Quality",
    span_text: "Texas industrial electricity rates averaged 8.4 cents per kWh in the most recent reporting period",
  },
  {
    // UNGROUNDED: span_text does not appear (paraphrased) in its own capture, proves the refusal path.
    state_code: "US-NY",
    state_label: "New York",
    region_code: "US",
    dimension: "labor_markets",
    fact_label: "State minimum wage",
    value: "17.00",
    unit: "USD/hour",
    effective_date: "2026-01-01",
    statute_citation: "N.Y. Lab. Law section  652",
    source_url: "https://www.dir.ca.gov/dlse/faq_minimumwage.htm", // deliberately reuses the CA capture
    source_name: "New York Department of Labor",
    span_text: "New York's minimum wage rose to seventeen dollars an hour",
  },
  {
    // UNRATED SOURCE: up.codes is a curated LEGAL_AGGREGATOR host (host-authority.ts), the institution
    // class table returns null for it (a permanent-worklist re-attribution case, never the publisher).
    // Proves rule 18's "rate it, never guess" refusal (not a hand-typed fallback tier).
    state_code: "US-WA",
    state_label: "Washington",
    region_code: "US",
    dimension: "operational_cost",
    fact_label: "Industrial electricity rate",
    value: "6.9",
    unit: "cents/kWh",
    effective_date: "2026-03-01",
    statute_citation: null,
    source_url: "https://up.codes/wa-energy-notes",
    source_name: "up.codes",
    span_text: "Washington industrial electricity averaged 6.9 cents per kWh",
  },
];

export function fixtureFetchCapture(url) {
  const text = CAPTURES[url];
  if (!text) return Promise.resolve(null);
  return Promise.resolve({ text, retrieved_at: "2026-09-25T00:00:00Z" });
}
