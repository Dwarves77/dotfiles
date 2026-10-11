import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError, type AuthContext } from "@/lib/api/auth";
import {
  requireCommunityAuth,
  isCommunityAuthError,
  type CommunityAuthResult,
} from "@/lib/api/community-auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { isPlatformAdmin } from "@/lib/auth/admin";
import { getServiceSupabase } from "@/lib/supabase-service";

export type ServiceSupabase = ReturnType<typeof getServiceSupabase>;

/** Resolved context of a user route: the authenticated caller and the anon client bound to the caller's
 *  own bearer (`userClient`, RLS applies). Named `userClient`, not `supabase`: AdminRoute extends this
 *  interface and its `supabase` is the service-role client. */
export interface UserRoute {
  userId: string;
  userClient: SupabaseClient;
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
  authenticate?: (request: NextRequest) => Promise<AuthContext | NextResponse>;
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
  return { userId: auth.userId, userClient: auth.supabase };
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
  return { userId: user.userId, userClient: user.userClient, supabase, headers };
}
