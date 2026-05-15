import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";

/**
 * Server-side auth + workspace bootstrap.
 *
 * Resolves the current user, their org membership (orgId, orgName, role),
 * and their per-user sector overrides in ONE pass, request-scoped via
 * React's cache(). Used by the root layout to seed AuthProvider with
 * initial state — eliminates the 2 client-side queries AuthProvider
 * was firing on every page mount (auth.getUser + org_memberships +
 * profiles.sector_overrides).
 *
 * Why cache(): React's cache() is request-scoped — the same call from
 * multiple server components within one request shares the result. So
 * the root layout, /admin role gate, /settings auth check, and any
 * future caller all hit GoTrue once per request instead of N times.
 *
 * Returns a stable empty shape for anonymous users so callers don't
 * need to null-guard every field. The AuthProvider treats orgId=null
 * as "no workspace" — same as the prior anonymous fallback.
 *
 * Migrated 2026-05-15 (migration 075 Phase 2): reads sector overrides
 * from `profiles.sector_overrides` instead of `user_profiles.sectors`.
 * Also surfaces the workspace-level sector_profile from workspace_settings
 * so callers can compose the two layers (per Section 6.8). Dual-write
 * triggers in the DB keep user_profiles in sync until Phase 3 drops it.
 */
export interface ServerBootstrap {
  user: User | null;
  orgId: string | null;
  orgName: string;
  role: "owner" | "admin" | "editor" | "viewer" | null;
  /**
   * Per-user sector overrides (from profiles.sector_overrides). Empty
   * means "use workspace defaults."
   */
  sectors: string[];
  /**
   * Workspace-level sector profile (from workspace_settings.sector_profile).
   * The composition layer (per-user override > workspace default) is
   * downstream Section 6.8 work; this field is provided so the consumer
   * can produce that composition without an additional query.
   */
  workspaceSectors: string[];
}

const EMPTY: ServerBootstrap = {
  user: null,
  orgId: null,
  orgName: "",
  role: null,
  sectors: [],
  workspaceSectors: [],
};

export const resolveServerBootstrap = cache(
  async (): Promise<ServerBootstrap> => {
    try {
      const supabase = await createSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return EMPTY;

      const [membershipRes, profileRes] = await Promise.all([
        supabase
          .from("org_memberships")
          .select("org_id, role, organizations(id, name)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("sector_overrides")
          .eq("id", user.id)
          .maybeSingle(),
      ]);

      const membership = membershipRes.data;
      const org = (membership?.organizations as { id?: string; name?: string } | null) || null;
      const sectors =
        (profileRes.data as { sector_overrides: string[] | null } | null)?.sector_overrides ?? [];

      // Pull workspace-level sectors only if the user has a workspace.
      let workspaceSectors: string[] = [];
      const orgId = org?.id || membership?.org_id || null;
      if (orgId) {
        const { data: ws } = await supabase
          .from("workspace_settings")
          .select("sector_profile")
          .eq("org_id", orgId)
          .maybeSingle();
        workspaceSectors =
          (ws as { sector_profile: string[] | null } | null)?.sector_profile ?? [];
      }

      return {
        user,
        orgId,
        orgName: org?.name || "",
        role: (membership?.role as ServerBootstrap["role"]) || null,
        sectors,
        workspaceSectors,
      };
    } catch {
      return EMPTY;
    }
  }
);
