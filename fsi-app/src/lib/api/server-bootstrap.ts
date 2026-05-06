import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";

/**
 * Server-side auth + workspace bootstrap.
 *
 * Resolves the current user, their org membership (orgId, orgName, role),
 * and their per-user sector profile in ONE pass, request-scoped via
 * React's cache(). Used by the root layout to seed AuthProvider with
 * initial state — eliminates the 2 client-side queries AuthProvider
 * was firing on every page mount (auth.getUser + org_memberships +
 * user_profiles).
 *
 * Why cache(): React's cache() is request-scoped — the same call from
 * multiple server components within one request shares the result. So
 * the root layout, /admin role gate, /settings auth check, and any
 * future caller all hit GoTrue once per request instead of N times.
 *
 * Returns a stable empty shape for anonymous users so callers don't
 * need to null-guard every field. The AuthProvider treats orgId=null
 * as "no workspace" — same as the prior anonymous fallback.
 */
export interface ServerBootstrap {
  user: User | null;
  orgId: string | null;
  orgName: string;
  role: "owner" | "admin" | "editor" | "viewer" | null;
  sectors: string[];
}

const EMPTY: ServerBootstrap = {
  user: null,
  orgId: null,
  orgName: "",
  role: null,
  sectors: [],
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
          .from("user_profiles")
          .select("sectors")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      const membership = membershipRes.data;
      const org = (membership?.organizations as { id?: string; name?: string } | null) || null;
      const sectors =
        (profileRes.data as { sectors: string[] | null } | null)?.sectors ?? [];

      return {
        user,
        orgId: org?.id || membership?.org_id || null,
        orgName: org?.name || "",
        role: (membership?.role as ServerBootstrap["role"]) || null,
        sectors,
      };
    } catch {
      return EMPTY;
    }
  }
);
