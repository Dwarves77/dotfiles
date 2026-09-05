// read-register.mjs — the customer-facing read for the obligation register (migration 290
// `obligations`), Lane OBLIG, 2026-09-02.
//
// SIBLING TO `src/lib/forward-events/read-upcoming.mjs`, same posture, deliberately not merged with it:
// read-upcoming.mjs reads item_forward_events directly (the raw dated-event grain, used by
// UpcomingObligationsStrip's "what is due next" top strip); this module reads `obligations` (migration
// 290's DENORMALIZED register — jurisdiction/mode/binding_position already attached, one row per
// forward event) for the register SECTION spec-01 §2 calls for: filterable by jurisdiction / mode /
// binding_position / due window, sorted by due date. Same underlying corpus, two different reads for
// two different surface jobs — not a duplicate.
//
// RLS, NOT A SEPARATE GATE. Migration 290's own header: same posture as 274 — "the ONLY thing standing
// between a browsing customer and these rows is the Postgres RLS policy itself." This module performs
// NO extra authorization of its own beyond the same defense-in-depth read-upcoming.mjs already applies
// (provenance_status='verified' on the item join — RLS itself only checks is_archived) and MUST always
// be called with the REQUEST-SCOPED client (createSupabaseServerClient, cookie-bound, anon key), never
// a service-role client, for the same reason stated there.
//
// PURE QUERY BUILDER + PURE VIEW-MODEL SHAPER + ONE I/O FUNCTION, same split read-upcoming.mjs uses:
// buildRegisterQuerySpec (kind/jurisdiction/mode/binding/due-window defaulting, unit-testable with zero
// I/O), selectRegisterRows (post-join filter + shape), fetchObligationRegister (the only function here
// that touches a real client).
//
// PLAIN ESM, NO `@/` ALIAS — same portability constraint read-upcoming.mjs states for itself: importable
// by a plain `node --test` proof with zero tsconfig/Next resolution, and by the regulations list and
// detail pages (React server components).
//
// REG-GRAIN (2026-09-05) — THE ROW NOW CARRIES ITS OWN OBLIGATION TEXT, NOT JUST ITS COORDINATES.
// [CONFIRMED, lane FE-DEDUP's report + the coordinator's live screenshot of /regulations at 1ae31181]
// Before this lane, a register row selected id/intelligence_item_id/forward_event_id/jurisdiction/
// modes/binding_position/due_date/date_precision/event_kind/status — the event's own COORDINATES — and
// never the obligation's own text (item_forward_events.obligation_text). Two genuinely distinct
// obligations sharing (item, kind, date) — Euro 7's phase-out schedule, several events on one date;
// NZIA's four distinct 2030-01-01 targets — rendered as identical rows: a reader could tell something
// was due, never what. Measured this lane (Supabase MCP, 2026-09-05): of 1,141 live obligations, 927
// survive FE-DEDUP's exact-text-twin removal (migration 307's own dedupe key), and 583 of those 927
// (63%) still share (intelligence_item_id, event_kind, due_date) with a sibling whose obligation_text
// genuinely differs — the defect this lane fixes, not a hypothetical. The fix: `fetchObligationRegister`
// and `fetchObligationRegisterPage` both embed `item_forward_events(obligation_text)` on the SAME
// `forward_event_id` FK the row already carries (one query, no added round trip — PostgREST resolves an
// embed inside the same request) and `flattenObligationText` trims it (OBLIGATION_TEXT_TRIM_LENGTH,
// 160 chars, ellipsis) onto `row.obligation_text` before the row ever reaches selectRegisterRows /
// filterJoinedRows(Page). `source_span` (the verbatim date-phrase substring) is deliberately NOT
// selected here: spec-01 §3.2's `verbatim_text` field is the clause-around-the-date obligation_text
// already carries, and adding a second text column with no distinct customer-facing job would be bytes
// spent on the same defensibility story obligation_text already tells — see this lane's REPORT for the
// measured bytes-per-page delta this addition costs, fed into perf-budget.mjs honestly.

