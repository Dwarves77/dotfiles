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
   * positional S<i+1> numbering (settings) unchanged.
   *
   * Lane IDX-1 (2026-10-07): the regulations table now carries fixed ordinals too (01 to 10), and the
   * two main-content sections that had no tab (Connected, Inferences) are index entries on every
   * surface. Every reader of an ordinal (the index tab, the section header) reads `ord`, never the
   * array position.
   */
  ord?: number;
}

export const SECTION_INDEX_SHORT_NAME_MAX = 14;

export const CONNECTED_SECTION_ID = "across-pages";
export const INFERENCES_SECTION_ID = "inferences";

/** Review item 5's canonical order, applied to every regulation (build step 5: "Same order on
 *  every regulation"): Substantive requirements moves up to S3; Compliance chain moves down to S6.
 *  The short names themselves are review item 4's own list, verbatim. Ordinals are FIXED (operator
 *  ruling 2026-10-07, lane IDX-1): a section the item does not carry is omitted, never renumbered.
 *  Connections stay in the masthead (board 03, 2026-09-25); there is no Related section here. */
export const REGULATION_SECTION_INDEX: SectionIndexEntry[] = [
  { id: "summary", shortName: "Summary", ord: 1 },
  { id: "obligations", shortName: "Obligations", ord: 2 },
  { id: "requirements", shortName: "Requirements", ord: 3 },
  { id: "registration", shortName: "Registration", ord: 4 },
  { id: "operations", shortName: "Operations", ord: 5 },
  { id: "compliance", shortName: "Compliance", ord: 6 },
  { id: "penalties", shortName: "Penalties", ord: 7 },
  { id: "sources", shortName: "Sources", ord: 8 },
  { id: CONNECTED_SECTION_ID, shortName: "Connected", ord: 9 },
  { id: INFERENCES_SECTION_ID, shortName: "Inferences", ord: 10 },
];

/** The fixed ordinals of the two trailing sections on Market, Research and Operations (their 03 and 04
 *  live in the masthead, 05 is Sources, 06 is Related). */
const OTHER_SURFACE_CROSS_PAGE_ORD = { connected: 7, inferences: 8 } as const;

function crossPageOrds(surfaceKey: string): { connected: number; inferences: number } {
  if (surfaceKey === "regulations") {
    const ord = (id: string) => REGULATION_SECTION_INDEX.find((e) => e.id === id)!.ord!;
    return { connected: ord(CONNECTED_SECTION_ID), inferences: ord(INFERENCES_SECTION_ID) };
  }
  return { ...OTHER_SURFACE_CROSS_PAGE_ORD };
}

/** The fixed ordinal of the Connected intelligence section on a surface (its header and its tab agree). */
export function connectedSectionOrd(surfaceKey: string): number {
  return crossPageOrds(surfaceKey).connected;
}

/** The fixed ordinal of the Inferences section on a surface. */
export function inferencesSectionOrd(surfaceKey: string): number {
  return crossPageOrds(surfaceKey).inferences;
}

/** The index entries for the two trailing sections, present only when the section renders. */
export function crossPageIndexEntries(
  surfaceKey: string,
  present: { connected: boolean; inferences: boolean },
): SectionIndexEntry[] {
  const ords = crossPageOrds(surfaceKey);
  return [
    ...(present.connected ? [{ id: CONNECTED_SECTION_ID, shortName: "Connected", ord: ords.connected }] : []),
    ...(present.inferences ? [{ id: INFERENCES_SECTION_ID, shortName: "Inferences", ord: ords.inferences }] : []),
  ];
}

/** The fixed ordinal of a regulation section by index id, or null when the id is not in the table. */
export function regulationSectionOrd(indexId: string): number | null {
  const e = REGULATION_SECTION_INDEX.find((x) => x.id === indexId);
  return e?.ord ?? null;
}
