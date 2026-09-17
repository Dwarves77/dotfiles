// src/lib/api/route-guard.ts
//
// ONE home for the guard sequence every authenticated API route repeats at the top of each handler:
// authenticate, rate-limit, and for platform-admin routes resolve the service client and the
// platform-admin gate. Lane L31 (2026-09-17) extracted it from the route files that carried the same
// 4 to 14 lines by hand (35 admin routes, 39 community and org routes, 10 user-state routes); four of
// the admin routes had each grown their own local `requireAdminRole` on top. The system health audit
// (docs/audits/system-health-audit-2026-09-17.md, section 2) lists the families; F45 keeps the count
// from growing back.
//
// Contract (unchanged from the inline blocks it replaces):
//   1. Bearer auth via requireAuth (401 on a missing or invalid token; 500 when auth is unconfigured).
//   2. The 60/min/user sliding window via checkRateLimit (429 with Retry-After).
//   3. Admin routes only: profiles.is_platform_admin via isPlatformAdmin on a service-role client
//      (OBS-17, the platform layer, never the workspace role), 403 with the rate-limit headers.
//   Order is fixed: no rate-limit slot is spent on an unauthenticated call, and no service-role
//   lookup happens for a rate-limited caller.
//
// Every guard returns EITHER the resolved context OR the refusal response; `isRefusal` narrows.
// Routes that must wrap a refusal (no-store or negative-cache headers) wrap the returned response
// exactly as they wrapped the inline one. Dependencies are injectable for the unit tests only;
// route code never passes them.
//
// The fitness function F2 accepts `requireAdminRoute` as the admin gate for src/app/api/admin/**.
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import {
  requireCommunityAuth,
  isCommunityAuthError,
  type CommunityAuthResult,
} from "@/lib/api/community-auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { isPlatformAdmin } from "@/lib/auth/admin";
import { getServiceSupabase } from "@/lib/supabase-service";

export type ServiceSupabase = ReturnType<typeof getServiceSupabase>;

/** Resolved context of a user route: the authenticated caller. */
export interface UserRoute {
  userId: string;
}

/** Resolved context of a platform-admin route: the caller, the service-role client the gate used
 *  (reuse it; never construct a second), and the rate-limit headers for the success response. */
export interface AdminRoute extends UserRoute {
  supabase: ServiceSupabase;
  headers: Record<string, string>;
}

export const ADMIN_REQUIRED_ERROR = "Platform admin access required";

/** True when a guard returned a refusal (401, 403, 429, 500) instead of a context. Checks the web
 *  standard Response (NextResponse extends it): a route test that stubs the auth module with plain
 *  Response.json refusals is refused the same way production is. */
export function isRefusal<T>(result: T | NextResponse): result is NextResponse {
  return result instanceof Response;
}

export interface UserRouteDeps {
  authenticate?: (request: NextRequest) => Promise<{ userId: string } | NextResponse>;
  rateLimit?: (userId: string) => NextResponse | null;
}

export interface AdminRouteDeps extends UserRouteDeps {
  isAdmin?: (userId: string, supabase: ServiceSupabase) => Promise<boolean>;
  serviceClient?: () => ServiceSupabase;
  limitHeaders?: (userId: string) => Record<string, string>;
}

export interface CommunityRouteDeps {
  authenticate?: (request: NextRequest) => Promise<CommunityAuthResult | NextResponse>;
  rateLimit?: (userId: string) => NextResponse | null;
}

/** Bearer auth + rate limit. */
export async function requireUserRoute(
  request: NextRequest,
  deps: UserRouteDeps = {}
): Promise<UserRoute | NextResponse> {
  const { authenticate = requireAuth, rateLimit = checkRateLimit } = deps;
  const auth = await authenticate(request);
  if (isAuthError(auth)) return auth;
  const limited = rateLimit(auth.userId);
  if (limited) return limited;
  return { userId: auth.userId };
}

/** Cookie-session (or Bearer) community auth + rate limit. Returns the community-auth result, which
 *  carries the cookie-bound client that is the RLS boundary for community writes. */
export async function requireCommunityRoute(
  request: NextRequest,
  deps: CommunityRouteDeps = {}
): Promise<CommunityAuthResult | NextResponse> {
  const { authenticate = requireCommunityAuth, rateLimit = checkRateLimit } = deps;
  const auth = await authenticate(request);
  if (isCommunityAuthError(auth)) return auth;
  const limited = rateLimit(auth.userId);
  if (limited) return limited;
  return auth;
}

/** Bearer auth + rate limit + platform-admin gate on a service-role client. */
export async function requireAdminRoute(
  request: NextRequest,
  deps: AdminRouteDeps = {}
): Promise<AdminRoute | NextResponse> {
  const {
    isAdmin = isPlatformAdmin,
    serviceClient = getServiceSupabase,
    limitHeaders = rateLimitHeaders,
  } = deps;
  const user = await requireUserRoute(request, deps);
  if (isRefusal(user)) return user;
  const supabase = serviceClient();
  const admin = await isAdmin(user.userId, supabase);
  const headers = limitHeaders(user.userId);
  if (!admin) {
    return NextResponse.json({ error: ADMIN_REQUIRED_ERROR }, { status: 403, headers });
  }
  return { userId: user.userId, supabase, headers };
}
