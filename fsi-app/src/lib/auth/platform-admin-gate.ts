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

/**
 * The rpc that answers "is the signed-in caller a platform admin" (migration 375, lane SEC-6). The column
 * `profiles.is_platform_admin` is no longer selectable by a signed-in user, so every USER-SESSION read of the flag
 * goes through this SECURITY DEFINER function, which answers for the session user alone and takes no argument.
 * A read of ANOTHER user's flag (admin.ts isPlatformAdmin, the workspace bootstrap) stays on the service client.
 */
export const IS_PLATFORM_ADMIN_RPC = "is_platform_admin";

/**
 * The caller's own platform-admin bit through the rpc, read strictly: only a literal `true` admits. An rpc
 * error is reported in `error` (admin false), never silently turned into a clean "no": callers that treat an
 * unknown answer as a failure (the identity bootstrap) throw on it, callers that fail closed (the route gate, the
 * Community shell) read `admin` alone.
 */
export async function readOwnPlatformAdmin(
  supabase: Pick<SupabaseClient, "rpc">
): Promise<{ admin: boolean; error: unknown | null }> {
  const { data, error } = await supabase.rpc(IS_PLATFORM_ADMIN_RPC);
  if (error) return { admin: false, error };
  return { admin: data === true, error: null };
}

export type PlatformAdminDecision =
  | { kind: "anonymous" }
  | { kind: "denied"; userId: string }
  | { kind: "admitted"; userId: string; email: string };

/**
 * The route gate's decision, separated from the redirect so it is testable. The caller (admin.ts's
 * requirePlatformAdmin) maps `anonymous` to /login and `denied` to `/`. A flag read error (the rpc failing)
 * DENIES: the gate fails closed, it never admits on an unknown answer.
 */
export async function decidePlatformAdmin(
  supabase: Pick<SupabaseClient, "auth" | "rpc">
): Promise<PlatformAdminDecision> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "anonymous" };

  // The flag is read through the rpc, not the column (migration 375: SELECT on the column is revoked).
  const { admin, error } = await readOwnPlatformAdmin(supabase);
  if (error || !admin) {
    return { kind: "denied", userId: user.id };
  }
  return { kind: "admitted", userId: user.id, email: user.email || "" };
}
