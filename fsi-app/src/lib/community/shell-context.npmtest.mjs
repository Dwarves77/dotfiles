// @ts-check
// Lane L33 (2026-09-17): loadCommunityShellContext is the one home of the /community/* shell context the
// seven pages used to assemble by hand. A fake client returns the rows each read used to return; the test
// pins the mapping (memberships, invitations, topics, region counts with zero-fill, the current-user
// block) and the region-count RPC arguments browse passes. Runs via the CI npmtest glob (jiti for .ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { loadCommunityShellContext, COMMUNITY_REGIONS } = await jiti.import("./shell-context.ts");

function fakeClient(rows) {
  const calls = { rpc: [] };
  const chain = (table) => {
    const q = {
      select(cols) {
        // SEC-6 (migration 375): profiles.is_platform_admin is revoked from authenticated; a select naming it would 42501.
        if (table === "profiles" && /is_platform_admin/.test(String(cols))) throw new Error("permission denied for table profiles (42501): is_platform_admin");
        return q;
      }, eq() { return q; }, order() { return q; }, limit() { return q; },
      then(res) { return Promise.resolve({ data: rows[table] ?? [], error: null }).then(res); },
      maybeSingle() { return Promise.resolve({ data: (rows[table] ?? [])[0] ?? null, error: null }); },
    };
    return q;
  };
  return {
    calls,
    from(table) { return chain(table); },
    rpc(name, args) {
      calls.rpc.push([name, args]);
      if (name === "is_platform_admin") return Promise.resolve(rows.__adminError ? { data: null, error: rows.__adminError } : { data: rows.__admin === true, error: null });
      return Promise.resolve({ data: rows.__rpc ?? [], error: null });
    },
  };
}

const rows = {
  community_group_members: [
    { group_id: "g1", role: "member", starred: 1, muted: 0, joined_at: "2026-01-01", community_groups: { id: "g1", name: "EU forwarders", slug: "eu-forwarders", region: "EU", privacy: "public", member_count: null, weekly_post_count: 3, last_active_at: "2026-09-01" } },
    { group_id: "gone", role: "member", community_groups: null },
  ],
  community_group_invitations: [{ id: "i1", group_id: "g2", inviter_user_id: "u9", status: "pending", created_at: "2026-09-02", community_groups: { id: "g2", name: "UK", slug: "uk", region: "UK", privacy: "private" } }],
  community_topics: [{ id: "t1", label: "SAF", community_topic_groups: [{ group_id: "g1" }, { group_id: "g2" }] }, { id: "t2", label: "CBAM", community_topic_groups: null }],
  __rpc: [{ region: "EU", count: "4" }, { region: "APAC", count: 2 }],
  profiles: [{ name: "Ada", headshot_url: null }],
  __admin: true,
  org_memberships: [{ organizations: { name: "Caro Freight" } }],
};

test("maps the four shell reads and the two profile reads into CommunityShell's props", async () => {
  const sb = fakeClient(rows);
  const ctx = await loadCommunityShellContext(sb, { id: "u1", email: "ada@example.org" });
  assert.deepEqual(ctx.memberships, [{ group_id: "g1", role: "member", starred: true, muted: false, joined_at: "2026-01-01", group: { id: "g1", name: "EU forwarders", slug: "eu-forwarders", region: "EU", privacy: "public", member_count: 0, weekly_post_count: 3, last_active_at: "2026-09-01" } }]);
  assert.deepEqual(ctx.invitations.map((i) => [i.id, i.group.slug]), [["i1", "uk"]]);
  assert.deepEqual(ctx.topics, [{ id: "t1", label: "SAF", group_count: 2 }, { id: "t2", label: "CBAM", group_count: 0 }]);
  assert.equal(ctx.regions, COMMUNITY_REGIONS);
  assert.equal(ctx.regionCounts.EU, 4);
  assert.equal(ctx.regionCounts.APAC, 2);
  assert.equal(ctx.regionCounts.GLOBAL, 0, "every region is zero-filled");
  assert.deepEqual(ctx.currentUser, { id: "u1", email: "ada@example.org", name: "Ada", headshotUrl: null, employer: "Caro Freight", isPlatformAdmin: true });
  assert.deepEqual(sb.calls.rpc.filter(([n]) => n === "community_region_counts"), [["community_region_counts", undefined]]);
  assert.deepEqual(sb.calls.rpc.filter(([n]) => n === "is_platform_admin"), [["is_platform_admin", undefined]], "the flag is read through the rpc, once");
});