// not exported (lane DEAD-EXEC, 2026-09-04): used only within this file (buildRegisterQuerySpec below),
// per the wiring audit's Appendix B (dead exports, 2026-09-04) — UNCLASSIFIED and DUE_WINDOWS below
// remain exported since other callers import them individually.
const BINDING_POSITIONS = Object.freeze([
  "direct_duty", "carrier_passthrough", "customer_contract", "monitoring_only",
]);

// The pseudo-value the UI/read model uses to mean "binding_position IS NULL" — a real, distinct,
// filterable state (migration 290's own column comment: NULL means "not yet classified", never a blank
// or a dropped row). Never stored in the DB itself; only ever a filter-side token.
export const UNCLASSIFIED = "unclassified";

export const DUE_WINDOWS = Object.freeze(["overdue", "30", "90", "365", "undated", "all"]);

const GENERIC_JURISDICTIONS = new Set(["global", "worldwide", "all"]);

// REG-GRAIN (2026-09-05): bound length for `obligation_text` at the READ, not the write. The source
// column (item_forward_events.obligation_text, migration 274) is untrimmed by design — "the
// clause/sentence around the date... giving a reader the obligation in context" — and the live corpus
// carries values up to 222 chars (measured, Supabase MCP, 2026-09-05, first-page-by-due-date sample).
// One constant, applied identically to every caller (fetchObligationRegister and
// fetchObligationRegisterPage both call trimObligationText below) so the register's per-row payload
// never balloons regardless of how long a future extraction run's obligation_text gets — see this
// lane's REPORT for the measured before/after bytes-per-page delta feeding perf-budget.mjs.
export const OBLIGATION_TEXT_TRIM_LENGTH = 160;

/**
 * Pure: bound `text` to `max` characters, ellipsis-terminated when truncated. Never throws on a
 * non-string/null/undefined input — degrades to `null` (same "render what's known, never break the
 * page" posture every other read here takes), since a register row missing its obligation text is a
 * real, renderable state (falls back to the event-kind label alone), not an error.
 */
