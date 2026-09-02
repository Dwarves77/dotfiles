#!/usr/bin/env node
// apply-mint-batch.mjs — the coordinator-apply step for a --census-rows record-grade mint batch (Lane
// POP, 2026-09-02). Takes the `<basename>.apply-ready.json` run-mint-batch.mjs --census-rows --grade
// record --execute already wrote (validator-green payloads only), applies each through the SAME guarded
// write path every mint batch before it used (MINT-RUNBOOK.md's "zero DB writes from a mint lane" rule:
// run-mint-batch.mjs itself never writes to Supabase; this IS the coordinator-apply step that finally
// does, exactly the hand-off MINT-RUNBOOK.md §6/§7 describe), and enriches that batch's existing
// scripts/harness-runs/mint/mint-run-NNN.json artifact with the outcome (mint-run-006.json's own
// per_item/db_deltas shape, reproduced here, not reinvented).
//
// ── WRITE PATH: WHY NOT mintIntelligenceItem() (src/lib/intake/mint-item.ts) ────────────────────────
// The task instructions for this lane said: try mintIntelligenceItem() FIRST, and fall back to a direct
// guarded-db write in canonical-pipeline.ts's insert order only if `MintPlan` cannot carry the payload's
// sections/claims/search_results. It cannot, by inspection of that file itself:
//   - `MintPlan` (mint-item.ts lines 59-81) has exactly five fields: `seed` (the intelligence_items ROW
//     to insert), `legacyId`, `relevance`, `origin`, `grade`. There is no field anywhere in the interface
//     for sections[], claims[], or search_results[] — a payload's entire evidentiary body (payload-
//     schema.json's required top-level keys `sections`, `search_results`, `claims`) has no home in it.
//   - mint-item.ts's own module header (lines 15-20) states the boundary explicitly: "MOAT BOUNDARY:
//     this writes intelligence_items ... item_cross_references ... integrity_flags ... and ...
//     item_forward_events. It NEVER writes section_claim_provenance — extraction/links never ground reg
//     facts; it only READS that table."
// So mintIntelligenceItem() cannot rehydrate a mint payload end to end — calling it would insert a bare
// intelligence_items shell and leave every claim, section, and search result behind. This script instead
// writes in the canonical-pipeline.ts insert order: intelligence_items -> agent_run_searches ->
// intelligence_item_sections -> item_gate_a_state -> section_claim_provenance -> intelligence_item_citations,
// then `rpc("validate_item_provenance", ...)` (around line 1873). GATE A BEFORE THE CLAIMS is the part
// that matters and the part this script first got wrong (population-turn run #8, 2026-09-02, the first
// live apply: 10 items minted, every one `quarantined`): canonical-pipeline.ts ~line 1733 upserts
// item_gate_a_state "BEFORE applyLedgerDiff's claim writes fire the set_provenance_status trigger, so
// criterion 7 (missing/stale state ...) sees" it. The trigger fires on section and claim INSERTs (live:
// set_provenance_status_sections_trg / set_provenance_status_claims_trg) and on nothing after them —
// item_gate_a_state and intelligence_item_citations carry no trigger — so the LAST claim insert is the
// derivation that sticks. With the gate written after the claims, that derivation saw no gate row,
// stamped `quarantined`, and nothing ever re-derived; `rpc("validate_item_provenance")` afterwards
// reported `verified` (it is a pure function) and the artifact recorded `minted_verified` against a
// quarantined row. The outcome now reads the ROW's provenance_status back, never the RPC alone. Through
// scripts/lib/db.mjs's guarded functions (cite + snapshot + read-back, same as every other guarded
// script in this repo) — the SAME thing mint-run-005/006's own coordinator-apply pass did (raw guarded
// writes, "write_plan": "batch-001 write order + two additions", never through mint-item.ts). This is
// NOT an F13 (single-mint-chokepoint) violation: F13's own scope comment restricts it to
// `fsi-app/src/**/*.{ts,tsx,mjs}`, "EXCLUDING ... Scripts (fsi-app/scripts/**) are one-shot tools, out of
// runtime scope" (.discipline/fitness/functions/F13-single-mint-chokepoint.mjs) — a coordinator-apply
// script writing intelligence_items directly is exactly the shape F13 already carves out.
//
// One consequence, named honestly: mint-item.ts's rule-16 post-insert participation (connection discovery
// + forward-event extraction, both run unconditionally inside that chokepoint) does NOT run here.
// MINT-RUNBOOK.md §8 already treats discovery + forward-event extraction as a SEPARATE, later,
// post-apply pass over the newly-minted items ("Steps 1-2 above happen in a DIFFERENT turn than the mint
// batch itself") — this script's job ends at "the item exists, is grounded, and its provenance verdict
// is recorded", matching that runbook's own hand-off model. This gap is recorded in every run's
// `proposer_notes`, not silently absorbed.
//
// ── M4 pre-check ─────────────────────────────────────────────────────────────────────────────────────
// Before writing anything for a payload: does ANY intelligence_items row (archived included) already
// hold its canonical_instrument_key, or already sit at its source_url? See checkM4 below — mirrors
// mint-run-006.json's own M4 pre-check outcomes (`not_applied_holder_conflict`) plus the WO-26 disposition
// stamp-wo26-archive-reason.mjs makes legible (`not_applied_wo26_excluded`) and a same-URL holder
// (`not_applied_url_holder`, the case M4 as documented in mint-run-006 did not need to separately name
// because none of that batch's rows collided on URL — this batch may).
//
// ── census_worklist resolution ───────────────────────────────────────────────────────────────────────
// Migration 221's enumeration_status ladder is `discovered < classified < dry_run_complete < reconciled`
// (plus `flagged`, reachable from/to anywhere). mint-run-006.json's own metrics carry
// `"census_rows_reconciled": 5` — the live precedent for "resolved" is `enumeration_status = 'reconciled'`,
// stamped ONLY on a row whose payload actually minted an item (a not_applied_* row is left UNRECONCILED,
// exactly as mint-run-006's own per_item evidence says for its three holder-conflict rows: "census row
// left UNRECONCILED pending operator archived-holder policy" — this script reproduces that posture, not a
// new one).
//
// DRY (default): computes and prints the full plan for every payload — M4 disposition, whether its
// source needs inline registration, and the row/section/claim/search counts it would write — and writes
// NOTHING: no DB write, no census_worklist stamp, and no mint-run artifact enrichment either (an
// enrichment IS a write, to the committed artifact file). --apply performs the real guarded writes.
//
// USAGE:
//   node scripts/mint/apply-mint-batch.mjs --apply-ready path/to/batch.apply-ready.json \
//        --census-rows path/to/census-rows.json --mint-run scripts/harness-runs/mint/mint-run-NNN.json \
//        [--apply]

