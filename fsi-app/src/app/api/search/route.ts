import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { withErrorCapture } from "@/lib/telemetry/capture-error";
import { runSearch, MIN_QUERY_LEN, type SearchSupabaseClient } from "./logic";

// GET /api/search?q=<text> — Standard Search (CMDSEARCH lane, 2026-09-09).
//
// The command bar's default mode, no model call and no spend (operator: "leave API off for now"
// applies only to Ask; Search is unconditional). This route is a THIN wrapper around retrieval
// machinery that already exists — `runSearch` (./logic.ts) reuses the SAME
// `search_intelligence_items` RPC (migration 159) and the SAME two-step retrieval shape /api/ask
// already uses for its own retrieval step, rather than building a second FTS mechanism (CLAUDE.md
// rule 13). Auth (requireAuth, bearer JWT) and the customer read predicate
// (provenance_status='verified' AND NOT archived, enforced inside the RPC AND re-applied on the
// re-fetch as belt-and-suspenders, matching /api/ask's own posture) are the SAME as every other
// authenticated read in this app — no wider scope, no org-specific carve-out, because none of the
// platform's other reads (including /api/ask) filter intelligence_items by org either; the corpus is
// one shared platform corpus and org resolution governs personal state, not this table.
//
// BOUNDED (F38/F39): see logic.ts's own header — runSearch's bound is what
// search.bounded-and-scoped.npmtest.mjs proves against a fake client.
//
// The pure retrieval core lives in logic.ts, not here: a route.ts may export only route
// handlers/config (F34's named residual — see check-sources/route.ts's identical precedent).

export const dynamic = "force-dynamic";

async function handleGET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();

  // Empty/short query: no query executed, no rows — the bar's "empty query shows nothing"
  // contract starts here, not just in the client.
  if (q.length < MIN_QUERY_LEN) {
    return NextResponse.json({ query: q, results: [] }, { headers: rateLimitHeaders(auth.userId) });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // Cast to the narrow interface logic.ts declares: the real client's generated `.rpc()` overload
    // set is deep enough that TS's structural check against a plain interface times out ("type
    // instantiation excessively deep") — the same shape /api/ask's own service-role client would hit
    // if it were narrowed this way. The cast changes no runtime behavior; runSearch only ever calls
    // the four methods SearchSupabaseClient declares.
    const results = await runSearch(supabase as unknown as SearchSupabaseClient, q);
    return NextResponse.json({ query: q, results }, { headers: rateLimitHeaders(auth.userId) });
  } catch (e: any) {
    console.warn(`[search] unexpected error: ${e?.message ?? e}`);
    return NextResponse.json({ query: q, results: [] }, { headers: rateLimitHeaders(auth.userId) });
  }
}

export const GET = withErrorCapture("/api/search", handleGET);
