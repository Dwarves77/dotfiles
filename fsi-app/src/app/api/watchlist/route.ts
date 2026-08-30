import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-service";

import { revalidateTag } from "next/cache";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { resolveOrgIdFromUserId } from "@/lib/api/org";
import { withErrorCapture } from "@/lib/telemetry/capture-error";
import { APP_DATA_TAG } from "@/lib/data";

// /api/watchlist — the watchlist WRITER + READER, both scopes.
//
// Scope split, per the operator ruling "archiving should be an option for group
// or individual, watchlist should be the same":
//   - PERSONAL watch → user_watchlist (migration 060, vocabulary widened by 233).
//     Visible to the caller only.
//   - TEAM watch     → org_watchlist (migration 077, CHECK aligned by 236).
//     Visible to every member of the org, carries an optional note.
//
// NO ROLE GATE on the team scope, and that is deliberate divergence from the
// dual-scope archive, not an oversight. Migration 077 shipped all four
// org_watchlist RLS policies as `user_belongs_to_org(org_id)` and named the
// choice in its own DDL comment ("Bloomberg pattern"): any member may add or
// remove. Archiving is destructive — it hides an item from everyone — so it
// earned admin/owner protection. Watching is additive: a team watch only ever
// surfaces an item. Applying the archive gate here would contradict the shipped
// RLS and make the API stricter than the database it writes to.
//
// Writes are always scoped to the authed caller — the route never accepts a
// user_id or org_id from the body.
//
// item_id is text by design (legacy_id or UUID; fetchWatchlist resolves titles
// for both), which is why every value that reaches PostgREST goes through an
// encoded builder method and never through string interpolation into a filter.

// ITEM_TYPES and TEAM_ONLY_TYPES are exported (alongside isTeamOnlyScopeViolation
// below) purely for direct unit test of the real validation, the same
// route.ts-exports-a-pure-decision-function pattern
// src/app/api/admin/sources/bulk-import/route.ts's headReachabilityDecision
// already uses — it changes nothing about the route's HTTP contract.
export const ITEM_TYPES = new Set([
  "source",
  "reg",
  "signal",
  "research",
  "operations",
  "market_series",
]);
const SCOPES = new Set(["personal", "team"]);

// market_series is a TEAM-scope-only watchable type (WO-23). Migration 270
// widened org_watchlist_item_type_check to admit it but deliberately left
// user_watchlist_item_type_check untouched — series watching is a team
// feature by standing ruling, and personal watching of a series is a
// separate, unruled question. ITEM_TYPES above is a flat, scope-blind gate
// shared by GET/POST/DELETE, so simply adding "market_series" to it would let
// a personal-scope market_series write pass this gate, reach the
// still-narrow user_watchlist CHECK, and surface as a raw Postgres 500
// instead of this route's own clean 400. TEAM_ONLY_TYPES is the second,
// scope-aware gate that catches that case first, with a real reason.
//
// Applied at the WRITE handlers (POST, DELETE) only, not GET: GET's `scope`
// query param is not used to select which table to read (it always reads
// personal AND team and returns both), so it can never reach a CHECK
// violation and gating it here would only break the ability to check a
// market_series item's team-watched status without the caller remembering to
// pass scope=team explicitly — an artificial requirement GET does not
// otherwise have for any other item_type.
export const TEAM_ONLY_TYPES = new Set(["market_series"]);

/** The real scope-conditional decision handlePOST and handleDELETE both gate
 *  writes on. Exported for direct unit test. */
export function isTeamOnlyScopeViolation(itemType: string, scope: string): boolean {
  return TEAM_ONLY_TYPES.has(itemType) && scope !== "team";
}

// The team note is shown to every member of the org. Bounded so one member
// cannot push an unbounded blob onto everyone else's rail.
const NOTE_MAX = 280;

const TYPES_HINT = "source|reg|signal|research|operations|market_series";

type Scope = "personal" | "team";

interface Params {
  itemType: string;
  itemId: string;
  scope: Scope;
}

function readParams(request: NextRequest): Params | null {
  const itemType = request.nextUrl.searchParams.get("item_type") ?? "";
  const itemId = request.nextUrl.searchParams.get("item_id") ?? "";
  const scope = request.nextUrl.searchParams.get("scope") ?? "personal";
  if (!ITEM_TYPES.has(itemType) || !itemId || !SCOPES.has(scope)) return null;
  return { itemType, itemId, scope: scope as Scope };
}

const paramError = () =>
  NextResponse.json(
    {
      error: `item_type (${TYPES_HINT}) and item_id are required; scope, when given, must be personal|team`,
    },
    { status: 400 }
  );

// org_watchlist.org_id is NOT NULL, so an unresolvable membership cannot fall
// through to null the way user_watchlist.org_id does. A team write with no org
// is not a degraded write, it is a mis-scoped one, so it fails loudly.
const noOrgError = () =>
  NextResponse.json(
    { error: "No organization membership resolved for this user; team scope unavailable" },
    { status: 403 }
  );

// The scope-conditional rejection for a TEAM_ONLY_TYPES item requested at
// scope=personal. Names the actual reason (team-scope only), not a generic
// "invalid type" — the caller did name a real item_type, just at a scope that
// does not support it yet.
export const teamOnlyError = (itemType: string) =>
  NextResponse.json(
    {
      error: `item_type "${itemType}" is only watchable at scope=team; personal watching of ${itemType} is not supported`,
    },
    { status: 400 }
  );

