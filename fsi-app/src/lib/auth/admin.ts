import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { decidePlatformAdmin, isPlatformAdminProfile } from "@/lib/auth/platform-admin-gate";

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
 * SERVICE-ROLE client only (migration 375, lane SEC-6): SELECT on
 * `profiles.is_platform_admin` is revoked from anon and authenticated, so a
 * user-session client gets 42501 here and this returns false (fail closed).
 * It answers for an arbitrary userId, which only the service role may read.
 * The signed-in caller's OWN flag is read through the rpc
 * `is_platform_admin()` (platform-admin-gate.ts readOwnPlatformAdmin). The
 * admin API routes already construct a service-role client; pass it in.
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
  // One predicate for every platform-admin read (lane AUTH-IDENTITY): platform-admin-gate.ts.
  return isPlatformAdminProfile(data);
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
 * Uses the SSR Supabase client (cookie-scoped). The flag is read through
 * the own-row rpc is_platform_admin() (the column itself is revoked from
 * signed-in users, migration 375), so no service-role client is required.
 *
 * Designed per Phase 1 Option C in docs/sprint-1/alignment-audit-2026-05-18.md
 * Section D. Closes OBS-17.
 */
export async function requirePlatformAdmin(
  redirectPath: string = "/admin"
): Promise<{ userId: string; email: string }> {
  const supabase = await createSupabaseServerClient();
  // The decision lives in platform-admin-gate.ts (lane AUTH-IDENTITY, 2026-09-24), the same module whose
  // predicate the identity route uses to tell the nav whether to show Admin, so the two cannot drift.
  const decision = await decidePlatformAdmin(supabase);

  if (decision.kind === "anonymous") {
    redirect(`/login?redirect=${encodeURIComponent(redirectPath)}`);
  }

  if (decision.kind === "denied") {
    // Non-platform-admin users land at /. Matches the existing no-permission
    // UX on /admin prior to this change. Operator-side: grant by setting
    // profiles.is_platform_admin = true via service-role DB write; the
    // column is service-role-only writable per migration 027/075.
    redirect("/");
  }

  return { userId: decision.userId, email: decision.email };
}
