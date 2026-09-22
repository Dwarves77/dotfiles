/**
 * section-index-fixtures: static section bodies for the `/admin/parts/section-index` sign-off page
 * (lane W10-ActionCard-a, 2026-09-21). Each entry pairs a `REGULATION_SECTION_INDEX` id with a
 * short placeholder body so the fixture page can anchor real DOM elements for the scroll-spy
 * IntersectionObserver, and so a reviewer can see the FULL section header beside the tab's SHORT
 * name (review item 4: "Full name is the section header, not the tab").
 */

export interface SectionIndexBodyFixture {
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
];
