// /api/admin/corpus-turn-requests
//
// Read/write surface for corpus_turn_requests (migration 277) — the "this item needs a flywheel turn"
// queue the migration's own trigger (`enqueue_corpus_turn_request`) fills mechanically for every producer
// that bypasses the in-app rule-16 chokepoints. This route does NOT run a turn itself (no discovery, no
// forward-event extraction) — same posture as admin/forward-events and admin/themes (this file's own
// header states it): it only ASSEMBLES/APPENDS what the trigger (GET) and the operator (POST) put there.
// The actual turn is `scripts/turns/consume-turn-requests.mjs` (reads + marks consumed) feeding
// `scripts/connections/discover-for-items.mjs --ids <...>`, or the corpus-turn GitHub Actions workflow a
// sibling lane owns.
//
// Methods:
//   GET   — list OPEN requests (consumed_at IS NULL), joined with the item's title/legacy_id so the admin
//           panel can render something meaningful without a second round trip, plus open_count and
//           last_consumed_at (MAX(consumed_at) across every row, open or not — "when did a corpus turn
//           last actually run" is the useful operator signal, not just today's open count).
//   POST  — insert a MANUAL request: { itemId: "<uuid>" } for one item, or { all: true } to backfill a
//           reason='manual' request for every live (verified, non-archived) item that does not already
//           carry an open one. 'manual' is the one reason value the trigger itself never writes (migration
//           277's own header) — reserved for exactly this operator action.
//
// Auth: requireAuth + isPlatformAdmin + checkRateLimit (house admin-route pattern — mirrors
// admin/forward-events, the freshest example at time of writing). Cache-Control: no-store on GET — this
// is an operator queue read, not a cached surface (same posture admin/forward-events documents for
// itself).

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-service";

import { requireAuth, isAuthError } from "@/lib/api/auth";
import { isPlatformAdmin } from "@/lib/auth/admin";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

const NO_STORE = "no-store";

// Batch size for the --all backfill insert (mirrors the 200/500-row chunking admin/forward-events and
// item_forward_events writers already use for this table's neighbors — large enough to be a handful of
// round trips over the ~300-item live corpus, small enough to stay well under PostgREST's request-size
// comfort zone).
const INSERT_CHUNK = 500;
// Same 1000-row PostgREST page cap readAll()/db.mjs documents (`max-rows`) — paginate, never assume a
// single .select() returns everything.
const PAGE_SIZE = 1000;

function withNoStore(resp: NextResponse): NextResponse {
  resp.headers.set("Cache-Control", NO_STORE);
  return resp;
}

async function requireAdmin(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return { error: withNoStore(auth) } as const;
  const limited = checkRateLimit(auth.userId);
  if (limited) return { error: withNoStore(limited) } as const;

  const supabase = getServiceSupabase();
  const admin = await isPlatformAdmin(auth.userId, supabase);
  if (!admin) {
    return {
      error: withNoStore(
        NextResponse.json(
          { error: "Platform admin access required" },
          { status: 403, headers: rateLimitHeaders(auth.userId) }
        )
      ),
    } as const;
  }
  return { userId: auth.userId, supabase } as const;
}

/** Paginated single-column read matching a filter — the same "PostgREST caps at ~1000 rows" guard
 *  scripts/lib/db.mjs's readAll documents, reimplemented here (a route cannot import a scripts/ module).
 *  `column` is the value collected per row (e.g. "id" for intelligence_items, "intelligence_item_id" for
 *  corpus_turn_requests — the two tables' own row identity is not the value this route needs from them). */
