"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type { User } from "@supabase/supabase-js";

interface AuthContext {
  user: User | null;
  /**
   * Server-resolved org id, hydrated synchronously from initial props.
   * Use this — not useWorkspaceStore.orgId — for first-render gates
   * (e.g. AppShell's no-workspace banner), since useWorkspaceStore is
   * hydrated in an effect and is null on server render. See SF-WS-1
   * (Sprint 3, 2026-05-27).
   */
  orgId: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContext>({
  user: null,
  orgId: null,
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
  /**
   * Seeds useWorkspaceStore.sectorProfile — the ONE store every sector-aware
   * read path in the app consumes (HomeSurface, SectorSynopsis,
   * RegulationDetailSurface, AskAssistant, scoring.ts, and Settings'
   * FreightSectorsCard itself). This prop's contract: it MUST be the
   * workspace's sector_profile (workspace_settings.sector_profile — the
   * single source of truth OnboardingWizard.tsx's persistSectors() writes,
   * post-2026-05-18 fix), never profiles.sector_overrides.
   *
   * KNOWN DEFECT (root-caused by lane HYG-2, 2026-09-02, Part B — the one
   * remaining item behind the 2026-08-31 register's "/profile Sectors panel
   * writes to a dead-end column"; the read side, UserProfilePage.tsx's
   * SectorProfileTab, was fixed separately and is not affected). This
   * component's own seeding call below (setSectorProfile(initialSectors))
   * is correct — it faithfully seeds the store with whatever this prop is
   * given. The bug is upstream, at this prop's ONLY call site,
   * src/app/layout.tsx:62 (`initialSectors={bootstrap.sectors}`):
   * `ServerBootstrap.sectors` (src/lib/api/server-bootstrap.ts:85-86) reads
   * `profiles.sector_overrides` — a per-user override column nothing has
   * written to since Settings/Onboarding were redirected to
   * workspace_settings.sector_profile (OnboardingWizard.tsx:217-225's own
   * comment documents that 2026-05-18 fix) — so it is always `[]`.
   * `ServerBootstrap.workspaceSectors` (server-bootstrap.ts:88-99) already
   * computes the CORRECT value from workspace_settings.sector_profile; it
   * is simply never passed to this component. Net effect: every logged-in
   * user's app-wide sector filtering/scoring silently behaves as "no
   * sectors configured" regardless of what Settings actually has saved.
   * The fix is one line at the call site —
   * `initialSectors={bootstrap.workspaceSectors}` — but src/app/layout.tsx
   * is outside this lane's write set (fsi-app/src/components/auth/**,
   * fsi-app/src/lib/auth/provision-personal-workspace.ts,
   * fsi-app/src/components/profile/**); reported as
   * NEEDS WRITE-SET EXPANSION rather than fixed here. No migration is
   * needed — both columns and their schemas are correct; this is purely an
   * app-level wiring bug.
   */
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
  // Sprint 3 SF-WS-1 (2026-05-27): orgId hydrates synchronously from
  // server props so first-render gates (e.g. AppShell's no-workspace
  // banner) see the populated value instead of the workspaceStore's
  // module-default null. Without this, banner rendered against a
  // server-side null for ~one paint between RSC stream and the
  // workspaceStore's useEffect hydration.
  const [orgId] = useState<string | null>(initialOrgId);
  // Already hydrated from server props — never enter a loading state on
  // first render. Components reading useAuth().loading get false from
  // the start, so role-gated UI doesn't flash between "loading" and
  // "admin-visible".
  const [loading] = useState(false);

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
    <AuthContext.Provider value={{ user, orgId, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
