// Account-page-composition-only stub for @/lib/supabase-browser (lane compose-other, 2026-09-08).
// UserProfilePage.tsx reads three tables directly via supabase.from(...).select(...).eq(...): the
// profiles row (name/bio/verifier status/created_at), organizations.plan (rail "Plan" tile), and
// org_memberships (head-count for the "Members & roles · N" tab label). The generic
// stub-supabase-browser.mjs always resolves null/empty, which is correct for a click-fires-callback
// smoke proof but wrong here — this lane's mounts show POPULATED fixture data (no live Supabase
// project reachable in this sandbox; see DEVIATION-LOG.md), so this stub answers each of those three
// reads with a fixture row instead of null.
export function createSupabaseBrowserClient() {
  return {
    auth: {
      getSession: async () => ({
        data: { session: { access_token: 'smoke-test-token' } },
      }),
    },
    from(table) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => {
          if (table === 'profiles') {
            return {
              data: {
                id: 'audit-user',
                full_name: 'Jason Losh',
                bio: 'Compliance lead, ocean and air freight.',
                avatar_url: null,
                jurisdiction_overrides: ['eu', 'us', 'uk'],
                transport_mode_overrides: ['ocean', 'air'],
                verifier_status: 'active',
                verifier_since: '2026-02-01',
                created_at: '2025-11-03T00:00:00Z',
              },
              error: null,
            };
          }
          if (table === 'organizations') {
            return { data: { plan: 'enterprise' }, error: null };
          }
          return { data: null, error: null };
        },
        upsert: async () => ({ error: null }),
        update: () => chain,
        then: undefined,
      };
      // org_memberships head-count read chains `.select(..., {count}).eq(...)` and is awaited
      // directly (no maybeSingle) — make the chain itself thenable so `await` on it resolves.
      if (table === 'org_memberships') {
        chain.select = () => ({
          eq: async () => ({ count: 12, error: null }),
        });
      }
      return chain;
    },
  };
}
