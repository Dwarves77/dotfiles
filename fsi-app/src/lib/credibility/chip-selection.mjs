/**
 * @typedef {Object} BiasTagInput
 * @property {'funding'|'methodology'|'stakeholder'} dimension
 * @property {string} tag
 * @property {number|null|undefined} [confidence]
 */
/**
 * Pick the top-N bias chips to display in a dense list context.
 *
 * Sort key: confidence desc, then dimension order (funding -> methodology
 * -> stakeholder), then tag alpha for stable output across renders.
 *
 * @param {BiasTagInput[]} tags
 * @param {number|undefined} maxChips When undefined or non-positive, returns
 *   all tags (preserves the original BiasBadge contract for ProvenancePanel
 *   and any future caller that wants the full set).
 * @returns {{ displayed: BiasTagInput[], remaining: number }}
 */

export function selectBiasChipsForDisplay(tags, maxChips) {
  const safe = Array.isArray(tags) ? tags : [];
  if (typeof maxChips !== 'number' || maxChips <= 0 || safe.length <= maxChips) {
    return { displayed: safe, remaining: 0 };
  }
  const dimOrder = { funding: 0, methodology: 1, stakeholder: 2 };
  const sorted = [...safe].sort((a, b) => {
    const ac = typeof a.confidence === 'number' ? a.confidence : -1;
    const bc = typeof b.confidence === 'number' ? b.confidence : -1;
    if (bc !== ac) return bc - ac;
    const ad = dimOrder[a.dimension] ?? 99;
    const bd = dimOrder[b.dimension] ?? 99;
    if (ad !== bd) return ad - bd;
    return String(a.tag).localeCompare(String(b.tag));
  });
  return {
    displayed: sorted.slice(0, maxChips),
    remaining: safe.length - maxChips,
  };
}
