/**
 * The ONE platform-admin predicate (lane AUTH-IDENTITY, 2026-09-24).
 *
 * THE DEFECT [CONFIRMED by code read, 2026-09-24]: the nav's Admin row (Sidebar.tsx) showed for a
 * WORKSPACE owner or admin (`useWorkspaceStore.userRole`), while `/admin` (requirePlatformAdmin, in
 * admin.ts) admits only `profiles.is_platform_admin = true`. Two different questions, so the nav could
 * offer a link the route would bounce (a workspace owner who is not platform staff: the gmail account in
 * "Dietl / Rockit"), and could hide the link from the platform admin whenever the workspace role was
 * missing (the failed-identity-lookup state).
 *
 * THE FIX: both sides now call this module. `requirePlatformAdmin()` decides with
 * `decidePlatformAdmin()`, and the identity route (server-bootstrap.ts) returns
 * `isPlatformAdminProfile(<the same profiles row>)` to the client, which gates the nav on exactly that
 * bit. Import-free (a type-only import is erased), so it loads under `node --test` + jiti without Next.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** `profiles.is_platform_admin` read strictly: only a literal `true` admits. */
export function isPlatformAdminProfile(row: { is_platform_admin?: unknown } | null | undefined): boolean {
  return !!row && row.is_platform_admin === true;
}

export type PlatformAdminDecision =
  | { kind: "anonymous" }
  | { kind: "denied"; userId: string }
  | { kind: "admitted"; userId: string; email: string };

/**
 * The route gate's decision, separated from the redirect so it is testable. The caller (admin.ts's
 * requirePlatformAdmin) maps `anonymous` to /login and `denied` to `/`. A profiles read error DENIES:
 * the gate fails closed, it never admits on an unknown answer.
 */
export async function decidePlatformAdmin(
  supabase: Pick<SupabaseClient, "auth" | "from">
): Promise<PlatformAdminDecision> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "anonymous" };

  const { data, error } = await supabase
    .from("profiles")
    .select("is_platform_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !isPlatformAdminProfile(data as { is_platform_admin?: unknown } | null)) {
    return { kind: "denied", userId: user.id };
  }
  return { kind: "admitted", userId: user.id, email: user.email || "" };
}
