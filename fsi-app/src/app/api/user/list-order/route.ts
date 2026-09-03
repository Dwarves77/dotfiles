import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-service";

import { revalidateTag } from "next/cache";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { withErrorCapture } from "@/lib/telemetry/capture-error";
import { APP_DATA_TAG } from "@/lib/data";
import { LIST_ORDER_ITEM_ID_MAX, LIST_ORDER_SEED_MAX } from "@/lib/list-order";
// The list_key allowlist lives in a sibling module, not here: a route.ts may
// export only route handlers/config (F34's named residual — `next build
// --webpack` rejects any other export field). See logic.ts's header.
import { LIST_KEYS } from "./logic";

// /api/user/list-order — personal drag ordering (migrations 237 + 238).
//
// PERSONAL BY RULING ("drag order is personal"), which is why this route lives
// under /api/user and not /api/workspace: there is no org scope anywhere in the
// path, no role gate, and no notification fan-out. Rearranging your own rail is
// not a team action and must never read as one.
//
// Every write is scoped to the authed caller. p_user_id is passed to the RPC
// from auth.userId and is NEVER read from a request body — reorder_user_list_item
// is SECURITY DEFINER, so a body-supplied user_id would let any signed-in user
// rewrite anyone else's order straight through the RLS policies on
// user_list_order.

const LIST_KEY_SET: ReadonlySet<string> = new Set(LIST_KEYS);
const KEYS_HINT = LIST_KEYS.join("|");

// Both bounds are IMPORTED, not re-typed. The client checks them before it
// sends so a malformed drag fails locally with a useful message instead of as
// an opaque 400, and a second literal here would be free to drift from the one
// the client enforces. See list-order.ts for why the seed bound is where it is.
const SEED_MAX = LIST_ORDER_SEED_MAX;
const ITEM_ID_MAX = LIST_ORDER_ITEM_ID_MAX; // matches user_list_order_item_id_check

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function readItemId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > ITEM_ID_MAX) return null;
  return trimmed;
}

