// read-upcoming.mjs — the CUSTOMER-FACING read for item_forward_events ("what is due, when"), migration
// 274/275. Lane SURF (customer-value surfaces, 2026-09-01).
//
// WHY THIS EXISTS. The 901 rows this table holds today render on exactly one surface: the admin-only
// UpcomingObligationsPanel (src/components/admin/UpcomingObligationsPanel.tsx, reached via
// SourceHealthDashboard's "Sources" tab) through the platform-admin-gated GET /api/admin/forward-events.
// No customer sees "what is due, when" anywhere — the system review's own words (docs/audits/
// system-review-2026-09-01.md §7: "an obligations calendar (the 901 events exist, on an admin tab)").
// This module is the customer read: it does NOT call the admin route (that route is
// requireAuth + isPlatformAdmin-gated by design, and forbidden to this lane to modify), and it does NOT
// re-derive precision-honest date rendering (src/lib/connections/forward-event-format.mjs owns that —
// this module hands back the raw event_date/date_precision columns; the caller renders them through
// formatEventDate, same as the admin panel does).
//
// RLS, NOT A SEPARATE GATE. Migration 274's own header: "item_forward_events is customer-visible
// content... a public SELECT policy gated on the parent item's is_archived flag, nothing more
// restrictive" (mirrors migration 103, intelligence_item_sections). So the ONLY thing standing between
// a browsing customer and these rows is the Postgres RLS policy itself — this module performs NO extra
// authorization of its own and must always be called with the REQUEST-SCOPED client (createServerClient
// from src/lib/supabase-server-client.ts, cookie-bound, anon key) so that policy actually applies. Never
// call it with a service-role client from a customer-facing page — that would bypass RLS entirely and
// is exactly the posture the admin route uses on purpose (platform-admin gate replacing RLS for an
// operator queue read). The customer read gate this module ADDS on top of RLS (defense in depth, same
// posture RegulationDetailPage's related-items lookup and research/[slug]/page.tsx's related-findings
// query already take): the item join also filters `provenance_status = 'verified'` — RLS itself does not
// check this column, only is_archived, so a forward event lifted from a live-but-unverified/quarantined
// item (should one ever exist — FE-1's own corpus was 322 verified live items, but this module does not
// trust that invariant blindly) is dropped here rather than rendered to a customer.
//
// PURE QUERY BUILDER + A FUNCTION TAKING THE CLIENT, per this lane's brief: everything that can be
// tested without a database (kind-filter defaulting, jurisdiction-filter defaulting and matching,
// ordering, limiting, the item-join composition) is a plain function below; buildUpcomingEventsQuery and
// buildItemLookupQuery are pure query-SPEC builders (a plain params object a caller applies to a real
// supabase-js query builder — see fetchUpcomingObligations for the one place that actually does), and
// selectUpcoming is the pure post-join view-model shaper. fetchUpcomingObligations is the only function
// here that touches I/O.
//
// PLAIN ESM, NO `@/` ALIAS (same portability constraint src/lib/connections/gaps.mjs states for itself):
// this file is meant to be importable by a plain `node --test` proof of its pure parts with zero
// tsconfig/Next resolution, and by both the (React server component) regulations list and detail pages.
//
// EVENT_KINDS / DATE_PRECISIONS mirror the CHECK-constrained vocabularies migration 274 owns
// (item_forward_events_event_kind_check / _date_precision_check) and the SAME literal sets the admin
// route (src/app/api/admin/forward-events/route.ts) and panel already hold — this is the third holder of
// that closed 6/3-value vocabulary, not a new one; migration 274 is the actual source of truth (a DB
// CHECK constraint), and every one of the three holders is a plain array a reader can diff against it by
// eye. Duplicating a 6-literal enum three times is the existing, already-accepted posture in this
// codebase (see forward-event-format.mjs's own header for why a shared module was not created for the
// even-smaller PRECISIONS set) — not a new pattern introduced here.

export const EVENT_KINDS = Object.freeze([
  "entry_into_force", "compliance_deadline", "review_or_report",
  "phase_step", "consultation_close", "other",
]);

/** The kind filter this reader applies when the caller does not pass one: every kind except 'other'.
 *  'other' is the extractor's own "deliberately declined to over-classify" bucket (migration 274's
 *  column comment) — real, but the least legible thing to lead an obligations calendar with. A caller
 *  that wants 'other' too passes an explicit `kinds` array that includes it. */
