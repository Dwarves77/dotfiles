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
  const todayIso =
    typeof opts.todayIso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(opts.todayIso)
      ? opts.todayIso
      : new Date().toISOString().slice(0, 10);
  return { jurisdiction, mode, bindingPosition, dueWindow, limit, todayIso, itemId: opts.itemId ?? null };
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
 * @param {{ jurisdiction: string|null, mode: string|null, bindingPosition: string|null, dueWindow: string, todayIso: string, limit?: number }} spec
 */
export function filterJoinedRows(joinedRows, spec) {
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
  return spec.limit ? out.slice(0, spec.limit) : out;
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
    .select("id, intelligence_item_id, forward_event_id, jurisdiction, modes, binding_position, due_date, date_precision, event_kind, status")
    .eq("status", "active");
  q = spec.itemId ? q.eq("intelligence_item_id", spec.itemId) : q;
  // Overfetch before the app-side filter/window pass, same reasoning read-upcoming.mjs states for its
  // own overfetch factor — jurisdiction/mode/window filtering happens after the item join below, not in
  // this query, so a tight `.limit(spec.limit)` here could starve the post-filter result short.
  q = q.limit(spec.itemId ? Math.max(spec.limit, 100) : spec.limit * 5 || 1000);

  const { data: rows, error } = await q;
  if (error || !rows || rows.length === 0) return [];

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
