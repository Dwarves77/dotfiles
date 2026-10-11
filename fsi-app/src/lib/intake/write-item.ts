import { scanBrief } from "../agent/gate-a-scan.mjs";

// ── item_gate_a_state ────────────────────────────────────────────────────────────────────────────────

interface GateAClaimInput {
  claim_text: string;
  source_span: string;
}

interface GateARow {
  intelligence_item_id: string;
  scanned_hash: string;
  orphan_count: number;
  orphans: unknown[];
  gate_a_version: string;
  scanned_at: string;
  [key: string]: unknown;
}

/**
 * The item_gate_a_state row BOTH tiers write, via the SAME live Gate-A scanner (src/lib/agent/
 * gate-a-scan.mjs -- scripts/mint/lib/gate-a-scan.mjs is a verbatim copy of this file kept for the mint
 * kit's own $0/no-DB validator, per that copy's own header; this module, living under src/, imports the
 * original directly rather than either copy). Pure -- no I/O. Callers MUST insert/upsert this row BEFORE
 * any claim write (see this file's header) so the set_provenance_status trigger the LAST claim write
 * fires always finds current gate-A state.
 */
export function buildGateARow({
  itemId,
  fullBrief,
  factClaims,
  derivedCovered = new Set<string>(),
  nowIso = new Date().toISOString(),
}: {
  itemId: string;
  fullBrief: string | null | undefined;
  factClaims: GateAClaimInput[];
  derivedCovered?: Set<string>;
  nowIso?: string;
}): GateARow {
  const ga = scanBrief(fullBrief ?? "", factClaims, derivedCovered);
  return {
    intelligence_item_id: itemId,
    scanned_hash: ga.scanned_hash,
    orphan_count: ga.orphan_count,
    orphans: ga.orphans,
    gate_a_version: ga.gate_a_version,
    scanned_at: nowIso,
  };
}

// ── intelligence_item_citations ─────────────────────────────────────────────────────────────────────

export interface CitationEdgeRow {
  intelligence_item_id: string;
  source_id: string;
  detected_at: string;
  origin: "agent_extraction";
  [key: string]: unknown;
}

/**
 * intelligence_item_citations edge rows for a DISTINCT set of cited source ids -- the item->source
 * grounding edges get_source_citation_stats (migration 098) reads. Pure; dedups, drops falsy ids. Both
 * tiers derive their cited-source-id set differently (record tier from its own claim rows' source_id;
 * brief tier from groundBrief's citedSourceIds accumulator) but the EDGE SHAPE is this one function,
 * everywhere.
 */
export function buildCitationEdges(
  itemId: string,
  sourceIds: Iterable<string | null | undefined>,
  nowIso: string = new Date().toISOString(),
): CitationEdgeRow[] {
  const dedup = new Set<string>();
  for (const id of sourceIds) if (id) dedup.add(id);
  return [...dedup].map((sourceId) => ({
    intelligence_item_id: itemId,
    source_id: sourceId,
    detected_at: nowIso,
    origin: "agent_extraction" as const,
  }));
}

/** buildCitationEdges specialized for a claim-rows array (record tier's own shape -- each row carries its
 *  own `source_id`, possibly null for a GAP/unsourced claim). */
export function buildCitationRows(
  itemId: string,
  claimRows: Array<{ source_id?: string | null }>,
  nowIso: string = new Date().toISOString(),
): CitationEdgeRow[] {
  return buildCitationEdges(itemId, claimRows.map((c) => c.source_id ?? null), nowIso);
}

// ── outcome classification ──────────────────────────────────────────────────────────────────────────

type MintOutcome = "minted_verified" | "minted_unverified";

/**
 * The pass/fail meaning of a FRESH read of intelligence_items.provenance_status, straight from the row --
 * never from an RPC's own returned valid/recommended_status (see this file's header: population-turn run
 * #8's exact bug). Both tiers call this on the SAME string so "verified" means the same outcome
 * everywhere.
 */
export function classifyMintOutcome(rowProvenanceStatus: string | null | undefined): MintOutcome {
  return rowProvenanceStatus === "verified" ? "minted_verified" : "minted_unverified";
}

