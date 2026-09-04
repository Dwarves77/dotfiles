// Unit tests for /api/workspace/bootstrap's field loaders (PERF-9, 2026-09-04, item 5,
// docs/decisions/ADR-026-detail-cache-and-viewer-state-split.md §4). Exercises the REAL exported
// loaders (not reimplementations), imported from logic.ts (BUILDGATE, 2026-09-02: route.ts may
// export only route handlers — see logic.ts's header). Each loader is proven independently
// fail-soft: one field's DB error must never take down the others (that guarantee is what makes
// collapsing four routes into one response safe).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { "@": resolve(ROOT, "src") },
});
const { loadPersonalState, loadListOrders, loadMembers, loadAdminAttention, loadOrgId, emptyListOrderByKey } =
  await jiti.import("./logic.ts");

// ── loadPersonalState ──

test("loadPersonalState: maps rows, normalizing the embedded intelligence_items object shape", async () => {
  const supabase = {
    from(table) {
      assert.equal(table, "user_item_state");
      return {
        select() {
          return {
            eq(col1) {
              assert.equal(col1, "user_id");
              return {
                eq(col2, val2) {
                  assert.equal(col2, "is_archived");
                  assert.equal(val2, true);
                  return {
                    order: async () => ({
                      data: [
                        {
                          item_id: "uuid-1",
                          is_archived: true,
                          archive_note: "noted",
                          archived_at: "2026-09-01T00:00:00Z",
                          intelligence_items: { legacy_id: "r1", title: "Reg One" },
                        },
                      ],
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  const items = await loadPersonalState(supabase, "user-1");
  assert.deepEqual(items, [
    {
      itemId: "uuid-1",
      legacyId: "r1",
      title: "Reg One",
      isArchived: true,
      archiveNote: "noted",
      archivedAt: "2026-09-01T00:00:00Z",
    },
  ]);
});

test("loadPersonalState: normalizes an ARRAY-shaped embedded row (postgrest-js FK widening) to its first element", async () => {
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: async () => ({
              data: [
                {
                  item_id: "uuid-2",
                  is_archived: true,
                  archive_note: null,
                  archived_at: null,
                  intelligence_items: [{ legacy_id: "m2", title: "Market Two" }],
                },
              ],
              error: null,
            }),
          }),
        }),
      }),
    }),
  };
  const items = await loadPersonalState(supabase, "user-1");
  assert.equal(items[0].legacyId, "m2");
  assert.equal(items[0].title, "Market Two");
});

test("loadPersonalState: DB error → [] (fail-soft, never throws)", async () => {
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: async () => ({ data: null, error: { message: "connection reset" } }),
          }),
        }),
      }),
    }),
  };
  const items = await loadPersonalState(supabase, "user-1");
  assert.deepEqual(items, []);
});

test("loadPersonalState: thrown exception → [] (fail-soft, never throws)", async () => {
  const supabase = { from() { throw new Error("boom"); } };
  const items = await loadPersonalState(supabase, "user-1");
  assert.deepEqual(items, []);
});

// ── loadListOrders ──

test("emptyListOrderByKey: has every LIST_KEYS entry, each an empty array", () => {
  const out = emptyListOrderByKey();
  assert.equal(out.watchlist.length, 0);
  assert.equal(out.regulations.length, 0);
  assert.equal(out.market.length, 0);
  assert.equal(out.research.length, 0);
  assert.equal(out.operations.length, 0);
});

test("loadListOrders: ONE query across all list_keys, grouped by key preserving position order", async () => {
  let sawIn = null;
  const supabase = {
    from(table) {
      assert.equal(table, "user_list_order");
      return {
        select: () => ({
          eq: (col, val) => {
            assert.equal(col, "user_id");
            assert.equal(val, "user-1");
            return {
              in: (col2, keys) => {
                assert.equal(col2, "list_key");
                sawIn = keys;
                return {
                  order: async () => ({
                    data: [
                      { list_key: "regulations", item_id: "r-a", position: "1000" },
                      { list_key: "market", item_id: "m-a", position: "1500" },
                      { list_key: "regulations", item_id: "r-b", position: "2000" },
                    ],
                    error: null,
                  }),
                };
              },
            };
          },
        }),
      };
    },
  };
  const out = await loadListOrders(supabase, "user-1");
  assert.ok(Array.isArray(sawIn) && sawIn.includes("regulations") && sawIn.includes("market"));
  assert.deepEqual(out.regulations, [
    { itemId: "r-a", position: "1000" },
    { itemId: "r-b", position: "2000" },
  ]);
  assert.deepEqual(out.market, [{ itemId: "m-a", position: "1500" }]);
  assert.deepEqual(out.watchlist, []);
});

test("loadListOrders: an unrecognized list_key row (drift) is silently skipped, not thrown on", async () => {
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          in: () => ({
            order: async () => ({
              data: [{ list_key: "some-future-key", item_id: "x", position: "1" }],
              error: null,
            }),
          }),
        }),
      }),
    }),
  };
  const out = await loadListOrders(supabase, "user-1");
  assert.deepEqual(out, emptyListOrderByKey());
});

test("loadListOrders: DB error → empty-by-key (fail-soft, never throws)", async () => {
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          in: () => ({
            order: async () => ({ data: null, error: { message: "timeout" } }),
          }),
        }),
      }),
    }),
  };
  const out = await loadListOrders(supabase, "user-1");
  assert.deepEqual(out, emptyListOrderByKey());
});

