"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type { User } from "@supabase/supabase-js";
import { resolveAuthSeed, type AuthSeed, type BootstrapLike } from "@/components/shell/bootstrap-seed";

interface AuthContext {
  user: User | null;
  /**
   * Client-fetched org id (PERF-10, 2026-09-04) — see this file's header for the mechanism.
   * Use this — not useWorkspaceStore.orgId — for first-render gates
   * (e.g. AppShell's no-workspace banner), since useWorkspaceStore is
   * hydrated in an effect and is null on server render. See SF-WS-1
   * (Sprint 3, 2026-05-27).
   */
  orgId: string | null;
  /**
   * True until the identity fetch has resolved (PERF-10, 2026-09-04). NOT the same thing as
   * "signed out" — a `loading: true, user: null` pair means "we don't know yet," while
   * `loading: false, user: null` means "confirmed anonymous." Consumers gating a fetch on
   * knowing the real auth state (useAdminAttention) already read this field; every other
   * consumer (UserMenu, AppShell's no-workspace banner) already renders nothing for
   * `user === null` regardless of `loading`, so the pending window shows blank chrome, never a
   * WRONG (anonymous) state for a signed-in viewer — see this file's header for the full
   * mechanism this supports.
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
 * Client-side auth context.
 *
 * PERF-10 (2026-09-04, root-cause fix, docs/decisions/ADR-026-detail-cache-and-viewer-state-split.md
 * Follow-up): this provider used to be SEEDED by src/app/layout.tsx's server-rendered
 * `resolveServerBootstrap()` promise, fed in via BootstrapBoundary.tsx's `use()`/Suspense
 * mechanism (PERF-4/PERF-9). That mechanism required `headers()` to run UNCONDITIONALLY in every
 * route's shared layout tree to decide whether to skip the resolve on an RSC navigation — and
 * `headers()`/`cookies()` used anywhere in a route's render tree, even inside `<Suspense
 * fallback={null}>`, forces that WHOLE route `ƒ` (Dynamic) under Next's classical renderer
 * (measured directly, ADR-026 Context §1: `/privacy` — zero dynamic APIs of its own — stayed `ƒ`
 * with the Suspense-wrapped version). This provider now mounts with the anonymous/pending default
 * (`loading: true`, `user: null`, `orgId: null`) and seeds itself via a plain client-side `fetch`
 * to `GET /api/auth/identity` (see that route's header) in a `useEffect` below — a Route Handler's
 * own dynamism does not propagate to a page that merely `fetch()`s it from the browser, so this
 * is what actually lets a route with no dynamic API of its own build `○`. `resolveAuthSeed`
 * (bootstrap-seed.ts) is REUSED unchanged for the pure "resolved bootstrap shape → seed" mapping
 * this file always delegated to — only the transport (client fetch instead of a server-rendered,
 * `use()`-consumed promise) changed. This fetch fires once per browser session (AuthProvider never
 * unmounts across a client-side navigation, same as before), not once per navigation.
 *
 * TRADE-OFF, STATED HONESTLY (not claimed as a pure win): on a DOCUMENT load, the identity fetch is
 * now ALWAYS a client round trip (previously sometimes free — shared, via React `cache()`, with
 * other server components on the same request that also needed it). See this lane's REPORT for the
 * measured chrome-seed latency this trades for the route-table win.
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
  // would be stale).
  const knownUserRef = useRef<User | null>(null);

  const seed = useCallback((bootstrap: BootstrapLike | null) => {
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

  // PERF-10: the client-side identity fetch this provider now seeds itself from — see this file's
  // header. Fires once (empty deps); this component mounts once per browser session. A failed
  // fetch (network error, non-200) seeds the anonymous default via resolveAuthSeed(null) — never
  // leaves `loading: true` forever, and never renders a WRONG signed-in state.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/identity", { credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<BootstrapLike>) : null))
      .then((body) => {
        if (!cancelled) seed(body);
      })
      .catch(() => {
        if (!cancelled) seed(null);
      });
    return () => {
      cancelled = true;
    };
  }, [seed]);

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
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