import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { scanBrief } from "./lib/gate-a-scan.mjs";
import { writeRunArtifact, validateRunArtifact } from "../lib/run-artifact.mjs";
// Relative .ts import, native Node type-stripping (same precedent as scripts/lib/db.mjs's own import of
// classify-source-role.ts) — no bundler, no jiti. domainForItemType is pure (name+category in, int out).
import { domainForItemType } from "../../src/lib/domains.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..");

// ── M4 pre-check ─────────────────────────────────────────────────────────────────────────────────────

/** Build the two lookup indexes checkM4 needs from a live intelligence_items read (id, source_url,
 *  canonical_instrument_key, archive_reason — archived rows INCLUDED, per M4's own charter). Pure. */
export function buildItemsIndex(items) {
  const byCanonicalKey = new Map();
  const bySourceUrl = new Map();
  for (const it of items ?? []) {
    if (it.canonical_instrument_key) {
      const arr = byCanonicalKey.get(it.canonical_instrument_key) ?? [];
      arr.push(it);
      byCanonicalKey.set(it.canonical_instrument_key, arr);
    }
    if (it.source_url) bySourceUrl.set(it.source_url, it);
  }
  return { byCanonicalKey, bySourceUrl };
}

/** The M4 pre-check itself. Pure. Canonical-key holder checked first (the identity collision); a
 *  same-source_url holder second (a different/absent key naming the same document). Neither check writes
 *  anything — a blocked payload is simply never attempted. */
export function checkM4(payload, itemsIndex) {
  const key = payload?.item?.canonical_instrument_key ?? null;
  if (key) {
    const holders = itemsIndex.byCanonicalKey.get(key) ?? [];
    if (holders.length) {
      const holder = holders[0];
      if (holder.archive_reason === "out_of_scope_wo26") {
        return { blocked: true, outcome: "not_applied_wo26_excluded", holderId: holder.id };
      }
      return { blocked: true, outcome: "not_applied_holder_conflict", holderId: holder.id };
    }
  }
  const sourceUrl = payload?.item?.source_url ?? null;
  if (sourceUrl) {
    const holder = itemsIndex.bySourceUrl.get(sourceUrl);
    if (holder) {
      return { blocked: true, outcome: "not_applied_url_holder", holderId: holder.id };
    }
  }
  return { blocked: false };
}

