// linkStep executor (phase-intake-gate piece 3): turn the deterministic entity plan into DB writes that
// FEED the existing cross-reference graph — the reconnect that makes autonomous intake populate
// item_cross_references instead of leaving it to admin curation. Pure planning lives in entity-resolve.mjs;
// this only executes the plan. MOAT BOUNDARY: it writes ONLY item_cross_references + integrity_flags
// (asserted at runtime AND unit-proven with a failing mode) — never section_claim_provenance.
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/db/paginate.mjs";
import { planLinkWrites, assertMoatBoundary } from "@/lib/entities/entity-resolve.mjs";

interface CorpusRow { id: string; title: string | null; instrument_identifier: string | null }
interface LinkWrite { table: string; row: Record<string, unknown> }

export interface LinkResult { edges: number; surfaced: number; skipped: boolean }

/**
 * Wire an item's content-mentioned entities into item_cross_references (origin='entity_extraction',
 * relationship TYPED per classifyRelationship — WO-28/ADR-021) and surface ambiguous/unknown-standard
 * candidates + absent-parent lineage gaps to integrity_flags. Read-then-write, idempotent:
 *  - edges upsert on (source_item_id, target_item_id) — re-runs never duplicate.
 *  - each aggregated flag is created only when there is none open for this item IN ITS OWN created_by
 *    namespace ("intake-entity-link" for ambiguous/unknown mentions, "lineage-gap:absent-parent" for
 *    lineage-shaped mentions resolving to zero items) — no re-run spam, and the two flag kinds never
 *    clobber each other's open/closed state.
 * Deterministic (no LLM). Non-gating: a link failure never invalidates an already-grounded brief.
 */
export async function linkItems(sb: SupabaseClient, itemId: string): Promise<LinkResult> {
  // read-only corpus + this item's grounded content (brief + pool). PAGINATED (case-file 9): the corpus is the
  // entity-match target set — a truncated read past 1000 rows would silently drop cross-reference edges to any
  // entity living past the cap (Track B pushes the corpus well past 1000). Non-gating: on read failure, empty
  // corpus → no links this pass (a link failure never invalidates an already-grounded brief).
  let corpus: CorpusRow[] = [];
  try {
    corpus = (await fetchAllRows((from, to) =>
      sb
        .from("intelligence_items")
        .select("id,title,instrument_identifier")
        .eq("is_archived", false)
        .order("id", { ascending: true })
        .range(from, to)
    )) as CorpusRow[];
  } catch { corpus = []; }

  const { data: item } = await sb.from("intelligence_items").select("full_brief").eq("id", itemId).single();
  const { data: pool } = await sb.from("agent_run_searches").select("result_content").eq("intelligence_item_id", itemId);
  const content = `${(item as { full_brief?: string } | null)?.full_brief ?? ""} ${(pool ?? []).map((r: { result_content?: string }) => r.result_content ?? "").join(" ")}`;
  if (content.trim().length < 20) return { edges: 0, surfaced: 0, skipped: true };

  const writes: LinkWrite[] = planLinkWrites(content, corpus, itemId);
  assertMoatBoundary(writes); // runtime moat guard, in addition to the pure guard inside planLinkWrites

  let edges = 0;
  let surfaced = 0;
  for (const w of writes) {
    if (w.table === "item_cross_references") {
      const { error } = await sb.from("item_cross_references").upsert(w.row, { onConflict: "source_item_id,target_item_id", ignoreDuplicates: true });
      if (!error) edges++;
      else console.warn(`[linkStep] edge upsert failed for ${itemId}: ${error.message}`);
    } else if (w.table === "integrity_flags") {
      // idempotent: one open flag per item PER NAMESPACE (created_by) — the entity-link candidate flag
      // ("intake-entity-link") and the WO-28 lineage-gap flag ("lineage-gap:absent-parent") are separate
      // aggregations of separate signal, so each gets its own one-open-flag dedup rather than sharing one.
      const createdBy = String((w.row as { created_by?: unknown }).created_by ?? "");
      const { data: existing } = await sb.from("integrity_flags").select("id").eq("subject_ref", itemId).eq("created_by", createdBy).eq("status", "open").maybeSingle();
      if (!existing) { const { error } = await sb.from("integrity_flags").insert(w.row); if (!error) surfaced++; }
    }
  }
  return { edges, surfaced, skipped: false };
}
