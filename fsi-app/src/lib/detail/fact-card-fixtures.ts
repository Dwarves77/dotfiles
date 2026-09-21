// src/lib/detail/fact-card-fixtures.ts
//
// Lane w10-factcard-b (2026-09-20), Amendment 1 section B.2: "/admin/parts is the one home for every
// part lane's sign-off picture ... rendering every kind and form, the no-lead case, the matrix
// density, a long claim, and a card with no provenance, from static fixture models (no database
// read)." This module is that fixture set. Pure data, no I/O, no database read - imported by
// src/app/admin/parts/fact-card/page.tsx, which is the only production importer (F25 module
// liveness).
//
// Every fixture is HAND-BUILT, never derived from a real corpus row: this page exists to show the
// PART's anatomy, not to report live data (that is /admin/factors's job for a different table). The
// integrity rule (environmental-policy-and-innovation skill) governs product content, not UI fixture
// prose; these strings are deliberately generic placeholders, never presented as real regulatory
// facts.

import type { FactCardModel } from "@/lib/detail/fact-card-model";

export interface FactCardFixture {
  label: string;
  model: FactCardModel;
}

const PROVENANCE = {
  tier: 1,
  source: "Example Regulation, Article 6",
  org: "Example Regulatory Body",
  href: "https://example.org/regulation",
  accessed: "2026-09-01",
};

/** One fixture per kind in FACT_CARD_KINDS (9 kinds), each with a figure lead where the kind's own
 *  rule allows one, full provenance, and a claim under the 66ch measure - the "every kind" and
 *  "every form" (orange / ink / inference, told apart by kind) requirement. */
export const KIND_FIXTURES: FactCardFixture[] = [
  {
    label: "ACTION REQUIRED (orange form)",
    model: {
      kind: "ACTION REQUIRED",
      qualifier: "register with the coordinating body",
      figureLead: "Register",
      claim: [{ text: "Confirm, for any client importing packaged goods, whether that client has registered its compliance route." }],
      provenance: PROVENANCE,
    },
  },
  {
    label: "LEGAL CONFIRMATION REQUIRED (orange form)",
    model: {
      kind: "LEGAL CONFIRMATION REQUIRED",
      qualifier: "not resolved by the source",
      figureLead: null,
      claim: [{ text: "Whether \"importer\", as applied to a specific transaction, brings a forwarder acting as importer of record within the obligated class." }],
      provenance: { ...PROVENANCE, source: "refer to counsel", href: null, org: null, accessed: null },
    },
  },
  {
    label: "DEADLINE (ink form)",
    model: {
      kind: "DEADLINE",
      qualifier: "effective date",
      figureLead: "2027-01-01",
      claim: [{ text: "The " }, { text: "phase-in obligation", bold: true }, { text: " begins on this date." }],
      provenance: PROVENANCE,
    },
  },
  {
    label: "BASELINE TARGET (ink form)",
    model: {
      kind: "BASELINE TARGET",
      qualifier: "EU baseline",
      figureLead: "50-65%",
      figureSubLabel: "recovered",
      claim: [{ text: "Between " }, { text: "50% and 65%", bold: true }, { text: " by weight of packaging waste recovered." }],
      provenance: PROVENANCE,
    },
  },
  {
    label: "NATIONAL TARGET (ink form)",
    model: {
      kind: "NATIONAL TARGET",
      qualifier: "national implementation",
      figureLead: "80% / 50%",
      figureSubLabel: "recovery / recycling",
      claim: [{ text: "National cooperation agreement sets " }, { text: "45% recycling / 70% recovery", bold: true }, { text: " rising over the phase-in." }],
      provenance: PROVENANCE,
    },
  },
  {
    label: "SCOPE (ink form)",
    model: {
      kind: "SCOPE",
      qualifier: null,
      figureLead: null,
      claim: [{ text: "Applies to packaging placed on the market by economic operators within the jurisdiction, including packaging filled abroad." }],
      provenance: PROVENANCE,
    },
  },
  {
    label: "PENALTY (ink form)",
    model: {
      kind: "PENALTY",
      qualifier: "non-compliance",
      figureLead: "EUR 10-50",
      figureSubLabel: "per tonne CO2e",
      claim: [{ text: "Penalty range for " }, { text: "undeclared embedded emissions", bold: true }, { text: " under the enforcement schedule." }],
      provenance: PROVENANCE,
    },
  },
  {
    label: "DEFINITION (ink form)",
    model: {
      kind: "DEFINITION",
      qualifier: "as defined in Article 3",
      figureLead: null,
      claim: [{ text: "\"" }, { text: "Producer", bold: true }, { text: "\" means the entity that first places packaging on the market under its own name." }],
      provenance: PROVENANCE,
    },
  },
  {
    label: "ANALYTICAL INFERENCE (dashed inference form, no figure lead, not citable)",
    model: {
      kind: "ANALYTICAL INFERENCE",
      qualifier: "derived from the two facts above",
      figureLead: null,
      claim: [{ text: "A bare compliance statement omits the trajectory: recovery rose from 70% to 80% and recycling from 45% to 50% within one year, well above the EU's ceilings." }],
      provenance: null,
    },
  },
];