// GET /api/watchlist?item_type=reg&item_id=<id>
// → { watched, personal, team, teamAvailable }
//
// Both scopes resolve in ONE round trip. `watched` mirrors `personal` so the
// existing WatchButton contract keeps working unchanged; the button's own
// toggle is the personal watch.
//
// `teamAvailable` reports whether an org resolved at all. Without it, team:false
// is ambiguous — it could mean "the org has not watched this" or "this user has
// no org" — and the client would render a team affordance that can only 403.
async function handleGET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;
  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const p = readParams(request);
  if (!p) return paramError();

  const supabase = getServiceSupabase();
  const orgId = await resolveOrgIdFromUserId(supabase, auth.userId).catch(() => null);

  const [personalRes, teamRes] = await Promise.all([
    supabase
      .from("user_watchlist")
      .select("id")
      .eq("user_id", auth.userId)
      .eq("item_type", p.itemType)
      .eq("item_id", p.itemId)
      .maybeSingle(),
    orgId
      ? supabase
          .from("org_watchlist")
          .select("id")
          .eq("org_id", orgId)
          .eq("item_type", p.itemType)
          .eq("item_id", p.itemId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (personalRes.error) {
    return NextResponse.json({ error: personalRes.error.message }, { status: 500 });
  }
  if (teamRes.error) {
    return NextResponse.json({ error: teamRes.error.message }, { status: 500 });
  }

  const personal = !!personalRes.data;
  const team = !!teamRes.data;

  return NextResponse.json(
    { watched: personal, personal, team, teamAvailable: !!orgId },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

// POST /api/watchlist
// Body: { itemType, itemId, scope?: "personal"|"team", note?: string }
// → { watched: true, scope }
async function handlePOST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;
  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const itemType = typeof body.itemType === "string" ? body.itemType : "";
  const itemId = typeof body.itemId === "string" ? body.itemId.trim() : "";
  const scope = typeof body.scope === "string" ? body.scope : "personal";
  if (!ITEM_TYPES.has(itemType) || !itemId || !SCOPES.has(scope)) {
    return NextResponse.json(
      {
        error: `itemType (${TYPES_HINT}) and itemId are required; scope, when given, must be personal|team`,
      },
      { status: 400 }
    );
  }

  if (isTeamOnlyScopeViolation(itemType, scope)) {
    return teamOnlyError(itemType);
  }

  const rawNote = typeof body.note === "string" ? body.note.trim() : "";
  if (rawNote.length > NOTE_MAX) {
    return NextResponse.json(
      { error: `note must be ${NOTE_MAX} characters or fewer` },
      { status: 400 }
    );
  }
  const note = rawNote.length > 0 ? rawNote : null;

  const supabase = getServiceSupabase();

  if (scope === "team") {
    const orgId = await resolveOrgIdFromUserId(supabase, auth.userId).catch(() => null);
    if (!orgId) return noOrgError();

    // ignoreDuplicates, not overwrite. The team row is ONE shared row keyed by
    // (org_id, item_type, item_id). A second member adding an already-watched
    // item must not silently reassign attribution to themselves or replace the
    // first adder's rationale. First adder wins; the row is already on the rail,
    // which is what the caller wanted.
    const { error } = await supabase.from("org_watchlist").upsert(
      {
        org_id: orgId,
        added_by_user_id: auth.userId,
        item_type: itemType,
        item_id: itemId,
        note,
      },
      { onConflict: "org_id,item_type,item_id", ignoreDuplicates: true }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    revalidateTag(APP_DATA_TAG, "max");
    return NextResponse.json(
      { watched: true, scope },
      { headers: rateLimitHeaders(auth.userId) }
    );
  }

  // Personal. org_id here is contextual metadata (nullable by schema), so a
  // resolution failure never blocks the watch — the opposite of the team path.
  const orgId = await resolveOrgIdFromUserId(supabase, auth.userId).catch(() => null);
  const { error } = await supabase.from("user_watchlist").upsert(
    { user_id: auth.userId, org_id: orgId ?? null, item_type: itemType, item_id: itemId },
    { onConflict: "user_id,item_type,item_id" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidateTag(APP_DATA_TAG, "max");
  return NextResponse.json(
    { watched: true, scope },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

// DELETE /api/watchlist?item_type=reg&item_id=<id>&scope=personal|team
// → { watched: false, scope }
async function handleDELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;
  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const p = readParams(request);
  if (!p) return paramError();
  if (isTeamOnlyScopeViolation(p.itemType, p.scope)) {
    return teamOnlyError(p.itemType);
  }

  const supabase = getServiceSupabase();

  if (p.scope === "team") {
    const orgId = await resolveOrgIdFromUserId(supabase, auth.userId).catch(() => null);
    if (!orgId) return noOrgError();

    // Any member may remove, matching 077's RLS. The delete is bounded to the
    // caller's own org, so one org can never clear another's rail.
    const { error } = await supabase
      .from("org_watchlist")
      .delete()
      .eq("org_id", orgId)
      .eq("item_type", p.itemType)
      .eq("item_id", p.itemId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    revalidateTag(APP_DATA_TAG, "max");
    return NextResponse.json(
      { watched: false, scope: p.scope },
      { headers: rateLimitHeaders(auth.userId) }
    );
  }

  const { error } = await supabase
    .from("user_watchlist")
    .delete()
    .eq("user_id", auth.userId)
    .eq("item_type", p.itemType)
    .eq("item_id", p.itemId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidateTag(APP_DATA_TAG, "max");
  return NextResponse.json(
    { watched: false, scope: p.scope },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

// R0.2 first-party error tracking on a customer data route: capture thrown
// failures as error_events groups (mig 195), then rethrow — semantics unchanged.
// The prior single-scope revision of this route was never wrapped; that gap is
// closed here rather than left as one more unwrapped customer route.
export const GET = withErrorCapture("/api/watchlist", handleGET);
export const POST = withErrorCapture("/api/watchlist", handlePOST);
export const DELETE = withErrorCapture("/api/watchlist", handleDELETE);
