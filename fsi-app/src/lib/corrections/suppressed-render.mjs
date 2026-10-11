import { fetchAllByIdChunks } from "../db/paginate.mjs";
import { readAllCorrections, readItemCorrections, suppressedClaimMatcher } from "./item-corrections.mjs";

const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;
// a bracket matches itself or its markdown-escaped form (optional backslash, then the bracket)
const charPattern = (ch) => (ch === "[" ? "\\\\?\\[" : ch === "]" ? "\\\\?\\]" : ch.replace(REGEX_SPECIALS, "\\$&"));

/**
 * The pattern that finds a claim's text in rendered markdown (lane DFIX-2). Same words in the same order, but
 * tolerant of the two things rendering changes without changing the claim: any run of whitespace (a line wrap, a
 * doubled space, CRLF) matches any other run, and a square bracket matches itself or its markdown-escaped form
 * (a record-grade claim_text opens with "[slot_key]", which a markdown pass may write as "\[slot_key\]").
 * When the match starts a list line, the bullet marker is part of the match, so no empty bullet is left behind.
 * Nothing else is fuzzy: a different word, number or order does not match. PURE.
 * @param {string} claimText non-blank
 * @returns {RegExp} global, multiline
 */
function claimTextPattern(claimText) {
  const body = claimText
    .trim()
    .split(/\s+/)
    .map((tok) => Array.from(tok, charPattern).join(""))
    .join("\\s+");
  return new RegExp(`(?:^[ \\t]*[-*+][ \\t]+)?${body}`, "gm");
}

/**
 * Remove every occurrence of claimText from text: an exact one, or the same words with different whitespace or
 * escaped brackets (see claimTextPattern). When something was removed, runs of three or more newlines (the gap the
 * removal can leave) collapse to one blank line. PURE.
 * @returns {{text:string, found:boolean}}
 */
export function removeClaimText(text, claimText) {
  const t = typeof text === "string" ? text : "";
  const c = typeof claimText === "string" ? claimText : "";
  if (!t || !c.trim()) return { text: t, found: false };
  const re = claimTextPattern(c);
  if (!re.test(t)) return { text: t, found: false };
  re.lastIndex = 0;
  return { text: t.replace(re, "").replace(/\n{3,}/g, "\n\n"), found: true };
}

/**
 * Apply a set of suppressed claims to an item's sections and full brief. PURE; never mutates its inputs.
 * @param {{
 *   sections?: Array<{id?:string, content_md?:string}>,
 *   fullBrief?: string|null,
 *   claims: Array<{id:string, claim_text:string, section_row_id?:string|null}>
 * }} input
 * @returns {{
 *   sections: Array<object>,
 *   fullBrief: string|null|undefined,
 *   report: Array<{claim_id:string, claim_text:string, section_found:boolean|null, brief_found:boolean|null}>
 * }} section_found is true when the claim text was removed from its own section, false when that section was found
 *   but did not carry the text verbatim, null when the claim names no section or the section is not in `sections`.
 *   brief_found is null when there is no full brief to look in.
 */
export function redactSuppressedClaims({ sections, fullBrief, claims }) {
  const list = Array.isArray(claims) ? claims : [];
  const outSections = (Array.isArray(sections) ? sections : []).map((s) => ({ ...s }));
  let brief = fullBrief;
  const report = [];
  for (const claim of list) {
    let sectionFound = null;
    if (claim.section_row_id) {
      const target = outSections.find((s) => s.id !== undefined && String(s.id) === String(claim.section_row_id));
      if (target) {
        const r = removeClaimText(target.content_md, claim.claim_text);
        target.content_md = r.text;
        sectionFound = r.found;
      }
    }
    let briefFound = null;
    if (typeof brief === "string" && brief) {
      const r = removeClaimText(brief, claim.claim_text);
      brief = r.text;
      briefFound = r.found;
    }
    report.push({ claim_id: claim.id, claim_text: claim.claim_text, section_found: sectionFound, brief_found: briefFound });
  }
  return { sections: outSections, fullBrief: brief, report };
}

/**
 * The suppressed claims of the given items: claims whose latest active matching fact correction is a `suppress`
 * (by id, or by the original machine claim_text, same rule as suppressedClaimMatcher). A read error throws.
 * @param {object} sb PostgREST-style client (service role)
 * @param {string[]} itemIds uuids
 * @returns {Promise<Array<{item_id:string, id:string, claim_text:string, section_row_id:string|null}>>}
 */
export async function loadSuppressedClaims(sb, itemIds) {
  const ids = [...new Set((itemIds ?? []).filter(Boolean))];
  if (!ids.length) return [];
  const corrections = ids.length === 1 ? await readItemCorrections(sb, ids[0]) : await readAllCorrections(sb);
  const withFacts = ids.filter((id) => corrections.some((c) => c.item_id === id && c.target_kind === "fact" && c.op === "suppress" && !c.revoked_at));
  if (!withFacts.length) return [];
  const claims = await fetchAllByIdChunks(
    withFacts,
    async (slice) => {
      const { data, error } = await sb
        .from("section_claim_provenance")
        .select("id, claim_text, section_row_id, intelligence_item_id")
        .in("intelligence_item_id", slice);
      if (error) throw new Error(`section_claim_provenance read failed: ${error.message}`);
      return data ?? [];
    },
    { manyPerId: true },
  );
  const out = [];
  for (const itemId of withFacts) {
    const isSuppressed = suppressedClaimMatcher(corrections, itemId);
    for (const c of claims) {
      if (c.intelligence_item_id !== itemId || !isSuppressed(c)) continue;
      out.push({ item_id: itemId, id: c.id, claim_text: c.claim_text, section_row_id: c.section_row_id ?? null });
    }
  }
  return out;
}
