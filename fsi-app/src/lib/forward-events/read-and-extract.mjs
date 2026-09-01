// read-and-extract.mjs — the shared DB-reading driver around extract-forward-events.mjs's pure extractor.
// extract-forward-events.mjs itself stays pure ("Pure, deterministic, $0, no-LLM module" — its own
// header) by design: no DB, no I/O, testable on plain fixtures. This module is the non-pure counterpart —
// the read-back-grounded-content-then-extract sequence every rule-16(b) participant needs — so mint-item.ts
// (mint time) and apply-staged-update.ts (substantive-update time) run the exact same read shape rather
// than each hand-copying the section_claim_provenance / intelligence_item_sections read + row-mapping.
//
// MOVED HERE (lane FIX, 2026-09-01) from mint-item.ts's own post-insert block. Content and behavior for
// the mint caller are UNCHANGED by this move (same two-query Promise.all, same claim-kind filter, same
// row shape fed to extractForwardEvents) — verified by mint-forward-participation.npmtest.mjs, which
// exercises this exact read+extract sequence unmodified.
//
// Throws on a read error (never swallows) so both callers' identical try/catch + recordFlywheelDefect
// (rule 16d) posture keeps working unchanged — this module is not the place that decides "non-fatal."
import { extractForwardEvents } from "./extract-forward-events.mjs";

/**
 * Read one item's already-grounded FACT/GAP claims and rendered sections, and run the pure extractor
 * over them.
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} itemId
 * @returns {Promise<{events: object[], skipped: object[], claims: object[], sections: object[]}>}
 *   `claims`/`sections` are the exact (id-bearing) inputs fed to the extractor — returned alongside
 *   events/skipped so a caller that needs to know WHICH claims/sections currently exist for this item
 *   (e.g. apply-staged-update.ts's stale-events check: does an existing item_forward_events row's
 *   source_claim_id/source_section_id still appear here) never issues a second, duplicate read.
 */
export async function readAndExtractForwardEvents(sb, itemId) {
  const [{ data: claimRows, error: claimErr }, { data: sectionRows, error: sectionErr }] = await Promise.all([
    sb
      .from("section_claim_provenance")
      .select("id, claim_kind, claim_text, source_span")
      .eq("intelligence_item_id", itemId)
      .in("claim_kind", ["FACT", "GAP"]),
    sb.from("intelligence_item_sections").select("id, section_key, content_md").eq("item_id", itemId),
  ]);
  if (claimErr) throw new Error(`section_claim_provenance read failed: ${claimErr.message}`);
  if (sectionErr) throw new Error(`intelligence_item_sections read failed: ${sectionErr.message}`);

  const claims = (claimRows ?? []).map((r) => ({
    claim_id: r.id,
    kind: r.claim_kind,
    text: r.claim_text,
    span: r.source_span ?? null,
  }));
  const sections = (sectionRows ?? []).map((r) => ({
    section_id: r.id,
    key: r.section_key,
    md: r.content_md ?? "",
  }));

  const { events, skipped } = extractForwardEvents({ claims, sections });
  return { events, skipped, claims, sections };
}
