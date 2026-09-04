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
//
// FETCH ONLY WHAT MIGHT BE CONSUMED (lane FE-SLOT-2b, 2026-09-04). FE-SLOT-2 (above) made every caller
// fetch this item's ENTIRE `agent_run_searches` pool — `result_content` is the full grounding source pool
// per ADR-016, never truncated (tens of KB per capture, several captures per item; measured live this
// lane, project kwrsbpiseruzbfwjpvsp: the whole table is 6,037 rows / ~617 MB across 1,875 items, but only
// 118 items carry a `[due_date]` claim whose span even has a calendar year in it — 2.2% of the bytes) —
// EVEN THOUGH `attachDueDateContext` only ever looks at that pool for a due_date slot FACT claim whose span
// the extractor's own rescue branch would actually consult (`extractForwardEvents`'s "DUE-DATE SLOT CONTEXT
// RESCUE": `isDueDateSlot && hits.length === 0` in that module — a relative/recurring deadline with no
// calendar date at all, or a claim that already classifies from its span alone, never reaches
// `claim.context`). `claimNeedsDueDateContext` (below) answers "would this claim's context ever be looked
// at" by running the real, pure, zero-I/O `extractForwardEvents` over a ONE-claim, context-less copy of the
// claim and reading its own `skipped` reasons back — the exact test the rescue path applies, reused rather
// than re-implemented (a second date-shape regex here would drift from that module's grammar the first time
// either one changed; `extract-forward-events.mjs` is this family's OTHER governing file, F28
// GOVERNING_FILES, and is not touched by this lane at all). `itemIdsNeedingContext` folds that per-claim
// predicate over a batch of raw claim rows (needs `intelligence_item_id` on each row) into the item-id set
// worth an `agent_run_searches` read at all — every caller in this family (this file's own
// `readExtractionInput`, `export-corpus-for-extraction.mjs`, `forward-events-retext.mjs`) now fetches the
// pool ONLY for that set, never the whole target/chunk. `attachDueDateContext`'s own contract is UNCHANGED
// by this — it still attaches (or, on an empty pool, attaches `context: null`) to every due_date slot FACT
// claim it is given; the change is entirely upstream, in which rows a caller bothers to fetch before
// calling it.
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
// Fetch-only-what's-needed (see this file's own header, "FETCH ONLY WHAT MIGHT BE CONSUMED").
// ---------------------------------------------------------------------------

/**
 * True when `claim` (already in the extractor's own claim shape — i.e. already run through `mapClaimRow`)
 * is a due_date slot claim whose `agent_run_searches` context would actually be consulted by
 * `extractForwardEvents`'s "DUE-DATE SLOT CONTEXT RESCUE" branch — the SAME test that branch itself
 * applies (`isDueDateSlotClaim` + a span whose own trigger+date scan produces no direct hit but does
 * produce a scanText skip, i.e. a calendar-date-shaped span the rescue path would otherwise try context
 * on), reused by actually running the real, pure, zero-I/O `extractForwardEvents` over a one-claim,
 * context-less input rather than re-deriving the date grammar here (never a second date regex —
 * `extract-forward-events.mjs` is this family's other governing file and stays untouched). False for: a
 * non-FACT or non-due_date-slot claim, a GAP claim (`isDueDateSlotClaim` requires `kind === 'FACT'`), a
 * span with no calendar-date trigger at all (`relative_deadline_no_calendar_date` — a relative/recurring
 * deadline the extractor is right to never anchor to a date), and a span that already classifies from
 * itself alone (no rescue branch entered at all — no `calendar_date_deontic_context_unavailable`/
 * `calendar_date_no_deontic_in_context` skip is ever produced for it). Pure. Exported for testing and for
 * `itemIdsNeedingContext` below.
 */
export function claimNeedsDueDateContext(claim) {
  if (!isDueDateSlotClaim(claim) || typeof claim?.span !== "string" || !claim.span) return false;
  const { skipped } = extractForwardEvents({ claims: [{ ...claim, context: undefined }], sections: [] });
  return skipped.some((s) => s.reason === "calendar_date_deontic_context_unavailable");
}

/**
 * `claimNeedsDueDateContext` folded over a batch of RAW `section_claim_provenance` rows (each row must
 * carry `intelligence_item_id`, `claim_kind`, `claim_text`, `source_span` — a superset of `mapClaimRow`'s
 * own input, tolerantly ignored per-row via that same function) into the set of item ids carrying at least
 * one claim whose context would actually be consulted. Rows with no `intelligence_item_id` are ignored
 * (nothing to key a fetch by). Pure — this is the set a caller then reads `agent_run_searches` for, never
 * the full id list it started from. Exported so every caller in this family (this file's own
 * `readExtractionInput`, `export-corpus-for-extraction.mjs`, `forward-events-retext.mjs`) decides
 * identically which items are worth a pool read.
 * @param {Array<object>} claimRows
 * @returns {Set<string>}
 */
export function itemIdsNeedingContext(claimRows) {
  const ids = new Set();
  for (const r of claimRows ?? []) {
    if (r?.intelligence_item_id == null) continue;
    if (claimNeedsDueDateContext(mapClaimRow(r))) ids.add(r.intelligence_item_id);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// The one live, single-item reader (this module's own long-standing job — see header).
// ---------------------------------------------------------------------------

const CLAIM_SELECT = CLAIM_BASE_COLUMNS.join(", ");
const SECTION_SELECT = SECTION_BASE_COLUMNS.join(", ");
const POOL_SELECT = POOL_BASE_COLUMNS.join(", ");

/**
 * Read one item's already-grounded FACT/GAP claims, rendered sections, and (for its due_date slot claims
 * that would actually consult it — `claimNeedsDueDateContext` above) captured-source context, in the exact
 * shape `extractForwardEvents` consumes. Claims and sections are read in parallel FIRST; the
 * `agent_run_searches` pool (this item's full grounding source pool, ADR-016 — never small) is read only
 * as a SECOND round trip, and only when at least one claim needs it — see this file's own header, "FETCH
 * ONLY WHAT MIGHT BE CONSUMED".
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} itemId
 * @returns {Promise<{claims: object[], sections: object[]}>}
 */
export async function readExtractionInput(sb, itemId) {
  const [
    { data: claimRows, error: claimErr },
    { data: sectionRows, error: sectionErr },
  ] = await Promise.all([
    sb.from("section_claim_provenance").select(CLAIM_SELECT).eq("intelligence_item_id", itemId).in("claim_kind", CLAIM_KIND_FILTER),
    sb.from("intelligence_item_sections").select(SECTION_SELECT).eq("item_id", itemId),
  ]);
  if (claimErr) throw new Error(`section_claim_provenance read failed: ${claimErr.message}`);
  if (sectionErr) throw new Error(`intelligence_item_sections read failed: ${sectionErr.message}`);

  const mappedClaims = mapClaimRows(claimRows);
  let poolRows = [];
  if (mappedClaims.some(claimNeedsDueDateContext)) {
    const { data, error: poolErr } = await sb.from("agent_run_searches").select(POOL_SELECT).eq("intelligence_item_id", itemId);
    if (poolErr) throw new Error(`agent_run_searches read failed: ${poolErr.message}`);
    poolRows = data ?? [];
  }

  const claims = attachDueDateContext(mappedClaims, poolRows);
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
