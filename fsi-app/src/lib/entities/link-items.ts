// SHARED-WRITER: item_cross_references, integrity_flags
// linkStep executor (phase-intake-gate piece 3): turn the deterministic entity plan into DB writes that
// FEED the existing cross-reference graph — the reconnect that makes autonomous intake populate
// item_cross_references instead of leaving it to admin curation. Pure planning lives in entity-resolve.mjs;
// this only executes the plan. MOAT BOUNDARY: it writes ONLY item_cross_references + integrity_flags
// (asserted at runtime AND unit-proven with a failing mode) — never section_claim_provenance.
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/db/paginate.mjs";
import { planLinkWrites, assertMoatBoundary } from "@/lib/entities/entity-resolve.mjs";
import { partitionLineageWrites, pairKey } from "@/lib/entities/lineage-backfill.mjs";

interface CorpusRow { id: string; title: string | null; instrument_identifier: string | null }
interface LinkWrite { table: string; row: Record<string, unknown> }
interface ExistingEdge { id: string; source_item_id: string; target_item_id: string; origin: string; relationship: string; basis?: unknown }

export interface LinkResult {
  /** edges written (inserted + upgraded); in dry mode, the number that WOULD be written. */
  edges: number;
  surfaced: number;
  skipped: boolean;
  /** s2a-typed-edges: partitionLineageWrites outcome counts, reported never silent. */
  inserted: number;
  upgraded: number;
  skippedForeign: number;
  /** a foreign-origin row already holds a DIFFERENT typed relationship: reported, never written (ADR-022). */
  conflicts: number;
  unchanged: number;
  /** of inserted + upgraded, how many carry a lineage type (a relationship other than 'related'). */
  typed: number;
  dry: boolean;
}

export interface LinkOptions {
  /** Plan and count everything, write nothing (reads still run). */
  dry?: boolean;
  /** Text to read INSTEAD of the item's stored full_brief + grounding pool (mint-time: the seed's own
   *  text; the dry brief-apply preview: the entry body that is about to be written). */
  content?: string;
  /** Resolution corpus, when the caller already holds one (mint reads one for dedup). Must carry the item
   *  itself so a self-title lineage signal resolves; defaults to the paginated non-archived read. */
  corpus?: CorpusRow[];
}

const NOTHING: LinkResult = { edges: 0, surfaced: 0, skipped: true, inserted: 0, upgraded: 0, skippedForeign: 0, conflicts: 0, unchanged: 0, typed: 0, dry: false };

/**
 * Wire an item's content-mentioned entities into item_cross_references (origin='entity_extraction',
 * relationship TYPED per classifyRelationship — WO-28/ADR-021) and surface ambiguous/unknown-standard
 * candidates + absent-parent lineage gaps to integrity_flags. Read-then-write, idempotent:
 *  - edges are partitioned against the item's EXISTING edges by partitionLineageWrites, the one reference
 *    implementation (never reimplemented here), which follows ADR-022: an absent pair is inserted; a generic
 *    'related' row of any machine origin is upgraded to the typed relationship ADDITIVELY (basis appended,
 *    origin and score kept); a 'manual' row is never changed; a foreign row already holding a different
 *    typed relationship is reported as a conflict and not written; an identical pair is a no-op. (Before
 *    lane s2a-typed-edges this was an ignore-duplicates upsert, so a later, more specific classification
 *    could never replace an earlier untyped 'related' edge.)
 *  - each aggregated flag is created only when there is none open for this item IN ITS OWN created_by
 *    namespace ("intake-entity-link" for ambiguous/unknown mentions, "lineage-gap:absent-parent" for
 *    lineage-shaped mentions resolving to zero items) — no re-run spam, and the two flag kinds never
 *    clobber each other's open/closed state.
 * Deterministic (no LLM). Non-gating: a link failure never invalidates an already-grounded brief.
 * Dry mode (opts.dry) computes the same plan and every count and writes nothing.
 */