export function trimObligationText(text, max = OBLIGATION_TEXT_TRIM_LENGTH) {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

/**
 * Pure: flatten the PostgREST-embedded `item_forward_events` object (one FK hop,
 * `obligations.forward_event_id -> item_forward_events.id`, migration 290) onto the row itself as a
 * trimmed `obligation_text` string, and drop the nested object — every caller of this module reads
 * `row.obligation_text` directly, never `row.item_forward_events`, so there is exactly one shape for
 * a joined row regardless of which function produced it.
 */
function flattenObligationText(row) {
  const nested = row.item_forward_events;
  const { item_forward_events: _drop, ...rest } = row;
  return { ...rest, obligation_text: trimObligationText(nested?.obligation_text) };
}

/**
 * Pure: normalize a caller-supplied filter set into the exact shape the query needs. Never throws on a
 * bad value — an unrecognised filter degrades to "no filter" (the same "never invent, never silently
 * error" posture read-upcoming.mjs takes for jurisdiction defaulting).
 *
 * @param {{ jurisdiction?: string|null, mode?: string|null, bindingPosition?: string|null,
 *           dueWindow?: string|null, limit?: number, todayIso?: string, itemId?: string|null }} [opts]
 * @returns {{ jurisdiction: string|null, mode: string|null, bindingPosition: string|null,
 *             dueWindow: string, limit: number, todayIso: string, itemId: string|null }}
 */
export function buildRegisterQuerySpec(opts = {}) {
  const jurisdiction =
    typeof opts.jurisdiction === "string" && opts.jurisdiction.trim() && !GENERIC_JURISDICTIONS.has(opts.jurisdiction.trim().toLowerCase())
      ? opts.jurisdiction.trim().toLowerCase()
      : null;
  const mode = typeof opts.mode === "string" && opts.mode.trim() ? opts.mode.trim().toLowerCase() : null;
  const bindingPosition =
    typeof opts.bindingPosition === "string" &&
    (BINDING_POSITIONS.includes(opts.bindingPosition) || opts.bindingPosition === UNCLASSIFIED)
      ? opts.bindingPosition
      : null;
  const dueWindow = DUE_WINDOWS.includes(opts.dueWindow) ? opts.dueWindow : "all";
  const limit = Number.isFinite(opts.limit) && opts.limit > 0 ? Math.min(500, Math.floor(opts.limit)) : 200;
  // PERF-11 (2026-09-04): page offset into the filtered/sorted result — the register's own "Load more"
  // (ObligationRegisterFilterBar.tsx / /api/obligations/register) pages through the SAME server-computed
  // filtered+sorted sequence a fresh call recomputes, rather than shipping the whole sequence once and
  // slicing client-side. Default 0 (first page), same "never throw on a bad value" posture as every
  // other field here.
  const offset = Number.isFinite(opts.offset) && opts.offset >= 0 ? Math.floor(opts.offset) : 0;
  const todayIso =
    typeof opts.todayIso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(opts.todayIso)
      ? opts.todayIso
      : new Date().toISOString().slice(0, 10);
  return { jurisdiction, mode, bindingPosition, dueWindow, limit, offset, todayIso, itemId: opts.itemId ?? null };
}

/** Pure: does this row's due_date fall inside the requested due window, evaluated against `todayIso`?
 *  `undated` and `all` are the two windows where the classifier never rejects on date alone. */
export function matchesDueWindow(dueDate, dueWindow, todayIso) {
  if (dueWindow === "all") return true;
  if (dueWindow === "undated") return dueDate === null || dueDate === undefined;
  if (dueDate === null || dueDate === undefined) return false; // a dated window never matches an undated row
  if (dueWindow === "overdue") return dueDate < todayIso;
  const days = Number(dueWindow);
  if (!Number.isFinite(days)) return true; // unrecognised window (should not reach here post-buildRegisterQuerySpec) — never excludes
  const from = new Date(`${todayIso}T00:00:00Z`);
  const to = new Date(from.getTime() + days * 86400000);
  const d = new Date(`${dueDate}T00:00:00Z`);
  return d >= from && d <= to;
}

/**
 * Pure: shape the post-join view model. `rows` are raw `obligations` rows (already carrying their own
 * denormalized jurisdiction/modes/binding_position — no join needed for those); `itemsById` supplies the
 * customer-visible item metadata (title, legacy_id) for the link/label. A row whose item did not survive
 * the verified-gate join is dropped — never rendered with a broken/leaked link, same rule
 * read-upcoming.mjs's selectUpcoming applies. Sort is stable: due date ascending, undated rows last (a
 * missing due date is not "soonest"), and this function performs that sort itself (unlike
 * read-upcoming.mjs's selectUpcoming, which trusts the DB's own ORDER BY) because the due-window filter
 * here can reorder relative to a straight DB `.order('due_date')` once undated rows are included.
 */
export function selectRegisterRows(rows, itemsById, spec) {
  const joined = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const item = itemsById.get(row.intelligence_item_id);
    if (!item) continue; // dropped: not in the verified/live join — never render a broken/leaked link
    joined.push({ ...row, item });
  }
  return filterJoinedRows(joined, spec);
}

