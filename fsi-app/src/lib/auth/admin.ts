import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";

/**
 * Platform-admin gate.
 *
 * Reads `profiles.is_platform_admin` (migration 075). This is the
 * canonical platform-admin signal per the three-layer tenant model in
 * caros-ledge-platform-intent Section 4: platform layer surfaces gate
 * on platform staff, NOT on workspace-membership roles.
 *
 * Prior implementation gated on `org_memberships.role IN ('owner','admin')`,
 * which is the WORKSPACE admin role. That conflated the workspace layer
 * with the platform layer and risked cross-tenant exposure on /admin
 * (OBS-17). Closed 2026-05-18 (Sprint 2 Build 6).
 *
 * Service-role client recommended for callers from API routes so the
 * RLS policy on `profiles` (self-read only on `is_platform_admin`) does
 * not block the lookup. The admin API routes already construct a
 * service-role client; pass it in.
 */
export async function isPlatformAdmin(
  userId: string,
  supabase: SupabaseClient
): Promise<boolean> {
  if (!userId) return false;

  const { data, error } = await supabase
    .from("profiles")
    .select("is_platform_admin")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return false;
  return data.is_platform_admin === true;
}

/**
 * Server-component platform-admin gate. Use in server components and
 * server-rendered pages (e.g. /admin) that need to redirect unauthorized
 * users before rendering.
 *
 * Behavior:
 *   - No user → redirect to /login?redirect=<currentPath>
 *   - User but not platform admin → redirect to /
 *   - Platform admin → return { userId, email }
 *
 * Uses the SSR Supabase client (cookie-scoped). The current user's own
 * profile row is readable under the existing RLS policy (self-read),
 * so no service-role client is required for the self-lookup.
 *
 * Designed per Phase 1 Option C in docs/sprint-1/alignment-audit-2026-05-18.md
 * Section D. Closes OBS-17.
 */
export async function requirePlatformAdmin(
  redirectPath: string = "/admin"
): Promise<{ userId: string; email: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(redirectPath)}`);
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("is_platform_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data || data.is_platform_admin !== true) {
    // Non-platform-admin users land at /. Matches the existing no-permission
    // UX on /admin prior to this change. Operator-side: grant by setting
    // profiles.is_platform_admin = true via service-role DB write; the
    // column is service-role-only writable per migration 027/075.
    redirect("/");
  }

  return { userId: user.id, email: user.email || "" };
}