/** The no-lead case: a real kind (not ANALYTICAL INFERENCE, which never has a lead by rule) whose
 *  claim carries no bold figure, so figureLead is honestly null rather than invented. */
export const NO_LEAD_FIXTURE: FactCardFixture = {
  label: "No-lead case (SCOPE, no bold figure in the claim)",
  model: {
    kind: "SCOPE",
    qualifier: "jurisdictional scope",
    figureLead: null,
    claim: [{ text: "Covers economic operators established in the jurisdiction and those placing packaging on the market from outside it." }],
    provenance: PROVENANCE,
  },
};

/** A claim well past the 66ch wrap measure the body row's claim column carries, so the sign-off
 *  page shows the part's own wrap behaviour rather than asserting it from the CSS alone. */
export const LONG_CLAIM_FIXTURE: FactCardFixture = {
  label: "Long claim (exceeds the 66ch measure, wraps inside the claim column)",
  model: {
    kind: "SCOPE",
    qualifier: "extended scope note",
    figureLead: null,
    claim: [
      {
        text:
          "This claim is deliberately longer than the sixty-six character measure the body row's claim column carries, so that the fixture page shows the part's real wrapping behaviour at both 375px and 1280px rather than asserting it from the stylesheet alone, and continues for one more clause to be sure.",
      },
    ],
    provenance: PROVENANCE,
  },
};

/** A card with no provenance at all: every provenance field absent, so ProvenanceBlock's own
 *  "nothing to show" branch renders (distinct from the inference form's "not citable" branch, which
 *  is driven by kind, not by an empty provenance object). */
export const NO_PROVENANCE_FIXTURE: FactCardFixture = {
  label: "No provenance (every field absent; not the inference form)",
  model: {
    kind: "DEFINITION",
    qualifier: "working note, unsourced",
    figureLead: null,
    claim: [{ text: "A placeholder definition carried with no citation, to show the part's empty-provenance column." }],
    provenance: null,
  },
};

export const DEFAULT_DENSITY_FIXTURES: FactCardFixture[] = [
  ...KIND_FIXTURES,
  NO_LEAD_FIXTURE,
  LONG_CLAIM_FIXTURE,
  NO_PROVENANCE_FIXTURE,
];

// ── density="matrix" fixtures (operations panel anatomy) ───────────────────────────────────────
// Raw region-grid.mjs-shaped fact rows, the same `Record<string, unknown>` shape
// RegionDimensionMatrix.tsx passes to `<FactCard density="matrix">` - NOT FactCardModel objects,
// since matrix facts are envelope rows, not classified fact paragraphs (see FactCard.tsx's own
// density="matrix" header comment).

export interface MatrixFixture {
  label: string;
  fact: Record<string, unknown>;
  baseFact: Record<string, unknown> | null;
}

export const MATRIX_FIXTURES: MatrixFixture[] = [
  {
    label: "density=\"matrix\", figure branch",
    fact: {
      label: "Warehouse worker monthly wage",
      value: "HKD 14,747",
      valueNumeric: 14747,
      unit: "HKD / mo",
      sourceName: "Indeed HK",
      sourceUrl: "https://example.org/indeed-hk-wages",
      referencePeriod: "2025-09",
      originClass: "official",
      lastUpdated: "2026-05-28",
    },
    baseFact: null,
  },
  {
    label: "density=\"matrix\", no-figure branch (six-word headline, then the claim)",
    fact: {
      label: "Berth allocation is discretionary",
      value: "Berth allocation at the container terminal is settled by the port authority case by case, and no published tariff or allocation table exists for it.",
      sourceName: null,
      sourceUrl: null,
      lastUpdated: "2026-05-28",
    },
    baseFact: null,
  },
];
