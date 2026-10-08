// Shared request preamble and response mapping for the /api/workspace/portfolios routes (lane S8-D,
// 2026-10-07). A route.ts may export only handlers (F34), so the pieces the three route files share live
// here: authenticate, resolve the caller's org on the SERVER from org_memberships (never from the client),
// and turn a service result into a response with the rate-limit headers.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-service";
import { isRefusal, requireUserRoute } from "@/lib/api/route-guard";
import { rateLimitHeaders } from "@/lib/api/rate-limit";
import { resolveOrgIdFromUserId } from "@/lib/api/org";

export interface PortfolioCaller {
  userId: string;
  orgId: string;
  sb: ReturnType<typeof getServiceSupabase>;
}

export async function resolvePortfolioCaller(request: NextRequest): Promise<PortfolioCaller | NextResponse> {
  const auth = await requireUserRoute(request);
  if (isRefusal(auth)) return auth;
  const sb = getServiceSupabase();
  const orgId = await resolveOrgIdFromUserId(sb, auth.userId);
  if (!orgId) {
    return NextResponse.json({ error: "User has no organization membership" }, { status: 403 });
  }
  return { userId: auth.userId, orgId, sb };
}

/** A service result as a response: failures carry their own status and message, successes the body. */
export function portfolioResponse(
  userId: string,
  result: { ok: boolean; status?: number; error?: string } & Record<string, unknown>,
  successStatus = 200
): NextResponse {
  const headers = rateLimitHeaders(userId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Request failed" }, { status: result.status ?? 500, headers });
  }
  const body: Record<string, unknown> = { ...result };
  delete body.ok;
  return NextResponse.json(body, { status: successStatus, headers });
}

export async function readJsonBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
