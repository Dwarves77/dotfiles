"use client";

import { use, useEffect } from "react";
import type { ServerBootstrap } from "@/lib/api/server-bootstrap";
import { useAuthSeed } from "@/components/auth/AuthProvider";

/**
 * BootstrapBoundary — the ONLY thing in the render tree that actually blocks on
 * `resolveServerBootstrap()`'s Supabase round trip (PERF-4, 2026-09-03,
 * docs/audits/perf-load-times-2026-09-03.md dispatch item (1): "DOCUMENT loads — hard reload, first
 * visit, the /profile hard navigation — still block first paint on that await (~1.5s cold)").
 *
 * MOUNTED AS A SIBLING of `<AppShell>{children}</AppShell>`, both children of `<AuthProvider>`
 * (src/app/layout.tsx), and wrapped in its OWN `<Suspense fallback={null}>`. This placement is the
 * entire mechanism:
 *
 *   - React's `use(bootstrapPromise)` suspends the CALLING component while the promise is pending.
 *     Suspense only replaces the nearest ANCESTOR boundary's subtree — it has no effect on siblings.
 *     Because `<AppShell>{children}</AppShell>` is a sibling of this component, not a descendant, it
 *     is completely unaffected by this component's suspension: the nav rail, the masthead, and the
 *     target route's own `loading.tsx` Suspense boundary all render and stream immediately, on a
 *     cold document load, before the auth/workspace Supabase read even starts returning.
 *   - This component itself renders NOTHING (`return null`) — its only job is calling
 *     `useAuthSeed()`'s callback with the resolved value, exactly once, so AuthProvider's context
 *     updates AFTER the shell has already painted. AuthProvider does not need to call `use()` itself
 *     (and must not — see AuthProvider.tsx's header for why that would put it, and everything nested
 *     inside it, behind the same block this lane removes).
 *
 * ON AN RSC (CLIENT-SIDE) NAVIGATION: layout.tsx hands this component an ALREADY-RESOLVED promise
 * (`Promise.resolve(null)` — PERF-3's `isRscNavigation` skip, unchanged by this lane). `use()` on an
 * already-settled promise returns synchronously without suspending, so this component never
 * re-arms a real fetch on navigation #2, #3, .... Combined with `shouldApplySeed`'s once-only guard
 * (bootstrap-seed.ts), that resolved-`null` value is received and discarded exactly like PERF-3's
 * original "AuthProvider ignores updates past first mount" contract — a background navigation can
 * never wipe an already-seeded signed-in user's state back to anonymous.
 *
 * NO ANONYMOUS FLASH: while this component's promise is pending, AuthProvider's context stays at its
 * mount-time default (`user: null, loading: true`). Every consumer that branches on `user` renders
 * NOTHING for `user === null` (UserMenu returns `null`; AppShell's no-workspace banner and
 * `<AskAssistant>` gate are both `user && ...`) — so the pending window is blank chrome popping in
 * once resolved, never a WRONG "you are signed out" state for a signed-in viewer. See
 * AuthProvider.tsx's `loading` field doc comment for the one consumer (`useAdminAttention`) that
 * reads `loading` explicitly to avoid firing a request before the real role is known.
 */
export function BootstrapBoundary({
  bootstrapPromise,
}: {
  bootstrapPromise: Promise<ServerBootstrap | null>;
}) {
  const bootstrap = use(bootstrapPromise);
  const seed = useAuthSeed();

  useEffect(() => {
    seed?.(bootstrap);
    // Intentionally empty deps: seed() applies exactly once (bootstrap-seed.ts's
    // shouldApplySeed) and every later render of this still-mounted component — with a new
    // `bootstrap` value, real or the RSC-nav `null` placeholder — must NOT re-fire this effect.
    // See this component's own header ("ON AN RSC NAVIGATION") for why that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
