interface SectionIndexBodyFixture {
  id: string;
  fullTitle: string;
  body: string;
}

export const SECTION_INDEX_BODY_FIXTURES: SectionIndexBodyFixture[] = [
  { id: "summary", fullTitle: "S1 Summary", body: "The 30-second read: what this regulation requires and by when." },
  { id: "obligations", fullTitle: "S2 Obligations · issues requiring action", body: "What the workspace must decide or do now." },
  { id: "requirements", fullTitle: "S3 Substantive requirements", body: "What the rule itself says, section by section." },
  { id: "registration", fullTitle: "S4 Registration and reporting", body: "EPR registration, producer registration, jurisdictional reporting." },
  { id: "operations", fullTitle: "S5 Operational requirements", body: "What the workspace must build or modify operationally." },
  { id: "compliance", fullTitle: "S6 Compliance chain", body: "Where the workspace sits in the regulation's defined roles." },
  { id: "penalties", fullTitle: "S7 Penalties", body: "Enforcement body and penalty range, verbatim from the source." },
  { id: "sources", fullTitle: "S8 Sources", body: "Full source list with type labels." },
  { id: "across-pages", fullTitle: "S9 Connected intelligence", body: "Intersections with items on other pages, and the theme analysis they belong to." },
  { id: "inferences", fullTitle: "S10 Inferences", body: "What the system has inferred about this item, labelled as inference and never as fact." },
];
