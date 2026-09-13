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

// ---------------------------------------------------------------------------
// Reference dates + the source-verbatim class fix (lane L6, D10, 2026-09-13 -- see
// docs/plans/defect-fix-plan-2026-09-12.md D10 and extract-forward-events.mjs's own header note
// "REFERENCE-DATE AND STATUS-ONLY REFUSALS").
//
// The defect: two item_forward_events rows carried obligation_text "In force as of <date>." with the date
// equal to the RUN date -- the 6.1b pilot bodies' own writing date, not a date the instrument states. The
// extractor's reference-date refusal (extract-forward-events.mjs) needs to be TOLD what the reference dates
// ARE; this driver is the one place with DB access to supply them.
//
// THE DOCUMENT-DATE COLUMN [CONFIRMED by reading the migration that created it]: `intelligence_items.
// last_regenerated_at`, added by supabase/migrations/018_b2_brief_schema.sql ("Timestamp of most recent
// agent regeneration under new SKILL.md contract"), still live (referenced by migration 316, the most
// recent migration to touch it, 2026-09-13 checkout). This is the closest live column to "when this
// brief's own content was written" -- exactly what the D10 defect's "In force as of <today>." sentence
// collided with. `intelligence_item_sections.created_at`/`updated_at` were also considered (migration
// 103_intelligence_item_sections.sql) but are per-SECTION, not per-brief, and this driver already reads
// many sections per item -- `last_regenerated_at` is the one per-item stamp of "when the brief was last
// written," matching the pilot's own framing exactly. `null` when the item was never regenerated under this
// pipeline (a record-grade mint, or a pre-pipeline row) -- referenceDates then carries only today's date.
// ---------------------------------------------------------------------------

export const ITEM_BASE_COLUMNS = Object.freeze(["last_regenerated_at"]);

/** Today, UTC, ISO (YYYY-MM-DD) -- the "run date" half of the reference-date refusal's input. Exported so
 *  a test can compute the same value a live call would use, without duplicating the slice logic. */
export function todayIsoUtc() {
  return new Date().toISOString().slice(0, 10);
}

/** The brief's own "document date" from an already-read `intelligence_items` row (or `undefined`/`null` --
 *  tolerant, since not every caller has one) -- see this file's header note above for which column and
 *  why. `null` when absent/malformed, never a crash. Pure. Exported for testing. */
export function documentDateIso(itemRow) {
  const raw = itemRow?.last_regenerated_at;
  if (typeof raw === "string" && raw.length >= 10) return raw.slice(0, 10);
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  return null;
}

/** [todayIsoUtc(), documentDateIso(itemRow)], deduplicated and with any null/empty entry dropped -- the
 *  exact `referenceDates` array extractForwardEvents/scanText consume (extract-forward-events.mjs's own
 *  header, "REFERENCE-DATE AND STATUS-ONLY REFUSALS"). Pure. Exported for testing. */
export function buildReferenceDates(itemRow) {
  const dates = [todayIsoUtc(), documentDateIso(itemRow)];
  return dates.filter((d, i) => Boolean(d) && dates.indexOf(d) === i);
}

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
// The source-verbatim class fix (D10 "Class fix", lane L6, 2026-09-13): a forward event must be verbatim
// in its SOURCE, the same rule as a FACT claim.
// ---------------------------------------------------------------------------

/**
 * Enforces the D10 class fix over one item's already-extracted events: a SECTION-kind event's `source_span`
 * (the matched date substring) must additionally be verbatim inside at least one FACT claim's own
 * `source_span` for the SAME item. `extract-forward-events.mjs`'s own `assertVerbatim` already proves the
 * span is verbatim in the SECTION's own rendered markdown -- exactly the text a brief-writing-date sentence
 * like "In force as of <today>." can fabricate FROM (that sentence IS in the section, verbatim, and always
 * will be). Requiring it ALSO appear in a FACT claim's span corroborates the date against text that was
 * separately grounded against the item's captured source pool (ADR-016; section_claim_provenance's own
 * contract) -- a materially stronger claim than "the brief said so."
 *
 * Deliberately does NOT also read the item's `agent_run_searches` pool text here, per this lane's own
 * dispatch: that read is only ever fetched CONDITIONALLY, for a due_date slot claim's own rescue (see this
 * file's header, "FETCH ONLY WHAT MIGHT BE CONSUMED") -- it is not already part of this driver's data path
 * for an arbitrary section-kind event, and the pool is "never small" (this file's own header) for every
 * item, not just the ones with a due_date slot claim. Adding an unconditional read of it here to check
 * every section event's span would be exactly the class of unbounded read this driver's own
 * "fetch-only-what-might-be-consumed" discipline exists to avoid. The FACT-claim check alone is the
 * assertion this lane ships; a wider pool-text corroboration is left for a future lane if measurement shows
 * a real residue the claim-span check misses.
 *
 * CLAIM-kind events are left untouched, never re-checked here: their `source_span` IS the claim's own span
 * by construction, already asserted verbatim by `assertVerbatim` inside extract-forward-events.mjs.
 *
 * A section-kind event that fails is dropped (never returned to the caller), logged with one run-log line
 * naming the item, section id, and span (never silent -- CLAUDE.md standing rule 13), appended to `skipped`
 * with a named reason, and counted in the returned `refusedNotInSource`. Pure aside from the log line -- no
 * DB I/O. Exported for testing.
 * @param {object[]} events
 * @param {object[]} skipped
 * @param {object[]} claims already in the extractor's own claim shape (mapClaimRow output)
 * @param {string} itemId used only for the run-log line
 * @returns {{events: object[], skipped: object[], refusedNotInSource: number}}
 */
