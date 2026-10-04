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

// FIXTURE_OPENALEX_CANDIDATES: real OpenAlex "work" object shape (spec 03 section 8: "OpenAlex is the
// spine: works, authors, institutions, topics ... free, no key"), recorded-response fidelity per lane
// L3's own openalex-client.mjs/authority-score.mjs headers (a live call during L3's build confirmed the
// top-level field names, including `citation_normalized_percentile` as an OBJECT
// `{value, is_in_top_1_percent, is_in_top_10_percent}`, never a bare number -- reproduced here even
// though this walker's own normalizeOpenAlexWork does not read that field, so the fixture stays an
// honest recorded shape rather than a convenient simplification). Fixture-only: the real client call
// (openalex-client.mjs's openAlexGet, reused unchanged by this lane -- see research-walker.mjs's own
// searchOpenAlexWorks) is never reached by the default CLI run; these objects are the `results` array
// of the exact JSON body a live `/works?search=...` call would hand to `res.json()`.
export const FIXTURE_OPENALEX_CANDIDATES = Object.freeze([
  {
    id: "https://openalex.org/W4401234567",
    title: "Decarbonisation pathways for heavy-duty road freight: a corridor-level assessment",
    doi: "https://doi.org/10.1000/example-freight-decarb",
    publication_date: "2026-08-15",
    // The record carries its own publisher landing page: the candidate's publisher host comes from it,
    // never from the DOI resolver link (lane S1-D). .edu host, so it places by a built-in rule.
    primary_location: { landing_page_url: "https://its.example-univ.edu/freight-decarb-corridors" },
    fwci: 1.8,
    citation_normalized_percentile: { value: 0.91, is_in_top_1_percent: false, is_in_top_10_percent: true },
    is_retracted: false,
  },
  {
    id: "https://openalex.org/W4401234568",
    title: "Alternative marine fuels and port-side bunkering infrastructure: a readiness review",
    doi: "https://doi.org/10.1000/example-marine-fuels",
    publication_date: "2026-07-02",
    // No landing page: the DOI resolver link is the only URL, so the publisher host is unresolved (residue).
    primary_location: { landing_page_url: null },
    fwci: 0.6,
    citation_normalized_percentile: { value: 0.42, is_in_top_1_percent: false, is_in_top_10_percent: false },
    is_retracted: false,
  },
  // Deliberately missing a landing_page_url AND a doi, to exercise the "no resolvable url -> skipped,
  // not minted" path a live feed will genuinely produce (OpenAlex ships works with neither field).
  {
    id: "https://openalex.org/W4401234569",
    title: "A work with no resolvable URL (fixture-only negative case)",
    doi: null,
    publication_date: "2026-06-01",
    primary_location: { landing_page_url: null },
    fwci: null,
    citation_normalized_percentile: null,
    is_retracted: false,
  },
]);

// Publisher-host fixtures (lane S1-D, 2026-10-04, rule 18): one work per placement outcome, each with a
// landing page on the publisher's own host (never a DOI resolver, which is an aggregator and never places).
//   - eprints.soton.ac.uk -> ACADEMIC_TLD (.ac.uk), a BUILT-IN rule -> class academic -> tier 4
//   - unplaced-example.test -> no built-in rule; placed ONLY by the fixture host verdict batch
//     (scripts/maintenance/host-verdicts/host-verdicts-000.fixture.json, class association -> tier 4)
//   - unlisted-journal.example -> no built-in rule and no verdict: unplaced, so residue, never a rejection
export const FIXTURE_OPENALEX_PUBLISHER_CANDIDATES = Object.freeze([
  {
    id: "https://openalex.org/W4401234570",
    title: "Port-hinterland rail modal shift: a corridor study (built-in placed publisher)",
    doi: null,
    publication_date: "2026-09-10",
    primary_location: { landing_page_url: "https://eprints.soton.ac.uk/example-rail-modal-shift" },
    is_retracted: false,
  },
  {
    id: "https://openalex.org/W4401234571",
    title: "Shipper-side scope 3 reporting practice survey (verdict-placed publisher)",
    doi: null,
    publication_date: "2026-09-12",
    primary_location: { landing_page_url: "https://unplaced-example.test/papers/scope3-survey" },
    is_retracted: false,
  },
  {
    id: "https://openalex.org/W4401234572",
    title: "Drayage electrification cost review (unplaced publisher)",
    doi: null,
    publication_date: "2026-09-14",
    primary_location: { landing_page_url: "https://unlisted-journal.example/articles/42" },
    is_retracted: false,
  },
]);

// The exact JSON body shape openAlexGet's `res.json()` returns for a `/works` search -- `{ results, meta }`,
// never the bare array -- so `deps.fetch` stubs in tests and the default CLI run exercise the SAME
// response envelope a live OpenAlex call would hand back, never a convenient shortcut.
const ALL_OPENALEX_FIXTURE_WORKS = [...FIXTURE_OPENALEX_CANDIDATES, ...FIXTURE_OPENALEX_PUBLISHER_CANDIDATES];
export const FIXTURE_OPENALEX_WORKS_RESPONSE = Object.freeze({
  meta: { count: ALL_OPENALEX_FIXTURE_WORKS.length, page: 1, per_page: 10 },
  results: ALL_OPENALEX_FIXTURE_WORKS,
});

export const FIXTURE_NOW = new Date("2026-10-02T12:00:00Z");