// GET /api/user/list-order?list_key=watchlist
// → { listKey, order: [{ itemId, position }] }
//
// Returns ONLY what is stored. An item the caller has never dragged has no row
// here, and the surface is expected to fall back to its own natural order for
// those — the route does not invent positions for unseen items, because it has
// no way to know what the surface is currently rendering.
async function handleGET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const listKey = request.nextUrl.searchParams.get("list_key") ?? "";
  if (!LIST_KEY_SET.has(listKey)) {
    return badRequest(`list_key is required and must be one of ${KEYS_HINT}`);
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("user_list_order")
    .select("item_id, position")
    .eq("user_id", auth.userId)
    .eq("list_key", listKey)
    .order("position", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // position is numeric, so postgrest-js hands it back as a string to preserve
  // exactness. It is passed through as a string for the same reason: the client
  // only ever compares order, and Number() on a deeply split midpoint would
  // reintroduce exactly the float rounding migration 238 exists to avoid.
  const order = (data ?? []).map((r) => ({
    itemId: r.item_id as string,
    position: String(r.position),
  }));

  return NextResponse.json(
    { listKey, order },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

// PATCH /api/user/list-order
// Body: { listKey, itemId, prevItemId?: string|null, nextItemId?: string|null,
//         seedItemIds?: string[] }
// → { listKey, itemId, position }
//
// prevItemId / nextItemId are the ids the item was dropped BETWEEN, in the
// surface's post-drop order. Either may be null at the head or tail of the list.
// seedItemIds is the full post-drop order and is used only when this list has
// never been ordered — see migration 238's header for why seeding belongs in the
// same transaction as the move.
//
// One drag writes ONE row in steady state. The alternative shape, sending the
// whole reordered array on every drop, would rewrite every row on every drag and
// would make two people on two devices clobber each other's entire list instead
// of just racing on one position.
async function handlePATCH(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const listKey = typeof body.listKey === "string" ? body.listKey : "";
  if (!LIST_KEY_SET.has(listKey)) {
    return badRequest(`listKey is required and must be one of ${KEYS_HINT}`);
  }

  const itemId = readItemId(body.itemId);
  if (!itemId) {
    return badRequest(`itemId is required and must be 1-${ITEM_ID_MAX} characters`);
  }

  const prevItemId = body.prevItemId == null ? null : readItemId(body.prevItemId);
  const nextItemId = body.nextItemId == null ? null : readItemId(body.nextItemId);
  if (body.prevItemId != null && !prevItemId) {
    return badRequest("prevItemId, when given, must be a non-empty string");
  }
  if (body.nextItemId != null && !nextItemId) {
    return badRequest("nextItemId, when given, must be a non-empty string");
  }
  // Rejected here as well as in the function. The RPC raises on this, but a
  // raised exception surfaces as an opaque 500; catching it at the edge gives
  // the client the actual reason.
  if (itemId === prevItemId || itemId === nextItemId) {
    return badRequest("itemId may not equal prevItemId or nextItemId");
  }

  let seedItemIds: string[] | null = null;
  if (body.seedItemIds != null) {
    if (!Array.isArray(body.seedItemIds)) {
      return badRequest("seedItemIds, when given, must be an array of strings");
    }
    if (body.seedItemIds.length > SEED_MAX) {
      return badRequest(`seedItemIds must contain ${SEED_MAX} entries or fewer`);
    }
    const cleaned: string[] = [];
    const seen = new Set<string>();
    for (const raw of body.seedItemIds) {
      const id = readItemId(raw);
      if (!id) {
        return badRequest(
          `seedItemIds entries must be non-empty strings of at most ${ITEM_ID_MAX} characters`
        );
      }
      // The seed feeds an INSERT keyed (user_id, list_key, item_id). A duplicate
      // would be swallowed by ON CONFLICT DO NOTHING, which means the ladder
      // would silently skip an ordinal and the caller would never learn its
      // list was malformed.
      if (seen.has(id)) {
        return badRequest(`seedItemIds contains a duplicate entry: ${id}`);
      }
      seen.add(id);
      cleaned.push(id);
    }
    seedItemIds = cleaned;
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase.rpc("reorder_user_list_item", {
    p_user_id: auth.userId,
    p_list_key: listKey,
    p_item_id: itemId,
    p_prev_item_id: prevItemId,
    p_next_item_id: nextItemId,
    p_seed_item_ids: seedItemIds,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // The rail is rendered from cached server data, so without this the drag
  // survives in local state but snaps back on the next server render.
  revalidateTag(APP_DATA_TAG, "max");

  return NextResponse.json(
    { listKey, itemId, position: data == null ? null : String(data) },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

// DELETE /api/user/list-order?list_key=watchlist[&item_id=<id>]
// → { listKey, itemId, deleted }
//
// With item_id: drops one item's stored position. With list_key alone: clears
// the whole list, which is the "reset to the default order" affordance. Clearing
// is a real feature rather than a maintenance hatch — a custom order that can be
// entered but not left is a trap.
async function handleDELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const listKey = request.nextUrl.searchParams.get("list_key") ?? "";
  if (!LIST_KEY_SET.has(listKey)) {
    return badRequest(`list_key is required and must be one of ${KEYS_HINT}`);
  }

  const rawItemId = request.nextUrl.searchParams.get("item_id");
  const itemId = rawItemId == null ? null : readItemId(rawItemId);
  if (rawItemId != null && !itemId) {
    return badRequest(`item_id, when given, must be 1-${ITEM_ID_MAX} characters`);
  }

  const supabase = getServiceSupabase();
  let query = supabase
    .from("user_list_order")
    .delete()
    .eq("user_id", auth.userId)
    .eq("list_key", listKey);
  if (itemId) query = query.eq("item_id", itemId);

  const { error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag(APP_DATA_TAG, "max");

  return NextResponse.json(
    { listKey, itemId, deleted: true },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

// R0.2 first-party error tracking on a customer data route: capture thrown
// failures as error_events groups (mig 195), then rethrow — semantics unchanged.
export const GET = withErrorCapture("/api/user/list-order", handleGET);
export const PATCH = withErrorCapture("/api/user/list-order", handlePATCH);
export const DELETE = withErrorCapture("/api/user/list-order", handleDELETE);
