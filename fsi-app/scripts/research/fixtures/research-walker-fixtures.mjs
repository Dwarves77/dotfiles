// research-walker-fixtures.mjs -- lane L7 (2026-10-02). Committed fixtures for research-walker.mjs's
// default (no --live) CLI run: zero network, zero DB credential, matching the posture
// research-assessment-fixtures.mjs already established for its own producer (read in full before this
// file was written).
//
// FIXTURE_GREY_LIT_SOURCES: the 3 research-role sources spec 03 section 8 and the L7 brief name by
// example (IEA, ICCT, a named university transport institute) -- real institutions, real hosts, so the
// institution-class resolution in host-authority.ts (rule 18: tier from the class table, never
// hand-typed) exercises its REAL classification rules against a REAL host, not an invented one.
//   - iea.org    -> GOV_INTERGOV in host-authority.ts -> codified tier 2
//   - theicct.org -> ANALYSIS class in host-authority.ts -> codified tier 6
//   - tti.tamu.edu (Texas A&M Transportation Institute, a real university transport institute) ->
//     ACADEMIC_TLD (.edu) -> codified tier 4
export const FIXTURE_GREY_LIT_SOURCES = Object.freeze([
  { name: "International Energy Agency", url: "https://www.iea.org/reports/example-transport-outlook" },
  { name: "International Council on Clean Transportation", url: "https://theicct.org/publication/example-freight-study" },
  { name: "Texas A&M Transportation Institute", url: "https://tti.tamu.edu/research/example-freight-corridor-study" },
]);

// FIXTURE_OPENALEX_CANDIDATES: shaped like the subset of an OpenAlex "works" API response this walker's
// minimal client reads (spec 03 section 8: "OpenAlex is the spine: works, authors, institutions,
// topics ... free, no key"). Fixture-only -- the real client (fetchOpenAlexWorks) is never called by the
// default CLI run; these objects are consumed directly by normalizeOpenAlexWork, the same pure function
// a live fetch's JSON would pass through.
export const FIXTURE_OPENALEX_CANDIDATES = Object.freeze([
  {
    id: "https://openalex.org/W4401234567",
    title: "Decarbonisation pathways for heavy-duty road freight: a corridor-level assessment",
    doi: "https://doi.org/10.1000/example-freight-decarb",
    publication_date: "2026-08-15",
    primary_location: { landing_page_url: "https://doi.org/10.1000/example-freight-decarb" },
  },
  {
    id: "https://openalex.org/W4401234568",
    title: "Alternative marine fuels and port-side bunkering infrastructure: a readiness review",
    doi: "https://doi.org/10.1000/example-marine-fuels",
    publication_date: "2026-07-02",
    primary_location: { landing_page_url: "https://doi.org/10.1000/example-marine-fuels" },
  },
  // Deliberately missing a landing_page_url AND a doi, to exercise the "no resolvable url -> skipped,
  // not minted" path a live feed will genuinely produce (OpenAlex ships works with neither field).
  {
    id: "https://openalex.org/W4401234569",
    title: "A work with no resolvable URL (fixture-only negative case)",
    doi: null,
    publication_date: "2026-06-01",
    primary_location: { landing_page_url: null },
  },
]);

export const FIXTURE_NOW = new Date("2026-10-02T12:00:00Z");
