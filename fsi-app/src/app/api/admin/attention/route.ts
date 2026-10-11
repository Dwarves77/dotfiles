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
