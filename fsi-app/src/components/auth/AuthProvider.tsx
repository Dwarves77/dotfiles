"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type { User } from "@supabase/supabase-js";

interface AuthContext {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContext>({
  user: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    // Get initial session + load workspace role + sector profile.
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      setUser(user);
      setLoading(false);

      if (user) {
        // Org membership + per-user sector profile in parallel — they're
        // independent reads. sectorProfile is the canonical per-user store
        // (user_profiles.sectors, migration 027). Settings reads from
        // useWorkspaceStore.sectorProfile, so this hydration is what makes
        // /settings show the correct ticked boxes after picking sectors
        // on /profile. Without it, the store stays at its [] initial state
        // and /settings says "No sectors selected".
        const [membershipRes, profileRes] = await Promise.all([
          supabase
            .from("org_memberships")
            .select("org_id, role, organizations(id, name)")
            .eq("user_id", user.id)
            .limit(1)
            .single(),
          supabase
            .from("user_profiles")
            .select("sectors")
            .eq("user_id", user.id)
            .maybeSingle(),
        ]);

        const membership = membershipRes.data;
        if (membership) {
          const org = membership.organizations as any;
          useWorkspaceStore.getState().setWorkspace(org?.id || membership.org_id, org?.name || "");
          useWorkspaceStore.getState().setUserRole(membership.role as any);
        }

        const sectors = (profileRes.data as { sectors: string[] | null } | null)?.sectors ?? [];
        useWorkspaceStore.getState().setSectorProfile(sectors);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
