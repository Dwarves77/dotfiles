// gate-a-derived.mjs — Gate B derived-date coverage (operator ruling 2026-07-27). The Gate-A scanner's SECOND
// coverage arm, as a PURE DB LOOKUP (no prose-pattern judgment): a fact token is "derived-covered" iff an
// explicit section_claim_provenance row with claim_kind='DERIVED' carries that EXACT token AND its
// basis_claim_id FACT exists AND that FACT's source_span still VERBATIM-matches its stored capture.
//
// Staleness (re-grounds-never-destroy): if the basis FACT's span ever stops matching its capture — or the basis
// is deleted (FK → NULL) — the derived token loses coverage and reverts to orphan on the next scan. The caller
// computes this set and passes it to scanBrief; scanBrief stays mechanical (literal FACT match OR set membership).
import { norm } from "./gate-a-match.mjs";

/**
 * The set of derived tokens (normalized) currently covered for an item — the scanner's DERIVED arm.
 * @param {{ from: (t: string) => any }} sb supabase-like client
 * @param {string} itemId
 * @returns {Promise<Set<string>>} normalized tokens that a VALID (basis-grounded, non-stale) DERIVED claim covers
 */
export async function derivedCoveredTokens(sb, itemId) {
  const covered = new Set();
  const { data: derived } = await sb
    .from("section_claim_provenance")
    .select("claim_text, basis_claim_id")
    .eq("intelligence_item_id", itemId)
    .eq("claim_kind", "DERIVED");
  if (!derived?.length) return covered;

  const basisIds = [...new Set(derived.map((d) => d.basis_claim_id).filter(Boolean))];
  if (!basisIds.length) return covered;
  const { data: bases } = await sb
    .from("section_claim_provenance")
    .select("id, claim_kind, source_span, search_result_id")
    .in("id", basisIds)
    .eq("claim_kind", "FACT");
  const byId = new Map((bases || []).map((b) => [b.id, b]));

  const srIds = [...new Set((bases || []).map((b) => b.search_result_id).filter(Boolean))];
  const capById = new Map();
  if (srIds.length) {
    const { data: caps } = await sb.from("agent_run_searches").select("id, result_content").in("id", srIds);
    for (const c of caps || []) capById.set(c.id, c.result_content || "");
  }

  for (const d of derived) {
    const b = byId.get(d.basis_claim_id);
    if (!b || !b.source_span) continue; // basis missing / not a FACT / spanless → not covered
    const cap = capById.get(b.search_result_id);
    // basis span must still be VERBATIM in its capture (case-insensitive, matching criterion 3). Stale → drop.
    if (!cap || !String(cap).toLowerCase().includes(String(b.source_span).toLowerCase())) continue;
    covered.add(norm(d.claim_text)); // the exact derived token is covered while its basis holds
  }
  return covered;
}