/**
 * Pure, NO ITEM JOIN: filter + sort + limit an already-joined rows array (each row already carries
 * `.item`). Split out from selectRegisterRows so the SAME predicate/sort logic can run twice from one
 * source of truth — once server-side (selectRegisterRows, right after the item join) and once
 * CLIENT-SIDE, in the browser, when the register's filter bar re-filters an already-fetched page of
 * rows without a round trip (ObligationRegisterFilterBar imports this directly — it is plain,
 * dependency-free ESM with no Node-only API, safe in a "use client" component). Never drops a row for a
 * missing item here (that already happened, or never happens, upstream) — only applies the filter spec.
 *
 * @param {Array<object>} joinedRows - rows already carrying `.item`
 * @param {{ jurisdiction: string|null, mode: string|null, bindingPosition: string|null, dueWindow: string, todayIso: string, limit?: number, offset?: number }} spec
 */
function filterAndSortJoinedRows(joinedRows, spec) {
  const out = [];
  for (const row of Array.isArray(joinedRows) ? joinedRows : []) {
    if (spec.jurisdiction && !(row.jurisdiction || []).some((j) => String(j).toLowerCase() === spec.jurisdiction || String(j).toLowerCase().startsWith(`${spec.jurisdiction}-`))) continue;
    if (spec.mode && !(row.modes || []).some((m) => String(m).toLowerCase() === spec.mode)) continue;
    if (spec.bindingPosition) {
      const isUnclassified = row.binding_position === null || row.binding_position === undefined;
      if (spec.bindingPosition === UNCLASSIFIED ? !isUnclassified : row.binding_position !== spec.bindingPosition) continue;
    }
    if (!matchesDueWindow(row.due_date ?? null, spec.dueWindow, spec.todayIso)) continue;
    out.push(row);
  }
  out.sort((a, b) => {
    if (a.due_date === b.due_date) return 0;
    if (a.due_date === null || a.due_date === undefined) return 1; // undated last
    if (b.due_date === null || b.due_date === undefined) return -1;
    return a.due_date < b.due_date ? -1 : 1;
  });
  return out;
}

export function filterJoinedRows(joinedRows, spec) {
  const out = filterAndSortJoinedRows(joinedRows, spec);
  return spec.limit ? out.slice(0, spec.limit) : out;
}

/**
 * PERF-11 (2026-09-04): same filter+sort as filterJoinedRows, but returns `{ rows, total }` — `total` is
 * the count AFTER filtering, BEFORE the page slice (so a caller can render "N of M obligations" honestly
 * for a page that is not the whole filtered set), and the slice starts at `spec.offset` (default 0)
 * rather than always 0. Used by fetchObligationRegisterPage (server) and the register's client-side
 * "Load more" call into /api/obligations/register — same predicate/sort logic, one source of truth,
 * matching filterJoinedRows's own reason for existing.
 *
 * @param {Array<object>} joinedRows - rows already carrying `.item`
 * @param {{ jurisdiction: string|null, mode: string|null, bindingPosition: string|null, dueWindow: string, todayIso: string, limit?: number, offset?: number }} spec
 * @returns {{ rows: Array<object>, total: number }}
 */
export function filterJoinedRowsPage(joinedRows, spec) {
  const out = filterAndSortJoinedRows(joinedRows, spec);
  const offset = spec.offset || 0;
  const rows = spec.limit ? out.slice(offset, offset + spec.limit) : out.slice(offset);
  return { rows, total: out.length };
}

/**
 * The one function here that touches I/O. `supabase` MUST be the request-scoped client (RLS applies —
 * see this module's header).
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ jurisdiction?: string|null, mode?: string|null, bindingPosition?: string|null,
 *           dueWindow?: string|null, limit?: number, itemId?: string|null }} [opts]
 * @returns {Promise<Array<object>>} register rows with `.item` attached, due-date-ascending (undated last)
 */
