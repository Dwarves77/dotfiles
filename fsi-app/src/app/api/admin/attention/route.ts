// GET /api/admin/attention
//
// Returns aggregated admin-attention counts across all needs-attention
// categories (provisional sources, staged updates, materialization failures,
// integrity flags, source attribution mismatches, auto-approved awaiting
// spot-check, coverage gaps). Wraps the `admin_attention_counts()` RPC
// added in migration 036 (W2.E).
//
// Auth: requireAuth + isPlatformAdmin. 401 for unauthenticated, 403 for
// authenticated non-admins — non-admin users should never see the red dot,
// so the API answer matches the UI gate.
//
// Cache layering:
//   - HTTP-level (Cache-Control headers, browser cache):
//       200 → private max-age=30; 401/403 → private max-age=60; 5xx no-store.
//       Absorbs duplicate fetches inside the same browser session.
//   - Server-level (unstable_cache, perf day-2 — 2026-05-08):
//       Wraps the supabase RPC. Cache key includes the calling admin user
//       id so the entry is workspace-scoped (one admin's mutation does not
//       evict another's snapshot, future-proofs if the RPC becomes
//       workspace-scoped). 30s TTL matches the HTTP positive-cache window.
//       Tagged with APP_DATA_TAG so any mutation route that already calls
//       revalidateTag(APP_DATA_TAG) (staged-update approval, workspace
//       overrides, etc.) flushes attention counts atomically — no separate
//       tag plumbing needed.
//   - 401/403 responses: see above. Admin status is sticky for the session.

import { NextRequest, NextResponse } from "next/server";
import { isRefusal, requireAdminRoute } from "@/lib/api/route-guard";
import { rateLimitHeaders } from "@/lib/api/rate-limit";
// PERF-9 (2026-09-04, item 5, ADR-026 §4): AttentionCounts/EMPTY_COUNTS/fetchAttentionCounts moved
// to a sibling logic.ts so /api/workspace/bootstrap/route.ts can share the SAME unstable_cache entry
// (same key, same tag) instead of registering a second, independent cache for the identical RPC.
import { fetchAttentionCounts } from "./logic";

const NEGATIVE_CACHE = "private, max-age=60";
const POSITIVE_CACHE = "private, max-age=30";

function withCacheHeader(resp: NextResponse, value: string): NextResponse {
  resp.headers.set("Cache-Control", value);
  return resp;
}

export async function GET(request: NextRequest) {
  // Auth ordering (perf v2): the cheapest gate runs first. requireAuth
  // returns 401 on missing/invalid token before the rate limiter or any
  // DB query touches. Stamp negative-cache on the 401 so a non-admin
  // browser doesn't keep refetching on every navigation.
  const auth = await requireAdminRoute(request);
  if (isRefusal(auth)) return withCacheHeader(auth, NEGATIVE_CACHE);
  const { supabase } = auth;

  const { row, rpcError } = await fetchAttentionCounts(auth.userId);

  if (rpcError) {
    return NextResponse.json(
      { error: `admin_attention_counts RPC failed: ${rpcError}` },
      {
        status: 500,
        headers: {
          ...rateLimitHeaders(auth.userId),
          "Cache-Control": "no-store",
        },
      }
    );
  }

  return NextResponse.json(row, {
    headers: {
      ...rateLimitHeaders(auth.userId),
      "Cache-Control": POSITIVE_CACHE,
    },
  });
}
