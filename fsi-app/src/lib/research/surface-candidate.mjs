export const RESEARCH_CANDIDATE_OR = "domain.eq.7,item_type.eq.research_finding";

/**
 * mirror of this file's own RESEARCH_CANDIDATE_OR (a PostgREST filter string): kept, JS-side boolean form for in-memory callers; drift-tested byte-for-byte by this file's test.
 * JS-side mirror of RESEARCH_CANDIDATE_OR, for the drift test and for any caller that already has rows
 * in hand (no round trip). Kept byte-for-byte in sync with RESEARCH_CANDIDATE_OR by the test.
 * @param {string | null | undefined} itemType
 * @param {number | null | undefined} domain
 * @returns {boolean}
 */
export function isResearchCandidate(itemType, domain) {
  const d = typeof domain === "number" ? domain : null;
  return d === 7 || itemType === "research_finding";
}