// ── record-tier row builders (payload -> row[], used by the fresh-item write path) ─────────────────────
// A payload here is scripts/mint/payload-schema.json's shape (item{}, source{}, sections[],
// search_results[], claims[]). These builders + writeGroundingSequence are what
// scripts/mint/apply-mint-batch.mjs's applyOnePayload calls for the whole post-item-insert write; they
// have no brief-tier analogue (groundBrief re-derives its own claims via non-destructive diff/apply, not
// from a payload) -- kept here anyway so the row shapes stay next to the buildGateARow/buildCitationRows
// they share a table family with, and so apply-mint-batch.mjs need not hand-duplicate them.

interface MintPayload {
  item: {
    full_brief?: string | null;
    [key: string]: unknown;
  };
  source?: { id?: string; base_tier?: number | null; [key: string]: unknown } | null;
  sections?: Array<{ section_key: string; section_order: number; content_md: string; is_conditional?: boolean }>;
  search_results?: Array<{
    result_url: string;
    result_title?: string | null;
    result_content: string;
    result_index?: number;
    search_query?: string | null;
  }>;
  claims?: Array<{
    section_key: string;
    claim_kind: string;
    claim_text: string;
    source_span?: string | null;
    source_url?: string | null;
  }>;
  [key: string]: unknown;
}

interface AgentRunSearchRow {
  intelligence_item_id: string;
  search_query: string | null;
  result_url: string;
  result_title: string | null;
  result_index: number;
  result_content: string;
  searched_at: string;
  [key: string]: unknown;
}

/** agent_run_searches INSERT rows -- one per payload.search_results[] entry, result_content copied
 *  VERBATIM and in FULL (ADR-016: storage never caps; the column itself is TEXT with no length check). */
export function buildAgentRunSearchRows(
  payload: MintPayload,
  itemId: string,
  nowIso: string = new Date().toISOString(),
): AgentRunSearchRow[] {
  return (payload.search_results ?? []).map((r, i) => ({
    intelligence_item_id: itemId,
    search_query: r.search_query ?? null,
    result_url: r.result_url,
    result_title: r.result_title ?? null,
    result_index: typeof r.result_index === "number" ? r.result_index : i,
    result_content: r.result_content,
    searched_at: nowIso,
  }));
}

export interface SectionRow {
  item_id: string;
  section_key: string;
  section_order: number;
  content_md: string;
  is_conditional: boolean;
  [key: string]: unknown;
}

/** intelligence_item_sections INSERT rows -- one per payload.sections[] entry. */
export function buildSectionRows(payload: MintPayload, itemId: string): SectionRow[] {
  return (payload.sections ?? []).map((s) => ({
    item_id: itemId,
    section_key: s.section_key,
    section_order: s.section_order,
    content_md: s.content_md,
    is_conditional: !!s.is_conditional,
  }));
}

export interface ClaimRow {
  section_row_id: string | null;
  intelligence_item_id: string;
  claim_text: string;
  claim_kind: string;
  source_span: string | null;
  source_id: string | null;
  search_result_id: string | null;
  source_tier_at_grounding: number | null;
  [key: string]: unknown;
}

/**
 * section_claim_provenance INSERT rows. `search_result_id` MUST resolve to the just-inserted
 * agent_run_searches row a FACT claim's source_url names -- validate_item_provenance criterion 3
 * (migration 114) LEFT JOINs on exactly that column and treats a NULL join (missing/wrong
 * search_result_id) as `result_content_excerpt IS NULL`, i.e. an automatic fact_span_not_in_source
 * failure regardless of whether the span really is in some agent_run_searches row's content -- which is
 * why agent_run_searches must be inserted (and its ids known) BEFORE claims.
 */
export function buildClaimRows(
  payload: MintPayload,
  itemId: string,
  {
    sectionIdBySectionKey,
    searchIdByUrl,
    sourceId,
    sourceTier,
  }: {
    sectionIdBySectionKey: Map<string, string>;
    searchIdByUrl: Map<string, string>;
    sourceId: string | null;
    sourceTier: number | null;
  },
): ClaimRow[] {
  return (payload.claims ?? []).map((c) => {
    const isGroundedFact = c.claim_kind === "FACT" && !!c.source_span;
    const url = c.source_url ?? null;
    return {
      section_row_id: sectionIdBySectionKey.get(c.section_key) ?? null,
      intelligence_item_id: itemId,
      claim_text: c.claim_text,
      claim_kind: c.claim_kind,
      source_span: c.source_span ?? null,
      source_id: isGroundedFact && url ? sourceId : null,
      search_result_id: isGroundedFact && url ? (searchIdByUrl.get(url) ?? null) : null,
      source_tier_at_grounding: isGroundedFact ? (sourceTier ?? null) : null,
    };
  });
}

