import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-service";

import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { withErrorCapture } from "@/lib/telemetry/capture-error";
import { loadPersonalState, loadListOrders, loadMembers, loadAdminAttention } from "./logic";

// GET /api/workspace/bootstrap — PERF-9 (2026-09-04, item 5,
// docs/decisions/ADR-026-detail-cache-and-viewer-state-split.md §4).
//
// Consolidates the four PER-USER reads the shell was previously issuing as four
// separate post-render requests (personal-state, list-order — one call per list
// key — members, admin/attention) into ONE authenticated round trip. Design
// mirrors the item 3 split: PUBLIC intelligence content stays server-cached
// (unstable_cache + revalidateTag); PER-USER state is fetched client-side, after
// first paint, in this single batched call (useWorkspaceBootstrap.ts), so the
// shell never blocks on it.
//
// /api/telemetry/error is deliberately NOT folded in here — it is a write
// (POST-only ingest), not a read, and is already fire-and-forget/keepalive/
// rate-limited client-side (see GlobalErrorReporter.tsx); folding a write into
// a GET bootstrap would change its semantics for no benefit.
//
// Partial-failure semantics: each of the four fields (see logic.ts) resolves
// independently and degrades to null/empty on its own failure — a member picker
// being briefly empty must never take down personal-state hydration, and vice
// versa. The endpoint itself still returns a single 401 if the caller isn't
// authenticated (there is no per-user data to partially degrade without an
// identity) and a single 429 if rate-limited.
async function handleGET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const supabase = getServiceSupabase();

  const [personalState, listOrders, members, adminAttention] = await Promise.all([
    loadPersonalState(supabase, auth.userId),
    loadListOrders(supabase, auth.userId),
    loadMembers(supabase, auth.userId),
    loadAdminAttention(supabase, auth.userId),
  ]);

  return NextResponse.json(
    { personalState, listOrders, members, adminAttention },
    { headers: { ...rateLimitHeaders(auth.userId), "Cache-Control": "private, no-store" } }
  );
}

// R0.2 first-party error tracking on a customer data route: capture thrown
// failures as error_events groups (mig 195), then rethrow — semantics unchanged.
export const GET = withErrorCapture("/api/workspace/bootstrap", handleGET);