export const DEFAULT_KINDS = Object.freeze(EVENT_KINDS.filter((k) => k !== "other"));

/** Jurisdiction profile keys that mean "everywhere" — never a meaningful filter to apply (same constant
 *  gaps.mjs keeps for the identical reason, duplicated here rather than imported so this module stays
 *  free of a cross-directory src/lib/connections dependency for one three-item set). */
const GENERIC_JURISDICTIONS = new Set(["global", "worldwide", "all"]);

/**
 * Pure: derive the default jurisdiction filter from a workspace profile's jurisdiction-weights map
 * (`WorkspaceProfile.jurisdictions`, `Record<iso, weight>` — src/lib/workspace/profile.ts's own shape,
 * NOT imported here, passed in as a plain object so this module needs no `@/` alias / live-client
 * dependency). Returns `null` (meaning "no filter — show every jurisdiction") when the profile is empty,
 * carries only generic/global keys, or is absent — the same "degrade to no filter, never invent a
 * jurisdiction" posture gaps.mjs takes for its own jurisdiction-span detector.
 *
 * @param {Record<string, number> | null | undefined} profileJurisdictions
 * @returns {string[] | null} lower-cased jurisdiction keys to filter to, or null for "no filter"
 */
export function defaultJurisdictionFilter(profileJurisdictions) {
  if (!profileJurisdictions || typeof profileJurisdictions !== "object") return null;
  const keys = Object.keys(profileJurisdictions)
    .map((k) => String(k).toLowerCase())
    .filter((k) => !GENERIC_JURISDICTIONS.has(k));
  return keys.length > 0 ? keys : null;
}

/**
 * Pure: does `itemJurisdictionIso` (an intelligence_items.jurisdiction_iso array, e.g. ["US-CA", "EU"])
 * satisfy `filterKeys` (lower-cased workspace jurisdiction keys, e.g. ["us", "eu", "imo"])?
 *
 * KNOWN LIMITATION, STATED RATHER THAN HIDDEN (same one gaps.mjs's own header names for its jurisdiction
 * matching): workspace_settings.jurisdiction_weights keys are lower-case short codes ('eu','us','uk',
 * 'imo') while intelligence_items.jurisdiction_iso is upper-case ISO-3166-ish ('EU','US','GB','IMO') plus
 * subnational codes ('US-CA'). This function handles the case-fold and the subnational-parent case
 * ('us' matches 'US-CA' via a prefix check) but does NOT resolve 'uk' to 'GB' — no ISO alias table
 * exists yet (gaps.mjs's own note names this same gap as unfixed). A workspace weighting 'uk' will not
 * match a 'GB' item until that alias table exists; documented here rather than silently "fixed" by a
 * guessed mapping.
 *
 * @param {string[] | null | undefined} itemJurisdictionIso
 * @param {string[] | null} filterKeys - null means "no filter", always matches
 * @returns {boolean}
 */
export function jurisdictionMatches(itemJurisdictionIso, filterKeys) {
  if (!filterKeys || filterKeys.length === 0) return true;
  if (!Array.isArray(itemJurisdictionIso) || itemJurisdictionIso.length === 0) return false;
  const keys = filterKeys.map((k) => String(k || "").toLowerCase()).filter(Boolean);
  return itemJurisdictionIso.some((raw) => {
    const iso = String(raw || "").toLowerCase();
    if (!iso) return false;
    return keys.some((key) => iso === key || iso.startsWith(`${key}-`));
  });
}

/**
 * Pure query-spec builder for the item_forward_events read: NOT itself a supabase-js query (this module
 * has no client), a plain params object fetchUpcomingObligations applies to one. Kept separate and pure
 * so the *defaulting* logic (kind-filter default, from-date default) is unit-testable with zero I/O,
 * mirroring admin/forward-events/route.ts's own parseCsvFilter shape one level up (a plain params object
 * instead of URLSearchParams, since this reader has no request to parse).
 *
 * @param {{ itemId?: string, kinds?: string[], from?: string, limit?: number }} [opts]
 * @returns {{ itemId: string|null, kinds: string[], from: string, limit: number }}
 */
