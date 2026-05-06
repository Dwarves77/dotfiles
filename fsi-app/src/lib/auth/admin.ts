import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Platform-admin gate.
 *
 * Mirrors the role check used at /admin (see app/admin/page.tsx) and
 * UserMenu / Sidebar (`role === "owner" || role === "admin"`). Centralising
 * here so API routes and server components share one definition.
 *
 * Phase scope: this checks org_memberships role only — workspace admins
 * are NOT distinct from platform admins yet. When Phase D introduces a
 * separate platform-admin role (e.g. on a `platform_roles` table or a
 * column on auth.users), this helper becomes the seam to update; every
 * caller flips together.
 *
 * The query reads the *first* (oldest) membership for the user, matching
 * resolveOrgIdFromUserId in src/lib/api/org.ts. A user with multiple
 * memberships at different roles will be treated as having their first-
 * org role; that's consistent with the rest of the codebase.
 */
export async function isPlatformAdmin(
  userId: string,
  supabase: SupabaseClient
): Promise<boolean> {
  if (!userId) return false;

  const { data, error } = await supabase
    .from("org_memberships")
    .select("role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) return false;
  return data.role === "owner" || data.role === "admin";
}
