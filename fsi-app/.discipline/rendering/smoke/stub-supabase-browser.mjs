// Smoke-spec stub for @/lib/supabase-browser (Lane GATES-1, 2026-09-02). See harness.mjs's header
// for why: createSupabaseBrowserClient() reads NEXT_PUBLIC_SUPABASE_URL/ANON_KEY from process.env,
// which an esbuild browser bundle never has, and @supabase/ssr's createBrowserClient throws on an
// undefined URL. This stub returns a fake-but-authenticated client: `.auth.getSession()` resolves a
// session with an access_token (so useListOrder / resourceStore's auth-gated writes proceed instead
// of failing closed with "sign in to arrange this list" — a real, useful state, but not the one a
// click-fires-callback smoke proof wants as its steady state) and `.from(table)` resolves an empty
// row on read and a no-error ack on write by default, matching a fresh-user / no-saved-row state.
export function createSupabaseBrowserClient() {
  return {
    auth: {
      getSession: async () => ({
        data: { session: { access_token: 'smoke-test-token' } },
      }),
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
