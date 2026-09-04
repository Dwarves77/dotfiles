import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-service";

import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { withErrorCapture } from "@/lib/telemetry/capture-error";
import { loadPersonalState, loadListOrders, loadMembers, loadAdminAttention, loadOverrides, loadOrgId } from "./logic";
// PERF-ARCH (2026-09-04, docs/decisions/ADR-027-*.md): Server-Timing instrumentation, wired here
// as this lane's one concrete example of the "add the timing wrapper" write-set item. A Route
// Handler is the ONE response type this app can attach a genuine HTTP Server-Timing header to —
// see src/lib/perf/server-timing.ts's own header for the doc-cited reason an RSC page response
// cannot get the same treatment. `timePhase` wraps each of the FIVE independent loaders (PERF-MERGE:
// PERF-10's `loadOverrides` joined the batch after this instrumentation was authored against four —
// see that loader's own timePhase call below) and `recordSerializedBytes` measures the exact JSON
// payload this route ships — the response body itself, not an estimate.
import { timePhase, recordSerializedBytes, withServerTiming, PERF_PHASES } from "@/lib/perf/server-timing";

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
  const auth = await timePhase(PERF_PHASES.AUTH, () => requireAuth(request));
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const supabase = getServiceSupabase();

  // Six independent per-user reads, in ONE Promise.all (the shape server-timing.ts's own header
  // cites PERF-9/ADR-026 §3 for — PERF-10's `loadOverrides` and PERF-12's `loadOrgId` both join the
  // same batch rather than adding a second round trip each). Each phase name below is this route's
  // own vocabulary (personal_state/list_orders/members/admin_attention/overrides/org_id), not the
  // shared PERF_PHASES constants, which name the regulations/detail-page vocabulary this route
  // doesn't share. Timing each individually (rather than the whole Promise.all as one span) is what
  // makes the eventual Server-Timing header useful for "which of the six is slow today", not just
  // "the batch was slow".
  const [personalState, listOrders, members, adminAttention, overrides, orgId] = await Promise.all([
    timePhase("personal_state", () => loadPersonalState(supabase, auth.userId)),
    timePhase("list_orders", () => loadListOrders(supabase, auth.userId)),
    timePhase("members", () => loadMembers(supabase, auth.userId)),
    timePhase("admin_attention", () => loadAdminAttention(supabase, auth.userId)),
    // PERF-10 (2026-09-04, ADR-026 Follow-up / migration 306): the caller's org-scoped
    // workspace_item_overrides rows — see logic.ts's loadOverrides header for why this joined the
    // bundle (it is what lets the four index/detail pages stop reading cookies() server-side).
    timePhase("overrides", () => loadOverrides(supabase, auth.userId)),
    // PERF-12 (2026-09-04, ADR-027 §5/item 4): exposed so the client can forward it to per-org
    // listing routes (X-Org-Id) for server-side VERIFICATION against the session — see loadOrgId's
    // own header for why this is a verification signal, never the thing that actually scopes a
    // query.
    timePhase("org_id", () => loadOrgId(supabase, auth.userId)),
  ]);

  const payload = { personalState, listOrders, members, adminAttention, overrides, orgId };
  recordSerializedBytes(payload, PERF_PHASES.SERIALIZE_BYTES);

  return withServerTiming(
    NextResponse.json(payload, {
      headers: { ...rateLimitHeaders(auth.userId), "Cache-Control": "private, no-store" },
    })
  );
}

// R0.2 first-party error tracking on a customer data route: capture thrown
// failures as error_events groups (mig 195), then rethrow — semantics unchanged.
export const GET = withErrorCapture("/api/workspace/bootstrap", handleGET);