export function enforceSectionVerbatimInSource(events, skipped, claims, itemId) {
  const factClaimSpans = (claims ?? [])
    .filter((c) => c?.kind === "FACT" && typeof c.span === "string" && c.span.length > 0)
    .map((c) => c.span);

  const keptEvents = [];
  const outSkipped = [...(skipped ?? [])];
  let refusedNotInSource = 0;

  for (const event of events ?? []) {
    if (event.source_kind !== "section") {
      keptEvents.push(event);
      continue;
    }
    const verbatimInAFactClaim = factClaimSpans.some((span) => span.includes(event.source_span));
    if (verbatimInAFactClaim) {
      keptEvents.push(event);
      continue;
    }
    refusedNotInSource += 1;
    // Deliberate run-log line (D10 class fix) -- never a silently dropped event (CLAUDE.md standing rule 13).
    console.warn(
      `[forward-events] refusedNotInSource: item=${itemId ?? "unknown"} section=${event.source_section_id ?? "unknown"} span=${JSON.stringify(event.source_span)} -- date span is not verbatim in any FACT claim span for this item`
    );
    outSkipped.push({
      source_kind: "section",
      source_claim_id: null,
      source_section_id: event.source_section_id ?? null,
      reason:
        "refusedNotInSource: section-kind event's date span is not verbatim in any FACT claim span for this item -- a forward event must be verbatim in its source, the same rule as a FACT claim (D10 class fix)",
      text: event.source_span,
    });
  }

  return { events: keptEvents, skipped: outSkipped, refusedNotInSource };
}

// ---------------------------------------------------------------------------
// The one live, single-item reader (this module's own long-standing job — see header).
// ---------------------------------------------------------------------------

const CLAIM_SELECT = CLAIM_BASE_COLUMNS.join(", ");
const SECTION_SELECT = SECTION_BASE_COLUMNS.join(", ");
const POOL_SELECT = POOL_BASE_COLUMNS.join(", ");
const ITEM_SELECT = ITEM_BASE_COLUMNS.join(", ");

/**
 * Read one item's already-grounded FACT/GAP claims, rendered sections, and (for its due_date slot claims
 * that would actually consult it — `claimNeedsDueDateContext` above) captured-source context, in the exact
 * shape `extractForwardEvents` consumes. Claims and sections are read in parallel FIRST; the
 * `agent_run_searches` pool (this item's full grounding source pool, ADR-016 — never small) is read only
 * as a SECOND round trip, and only when at least one claim needs it — see this file's own header, "FETCH
 * ONLY WHAT MIGHT BE CONSUMED".
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} itemId
 * @returns {Promise<{claims: object[], sections: object[], referenceDates: string[]}>} `referenceDates`
 *   (D10, lane L6, 2026-09-13 -- see this file's header note above) is [today's UTC ISO date, the item's
 *   `last_regenerated_at` document date], deduplicated, nulls dropped.
 */
export async function readExtractionInput(sb, itemId) {
  const [
    { data: claimRows, error: claimErr },
    { data: sectionRows, error: sectionErr },
    { data: itemRows, error: itemErr },
  ] = await Promise.all([
    sb.from("section_claim_provenance").select(CLAIM_SELECT).eq("intelligence_item_id", itemId).in("claim_kind", CLAIM_KIND_FILTER),
    sb.from("intelligence_item_sections").select(SECTION_SELECT).eq("item_id", itemId),
    sb.from("intelligence_items").select(ITEM_SELECT).eq("id", itemId),
  ]);
  if (claimErr) throw new Error(`section_claim_provenance read failed: ${claimErr.message}`);
  if (sectionErr) throw new Error(`intelligence_item_sections read failed: ${sectionErr.message}`);
  if (itemErr) throw new Error(`intelligence_items read failed: ${itemErr.message}`);

  const mappedClaims = mapClaimRows(claimRows);
  let poolRows = [];
  if (mappedClaims.some(claimNeedsDueDateContext)) {
    const { data, error: poolErr } = await sb.from("agent_run_searches").select(POOL_SELECT).eq("intelligence_item_id", itemId);
    if (poolErr) throw new Error(`agent_run_searches read failed: ${poolErr.message}`);
    poolRows = data ?? [];
  }

  const claims = attachDueDateContext(mappedClaims, poolRows);
  const sections = mapSectionRows(sectionRows);
  const referenceDates = buildReferenceDates((itemRows ?? [])[0]);
  return { claims, sections, referenceDates };
}

/**
 * Read one item's already-grounded FACT/GAP claims and rendered sections, and run the pure extractor
 * over them.
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} itemId
 * @returns {Promise<{events: object[], skipped: object[], claims: object[], sections: object[], refusedNotInSource: number}>}
 *   `claims`/`sections` are the exact (id-bearing) inputs fed to the extractor — returned alongside
 *   events/skipped so a caller that needs to know WHICH claims/sections currently exist for this item
 *   (e.g. apply-staged-update.ts's stale-events check: does an existing item_forward_events row's
 *   source_claim_id/source_section_id still appear here) never issues a second, duplicate read.
 *   `refusedNotInSource` (D10 class fix, lane L6, 2026-09-13 -- see `enforceSectionVerbatimInSource` above)
 *   counts section-kind events dropped for failing the verbatim-in-a-FACT-claim assertion.
 */
export async function readAndExtractForwardEvents(sb, itemId) {
  const { claims, sections, referenceDates } = await readExtractionInput(sb, itemId);
  const { events: rawEvents, skipped: rawSkipped } = extractForwardEvents({ claims, sections, referenceDates });
  const { events, skipped, refusedNotInSource } = enforceSectionVerbatimInSource(rawEvents, rawSkipped, claims, itemId);
  return { events, skipped, claims, sections, refusedNotInSource };
}
