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
//
// THE ONE READER (lane FE-SLOT-2, 2026-09-04 — CLAUDE.md's "no mirrored copies" rule). Before this lane,
// THREE modules built the extractor's per-item input by hand, each saying it "mirrors" another:
// this file's own live per-item read (below), `scripts/turns/export-corpus-for-extraction.mjs` (its own
// header: "COLUMN MAPPING mirrors read-and-extract.mjs's query shape exactly"), and
// `scripts/maintenance/forward-events-retext.mjs` (its own `mapClaimRows`/`mapSectionRows`: "mirrors
// read-and-extract.mjs's row mapping"). The row-shape mapping (`mapClaimRows`/`mapSectionRows`) and the
// `claim_kind` filter (`CLAIM_KIND_FILTER`) are now exported from HERE, ONCE, and imported by both scripts
// — see each file's own header for exactly how. This file still owns the only LIVE single-item read
// (`readExtractionInput`, below) — the two scripts read via `scripts/lib/db.mjs`'s `readAll` (a batched,
// service-role-scoped reader neither this module nor its live `sb` client shape fits), so each keeps its
// own DB-call mechanism (per the dispatch: "keep each caller's own behaviour otherwise") while sharing the
// one column/mapping/filter/context-attachment contract every caller must produce identically.
//
// THE THIRD INPUT (lane FE-SLOT-2, 2026-09-04 — see `extract-forward-events.mjs`'s own "DUE-DATE SLOT
// CONTEXT RESCUE" header for the full measurement and mechanism). Every due_date slot FACT claim
// (`claim_text` starting `[due_date] `) now additionally carries `context: {before, after, search_id}` —
// up to 240 chars either side of the claim's own verbatim `source_span`, sliced from the FIRST
// `agent_run_searches` capture (the item's grounding source pool, ADR-016; usable = `result_content` >
// 200 chars, the same floor `src/lib/agent/canonical-pipeline.ts` ~line 939/959 already uses) that
// contains the span verbatim (exact substring, case-sensitive — the same discipline `assertVerbatim`
// already enforces in `extract-forward-events.mjs`), ordered by `result_index` — or `null` when no capture
// contains it. `extract-forward-events.mjs` never fetches this itself (it stays zero-I/O); it only
// consumes what this reader attaches to `claim.context`.
import { extractForwardEvents, isDueDateSlotClaim } from "./extract-forward-events.mjs";

/** The two claim kinds every caller of this family reads — never a hand-typed `["FACT", "GAP"]` literal
 *  at a second call site. */
export const CLAIM_KIND_FILTER = Object.freeze(["FACT", "GAP"]);

/** Columns every caller's own `section_claim_provenance` read selects (a caller reading MANY items via a
 *  batched `.in()` additionally selects its own item-id join column — see each script's own header — this
 *  list is the shared core, not the full column string every call site sends). */
export const CLAIM_BASE_COLUMNS = Object.freeze(["id", "claim_kind", "claim_text", "source_span"]);

/** Columns every caller's own `intelligence_item_sections` read selects (same batched-vs-single-item
 *  caveat as CLAIM_BASE_COLUMNS above). */
export const SECTION_BASE_COLUMNS = Object.freeze(["id", "section_key", "content_md"]);

/** One raw `section_claim_provenance` row -> the extractor's claim shape. Pure. Exported so every caller
 *  in this family maps a row identically — never a second, hand-typed `{claim_id: r.id, ...}` literal. */
export function mapClaimRow(r) {
  return { claim_id: r.id, kind: r.claim_kind, text: r.claim_text, span: r.source_span ?? null };
}

/** `mapClaimRow` over an array (tolerant of `null`/`undefined`). Pure. */
export function mapClaimRows(rows) {
  return (rows ?? []).map(mapClaimRow);
}

/** One raw `intelligence_item_sections` row -> the extractor's section shape. Pure. */
export function mapSectionRow(r) {
  return { section_id: r.id, key: r.section_key, md: r.content_md ?? "" };
}

/** `mapSectionRow` over an array (tolerant of `null`/`undefined`). Pure. */
export function mapSectionRows(rows) {
  return (rows ?? []).map(mapSectionRow);
}

// ---------------------------------------------------------------------------
// The due_date slot context attachment (see this file's own header, "THE THIRD INPUT").
// ---------------------------------------------------------------------------

/** Columns every caller's own `agent_run_searches` pool read selects for context-building — id (the
 *  `search_id` a context is attributed to), the captured text itself, and `result_index` (the "first
 *  capture" ordering — same column `src/lib/agent/canonical-pipeline.ts` already orders this table by). */
export const POOL_BASE_COLUMNS = Object.freeze(["id", "result_content", "result_index"]);

// Same floor `src/lib/agent/canonical-pipeline.ts` ~line 939/959 already uses to decide whether a captured
// row is "usable" evidence at all — a stub/error row with a few bytes of result_content is never a real
// document, so it is never consulted here either.
const MIN_USABLE_POOL_CHARS = 200;

