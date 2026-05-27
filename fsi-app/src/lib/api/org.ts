import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";

/**
 * Resolve the active org_id for a known user id, using a service-role
 * Supabase client (bypasses RLS).
 *
 * Use from API routes that have already authenticated the request via
 * requireAuth() — pass auth.userId in.
 *
 * Returns null if the user has no org membership (caller should typically
 * 403 in that case).
 *
 * Multi-org policy: returns the oldest membership. We do not yet have a
 * notion of "active org" beyond first-membership; if/when we add an org
 * switcher, this resolver becomes the seam to swap.
 */
export async function resolveOrgIdFromUserId(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.org_id ?? null;
}

/**
 * Resolve the active org_id from the request's auth cookies, for use in
 * Server Components (page.tsx, layout.tsx, server-side data fetchers).
 *
 * Reads the Supabase session from cookies, then queries org_memberships
 * via the same authenticated client (so RLS scopes the query to the
 * user's own memberships).
 *
 * Returns null if the user is not signed in OR has no org membership.
 * Server components should treat this as "render the public/seed view"
 * (consistent with existing fallback behaviour in fetchDashboardData).
 */
export async function resolveOrgIdFromCookies(): Promise<string | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from("org_memberships")
      .select("org_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    return data?.org_id ?? null;
  } catch {
    return null;
  }
}
