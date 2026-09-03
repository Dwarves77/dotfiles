import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-service";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { resolveOrgIdFromUserId } from "@/lib/api/org";
import { withErrorCapture } from "@/lib/telemetry/capture-error";
import { fetchSupersededNotices } from "@/lib/propagation/methods/superseded-notices.ts";
import type { NoticesClient } from "@/lib/propagation/methods/superseded-notices.ts";
// resolveSinceParam and attachEntityLabels live in a sibling module, not here: a
// route.ts may export only route handlers/config (F34's named residual — `next
// build --webpack` rejects any other export field). See logic.ts's header.
import { resolveSinceParam, attachEntityLabels } from "./logic";

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