// Up to this many characters either side of a slot span, sliced from its capture — the window
// `extract-forward-events.mjs`'s `rescueSlotDateWithContext` re-scans for deontic/aim language. Chosen by
// this lane's own measurement (see that module's own header): a coarse ±240-char regex check over the same
// live 89-row population found 64/89 carrying a deontic/aim word in that range.
const CONTEXT_CHARS = 240;

/** Pool rows narrowed to "usable" (>200 trimmed chars) and ordered by `result_index` ascending — the pool
 *  every caller in this family consults, in the same order, for "the FIRST capture containing the span."
 *  Pure. Exported for testing. */
export function usableCapturesOrdered(poolRows) {
  return (poolRows ?? [])
    .filter((p) => String(p?.result_content ?? "").trim().length > MIN_USABLE_POOL_CHARS)
    .slice()
    .sort((a, b) => (a.result_index ?? 0) - (b.result_index ?? 0));
}

/** The due_date slot claim's own context object — `{before, after, search_id}` sliced from the FIRST
 *  usable capture (already ordered by `usableCapturesOrdered`) that contains `span` as a verbatim (exact,
 *  case-sensitive) substring, or `null` when no capture contains it. `before`/`after` are each capped at
 *  `CONTEXT_CHARS`. Pure — takes already-fetched pool rows, does no I/O itself. Exported for testing. */
export function buildDueDateContext(span, orderedUsableCaptures) {
  if (typeof span !== "string" || !span) return null;
  for (const capture of orderedUsableCaptures ?? []) {
    const content = capture?.result_content ?? "";
    const idx = content.indexOf(span);
    if (idx === -1) continue;
    return {
      before: content.slice(Math.max(0, idx - CONTEXT_CHARS), idx),
      after: content.slice(idx + span.length, idx + span.length + CONTEXT_CHARS),
      search_id: capture.id,
    };
  }
  return null;
}

/** Attaches `context` (see `buildDueDateContext`) to every due_date slot FACT claim in `claims` (already
 *  in the extractor's own claim shape, i.e. already run through `mapClaimRows`) — every other claim is
 *  returned unchanged (no `context` key at all, never `context: undefined` masquerading as "checked and
 *  found none"). `poolRows` are the item's raw `agent_run_searches` rows (any shape carrying
 *  `result_content`/`result_index`/`id` — narrowed and ordered internally via `usableCapturesOrdered`).
 *  Pure. Exported so every caller in this family attaches context identically. */
export function attachDueDateContext(claims, poolRows) {
  const ordered = usableCapturesOrdered(poolRows);
  return (claims ?? []).map((claim) => {
    if (!isDueDateSlotClaim(claim) || typeof claim.span !== "string" || !claim.span) return claim;
    return { ...claim, context: buildDueDateContext(claim.span, ordered) };
  });
}

// ---------------------------------------------------------------------------
// The one live, single-item reader (this module's own long-standing job — see header).
// ---------------------------------------------------------------------------

const CLAIM_SELECT = CLAIM_BASE_COLUMNS.join(", ");
const SECTION_SELECT = SECTION_BASE_COLUMNS.join(", ");
const POOL_SELECT = POOL_BASE_COLUMNS.join(", ");

/**
 * Read one item's already-grounded FACT/GAP claims, rendered sections, and (for its due_date slot claims)
 * captured-source context, in the exact shape `extractForwardEvents` consumes.
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} itemId
 * @returns {Promise<{claims: object[], sections: object[]}>}
 */
export async function readExtractionInput(sb, itemId) {
  const [
    { data: claimRows, error: claimErr },
    { data: sectionRows, error: sectionErr },
    { data: poolRows, error: poolErr },
  ] = await Promise.all([
    sb.from("section_claim_provenance").select(CLAIM_SELECT).eq("intelligence_item_id", itemId).in("claim_kind", CLAIM_KIND_FILTER),
    sb.from("intelligence_item_sections").select(SECTION_SELECT).eq("item_id", itemId),
    sb.from("agent_run_searches").select(POOL_SELECT).eq("intelligence_item_id", itemId),
  ]);
  if (claimErr) throw new Error(`section_claim_provenance read failed: ${claimErr.message}`);
  if (sectionErr) throw new Error(`intelligence_item_sections read failed: ${sectionErr.message}`);
  if (poolErr) throw new Error(`agent_run_searches read failed: ${poolErr.message}`);

  const claims = attachDueDateContext(mapClaimRows(claimRows), poolRows ?? []);
  const sections = mapSectionRows(sectionRows);
  return { claims, sections };
}

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
  const { claims, sections } = await readExtractionInput(sb, itemId);
  const { events, skipped } = extractForwardEvents({ claims, sections });
  return { events, skipped, claims, sections };
}
