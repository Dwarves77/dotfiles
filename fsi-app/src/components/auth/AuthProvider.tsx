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

interface AuthProviderProps {
  children: React.ReactNode;
  /** Server-resolved user (from resolveServerBootstrap in root layout). */
  initialUser?: User | null;
  /** Server-resolved org id; empty workspace if null. */
  initialOrgId?: string | null;
  /** Server-resolved org name. */
  initialOrgName?: string;
  /** Server-resolved role within the org. */
  initialRole?: "owner" | "admin" | "member" | "viewer" | null;
  /** Server-resolved per-user sector profile. */
  initialSectors?: string[];
}

/**
 * Client-side auth context. Hydrates from server-rendered initial props —
 * no mount-time fetches against Supabase Auth or org_memberships or
 * user_profiles. The previous version fired 3 client round-trips on
 * every page render; this version fires zero.
 *
 * The auth-state subscription is retained so cross-tab sign-in / sign-out
 * events still propagate. SIGNED_OUT triggers a hard reload so the
 * server-rendered initial props don't lie about a user who just signed
 * out in another tab. SIGNED_IN inside this tab routes via /login →
 * redirect, which already does a full reload.
 */
export function AuthProvider({
  children,
  initialUser = null,
  initialOrgId = null,
  initialOrgName = "",
  initialRole = null,
  initialSectors = [],
}: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(initialUser);
  // Already hydrated from server props — never enter a loading state on
  // first render. Components reading useAuth().loading get false from
  // the start, so role-gated UI doesn't flash between "loading" and
  // "admin-visible".
  const [loading, setLoading] = useState(false);

  // Hydrate the workspace store from server props once on mount. The
  // store is module-scoped, not React state, so this is safe to do in
  // an effect — no double-render concern.
  useEffect(() => {
    if (initialOrgId) {
      useWorkspaceStore
        .getState()
        .setWorkspace(initialOrgId, initialOrgName);
    }
    if (initialRole) {
      useWorkspaceStore.getState().setUserRole(initialRole);
    }
    useWorkspaceStore.getState().setSectorProfile(initialSectors);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for cross-tab auth changes. Don't refetch user data — the
  // server-rendered initial props are the source of truth for the
  // current request. On sign-out we reload so a stale props snapshot
  // can't render protected UI for an unauthenticated session.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === "SIGNED_OUT") {
        // Server props were captured for a different (signed-in) request —
        // hard reload re-renders against the now-anonymous server state.
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
      }
      if (event === "SIGNED_IN" && !initialUser) {
        // Tab-sync: another tab signed in. Reload to pick up the new
        // server-rendered orgId / role / sectors.
        if (typeof window !== "undefined") {
          window.location.reload();
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [initialUser]);

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