test("loadListOrders: thrown exception → empty-by-key (fail-soft, never throws)", async () => {
  const supabase = { from() { throw new Error("boom"); } };
  const out = await loadListOrders(supabase, "user-1");
  assert.deepEqual(out, emptyListOrderByKey());
});

// ── loadMembers ──

test("loadMembers: no org → null (degrades, does not throw a 403 the way the standalone route does)", async () => {
  const supabase = {
    from(table) {
      assert.equal(table, "org_memberships");
      return {
        select: () => ({
          eq: () => ({
            order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
          }),
        }),
      };
    },
  };
  const members = await loadMembers(supabase, "user-1");
  assert.equal(members, null);
});

test("loadMembers: org found → roster mapped with display-name fallback chain", async () => {
  let call = 0;
  const supabase = {
    from(table) {
      call += 1;
      if (call === 1) {
        // resolveOrgIdFromUserId's own org_memberships lookup
        assert.equal(table, "org_memberships");
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({ maybeSingle: async () => ({ data: { org_id: "org-1" }, error: null }) }),
              }),
            }),
          }),
        };
      }
      // the roster query
      assert.equal(table, "org_memberships");
      return {
        select: () => ({
          eq: (col, val) => {
            assert.equal(col, "org_id");
            assert.equal(val, "org-1");
            return {
              order: async () => ({
                data: [
                  { user_id: "u-1", role: "owner", user: { full_name: "Ada Lovelace" } },
                  { user_id: "u-2", role: "member", user: { display_name: "Bea" } },
                  { user_id: "u-3", role: "member", user: { email: "c@example.com" } },
                  { user_id: "u-4", role: "member", user: null },
                ],
                error: null,
              }),
            };
          },
        }),
      };
    },
  };
  const members = await loadMembers(supabase, "user-1");
  assert.deepEqual(members, [
    { user_id: "u-1", role: "owner", display_name: "Ada Lovelace", avatar_url: null },
    { user_id: "u-2", role: "member", display_name: "Bea", avatar_url: null },
    { user_id: "u-3", role: "member", display_name: "c@example.com", avatar_url: null },
    { user_id: "u-4", role: "member", display_name: "u-4...", avatar_url: null },
  ]);
});

test("loadMembers: roster query error → null (fail-soft, never throws)", async () => {
  let call = 0;
  const supabase = {
    from() {
      call += 1;
      if (call === 1) {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({ maybeSingle: async () => ({ data: { org_id: "org-1" }, error: null }) }),
              }),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ order: async () => ({ data: null, error: { message: "x" } }) }) }) };
    },
  };
  const members = await loadMembers(supabase, "user-1");
  assert.equal(members, null);
});

test("loadMembers: thrown exception → null (fail-soft, never throws)", async () => {
  const supabase = { from() { throw new Error("boom"); } };
  const members = await loadMembers(supabase, "user-1");
  assert.equal(members, null);
});

// ── loadOrgId ── (PERF-12, 2026-09-04, ADR-027 §5/item 4)

test("loadOrgId: org found → the org_id (same resolveOrgIdFromUserId call loadMembers already makes)", async () => {
  const supabase = {
    from(table) {
      assert.equal(table, "org_memberships");
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({ maybeSingle: async () => ({ data: { org_id: "org-1" }, error: null }) }),
            }),
          }),
        }),
      };
    },
  };
  const orgId = await loadOrgId(supabase, "user-1");
  assert.equal(orgId, "org-1");
});

test("loadOrgId: no membership → null (degrades, does not throw)", async () => {
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        }),
      }),
    }),
  };
  const orgId = await loadOrgId(supabase, "user-1");
  assert.equal(orgId, null);
});

test("loadOrgId: thrown exception → null (fail-soft, never throws)", async () => {
  const supabase = { from() { throw new Error("boom"); } };
  const orgId = await loadOrgId(supabase, "user-1");
  assert.equal(orgId, null);
});

// ── loadAdminAttention ──

test("loadAdminAttention: non-admin → null, RPC never queried", async () => {
  const supabase = {
    from(table) {
      assert.equal(table, "profiles");
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { is_platform_admin: false }, error: null }) }) }) };
    },
    rpc() {
      throw new Error("must not call admin_attention_counts for a non-admin");
    },
  };
  const result = await loadAdminAttention(supabase, "user-1");
  assert.equal(result, null);
});

// NOTE on what is NOT tested here: once isPlatformAdmin resolves true, loadAdminAttention calls the
// MODULE-LEVEL fetchAttentionCounts from admin/attention/logic.ts — by design (see logic.ts's header:
// "one cache, two callers"), that function builds its OWN getServiceSupabase() client rather than
// taking the `supabase` this test injects, so the RPC success/error branches are not mockable from
// here without a second seam. What IS proven below: the admin gate short-circuits before ever
// reaching the RPC (previous test), and a failure anywhere in that real call still degrades to null
// rather than throwing (this function's own try/catch) — the exact fail-soft contract every other
// field in this file already has.
test("loadAdminAttention: platform admin path reaches the shared fetchAttentionCounts cache and stays fail-soft (no live service-role client here → degrades to null, never throws)", async () => {
  const supabase = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { is_platform_admin: true }, error: null }) }) }) }),
    rpc() {
      throw new Error("must not be reached: fetchAttentionCounts uses its own getServiceSupabase() client, not this fake");
    },
  };
  const result = await loadAdminAttention(supabase, "admin-1");
  assert.equal(result, null);
});

test("loadAdminAttention: thrown exception → null (fail-soft, never throws)", async () => {
  const supabase = { from() { throw new Error("boom"); } };
  const result = await loadAdminAttention(supabase, "user-1");
  assert.equal(result, null);
});