// ── census_worklist row resolution ──────────────────────────────────────────────────────────────────

/** Map a --census-rows file's rows to a Set of their row_id (census_worklist.id) values, for matching
 *  against a payload's own `id` — run-mint-batch.mjs's buildPayloadsFromCensusRows stamps
 *  `payload.id = String(row.row_id ?? canonical_instrument_key ?? instrument_identifier ?? source_url ??
 *  index)`, so a payload traces back to its census_worklist row ONLY when row_id was actually present and
 *  therefore became that payload's id verbatim. Pure. */
export function censusRowIdSet(censusRows) {
  return new Set((censusRows ?? []).map((r) => r?.row_id).filter((v) => typeof v === "string" && v.length > 0));
}

/** Resolve a payload back to its census_worklist row id, or null when untraceable (a payload whose id
 *  fell back to a canonical key/identifier/URL, never a real row_id). Pure. */
export function resolveCensusRowId(payload, rowIdSet) {
  const id = payload?.id;
  return typeof id === "string" && rowIdSet.has(id) ? id : null;
}

// ── row builders (pure; every field traced to a specific payload-schema.json input) ────────────────

/** intelligence_items INSERT row. `domain` is the caller's pre-resolved value (domainForItemType) so this
 *  function stays a pure mapping with no import-time dependency. `provenance_status` is deliberately
 *  OMITTED — the column DEFAULTs to 'unverified' and migration 115's set_provenance_status AFTER trigger
 *  (INSERT/UPDATE on intelligence_items/intelligence_item_sections/section_claim_provenance) re-derives
 *  it via validate_item_provenance on every write in this same sequence; migration 118's provenance-flip
 *  binding carves out exactly this case (a genuine new-row INSERT-origin derivation, depth>=1, is allowed
 *  for the unrestricted service-role key — only a RECONCILIATION flip of a pre-existing row needs the
 *  bound `reconciler` credential). This script never sets provenance_status itself, the same way
 *  canonical-pipeline.ts's own ground() never does. */
export function buildIntelligenceItemRow(payload, { sourceId, domain }) {
  const item = payload.item;
  return {
    title: item.title,
    domain,
    item_type: item.item_type,
    source_id: sourceId,
    source_url: item.source_url,
    priority: item.priority ?? "MODERATE",
    full_brief: item.full_brief,
    instrument_identifier: item.instrument_identifier ?? null,
    canonical_instrument_key: item.canonical_instrument_key ?? null,
    jurisdiction_iso: item.jurisdiction_iso ? [item.jurisdiction_iso] : [],
    item_grade: item.grade ?? "record",
  };
}

/** agent_run_searches INSERT rows — one per payload.search_results[] entry, `result_content` copied
 *  VERBATIM and in FULL (ADR-016: storage never caps; the column itself is TEXT with no length check). */
export function buildAgentRunSearchRows(payload, itemId, nowIso = new Date().toISOString()) {
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

/** intelligence_item_sections INSERT rows — one per payload.sections[] entry. */
export function buildSectionRows(payload, itemId) {
  return (payload.sections ?? []).map((s) => ({
    item_id: itemId,
    section_key: s.section_key,
    section_order: s.section_order,
    content_md: s.content_md,
    is_conditional: !!s.is_conditional,
  }));
}

/**
 * section_claim_provenance INSERT rows. `search_result_id` MUST resolve to the just-inserted
 * agent_run_searches row a FACT claim's source_url names — validate_item_provenance criterion 3
 * (migration 114) LEFT JOINs on exactly that column and treats a NULL join (missing/wrong
 * search_result_id) as `result_content_excerpt IS NULL`, i.e. an automatic `fact_span_not_in_source`
 * failure, REGARDLESS of whether the span really is in some agent_run_searches row's content. This is why
 * agent_run_searches must be inserted (and its ids known) BEFORE claims, matching both the task's
 * directed table order and canonical-pipeline.ts's own.
 * @param {{sectionIdBySectionKey: Map<string,string>, searchIdByUrl: Map<string,string>, sourceId: string, sourceTier: number|null}} ctx
 */
export function buildClaimRows(payload, itemId, { sectionIdBySectionKey, searchIdByUrl, sourceId, sourceTier }) {
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
      source_tier_at_grounding: isGroundedFact ? sourceTier ?? null : null,
    };
  });
}

/** intelligence_item_citations INSERT rows — one per DISTINCT source_id any inserted claim actually cites
 *  (origin='agent_extraction', matching canonical-pipeline.ts's own tag for grounding-time citation
 *  edges — B#2 in that file). A record-grade payload cites exactly its own source, so this is at most one
 *  row; the general form still dedupes correctly if that ever changes. */
