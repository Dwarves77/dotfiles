import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-service";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { resolveOrgIdFromUserId } from "@/lib/api/org";
import { withErrorCapture } from "@/lib/telemetry/capture-error";
import { fetchSupersededNotices } from "@/lib/propagation/methods/superseded-notices.ts";
import type { SupersededNotice, NoticesClient } from "@/lib/propagation/methods/superseded-notices.ts";

// GET /api/notices — org-scoped RecalculationNotice feed (docs/specs/08-flywheel-design.md §2.2 Part 3 /
// §4 Layer 4). "Superseded derived_values (both versions) for entities on org's org_watchlist since
// ?since=" — the task brief's own words, answered literally below.
//
// SCOPE: TEAM (org_watchlist) ONLY, deliberately — a recalculation notice is inherently a shared,
// org-visible fact ("this figure your team is tracking just changed"), the same posture org_watchlist
// itself carries (migration 077: any member may add/remove, everyone in the org sees the list). There is
// no personal-scope equivalent here; user_watchlist is not consulted.
//
// WHY THE RAW derived_values READ IS SAFE HERE DESPITE F31. This route itself never calls
// `.from("derived_values")` — it calls `fetchSupersededNotices()`
// (src/lib/propagation/methods/superseded-notices.ts), which lives inside F31's sanctioned
// `src/lib/propagation/` tree and performs the raw read there, on this route's behalf. See that module's
// own header for the full reasoning (a superseded/stale OLD row is excluded by `derived_values_admissible`
// by design, so a notice — which exists precisely to surface a stale-then-replaced pair — cannot be built
// from the admissible view alone).
//
// entities.canonical_name (migration 282) is world-readable reference data (no RLS restriction beyond the
// schema-level grant) — resolving a label is a second, ordinary `.from("entities")` read, outside the
// derived_values gate entirely, so it stays in this route rather than needing its own propagation-tree
// detour.

const DEFAULT_WINDOW_DAYS = 30;

/**
 * Resolve the `?since=` query param to an ISO timestamp, defaulting to `DEFAULT_WINDOW_DAYS` days before
 * `now` when absent, empty, or unparseable — a malformed `since` degrades to the default window rather
 * than 400ing the caller (this is a notices feed, not a strict filter API; a wrong window is recoverable
 * by the caller simply re-requesting with a fixed value, whereas a hard 400 would break a naive integration
 * that forwards whatever it was last given). PURE — `now` is always injected.
 */
export function resolveSinceParam(sinceRaw: string | null, now: Date): string {
  if (!sinceRaw) return defaultSince(now);
  const parsed = new Date(sinceRaw);
  if (Number.isNaN(parsed.getTime())) return defaultSince(now);
  return parsed.toISOString();
}

function defaultSince(now: Date): string {
  return new Date(now.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/** One SupersededNotice + its resolved entity label/href — the exact shape RecalculationNotice.tsx's
 *  `RecalculationNoticeItem` expects. PURE — takes the label map as a plain object, no I/O. */
export function attachEntityLabels(
  notices: SupersededNotice[],
  labelsByEntityId: Record<string, string>
): Array<SupersededNotice & { entityLabel: string | null; href: string | null }> {
  return notices.map((n) => ({
    ...n,
    entityLabel: (n.entityId && labelsByEntityId[n.entityId]) || n.entityId || null,
    href: n.entityId ? `/entities/${encodeURIComponent(n.entityId)}` : null,
  }));
}

async function handleGET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;
  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const url = new URL(request.url);
  const sinceIso = resolveSinceParam(url.searchParams.get("since"), new Date());

  const supabase = getServiceSupabase();
  const orgId = await resolveOrgIdFromUserId(supabase, auth.userId).catch(() => null);
  if (!orgId) {
    // No org membership -> no team watchlist -> nothing to notify on. Honest empty list, not a 403: a
    // reader with no org is not doing anything wrong by hitting this feed.
    return NextResponse.json({ notices: [], since: sinceIso }, { headers: rateLimitHeaders(auth.userId) });
  }

  const { data: watched, error: watchErr } = await supabase.from("org_watchlist").select("item_id").eq("org_id", orgId);
  if (watchErr) {
    return NextResponse.json({ error: watchErr.message }, { status: 500 });
  }
  const entityIds = [...new Set((watched ?? []).map((r: { item_id: string }) => r.item_id))];

  // Cast: real supabase-js's PostgREST builder DOES carry .in()/.gte()/thenable after .select() — the
  // mismatch tsc reports is only that its pre-.select() QueryBuilder type is wider (has other methods too)
  // than the narrow NoticesClient interface superseded-notices.ts declares for its own testability (see
  // that module's header: a hand-rolled fake satisfies it with zero npm dependency). Same posture as this
  // codebase's other real-client-to-narrow-interface casts (e.g. src/lib/sources/source-growth.ts).
  const notices = await fetchSupersededNotices(supabase as unknown as NoticesClient, entityIds, sinceIso);

  let labelsByEntityId: Record<string, string> = {};
  const noticedEntityIds = [...new Set(notices.map((n) => n.entityId).filter((id): id is string => id != null))];
  if (noticedEntityIds.length > 0) {
    const { data: entities } = await supabase.from("entities").select("entity_id,canonical_name").in("entity_id", noticedEntityIds);
    labelsByEntityId = Object.fromEntries((entities ?? []).map((e: { entity_id: string; canonical_name: string }) => [e.entity_id, e.canonical_name]));
  }

  return NextResponse.json(
    { notices: attachEntityLabels(notices, labelsByEntityId), since: sinceIso },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

export const GET = withErrorCapture("/api/notices", handleGET);