export function buildUpcomingEventsQuerySpec(opts = {}) {
  const kinds = Array.isArray(opts.kinds) && opts.kinds.length > 0
    ? opts.kinds.filter((k) => EVENT_KINDS.includes(k))
    : [...DEFAULT_KINDS];
  const from = typeof opts.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(opts.from)
    ? opts.from
    : new Date().toISOString().slice(0, 10);
  const limit = Number.isFinite(opts.limit) && opts.limit > 0 ? Math.min(500, Math.floor(opts.limit)) : 8;
  return { itemId: opts.itemId ?? null, kinds, from, limit };
}

/**
 * Pure: shape the post-join view model — filter dropped-item rows (RLS/verified-gate already applied by
 * the caller's item lookup query; this only guards against a caller wiring the two reads together
 * wrong), apply the jurisdiction filter, and cap at `limit`. Rows arrive already date-ascending from the
 * DB query (item_forward_events' own idx_item_forward_events_event_date + .order()); this function does
 * NOT re-sort — re-sorting here would silently paper over a caller that forgot .order() rather than
 * surfacing it, and the DB is the one source of truth for "soonest first" (migration 274's own indexing
 * comment).
 *
 * @param {Array<{id:string, intelligence_item_id:string, event_date:string, date_precision:string, event_kind:string, obligation_text:string, source_kind:string, confidence:string}>} events
 * @param {Map<string, {id:string, title:string, legacy_id:string|null, jurisdiction_iso:string[]|null}>} itemsById
 * @param {{ jurisdictionFilter?: string[]|null, limit?: number }} [opts]
 * @returns {Array<object>} events with `.item` attached, jurisdiction-filtered, capped at limit
 */
export function selectUpcoming(events, itemsById, opts = {}) {
  const jurisdictionFilter = opts.jurisdictionFilter ?? null;
  const limit = Number.isFinite(opts.limit) && opts.limit > 0 ? Math.floor(opts.limit) : Infinity;

  const out = [];
  for (const ev of Array.isArray(events) ? events : []) {
    const item = itemsById.get(ev.intelligence_item_id);
    if (!item) continue; // dropped: not in the verified/live join — never render a broken/leaked link
    if (!jurisdictionMatches(item.jurisdiction_iso, jurisdictionFilter)) continue;
    out.push({ ...ev, item });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * The one function here that touches I/O. `supabase` MUST be the request-scoped client (RLS applies —
 * see this module's header); passing a service-role client defeats the customer read gate this reader
 * exists to enforce correctly.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ itemId?: string, kinds?: string[], from?: string, limit?: number, jurisdictionFilter?: string[]|null }} [opts]
 * @returns {Promise<Array<object>>} events with `.item` attached, soonest-first, capped at `limit`
 */
export async function fetchUpcomingObligations(supabase, opts = {}) {
  const spec = buildUpcomingEventsQuerySpec(opts);

  let q = supabase
    .from("item_forward_events")
    .select("id, intelligence_item_id, event_date, date_precision, event_kind, obligation_text, source_kind, confidence")
    .gte("event_date", spec.from)
    .in("event_kind", spec.kinds)
    .order("event_date", { ascending: true });

  // A detail-page call scopes to one item and asks for every upcoming row it has (no small default cap
  // hiding a later obligation on the SAME item); a list-page call caps to a small "top strip" count.
  // Overfetch by the item-lookup's own chunk factor is unnecessary here — .limit() is applied to the
  // already-sorted event rows before the item join, same order the admin route uses.
  q = spec.itemId ? q.eq("intelligence_item_id", spec.itemId).limit(Math.max(spec.limit, 100)) : q.limit(spec.limit * 5 || 40);

  const { data: events, error } = await q;
  if (error || !events || events.length === 0) return [];

  const itemIds = [...new Set(events.map((r) => r.intelligence_item_id))];
  const itemsById = new Map();
  // Chunked .in() — same reason admin/forward-events/route.ts chunks its own item join.
  for (let i = 0; i < itemIds.length; i += 200) {
    const { data: itemRows } = await supabase
      .from("intelligence_items")
      .select("id, title, legacy_id, jurisdiction_iso")
      .eq("is_archived", false)
      .eq("provenance_status", "verified") // customer read gate — see this module's header
      .in("id", itemIds.slice(i, i + 200));
    for (const row of itemRows ?? []) itemsById.set(row.id, row);
  }

  return selectUpcoming(events, itemsById, {
    jurisdictionFilter: opts.jurisdictionFilter ?? null,
    limit: spec.limit,
  });
}