export function buildCitationRows(itemId, claimRows, nowIso = new Date().toISOString()) {
  const cited = new Set();
  for (const c of claimRows) if (c.source_id) cited.add(c.source_id);
  return [...cited].map((sourceId) => ({
    intelligence_item_id: itemId,
    source_id: sourceId,
    detected_at: nowIso,
    origin: "agent_extraction",
  }));
}

/** item_gate_a_state row — computed via THE live Gate-A scanner (scripts/mint/lib/gate-a-scan.mjs, a
 *  verbatim copy of src/lib/agent/gate-a-scan.mjs, both listed in run-mint-batch.mjs's own
 *  MINT_GOVERNING_FILES), exactly the same function canonical-pipeline.ts's own ground() step calls.
 *  Record-tier-population-plan-2026-09-01.md §2 asserts this passes "by construction" (full_brief is
 *  built ONLY from claims' own claim_text); this call is what actually measures that, never assumes it. */
export function computeGateAState(payload, itemId, nowIso = new Date().toISOString()) {
  const claims = payload.claims ?? [];
  const factClaims = claims
    .filter((c) => c.claim_kind === "FACT")
    .map((c) => ({ claim_text: c.claim_text ?? "", source_span: c.source_span ?? "" }));
  const ga = scanBrief(payload.item.full_brief ?? "", factClaims, new Set());
  return {
    intelligence_item_id: itemId,
    scanned_hash: ga.scanned_hash,
    orphan_count: ga.orphan_count,
    orphans: ga.orphans,
    gate_a_version: ga.gate_a_version,
    scanned_at: nowIso,
  };
}

// ── mint run artifact enrichment (pure) ─────────────────────────────────────────────────────────────

/** Deep-add two db_deltas objects (mint-run-006.json's own metrics.db_deltas shape: items/sections/
 *  claims/searches/gate_a/citations/sources/open_dq_flags_delta). Pure. */
function addDbDeltas(a, b) {
  const out = { ...(a ?? {}) };
  for (const [k, v] of Object.entries(b ?? {})) out[k] = (out[k] ?? 0) + v;
  return out;
}

/**
 * Enrich an EXISTING, schema-valid mint run artifact with this apply run's outcomes. Pure — never
 * mutates its input, never touches the filesystem (the caller decides whether/where to write). Merges
 * `per_item` by id (an entry this apply pass reports for an id already present REPLACES it — the
 * apply-ready payload's own `apply_ready` per_item entry from run-mint-batch.mjs's execution becomes this
 * richer post-apply outcome; an id not previously present is appended) and additively merges
 * `metrics.db_deltas`, while every OTHER metrics key is a last-write-wins patch (matching
 * enrichRunArtifactMetrics's own posture in run-mint-batch.mjs, reused in spirit though not imported —
 * that function replaces `metrics` wholesale via spread, which would silently discard mint-run-006-shaped
 * pre-existing keys this call does not repeat; this version is additive specifically so a batch's
 * ALREADY-recorded metrics.attempted/valid/etc. from its --census-rows run survive an apply enrichment).
 * `writeRunArtifact`'s own schema check (imported, not re-implemented) is what a caller should run over
 * the result before writing — see run() below.
 */
export function enrichMintRunArtifact(artifact, { perItemPatches = [], metricsPatch = {}, defectsToAppend = [], proposerNoteAppend = null } = {}) {
  const perItemById = new Map((artifact.per_item ?? []).map((p) => [p.id, p]));
  for (const patch of perItemPatches) {
    const existing = perItemById.get(patch.id);
    perItemById.set(patch.id, existing ? { ...existing, ...patch } : patch);
  }
  const metrics = { ...(artifact.metrics ?? {}) };
  for (const [k, v] of Object.entries(metricsPatch)) {
    metrics[k] = k === "db_deltas" ? addDbDeltas(metrics.db_deltas, v) : v;
  }
  return {
    ...artifact,
    per_item: [...perItemById.values()],
    metrics,
    defects_found: [...(artifact.defects_found ?? []), ...defectsToAppend],
    proposer_notes: proposerNoteAppend
      ? `${artifact.proposer_notes ?? ""}\n\n${proposerNoteAppend}`.trim()
      : artifact.proposer_notes,
  };
}

// ── per-payload orchestration ───────────────────────────────────────────────────────────────────────

const DB_DELTA_ZERO = Object.freeze({ items: 0, sections: 0, claims: 0, searches: 0, gate_a: 0, citations: 0, sources: 0 });

