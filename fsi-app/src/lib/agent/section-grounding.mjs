// @ts-check
// GROUND-SECTION completeness (size-cap doctrine, 2026-07-06 — the size-axis analog of the spend ceiling).
// The old GROUND_SECTION_MAX_CHARS=12000 SILENTLY sliced each brief section before the grounder's ledger
// extractor saw it, so a binding fact past 12KB was invisible → false GAP / missed required slot / unlabeled-
// in-tail (the category-2 defect; failure direction is fail-CLOSED — completeness + wasted spend, not
// fabrication). Per the doctrine — EVERY cap on the grounding path is either sized so it never binds in normal
// operation, or fails LOUD when it binds — the section now reaches the grounder COMPLETE up to a HARD CEILING
// sized far above any real section (max observed 32KB vs a 200KB ceiling; trivial against the 560KB source
// budget), and a pathological section OVER the ceiling is a SURFACED slice (truncation-guard event →
// coverage_gap flag + held with named reason), never a silent one.

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
