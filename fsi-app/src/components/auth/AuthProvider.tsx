"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type { User } from "@supabase/supabase-js";
import { resolveAuthSeed, shouldApplySeed, type AuthSeed, type BootstrapLike } from "@/components/shell/bootstrap-seed";

interface AuthContext {
  user: User | null;
  /**
   * Server-resolved org id, hydrated (asynchronously, PERF-4) from BootstrapBoundary's seed.
   * Use this — not useWorkspaceStore.orgId — for first-render gates
   * (e.g. AppShell's no-workspace banner), since useWorkspaceStore is
   * hydrated in an effect and is null on server render. See SF-WS-1
   * (Sprint 3, 2026-05-27).
   */
  orgId: string | null;
  /**
   * True until the bootstrap seed has been applied (PERF-4, 2026-09-03). NOT the same thing as
   * "signed out" — a `loading: true, user: null` pair means "we don't know yet," while
   * `loading: false, user: null` means "confirmed anonymous." Consumers gating a fetch on
   * knowing the real auth state (useAdminAttention) already read this field; every other
   * consumer (UserMenu, AppShell's no-workspace banner) already renders nothing for
   * `user === null` regardless of `loading`, so the pending window shows blank chrome, never a
   * WRONG (anonymous) state for a signed-in viewer — see BootstrapBoundary.tsx's header for the
   * full mechanism this supports.
   */
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContext>({
  user: null,
  orgId: null,
  loading: true,
  signOut: async () => {},
});

/**
 * Side-channel context BootstrapBoundary.tsx uses to push the resolved server bootstrap into this
 * provider's state (PERF-4, 2026-09-03). Not part of useAuth()'s public surface — deliberately a
 * SEPARATE context from AuthContext so a component can call `use(bootstrapPromise)` and feed the
 * result in here WITHOUT itself becoming an ancestor AuthProvider suspends on (see
 * BootstrapBoundary.tsx's header for why that split is what lets the app shell + route content
 * render before the bootstrap promise resolves, instead of blocking behind it).
 */
const AuthSeedContext = createContext<((bootstrap: BootstrapLike | null) => void) | null>(null);

/** Used only by BootstrapBoundary.tsx. */
export function useAuthSeed() {
  return useContext(AuthSeedContext);
}

/**
 * Client-side auth context.
 *
 * PERF-4 (2026-09-03, docs/audits/perf-load-times-2026-09-03.md dispatch item (1)): this provider
 * used to receive `initialUser`/`initialOrgId`/... as PROPS, already resolved, because
 * src/app/layout.tsx awaited `resolveServerBootstrap()` before returning any JSX — every mount of
 * this component already had the real values in hand. That await is gone (layout.tsx now returns
 * the shell synchronously and creates the bootstrap promise without awaiting it). This provider now
 * mounts with the anonymous/pending default (`loading: true`, `user: null`, `orgId: null`) and is
 * SEEDED asynchronously, exactly once, by BootstrapBoundary.tsx — a sibling of `<AppShell>` inside
 * this provider, mounted in its own `<Suspense>` so the seed's own pending state never blocks
 * `<AppShell>`/`{children}` from rendering (see BootstrapBoundary.tsx's header for the full
 * mechanism; see bootstrap-seed.ts for the pure composition + once-only-apply logic `seed()` below
 * delegates to).
 *
 * No mount-time fetches against Supabase Auth / org_memberships / profiles fire from HERE either
 * way — this is unchanged from the pre-PERF-4 shape, just fed later instead of synchronously.
 *
 * The auth-state subscription is retained so cross-tab sign-in / sign-out
 * events still propagate. SIGNED_OUT triggers a hard reload so a stale
 * seeded snapshot doesn't render protected UI for an unauthenticated session.
 * SIGNED_IN inside this tab routes via /login → redirect, which already does
 * a full reload.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Mirrors `user` for the cross-tab SIGNED_IN check below (needs the LATEST known value inside a
  // callback registered once — see that effect's own comment for why a plain closure over `user`
  // would be stale). Also doubles as the seed-once guard's "have we applied a seed yet" flag
  // (bootstrap-seed.ts's shouldApplySeed): both a real seed and the RSC-nav skip's `null`
  // placeholder mark this true, since either one means "we now know this tab's answer."
  const seededRef = useRef(false);
  const knownUserRef = useRef<User | null>(null);

  const seed = useCallback((bootstrap: BootstrapLike | null) => {
    if (!shouldApplySeed(seededRef.current)) return;
    seededRef.current = true;
    const applied: AuthSeed = resolveAuthSeed(bootstrap);
    knownUserRef.current = applied.user as User | null;
    setUser(applied.user as User | null);
    setOrgId(applied.orgId);
    setLoading(false);
    // Hydrate the workspace store. The store is module-scoped, not React
    // state, so this is safe to do outside a render.
    if (applied.orgId) {
      useWorkspaceStore.getState().setWorkspace(applied.orgId, applied.orgName);
    }
    if (applied.role) {
      useWorkspaceStore.getState().setUserRole(applied.role);
    }
    useWorkspaceStore.getState().setSectorProfile(applied.sectors);
  }, []);

  // Listen for cross-tab auth changes. Don't refetch user data — the
  // seeded bootstrap is the source of truth for the current request. On
  // sign-out we reload so a stale seeded snapshot can't render protected UI
  // for an unauthenticated session.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      knownUserRef.current = session?.user ?? null;
      if (event === "SIGNED_OUT") {
        // Seeded state was captured for a different (signed-in) request —
        // hard reload re-renders against the now-anonymous server state.
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
      }
      if (event === "SIGNED_IN" && !knownUserRef.current) {
        // Tab-sync: another tab signed in and this tab had no known user yet
        // (either genuinely anonymous, or the bootstrap seed hasn't landed —
        // either way reloading is safe: it re-renders against a fresh
        // server-resolved orgId / role / sectors). Matches the pre-PERF-4
        // `!initialUser` check exactly for the common case (seed already
        // applied by the time a real cross-tab event fires in practice).
        if (typeof window !== "undefined") {
          window.location.reload();
        }
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider value={{ user, orgId, loading, signOut }}>
      <AuthSeedContext.Provider value={seed}>{children}</AuthSeedContext.Provider>
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