// ── writeGroundingSequence: the full guarded post-item-insert write, record tier's own call site ───────

interface GuardedInsertResult {
  inserted: unknown;
  snapshot?: string | null;
}
interface GuardedInsertManyResult {
  inserted: number;
  snapshot?: string | null;
  rows: Array<Record<string, unknown>>;
}
export interface Cite {
  skill: string;
  reason: string;
}
export interface WriteGroundingSequenceDeps {
  guardedInsert: (table: string, row: Record<string, unknown>, opts: { cite: Cite; select?: string }) => Promise<GuardedInsertResult>;
  guardedInsertMany: (
    table: string,
    rows: Array<Record<string, unknown>>,
    opts: { cite: Cite; select?: string },
  ) => Promise<GuardedInsertManyResult>;
  cite: Cite;
}
interface WriteGroundingSequenceResult {
  insSearches: GuardedInsertManyResult;
  insSections: GuardedInsertManyResult;
  insClaims: GuardedInsertManyResult;
  insCitations: GuardedInsertManyResult;
  claimRows: ClaimRow[];
}

const EMPTY_MANY: GuardedInsertManyResult = { inserted: 0, snapshot: null, rows: [] };

/**
 * The shared guarded write, in the ONE order (searches -> sections -> gate-A -> claims -> citations) that
 * both tiers must never invert (this file's header). Used by scripts/mint/apply-mint-batch.mjs's
 * applyOnePayload for the whole post-item-insert write; canonical-pipeline.ts's groundBrief does NOT call
 * this directly (its claims are a non-destructive diff/apply over an already-fetched pool, not a
 * payload's own claims[] array) but shares buildGateARow / buildCitationEdges / classifyMintOutcome above
 * for the pieces that DO generalize. No cleanup-on-failure here: the caller (apply-mint-batch.mjs) owns
 * the item row and its own cleanup-on-failure -- this function never sees or deletes the item row.
 */
export async function writeGroundingSequence(
  payload: MintPayload,
  itemId: string,
  sourceCtx: { sourceId: string | null; sourceTier: number | null },
  deps: WriteGroundingSequenceDeps,
): Promise<WriteGroundingSequenceResult> {
  const searchRows = buildAgentRunSearchRows(payload, itemId);
  const insSearches = searchRows.length
    ? await deps.guardedInsertMany("agent_run_searches", searchRows, { cite: deps.cite, select: "id, result_url" })
    : EMPTY_MANY;
  const searchIdByUrl = new Map<string, string>(
    (insSearches.rows ?? []).map((r) => [r.result_url as string, r.id as string]),
  );

  const sectionRows = buildSectionRows(payload, itemId);
  const insSections = sectionRows.length
    ? await deps.guardedInsertMany("intelligence_item_sections", sectionRows, { cite: deps.cite, select: "id, section_key" })
    : EMPTY_MANY;
  const sectionIdBySectionKey = new Map<string, string>(
    (insSections.rows ?? []).map((r) => [r.section_key as string, r.id as string]),
  );

  // GATE A BEFORE THE CLAIMS -- see this file's header. The claim inserts are the last writes that fire
  // set_provenance_status; criterion 7 must find the gate row when they do.
  const factClaims = (payload.claims ?? [])
    .filter((c) => c.claim_kind === "FACT")
    .map((c) => ({ claim_text: c.claim_text ?? "", source_span: c.source_span ?? "" }));
  const gateARow = buildGateARow({ itemId, fullBrief: payload.item?.full_brief, factClaims });
  await deps.guardedInsert("item_gate_a_state", gateARow, { cite: deps.cite, select: "intelligence_item_id" });

  const claimRows = buildClaimRows(payload, itemId, {
    sectionIdBySectionKey,
    searchIdByUrl,
    sourceId: sourceCtx.sourceId,
    sourceTier: sourceCtx.sourceTier,
  });
  const insClaims = claimRows.length
    ? await deps.guardedInsertMany("section_claim_provenance", claimRows, { cite: deps.cite, select: "id" })
    : EMPTY_MANY;

  const citationRows = buildCitationRows(itemId, claimRows);
  const insCitations = citationRows.length
    ? await deps.guardedInsertMany("intelligence_item_citations", citationRows, { cite: deps.cite, select: "id" })
    : EMPTY_MANY;

  return { insSearches, insSections, insClaims, insCitations, claimRows };
}