export async function linkItems(sb: SupabaseClient, itemId: string, opts: LinkOptions = {}): Promise<LinkResult> {
  const dry = opts.dry === true;

  // This item's text first: a short or empty text returns before any corpus read, so a mint-time hop on an
  // item with nothing to read costs no query at all.
  let content = opts.content;
  if (content === undefined) {
    const { data: item } = await sb.from("intelligence_items").select("full_brief").eq("id", itemId).single();
    const { data: pool } = await sb.from("agent_run_searches").select("result_content").eq("intelligence_item_id", itemId);
    content = `${(item as { full_brief?: string } | null)?.full_brief ?? ""} ${(pool ?? []).map((r: { result_content?: string }) => r.result_content ?? "").join(" ")}`;
  }
  if (content.trim().length < 20) return { ...NOTHING, dry };

  // read-only corpus. PAGINATED (case-file 9): the corpus is the entity-match target set, so a truncated read
  // past 1000 rows would silently drop cross-reference edges to any entity living past the cap. Non-gating:
  // on read failure, empty corpus → no links this pass (a link failure never invalidates a grounded brief).
  let corpus: CorpusRow[] = opts.corpus ?? [];
  if (!opts.corpus) {
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
  }

  const writes: LinkWrite[] = planLinkWrites(content, corpus, itemId);
  assertMoatBoundary(writes); // runtime moat guard, in addition to the pure guard inside planLinkWrites

  // existing edges of THIS item (source side), read only when the plan carries an edge to place.
  const edgeWrites = writes.filter((w) => w.table === "item_cross_references");
  const existing = new Map<string, ExistingEdge>();
  if (edgeWrites.length) {
    const rows = (await fetchAllRows((from, to) =>
      sb
        .from("item_cross_references")
        .select("id,source_item_id,target_item_id,origin,relationship,basis")
        .eq("source_item_id", itemId)
        .order("id", { ascending: true })
        .range(from, to)
    )) as ExistingEdge[];
    for (const r of rows) existing.set(pairKey(r.source_item_id, r.target_item_id), r);
  }
  const { inserts, upgrades, skippedForeign, conflicts, unchanged } = partitionLineageWrites(edgeWrites, existing) as {
    inserts: Array<Record<string, unknown> & { relationship: string }>;
    upgrades: Array<{ id: string; relationship: string; basis: unknown }>;
    skippedForeign: unknown[];
    conflicts: unknown[];
    unchanged: unknown[];
  };
  const typed = [...inserts, ...upgrades].filter((r) => r.relationship !== "related").length;

  let edges = inserts.length + upgrades.length; // dry: what WOULD be written
  let surfaced = 0;

  if (!dry) {
    edges = 0;
    if (inserts.length) {
      // ignoreDuplicates: a concurrent writer that landed the pair first wins (origin ownership), never overwritten
      const { error } = await sb.from("item_cross_references").upsert(inserts, { onConflict: "source_item_id,target_item_id", ignoreDuplicates: true });
      if (!error) edges += inserts.length;
      else console.warn(`[linkStep] edge insert failed for ${itemId}: ${error.message}`);
    }
    for (const u of upgrades) {
      // ADR-022 clause 2: the patch is relationship + the ADDITIVELY merged basis; origin and score are never in it
      const { error } = await sb.from("item_cross_references").update({ relationship: u.relationship, basis: u.basis }).eq("id", u.id);
      if (!error) edges++;
      else console.warn(`[linkStep] edge upgrade failed for ${itemId}: ${error.message}`);
    }
  }

  for (const w of writes) {
    if (w.table !== "integrity_flags") continue;
    // idempotent: one open flag per item PER NAMESPACE (created_by): the entity-link candidate flag
    // ("intake-entity-link") and the WO-28 lineage-gap flag ("lineage-gap:absent-parent") are separate
    // aggregations of separate signal, so each gets its own one-open-flag dedup rather than sharing one.
    const createdBy = String((w.row as { created_by?: unknown }).created_by ?? "");
    const { data: openFlag } = await sb.from("integrity_flags").select("id").eq("subject_ref", itemId).eq("created_by", createdBy).eq("status", "open").maybeSingle();
    if (openFlag) continue;
    if (dry) { surfaced++; continue; }
    const { error } = await sb.from("integrity_flags").insert(w.row);
    if (!error) surfaced++;
  }

  return { edges, surfaced, skipped: false, inserted: inserts.length, upgraded: upgrades.length, skippedForeign: skippedForeign.length, conflicts: conflicts.length, unchanged: unchanged.length, typed, dry };
}
