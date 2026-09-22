/**
 * section-index-data, the one table SectionIndex's regulation-surface entries read from (lane
 * W10-ActionCard-a, 2026-09-21, operator review item 4). Plain .ts, no JSX, so
 * section-index-data.test.mjs can assert the 14-character short-name bound directly under bare
 * `node --test`, without pulling in SectionIndex.tsx's React tree.
 */

export interface SectionIndexEntry {
  id: string;
  /** <= 14 characters (SECTION_INDEX_SHORT_NAME_MAX). The full section title is the section's own
   *  header, never this tab's label (review item 4: "Full name is the section header, not the
   *  tab"). */
  shortName: string;
}

export const SECTION_INDEX_SHORT_NAME_MAX = 14;

/** Review item 5's canonical order, applied to every regulation (build step 5: "Same order on
 *  every regulation"): Substantive requirements moves up to S3; Compliance chain moves down to S6.
 *  The short names themselves are review item 4's own list, verbatim. */
export const REGULATION_SECTION_INDEX: SectionIndexEntry[] = [
  { id: "summary", shortName: "Summary" },
  { id: "obligations", shortName: "Obligations" },
  { id: "requirements", shortName: "Requirements" },
  { id: "registration", shortName: "Registration" },
  { id: "operations", shortName: "Operations" },
  { id: "compliance", shortName: "Compliance" },
  { id: "penalties", shortName: "Penalties" },
  { id: "sources", shortName: "Sources" },
];
