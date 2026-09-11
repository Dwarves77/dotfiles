// Pure/injectable core of GET /api/search, split out of route.ts (BUILDGATE, 2026-09-02: a route.ts
// may export only route handlers/config — see check-sources/logic.ts's identical precedent cited in
// route.ts's own header). Split here specifically so the BOUND and the SCOPE gate can be proven with
// a fake Supabase client under `node --test`, the same shape check-sources/logic.npmtest.mjs and
// admin/recompute-trust/logic.npmtest.mjs already use — no NextRequest/NextResponse involved.

export const MIN_QUERY_LEN = 2;
// BOUND (F38/F39): the RPC's own max_rows argument, itself clamped to <=30 inside
// search_intelligence_items (migration 159). Kept below that ceiling, not at it, so this route's
// result set is never the widest thing the RPC would allow.
export const MAX_RESULTS = 20;

export interface SearchResultRow {
  id: string;
  title: string;
  item_type: string | null;
  domain: number | null;
  priority: string | null;
  jurisdictions: string[] | null;
  transport_modes: string[] | null;
  topic: string | null;
}

/** The subset of a Supabase client this module needs — narrow enough to fake in a test, matching
 *  auth.ts's ClaimsVerifier / check-sources' fakeSvc precedent. */
export interface SearchSupabaseClient {
  // PromiseLike, not Promise: the real @supabase/supabase-js client's `.rpc()`/`.in()` return a
  // PostgrestFilterBuilder (thenable, awaitable) rather than a literal Promise instance, so a
  // Promise-typed signature here rejects the real client at the route's own call site. A plain fake
  // object returning a real Promise still satisfies PromiseLike structurally.
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: unknown): {
        eq(col: string, val: unknown): {
          in(col: string, vals: string[]): PromiseLike<{ data: SearchResultRow[] | null; error: { message: string } | null }>;
        };
      };
    };
  };
}

/**
 * Standard Search's retrieval step. Mirrors /api/ask's own two-step retrieval (RPC rank, then a
 * re-fetch of exactly those ids with the customer read gate re-applied) rather than inventing a
 * second FTS mechanism — see route.ts's own header for the rule-13 rationale.
 *
 * BOUNDED: `maxRows` caps the RPC call; the subsequent `.in(id, hitIds)` re-fetch reads exactly the
 * RPC's own top-K hit set, so its size can never exceed `maxRows` either — the same bound proof
 * /api/ask's retrieval site carries at its own `.in()` call.
 *
 * SCOPED: `.eq("is_archived", false).eq("provenance_status", "verified")` is the SAME customer read
 * predicate every other authenticated read in this app applies (search_intelligence_items enforces
 * it a first time inside the RPC; this re-applies it belt-and-suspenders, matching /api/ask). No org
 * filter is added because none of this app's other intelligence_items reads — including /api/ask —
 * filter by org; the corpus is one shared platform corpus, not a per-org table (see route.ts header).
 *
 * A query shorter than MIN_QUERY_LEN never reaches the client — callers check that first — so this
 * function assumes `q` is already a real query.
 */
export async function runSearch(
  supabase: SearchSupabaseClient,
  q: string,
  maxRows: number = MAX_RESULTS
): Promise<SearchResultRow[]> {
  const boundedMaxRows = Math.min(Math.max(1, maxRows), MAX_RESULTS);

  const { data: hits, error: rpcErr } = await supabase.rpc("search_intelligence_items", {
    q,
    max_rows: boundedMaxRows,
  });
  if (rpcErr) return [];

  const hitIds: string[] = ((hits as Array<{ id: string }> | null) ?? []).map((h) => h.id);
  if (hitIds.length === 0) return [];

  const { data: rows, error: rowErr } = await supabase
    .from("intelligence_items")
    // BUGFIX (SEARCHFIX, 2026-09-11): `topic` is NOT a column on intelligence_items — the real
    // columns are `category`/`theme`/`topic_tags`. Every other reader in this app that populates
    // Resource.topic does `topic: row.category || undefined` (supabase-server.ts, 3 call sites);
    // this re-fetch instead asked PostgREST for a bare `topic` column, which does not exist, so
    // PostgREST rejected the request wholesale with 400 ("column intelligence_items.topic does not
    // exist" — captured verbatim in postgres_logs, 2026-09-09T19:2x, live project kwrsbpiseruzbfwjpvsp)
    // for every hit set, every term, 100% of the time — `rowErr` below was always truthy, so
    // runSearch always returned []. `topic:category` aliases the real column to the JSON key
    // CommandBar.tsx's SearchResultRow/metaLine already expect, matching the app-wide convention
    // instead of inventing a second one.
    .select("id, title, item_type, domain, priority, jurisdictions, transport_modes, topic:category")
    .eq("is_archived", false)
    .eq("provenance_status", "verified")
    // fitness-allow: F39 (hitIds is the RPC's own top-K hit set, bounded by boundedMaxRows above)
    .in("id", hitIds);
  if (rowErr) {
    // Observable failure (matches /api/ask's own `console.warn` on its identical re-fetch): a
    // silent [] here is exactly how this defect shipped invisibly for two days.
    console.warn(`[search] re-fetch failed: ${rowErr.message}`);
    return [];
  }
  if (!rows) return [];

  const byId = new Map(rows.map((r) => [r.id, r]));
  return hitIds.map((id) => byId.get(id)).filter((r): r is SearchResultRow => Boolean(r));
}
