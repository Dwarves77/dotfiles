// @ts-check

export const GROUND_SECTION_HARD_CEILING_CHARS = Number(process.env.GROUND_SECTION_HARD_CEILING_CHARS || 200000);

/**
 * Prepare one brief section for the grounder. Returns the FULL text when under the ceiling; over the ceiling,
 * returns the sliced text WITH truncated=true + fullLength so the caller SURFACES it — never a silent slice.
 * @param {string|null|undefined} contentMd @param {number} [ceiling]
 * @returns {{ text: string, truncated: boolean, fullLength: number, cap: number }}
 */
export function prepareSectionForGrounding(contentMd, ceiling = GROUND_SECTION_HARD_CEILING_CHARS) {
  const full = String(contentMd || "");
  if (full.length <= ceiling) return { text: full, truncated: false, fullLength: full.length, cap: ceiling };
  return { text: full.slice(0, ceiling), truncated: true, fullLength: full.length, cap: ceiling };
}