/**
 * Apply (or, in dry mode, plan) ONE payload. Returns { perItem, dbDeltas, censusStamped }.
 * `ctx`: { db: {guardedInsert, guardedInsertMany, guardedUpdate, guardedDelete, registerSource, readItemProvenance}, rpc, itemsIndex
 * (mutated in place on a successful apply so later payloads in the SAME batch see this one as a holder),
 * sourcesById (Map, mutated on inline registration), rowIdSet, cite, apply (bool) }.
 */
export async function applyOnePayload(payload, ctx) {
  const id = payload?.id ?? "(no id)";
  const m4 = checkM4(payload, ctx.itemsIndex);
  if (m4.blocked) {
    return {
      perItem: { id, outcome: m4.outcome, holder_item_id: m4.holderId, evidence_refs: [], error: null },
      dbDeltas: DB_DELTA_ZERO,
      censusStamped: false,
    };
  }

  // ── source resolution ────────────────────────────────────────────────────────────────────────────
  let sourceId = payload.source?.id ?? null;
  const knownSource = sourceId ? ctx.sourcesById.get(sourceId) : null;
  const needsRegistration = !sourceId || !knownSource || knownSource.status !== "active";
  let sourcesDelta = 0;

  if (!ctx.apply) {
    return {
      perItem: {
        id,
        outcome: needsRegistration ? "would_apply_new_source" : "would_apply",
        verdict:
          `plan: ${payload.sections?.length ?? 0} section(s), ${payload.claims?.length ?? 0} claim(s), ` +
          `${payload.search_results?.length ?? 0} search result(s)` +
          (needsRegistration ? `; source ${payload.source?.url ?? "(unknown)"} would be registered inline` : ""),
        evidence_refs: [],
        error: null,
      },
      dbDeltas: DB_DELTA_ZERO,
      censusStamped: false,
    };
  }

  if (needsRegistration) {
    const reg = await ctx.db.registerSource(
      {
        url: payload.source?.url ?? payload.item.source_url,
        name: payload.source?.name ?? null,
        base_tier: payload.source?.base_tier ?? undefined,
        source_role: payload.source?.source_role ?? undefined,
      },
      { cite: ctx.cite },
    );
    sourceId = reg.source_id;
    ctx.sourcesById.set(sourceId, { id: sourceId, url: payload.source?.url ?? payload.item.source_url, status: "active", category: payload.source?.category ?? null });
    if (reg.created) sourcesDelta = 1;
  }
  const sourceRow = ctx.sourcesById.get(sourceId) ?? {};

  // ── the write sequence itself (canonical-pipeline.ts order) ─────────────────────────────────────
  const domain = domainForItemType(payload.item.item_type, sourceRow.category ?? null);
  if (domain == null) {
    return {
      perItem: { id, outcome: "not_applied_domain_unresolved", evidence_refs: [], error: `domainForItemType(${payload.item.item_type}, ${sourceRow.category}) -> null` },
      dbDeltas: DB_DELTA_ZERO,
      censusStamped: false,
    };
  }

  const itemRow = buildIntelligenceItemRow(payload, { sourceId, domain });
  const insItem = await ctx.db.guardedInsert("intelligence_items", itemRow, { cite: ctx.cite, select: "id, source_url, canonical_instrument_key, archive_reason" });
  const itemId = insItem.inserted.id;

  // Everything after the item row is one unit: a failure part-way (run #8: an agent_run_searches insert
  // refused by Postgres — "unsupported Unicode escape sequence", a U+0000 in a Federal Register raw text)
  // must not abort the batch AND must not leave a bare item behind (that run left one: no sections, no
  // claims, `quarantined`, sitting in the corpus as a real row). There is no transaction across REST
  // calls, so the compensation is explicit: delete the partial item through the guarded path (every
  // child table FKs to intelligence_items ON DELETE CASCADE — checked live 2026-09-02), record
  // `apply_failed` with the error and whether the cleanup succeeded, and let the loop continue.
  let insSearches, insSections, insClaims, insCitations, claimRows;
  try {
    const searchRows = buildAgentRunSearchRows(payload, itemId);
    insSearches = searchRows.length
      ? await ctx.db.guardedInsertMany("agent_run_searches", searchRows, { cite: ctx.cite, select: "id, result_url" })
      : { inserted: 0, rows: [] };
    const searchIdByUrl = new Map((insSearches.rows ?? []).map((r) => [r.result_url, r.id]));

    const sectionRows = buildSectionRows(payload, itemId);
    insSections = sectionRows.length
      ? await ctx.db.guardedInsertMany("intelligence_item_sections", sectionRows, { cite: ctx.cite, select: "id, section_key" })
      : { inserted: 0, rows: [] };
    const sectionIdBySectionKey = new Map((insSections.rows ?? []).map((r) => [r.section_key, r.id]));

    // Gate A BEFORE the claims — see this file's header. The claim inserts are the last writes that
    // fire set_provenance_status; criterion 7 must find the gate row when they do.
    const gateARow = computeGateAState(payload, itemId);
    await ctx.db.guardedInsert("item_gate_a_state", gateARow, { cite: ctx.cite, select: "intelligence_item_id" });

    claimRows = buildClaimRows(payload, itemId, { sectionIdBySectionKey, searchIdByUrl, sourceId, sourceTier: sourceRow.base_tier ?? payload.source?.base_tier ?? null });
    insClaims = claimRows.length
      ? await ctx.db.guardedInsertMany("section_claim_provenance", claimRows, { cite: ctx.cite, select: "id" })
      : { inserted: 0, rows: [] };

    const citationRows = buildCitationRows(itemId, claimRows);
    insCitations = citationRows.length
      ? await ctx.db.guardedInsertMany("intelligence_item_citations", citationRows, { cite: ctx.cite, select: "id" })
      : { inserted: 0, rows: [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    let cleanup = "not_attempted";
    try {
      const del = await ctx.db.guardedDelete("intelligence_items", [itemId], { cite: ctx.cite });
      cleanup = del?.deleted === 1 ? "partial_item_deleted" : `partial_item_delete_returned_${del?.deleted ?? "nothing"}`;
    } catch (delErr) {
      cleanup = `partial_item_delete_failed: ${delErr instanceof Error ? delErr.message : String(delErr)}`;
    }
    return {
      perItem: { id, outcome: "apply_failed", item_id: itemId, evidence_refs: [], error: message, cleanup },
      dbDeltas: DB_DELTA_ZERO,
      censusStamped: false,
    };
  }

  // The RPC is a pure function; the row's own provenance_status is what the trigger derivation stamped,
  // and only the row is what every reader sees. Both are recorded; the outcome follows the row.
  const verdict = await ctx.rpc(itemId);
  const rowStatus = (await ctx.db.readItemProvenance(itemId)) ?? null;
  const outcome = rowStatus === "verified" ? "minted_verified" : "minted_unverified";

  // Later payloads in this SAME batch must see this item as a holder too (two payloads sharing a
  // canonical key within one batch is exactly the collision M4 exists to catch).
  const finalKey = insItem.inserted.canonical_instrument_key ?? itemRow.canonical_instrument_key ?? null;
  const newHolder = { id: itemId, source_url: itemRow.source_url, canonical_instrument_key: finalKey, archive_reason: null };
  if (finalKey) {
    const arr = ctx.itemsIndex.byCanonicalKey.get(finalKey) ?? [];
    arr.push(newHolder);
    ctx.itemsIndex.byCanonicalKey.set(finalKey, arr);
  }
  if (itemRow.source_url) ctx.itemsIndex.bySourceUrl.set(itemRow.source_url, newHolder);

  // ── census_worklist resolution — ONLY on a real mint, matching mint-run-006.json's own precedent of
  //    leaving a not_applied_* row's census row UNRECONCILED. ──────────────────────────────────────
  let censusStamped = false;
  const rowId = resolveCensusRowId(payload, ctx.rowIdSet);
  let censusStampError = null;
  if (rowId) {
    try {
      await ctx.db.guardedUpdate("census_worklist", (qb) => qb.eq("id", rowId), { enumeration_status: "reconciled" }, { cite: ctx.cite, select: "id, enumeration_status" });
      censusStamped = true;
    } catch (e) {
      censusStampError = e instanceof Error ? e.message : String(e);
    }
  }

  return {
    perItem: {
      id,
      outcome,
      item_id: itemId,
      verdict: `row provenance_status=${rowStatus ?? "unknown"}; rpc recommended_status=${verdict?.recommended_status ?? "none"}`,
      evidence_refs: [],
      error: outcome === "minted_verified"
        ? null
        : JSON.stringify({ row_provenance_status: rowStatus, rpc_valid: verdict?.valid ?? null, failures: verdict?.failures ?? [] }),
    },
    dbDeltas: {
      items: 1,
      sections: insSections.inserted,
      claims: insClaims.inserted,
      searches: insSearches.inserted,
      gate_a: 1,
      citations: insCitations.inserted,
      sources: sourcesDelta,
    },
    censusStamped,
    censusRowId: rowId,
    censusStampError,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────────

function usage() {
  return [
    "Usage: node scripts/mint/apply-mint-batch.mjs --apply-ready path/to/batch.apply-ready.json",
    "         --census-rows path/to/census-rows.json --mint-run scripts/harness-runs/mint/mint-run-NNN.json",
    "         [--apply]   (default: --dry — plans and prints, writes nothing)",
  ].join("\n");
}

export async function run(values, deps) {
  const applyReadyPath = resolve(values["apply-ready"]);
  const censusRowsPath = resolve(values["census-rows"]);
  const mintRunPath = resolve(values["mint-run"]);
  const apply = values.apply === true && values.dry !== true;

  const payloads = JSON.parse(readFileSync(applyReadyPath, "utf8"));
  const censusRowsRaw = JSON.parse(readFileSync(censusRowsPath, "utf8"));
  const censusRows = Array.isArray(censusRowsRaw) ? censusRowsRaw : censusRowsRaw?.rows ?? [];
  const rowIdSet = censusRowIdSet(censusRows);
  const mintRunArtifact = JSON.parse(readFileSync(mintRunPath, "utf8"));

  const liveItems = await deps.readAll("intelligence_items", "id, source_url, canonical_instrument_key, archive_reason");
  const liveSources = await deps.readAll("sources", "id, url, status, category, base_tier");
  const itemsIndex = buildItemsIndex(liveItems);
  const sourcesById = new Map(liveSources.map((s) => [s.id, s]));

  const ctx = {
    db: { guardedInsert: deps.guardedInsert, guardedInsertMany: deps.guardedInsertMany, guardedUpdate: deps.guardedUpdate, guardedDelete: deps.guardedDelete, registerSource: deps.registerSource, readItemProvenance: deps.readItemProvenance },
    rpc: deps.rpc,
    itemsIndex,
    sourcesById,
    rowIdSet,
    cite: {
      skill: "record-tier-population-plan",
      reason: "Lane POP record-grade population turn (docs/plans/record-tier-population-plan-2026-09-01.md) — coordinator-apply of a --census-rows --grade record mint batch through the guarded write path.",
    },
    apply,
  };

  const perItemPatches = [];
  let dbDeltas = { ...DB_DELTA_ZERO };
  let censusReconciled = 0;
  const notAppliedCounts = {};
  const censusStampFailures = [];

  console.log(`apply-mint-batch: mode=${apply ? "APPLY" : "DRY"} payloads=${payloads.length}`);
  for (let i = 0; i < payloads.length; i++) {
    const payload = payloads[i];
    let result;
    try {
      result = await applyOnePayload(payload, ctx);
    } catch (err) {
      // a failure BEFORE the item row exists (M4 index, source registration, the item insert itself): no
      // partial row to clean, but the batch goes on and the artifact records it.
      result = {
        perItem: { id: payload?.id ?? "(no id)", outcome: "apply_failed", evidence_refs: [], error: err instanceof Error ? err.message : String(err), cleanup: "no_item_row" },
        dbDeltas: DB_DELTA_ZERO,
        censusStamped: false,
      };
    }
    perItemPatches.push(result.perItem);
    console.log(`  [${i + 1}/${payloads.length}] ${result.perItem.id}: ${result.perItem.outcome}`);
    if (apply) {
      dbDeltas = addDbDeltas(dbDeltas, result.dbDeltas);
      if (result.perItem.outcome.startsWith("not_applied_")) {
        notAppliedCounts[result.perItem.outcome] = (notAppliedCounts[result.perItem.outcome] ?? 0) + 1;
      }
      if (result.censusStamped) censusReconciled += 1;
      if (result.censusStampError) censusStampFailures.push({ id: result.perItem.id, censusRowId: result.censusRowId, error: result.censusStampError });
    }
  }

  if (!apply) {
    console.log("apply-mint-batch: DRY — nothing written (no DB write, no census_worklist stamp, no mint-run artifact enrichment).");
    return { applied: false, perItemPatches };
  }

  const mintedVerified = perItemPatches.filter((p) => p.outcome === "minted_verified").length;
  const mintedUnverified = perItemPatches.filter((p) => p.outcome === "minted_unverified").length;
  const minted = mintedVerified + mintedUnverified;
  const applyFailed = perItemPatches.filter((p) => p.outcome === "apply_failed");
  const metricsPatch = {
    db_deltas: dbDeltas,
    minted,
    minted_verified: mintedVerified,
    minted_unverified: mintedUnverified,
    apply_failed: applyFailed.length,
    census_rows_reconciled: censusReconciled,
    ...Object.fromEntries(Object.entries(notAppliedCounts)),
  };
  const defectsToAppend = [];
  if (censusStampFailures.length) {
    defectsToAppend.push({
      description: `${censusStampFailures.length} minted payload(s) could not have their census_worklist row stamped reconciled: ${censusStampFailures.map((f) => f.id).join(", ")}`,
      root_cause: censusStampFailures.map((f) => `${f.id}: ${f.error}`).join(" | "),
      fix_ref: null,
    });
  }
  if (applyFailed.length) {
    defectsToAppend.push({
      description: `${applyFailed.length} payload(s) failed part-way through the guarded write sequence (outcome apply_failed; cleanup per item): ${applyFailed.map((f) => `${f.id} [${f.cleanup}]`).join(", ")}`,
      root_cause: applyFailed.map((f) => `${f.id}: ${f.error}`).join(" | "),
      fix_ref: null,
    });
  }
  if (mintedUnverified) {
    defectsToAppend.push({
      description: `${mintedUnverified} minted item(s) carry a provenance_status other than verified after the full write sequence (the row is what readers see; see each per_item error for the row status and the rpc failures)`,
      root_cause: perItemPatches.filter((p) => p.outcome === "minted_unverified").map((p) => `${p.id}: ${p.error}`).join(" | "),
      fix_ref: null,
    });
  }

  const enriched = enrichMintRunArtifact(mintRunArtifact, {
    perItemPatches,
    metricsPatch,
    defectsToAppend,
    proposerNoteAppend:
      `apply-mint-batch.mjs enrichment (${new Date().toISOString()}): ${minted} minted (${mintedVerified} verified, ${mintedUnverified} not), ` +
      `${applyFailed.length} apply_failed, ${Object.values(notAppliedCounts).reduce((a, b) => a + b, 0)} not_applied. Discovery + forward-event ` +
      "extraction (MINT-RUNBOOK.md §8) did NOT run as part of this apply — that is a separate post-apply " +
      "pass over the newly-minted items, per that runbook's own hand-off model, not skipped in error.",
  });

  const errors = validateRunArtifact(enriched);
  if (errors.length) {
    throw new Error(`apply-mint-batch: enrichment produced an INVALID run artifact —\n  ${errors.join("\n  ")}`);
  }
  const dir = dirname(mintRunPath);
  const written = writeRunArtifact(dir, enriched, { allowOverwrite: true });
  console.log(`apply-mint-batch: enriched ${written} — minted=${minted} db_deltas=${JSON.stringify(dbDeltas)}`);
  if (censusStampFailures.length) {
    console.warn(`apply-mint-batch: ${censusStampFailures.length} census_worklist stamp failure(s) — see defects_found in the enriched artifact.`);
  }

  return { applied: true, perItemPatches, dbDeltas, minted, censusReconciled };
}

async function main() {
  const { values } = parseArgs({
    options: {
      "apply-ready": { type: "string" },
      "census-rows": { type: "string" },
      "mint-run": { type: "string" },
      apply: { type: "boolean", default: false },
      dry: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    allowPositionals: false,
    strict: true,
  });

  if (values.help) {
    console.log(usage());
    return;
  }
  if (!values["apply-ready"] || !values["census-rows"] || !values["mint-run"]) {
    console.error(`apply-mint-batch: --apply-ready, --census-rows, and --mint-run are all required.\n${usage()}`);
    process.exit(1);
  }

  try { process.loadEnvFile(resolve(FSI_ROOT, ".env.local")); } catch { /* CI: env injected */ }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("apply-mint-batch: no DB creds — cannot run here (exit 2).");
    process.exit(2);
  }
  const { readAll, guardedInsert, guardedInsertMany, guardedUpdate, guardedDelete, registerSource, readClient } = await import("../lib/db.mjs");
  const readItemProvenance = async (itemId) => {
    const { data, error } = await readClient().from("intelligence_items").select("provenance_status").eq("id", itemId).single();
    if (error) throw new Error(`readItemProvenance failed: ${error.message}`);
    return data?.provenance_status ?? null;
  };
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const rpc = async (itemId) => {
    const { data, error } = await sb.rpc("validate_item_provenance", { p_item_id: itemId });
    if (error) return { valid: false, recommended_status: null, failures: [{ criterion: "rpc", reason: error.message }] };
    return Array.isArray(data) ? data[0] : data;
  };

  await run(values, { readAll, guardedInsert, guardedInsertMany, guardedUpdate, guardedDelete, registerSource, readItemProvenance, rpc });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error("apply-mint-batch: fatal:", e);
    process.exit(1);
  });
}