export async function fetchObligationRegister(supabase, opts = {}) {
  const spec = buildRegisterQuerySpec(opts);

  let q = supabase
    .from("obligations")
    // REG-GRAIN (2026-09-05): the SAME query, one added embed — `item_forward_events(obligation_text)`
    // follows the existing forward_event_id FK (no extra round trip; PostgREST resolves an embed inside
    // one request) so a register row carries its own obligation's text, not just its item/kind/date.
    // See this module's header ("the register renders one row per obligations row... a genuinely
    // distinct obligation sharing the same date/kind/item is otherwise indistinguishable from its
    // neighbour") and flattenObligationText below for the shape this produces.
    .select("id, intelligence_item_id, forward_event_id, jurisdiction, modes, binding_position, due_date, date_precision, event_kind, status, item_forward_events(obligation_text)")
    .eq("status", "active");
  q = spec.itemId ? q.eq("intelligence_item_id", spec.itemId) : q;
  // Overfetch before the app-side filter/window pass, same reasoning read-upcoming.mjs states for its
  // own overfetch factor — jurisdiction/mode/window filtering happens after the item join below, not in
  // this query, so a tight `.limit(spec.limit)` here could starve the post-filter result short.
  q = q.limit(spec.itemId ? Math.max(spec.limit, 100) : spec.limit * 5 || 1000);

  const { data: rawRows, error } = await q;
  if (error || !rawRows || rawRows.length === 0) return [];
  const rows = rawRows.map(flattenObligationText);

  const itemIds = [...new Set(rows.map((r) => r.intelligence_item_id))];
  const itemsById = new Map();
  // Chunked .in() — same reason read-upcoming.mjs chunks its own item join.
  for (let i = 0; i < itemIds.length; i += 200) {
    const { data: itemRows } = await supabase
      .from("intelligence_items")
      .select("id, title, legacy_id, jurisdiction_iso")
      .eq("is_archived", false)
      .eq("provenance_status", "verified") // customer read gate — see this module's header
      .in("id", itemIds.slice(i, i + 200));
    for (const row of itemRows ?? []) itemsById.set(row.id, row);
  }

  return selectRegisterRows(rows, itemsById, spec);
}

/**
 * PERF-11 (2026-09-04). PAGED sibling of fetchObligationRegister: same query/join, but the fixed overfetch
 * cap is no longer tied to the requested page size (see the OVERFETCH_CAP comment below) and the return
 * shape is `{ rows, total }` so a caller can page through the register (list-variant "Load more") without
 * losing the honest "N of M" count or breaking jurisdiction/mode/due-window filter correctness for pages
 * past the first. `fetchObligationRegister` above is UNCHANGED (still used by the detail variant, whose
 * `itemId`-scoped result set is always small) — this is additive, not a replacement.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ jurisdiction?: string|null, mode?: string|null, bindingPosition?: string|null,
 *           dueWindow?: string|null, limit?: number, offset?: number, itemId?: string|null }} [opts]
 * @returns {Promise<{ rows: Array<object>, total: number }>}
 */
