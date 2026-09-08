// Smoke-spec stub for @/lib/supabase-browser with NO SESSION (lane BRIEFDATA, 2026-09-08).
//
// The sibling stub-supabase-browser.mjs resolves a fake-but-authenticated session, which is the
// right steady state for every spec that wants to exercise a signed-in path. This one is its
// negative: `getSession()` resolves `{ session: null }`, the state a browser is genuinely in for
// the first frames after load and for every signed-out visitor.
//
// It exists because that state is where the watch write broke. Before train 61's lane TAGS-401,
// WatchButton interpolated the absent token into `Bearer ${session?.access_token || ""}` and sent
// it: a header that passes requireAuth's `startsWith("Bearer ")` check and then fails getClaims(),
// so the write 401s and nothing is written while the control looks live. `authed-fetch.ts`'s rule
// is that no token means NO REQUEST; this stub is what lets watchlist-write-smoke.mjs prove that
// rule holds rather than assert it from the source.
export function createSupabaseBrowserClient() {
  return {
    auth: {
      getSession: async () => ({ data: { session: null } }),
    },
    from() {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: null, error: null }),
        upsert: async () => ({ error: null }),
      };
      return chain;
    },
  };
}
