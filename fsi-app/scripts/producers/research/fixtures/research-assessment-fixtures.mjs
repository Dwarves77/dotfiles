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