test("SEC-6: isPlatformAdmin is true only for a literal true from the rpc; an rpc error or a non-admin is false (a display gate fails closed)", async () => {
  for (const [extra, want] of [[{ __admin: true }, true], [{ __admin: false }, false], [{ __admin: "true" }, false], [{ __admin: true, __adminError: { message: "boom" } }, false]]) {
    const ctx = await loadCommunityShellContext(fakeClient({ ...rows, ...extra }), { id: "u1", email: "ada@example.org" });
    assert.equal(ctx.currentUser.isPlatformAdmin, want, JSON.stringify(extra));
  }
});

test("region-count RPC arguments pass through (browse counts public groups only); a missing profile falls back to the email local part", async () => {
  const sb = fakeClient({ ...rows, profiles: [], org_memberships: [], __admin: false });
  const ctx = await loadCommunityShellContext(sb, { id: "u2", email: "grace@example.org" }, { regionCountsArgs: { p_privacy: "public" } });
  assert.deepEqual(sb.calls.rpc.filter(([n]) => n === "community_region_counts"), [["community_region_counts", { p_privacy: "public" }]]);
  assert.equal(ctx.currentUser.name, "grace");
  assert.equal(ctx.currentUser.employer, "");
  assert.equal(ctx.currentUser.isPlatformAdmin, false);
});

// ── Lane DATA-3a (2026-10-11, backlog B-0048): every read is read WITH its error ──
//
// The six reads used to destructure `{ data }` and drop `error`, so a failed read rendered the shell as if the
// user had no groups, no pending invitations, no topics, zero region counts, no employer. The function's
// contract is throw-on-failure (the six /community/* pages let the throw reach Next's error boundary); one case
// per read proves a failure now rejects with its site. RED against the unchanged source: each resolves instead.
/** A chain whose every method returns itself and which resolves to `result` when awaited or ended by maybeSingle(). */
function chainOf(result) {
  const chain = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") return (resolveFn) => resolveFn(result);
        if (prop === "maybeSingle") return async () => result;
        return () => chain;
      },
    }
  );
  return chain;
}
function failingClient(results) {
  return {
    from: (table) => chainOf(results[table] ?? { data: [], error: null }),
    rpc: (name) => chainOf(results[name] ?? { data: name === "is_platform_admin" ? false : [], error: null }),
  };
}
const READ_FAILED = { data: null, error: { message: "boom" } };

for (const [read, results, pattern] of [
  ["group memberships", { community_group_members: READ_FAILED }, /group memberships read failed: boom/],
  ["pending invitations", { community_group_invitations: READ_FAILED }, /pending invitations read failed: boom/],
  ["owned topics", { community_topics: READ_FAILED }, /owned topics read failed: boom/],
  ["region counts rpc", { community_region_counts: READ_FAILED }, /community_region_counts failed: boom/],
  ["profile", { profiles: READ_FAILED }, /profile read failed: boom/],
  ["employer", { org_memberships: READ_FAILED }, /employer read failed: boom/],
]) {
  test(`DATA-3a: a failed ${read} read throws with its site instead of rendering as empty`, async () => {
    await assert.rejects(() => loadCommunityShellContext(failingClient(results), { id: "u1", email: "ada@example.org" }), pattern);
  });
}
