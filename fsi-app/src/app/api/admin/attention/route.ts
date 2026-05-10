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
import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { isPlatformAdmin } from "@/lib/auth/admin";
import { APP_DATA_TAG } from "@/lib/data";

const NEGATIVE_CACHE = "private, max-age=60";
const POSITIVE_CACHE = "private, max-age=30";

function withCacheHeader(resp: NextResponse, value: string): NextResponse {
  resp.headers.set("Cache-Control", value);
  return resp;
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface AttentionCounts {
  provisional_sources_pending: number;
  staged_updates_pending: number;
  staged_updates_materialization_failed: number;
  integrity_flags_unresolved: number;
  source_attribution_mismatches: number;
  auto_approved_awaiting_spotcheck: number;
  coverage_gaps_critical: number;
  total: number;
}

const EMPTY_COUNTS: AttentionCounts = {
  provisional_sources_pending: 0,
  staged_updates_pending: 0,
  staged_updates_materialization_failed: 0,
  integrity_flags_unresolved: 0,
  source_attribution_mismatches: 0,
  auto_approved_awaiting_spotcheck: 0,
  coverage_gaps_critical: 0,
  total: 0,
};

// Server-side cache around the RPC. Keyed by admin user id so each admin
// gets an isolated entry. The RPC currently returns platform-wide counts
// (so all entries are content-identical), but the userId key future-proofs
// against the RPC becoming workspace-scoped. 30s TTL matches the HTTP
// positive cache; APP_DATA_TAG aligns with existing mutation revalidation.
type FetchResult = { row: AttentionCounts; rpcError: string | null };

const fetchAttentionCounts = unstable_cache(
  async (_userId: string): Promise<FetchResult> => {
    const supabase = getServiceClient();
    const { data, error } = await supabase.rpc("admin_attention_counts");
    if (error) return { row: EMPTY_COUNTS, rpcError: error.message };
    const row: AttentionCounts =
      Array.isArray(data) && data.length > 0
        ? (data[0] as AttentionCounts)
        : EMPTY_COUNTS;
    return { row, rpcError: null };
  },
  ["admin-attention-counts-v1"],
  { revalidate: 30, tags: [APP_DATA_TAG] }
);

export async function GET(request: NextRequest) {
  // Auth ordering (perf v2): the cheapest gate runs first. requireAuth
  // returns 401 on missing/invalid token before the rate limiter or any
  // DB query touches. Stamp negative-cache on the 401 so a non-admin
  // browser doesn't keep refetching on every navigation.
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return withCacheHeader(auth, NEGATIVE_CACHE);

  const limited = checkRateLimit(auth.userId);
  if (limited) return withCacheHeader(limited, NEGATIVE_CACHE);

  const supabase = getServiceClient();

  // Platform-admin gate. Service-role client bypasses RLS so the role
  // lookup works regardless of the caller's session scoping. Stamp the
  // 403 with negative-cache so authenticated non-admins don't re-query
  // org_memberships every navigation.
  const admin = await isPlatformAdmin(auth.userId, supabase);
  if (!admin) {
    return NextResponse.json(
      { error: "Platform admin access required" },
      {
        status: 403,
        headers: {
          ...rateLimitHeaders(auth.userId),
          "Cache-Control": NEGATIVE_CACHE,
        },
      }
    );
  }

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
