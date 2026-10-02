// research-assessment-fixtures.mjs -- fixture AssessmentInput rows for research-assessment-producer.mjs's
// dry/no-creds CLI run (lane-common-contract "test what you build": a producer is not done until it has
// run for real, dry or apply, and left a harness-run artifact). Shapes match src/lib/research/assess.mjs's
// AssessmentInput typedef exactly -- these are NOT live corpus rows (no DB creds in this worktree); each
// one exercises a DIFFERENT rule in the R1-R4 ladder plus the mandatory refusal state, so a single fixture
// run's per_item outcomes demonstrate every branch the producer's own metrics report.

export const FIXTURE_NOW = new Date("2026-10-01T00:00:00Z");

/** @type {import("../../../src/lib/research/assess.mjs").AssessmentInput[]} */
export const FIXTURE_CANDIDATES = [
  {
    id: "fixture-research-r1",
    itemType: "research_finding",
    addedDate: "2026-08-01T00:00:00Z",
    text: "ReFuelEU SAF blending steps apply to this corridor from the next compliance date.",
    sourceTier: 2,
    citationCount: 6,
    biasTags: [],
    forwardEvents: [
      {
        id: "fe-r1-1",
        kind: "obligation",
        event_date: "2027-01-01",
        obligation_text: "ReFuelEU SAF blending mandate takes effect for this route.",
        source_citation: null,
      },
    ],
  },
  {
    id: "fixture-research-r3",
    itemType: "research_finding",
    addedDate: "2026-07-15T00:00:00Z",
    text: "Hydrogen bunkering infrastructure is discussed in general industry terms.",
    sourceTier: 4,
    citationCount: 2,
    biasTags: [{ dimension: "funding", tag: "vendor-funded", confidence: 0.6 }],
    forwardEvents: [
      {
        id: "fe-r3-1",
        kind: "milestone",
        event_date: "2031-03-01",
        obligation_text: null,
        source_citation: "IEA World Energy Outlook",
      },
    ],
  },
  {
    id: "fixture-research-r4",
    itemType: "technology",
    // domain: 7 (Research) is the surface-candidate rule technology/innovation items need to be
    // admitted to Research at all (src/lib/research/surface-candidate.mjs's own RESEARCH_CANDIDATE_OR);
    // a bare "technology" item_type alone resolves to Market Intel/Operations, never Research.
    domain: 7,
    addedDate: "2026-06-01T00:00:00Z",
    text: "The electrolyser pathway remains at lab-scale testing, no commercial contracts yet.",
    sourceTier: 3,
    citationCount: 0,
    biasTags: [],
    forwardEvents: [],
  },
  {
    id: "fixture-research-refusal",
    itemType: "research_finding",
    addedDate: "2026-05-20T00:00:00Z",
    text: "General commentary on freight decarbonisation policy trends, no maturity or dated signal.",
    sourceTier: null,
    citationCount: null,
    biasTags: [],
    forwardEvents: [],
  },
];

// ── Lane L3 (2026-10-02): the OpenAlex-wired authority-score path, exercised offline ──────────────────
// Separate from FIXTURE_CANDIDATES above (which several tests assert an exact count/order against) --
// appended by the CLI's own dry run only (see research-assessment-producer.mjs's main()), so this
// addition cannot change any existing count-based assertion in research-assessment-producer.test.mjs.

/** The DOI this lane's "test what you build" real fire actually resolved against the live OpenAlex API
 *  (see docs/ops/session-log.d/2026-10-02-l3.md). Reusing a confirmed-real, resolvable DOI for the dry
 *  fixture's text; the recorded response below is what that live fire returned, trimmed to the fields
 *  the mapping step reads. */
export const FIXTURE_OPENALEX_DOI = "10.1038/nature12373";

/** Recorded response for FIXTURE_OPENALEX_DOI, captured live during this lane's build (2026-10-02) and
 *  trimmed to the fields `resolveOpenAlexSourceRecords` reads -- not invented. Notably
 *  `citation_normalized_percentile` is an OBJECT on the real API, not a bare number. */
export const FIXTURE_OPENALEX_WORK_RESPONSE = {
  id: "https://openalex.org/W2159974629",
  doi: "https://doi.org/10.1038/nature12373",
  publication_date: "2013-07-30",
  fwci: 48.9515,
  cited_by_count: 1983,
  citation_normalized_percentile: { value: 0.99967102, is_in_top_1_percent: true, is_in_top_10_percent: true },
  is_retracted: false,
  authorships: [{ institutions: [{ display_name: "Harvard University", type: "education", ror: "https://ror.org/03vek6s52" }] }],
};

/** @type {import("../../../src/lib/research/assess.mjs").AssessmentInput} */
export const FIXTURE_OPENALEX_CANDIDATE = {
  id: "fixture-research-openalex-doi",
  itemType: "research_finding",
  addedDate: "2026-09-01T00:00:00Z",
  text: `Primary evidence for this finding is reported at DOI ${FIXTURE_OPENALEX_DOI}, a lab-scale study.`,
  sourceTier: 7, // deliberately a vendor-tier source stamp on the ITEM -- must not be what drives the
  // result once the real OpenAlex record resolves; see assess.test.mjs's own test of exactly this.
  citationCount: 1,
  biasTags: [],
  forwardEvents: [],
};

/** An offline `deps.fetch` stub for the CLI's own dry run: resolves FIXTURE_OPENALEX_DOI from the
 *  recorded response above, 404s anything else -- zero real network, ever, from the default CLI run. */
export function fixtureOpenAlexFetchStub() {
  const encodedDoi = `https://doi.org/${FIXTURE_OPENALEX_DOI}`;
  return async (url) => {
    const matches = typeof url === "string" && url.includes(encodedDoi);
    return {
      status: matches ? 200 : 404,
      ok: matches,
      statusText: matches ? "OK" : "Not Found",
      headers: { get: () => null },
      json: async () => (matches ? FIXTURE_OPENALEX_WORK_RESPONSE : {}),
    };
  };
}