export async function fetchObligationRegisterPage(supabase, opts = {}) {
  const spec = buildRegisterQuerySpec(opts);

  let q = supabase
    .from("obligations")
    // REG-GRAIN (2026-09-05): same added embed as fetchObligationRegister above — one query shape for
    // both the first-page and the paged/filtered path, per this module's header.
    .select("id, intelligence_item_id, forward_event_id, jurisdiction, modes, binding_position, due_date, date_precision, event_kind, status, item_forward_events(obligation_text)")
    .eq("status", "active");
  q = spec.itemId ? q.eq("intelligence_item_id", spec.itemId) : q;
  // OVERFETCH_CAP: fixed, NOT `spec.limit * <factor>` — the jurisdiction/mode/due-window filters apply
  // in JS, after this fetch, so tying the DB fetch size to the requested PAGE size (as
  // fetchObligationRegister's own `spec.limit * 5` does) would silently under-cover the corpus once a
  // page is small: a 60-row page * 5 = 300 rows fetched, but the live table already carries 1,141 rows
  // matching the item-verified join [CONFIRMED, live SQL, 2026-09-04] — a "Next 90 days" filter could
  // miss real matches sitting past row 300 of an arbitrary (unordered) DB scan. 2000 is a fixed margin
  // comfortably above today's measured count with room for corpus growth; re-derive if the live count
  // (`select count(*) from obligations o join intelligence_items ii on ii.id=o.intelligence_item_id
  // where ii.provenance_status='verified' and ii.is_archived is not true`) approaches it.
  const OVERFETCH_CAP = 2000;
  q = q.limit(spec.itemId ? Math.max(spec.limit, 100) : OVERFETCH_CAP);

  const { data: rawRows, error } = await q;
  if (error || !rawRows || rawRows.length === 0) return { rows: [], total: 0 };
  const rows = rawRows.map(flattenObligationText);

  const itemIds = [...new Set(rows.map((r) => r.intelligence_item_id))];
  const itemsById = new Map();
  for (let i = 0; i < itemIds.length; i += 200) {
    const { data: itemRows } = await supabase
      .from("intelligence_items")
      .select("id, title, legacy_id, jurisdiction_iso")
      .eq("is_archived", false)
      .eq("provenance_status", "verified")
      .in("id", itemIds.slice(i, i + 200));
    for (const row of itemRows ?? []) itemsById.set(row.id, row);
  }

  const joined = [];
  for (const row of rows) {
    const item = itemsById.get(row.intelligence_item_id);
    if (!item) continue;
    joined.push({ ...row, item });
  }
  return filterJoinedRowsPage(joined, spec);
}

/**
 * PERF-11 (2026-09-04). The register's jurisdiction/mode filter DROPDOWN OPTIONS, sourced independently
 * of whatever page of rows is currently loaded — a first-page-only fetch (60 rows) would otherwise offer
 * an incomplete, silently-wrong option list (missing any jurisdiction/mode that happens not to appear in
 * the soonest 60 due dates). Reads only the two small array columns (never the full row, never joined to
 * items), server-side only — the dedupe happens here and only the resulting short option lists (today:
 * low tens of jurisdictions, ~6 modes) ever reach the client as props. Bounded to the same active-status
 * predicate the register itself uses; never throws (degrades to empty arrays, same "render what's known,
 * never break the page" posture as this module's other reads).
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @returns {Promise<{ jurisdictions: string[], modes: string[] }>}
 */
export async function fetchRegisterFacetOptions(supabase) {
  try {
    const { data, error } = await supabase
      .from("obligations")
      .select("jurisdiction, modes")
      .eq("status", "active")
      .limit(5000);
    if (error || !Array.isArray(data)) return { jurisdictions: [], modes: [] };
    const jurisdictions = new Set();
    const modes = new Set();
    for (const row of data) {
      for (const j of row.jurisdiction ?? []) jurisdictions.add(j);
      for (const m of row.modes ?? []) modes.add(m);
    }
    return { jurisdictions: [...jurisdictions].sort(), modes: [...modes].sort() };
  } catch {
    return { jurisdictions: [], modes: [] };
  }
}

/**
 * The count behind the empty state's "derived from N forward events on file" message (spec-01's own
 * register framing: the register is a DERIVATION of item_forward_events, migration 274 — 901+ rows live
 * — not an independent input, so an empty `obligations` table is never "nothing to show," it is "not yet
 * derived," and the UI must say which of those two states it is in rather than rendering a bare "no
 * obligations" that reads as the corpus having nothing to say). Counts item_forward_events directly
 * (head:true — no row payload, RLS still applies through the same is_archived-gated policy migration 274
 * ships) rather than trusting a cached total anywhere. Never throws: an error or a null count degrades to
 * `null` (the caller renders the generic empty copy with no count, same "degrade rather than break the
 * page" posture every I/O function in this module already takes).
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase - request-scoped client (RLS applies)
 * @returns {Promise<number|null>}
 */
export async function fetchForwardEventCount(supabase) {
  const { count, error } = await supabase
    .from("item_forward_events")
    .select("id", { count: "exact", head: true });
  if (error || typeof count !== "number") return null;
  return count;
}