async function readAllValues(
  supabase: ReturnType<typeof getServiceSupabase>,
  table: string,
  column: string,
  applyFilter: (q: any) => any
): Promise<string[]> {
  const values: string[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let q = supabase.from(table).select(column).order(column, { ascending: true }).range(from, from + PAGE_SIZE - 1);
    q = applyFilter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table} read failed: ${error.message}`);
    const rows = (data ?? []) as unknown as Array<Record<string, string>>;
    for (const row of rows) values.push(row[column]);
    if (!data || data.length < PAGE_SIZE) break;
  }
  return values;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;
  const { userId, supabase } = admin;

  const { data: openRows, error: openErr } = await supabase
    .from("corpus_turn_requests")
    .select("id, intelligence_item_id, reason, requested_at")
    .is("consumed_at", null)
    .order("requested_at", { ascending: true })
    .limit(PAGE_SIZE);
  if (openErr) {
    return withNoStore(
      NextResponse.json({ error: openErr.message }, { status: 500, headers: rateLimitHeaders(userId) })
    );
  }
  const open = openRows ?? [];

  // Item join — only the items these open rows actually reference, chunked (mirrors admin/forward-events'
  // own chunked .in() pattern for the identical reason: the id list can exceed a safe single-call size).
  const itemIds = [...new Set(open.map((r) => r.intelligence_item_id))];
  const itemsById = new Map<string, { id: string; title: string; legacy_id: string | null }>();
  for (let i = 0; i < itemIds.length; i += 200) {
    const { data: itemRows, error: itemErr } = await supabase
      .from("intelligence_items")
      .select("id, title, legacy_id")
      .in("id", itemIds.slice(i, i + 200));
    if (itemErr) {
      return withNoStore(
        NextResponse.json({ error: itemErr.message }, { status: 500, headers: rateLimitHeaders(userId) })
      );
    }
    for (const row of itemRows ?? []) itemsById.set(row.id, row);
  }

  const openWithItem = open.map((r) => ({ ...r, item: itemsById.get(r.intelligence_item_id) ?? null }));

  // Last-consumed timestamp — the useful "is anything actually running" signal, over EVERY row (open or
  // not), not just today's open count. A small aggregate read; corpus_turn_requests is not expected to
  // grow past a few thousand rows before consumption keeps it trimmed.
  const { data: lastConsumedRow, error: lastErr } = await supabase
    .from("corpus_turn_requests")
    .select("consumed_at")
    .not("consumed_at", "is", null)
    .order("consumed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastErr) {
    return withNoStore(
      NextResponse.json({ error: lastErr.message }, { status: 500, headers: rateLimitHeaders(userId) })
    );
  }

  return withNoStore(
    NextResponse.json(
      {
        open: openWithItem,
        open_count: open.length,
        last_consumed_at: lastConsumedRow?.consumed_at ?? null,
      },
      { headers: rateLimitHeaders(userId) }
    )
  );
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;
  const { userId, supabase } = admin;

  let body: { itemId?: unknown; all?: unknown };
  try {
    body = await request.json();
  } catch {
    return withNoStore(
      NextResponse.json({ error: "body must be { itemId: string } or { all: true }" }, { status: 400 })
    );
  }

  const itemId = typeof body.itemId === "string" && body.itemId.length > 0 ? body.itemId : null;
  const all = body.all === true;

  if ((itemId && all) || (!itemId && !all)) {
    return withNoStore(
      NextResponse.json(
        { error: "pass exactly one of { itemId: string } or { all: true }" },
        { status: 400 }
      )
    );
  }

  // reason is ALWAYS 'manual' for this route, regardless of what the request body says — the one value
  // the trigger itself never writes (migration 277 header), reserved for this exact operator action.
  const REASON = "manual" as const;

  if (itemId) {
    const { data: item, error: itemErr } = await supabase
      .from("intelligence_items")
      .select("id, is_archived, provenance_status")
      .eq("id", itemId)
      .maybeSingle();
    if (itemErr) {
      return withNoStore(
        NextResponse.json({ error: itemErr.message }, { status: 500, headers: rateLimitHeaders(userId) })
      );
    }
    if (!item) {
      return withNoStore(
        NextResponse.json({ error: `item ${itemId} not found` }, { status: 404, headers: rateLimitHeaders(userId) })
      );
    }
    if (item.is_archived || item.provenance_status !== "verified") {
      return withNoStore(
        NextResponse.json(
          { error: "item is not live (archived or not verified) — nothing for a corpus turn to act on" },
          { status: 409, headers: rateLimitHeaders(userId) }
        )
      );
    }

    const { data: existing, error: existingErr } = await supabase
      .from("corpus_turn_requests")
      .select("id")
      .eq("intelligence_item_id", itemId)
      .is("consumed_at", null)
      .maybeSingle();
    if (existingErr) {
      return withNoStore(
        NextResponse.json({ error: existingErr.message }, { status: 500, headers: rateLimitHeaders(userId) })
      );
    }
    if (existing) {
      return withNoStore(
        NextResponse.json(
          { ok: true, inserted: 0, already_open: true, requestId: existing.id },
          { headers: rateLimitHeaders(userId) }
        )
      );
    }

    const { data: inserted, error: insertErr } = await supabase
      .from("corpus_turn_requests")
      .insert({ intelligence_item_id: itemId, reason: REASON })
      .select("id")
      .single();
    if (insertErr) {
      return withNoStore(
        NextResponse.json({ error: insertErr.message }, { status: 500, headers: rateLimitHeaders(userId) })
      );
    }
    return withNoStore(
      NextResponse.json(
        { ok: true, inserted: 1, already_open: false, requestId: inserted.id },
        { headers: rateLimitHeaders(userId) }
      )
    );
  }

  // all:true — backfill a manual request for every live item that does not already carry an open one.
  let liveIds: string[];
  let openItemIds: string[];
  try {
    liveIds = await readAllValues(supabase, "intelligence_items", "id", (q) =>
      q.eq("is_archived", false).eq("provenance_status", "verified")
    );
    openItemIds = await readAllValues(supabase, "corpus_turn_requests", "intelligence_item_id", (q) =>
      q.is("consumed_at", null)
    );
  } catch (e) {
    return withNoStore(
      NextResponse.json(
        { error: e instanceof Error ? e.message : String(e) },
        { status: 500, headers: rateLimitHeaders(userId) }
      )
    );
  }
  const openItemIdSet = new Set(openItemIds);
  const targets = liveIds.filter((id) => !openItemIdSet.has(id));

  let insertedCount = 0;
  for (let i = 0; i < targets.length; i += INSERT_CHUNK) {
    const chunk = targets.slice(i, i + INSERT_CHUNK).map((id) => ({ intelligence_item_id: id, reason: REASON }));
    if (!chunk.length) continue;
    const { data: insertedRows, error: insertErr } = await supabase
      .from("corpus_turn_requests")
      .insert(chunk)
      .select("id");
    if (insertErr) {
      return withNoStore(
        NextResponse.json(
          { error: `insert failed after ${insertedCount} row(s): ${insertErr.message}` },
          { status: 500, headers: rateLimitHeaders(userId) }
        )
      );
    }
    insertedCount += insertedRows?.length ?? 0;
  }

  return withNoStore(
    NextResponse.json(
      {
        ok: true,
        inserted: insertedCount,
        already_open: openItemIdSet.size,
        total_live: liveIds.length,
      },
      { headers: rateLimitHeaders(userId) }
    )
  );
}
