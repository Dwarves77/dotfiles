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
  /**
   * Explicit tab ordinal ("S<ord>"), lane PARITY-PARTS (2026-09-24), operator ruling 2
   * (docs/ops/session-log.md, 2026-09-24 "operator rulings" entry, item 2): the detail S-order for
   * market/research/operations is "01 Summary, 02 Substantive/Series/Findings, 03 Exposure, 04
   * Timeline, 05 Sources, 06 Related. Numbers are fixed; a missing section is omitted, never
   * renumbered." Exposure and Timeline (03/04) render inside the one ActionCard masthead card
   * (check 2) and are never their own tab, so those three surfaces' real index is S1/S2/S5/S6, a
   * genuine gap at S3/S4, not a renumbering. Omitted (undefined), a caller keeps the prior
   * positional S<i+1> numbering (regulations, settings) unchanged.
   */
  ord?: number;
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
  // Operator check 8 (lane PARITY-PARTS, 2026-09-24): Connections is not a rail card, moved into
  // this trailing "Related" section in main content (matching the market/research/operations port).
  { id: "related", shortName: "Related" },
];
