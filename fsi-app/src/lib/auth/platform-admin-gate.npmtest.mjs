// platform-admin-gate.npmtest.mjs: lane AUTH-IDENTITY (2026-09-24), ONE admin gate.
//
// The nav's Admin row and `/admin`'s gate used to answer different questions: the row showed for a
// WORKSPACE owner/admin (useWorkspaceStore.userRole), the route admits only profiles.is_platform_admin
// (requirePlatformAdmin). This file proves they now agree for all four combinations of
// (platform admin yes/no) x (workspace owner yes/no), by running the REAL server-side chain on both
// sides against one fake Supabase client:
//   nav   = shouldShowAdminNav(resolveAuthSeed(await resolveServerBootstrapFromClient(client)))
//   route = (await decidePlatformAdmin(client)).kind === "admitted"   (what requirePlatformAdmin uses)
// and adds a sanity test that the OLD nav predicate disagreed with the route in two of the four, so
// the agreement test is not vacuous.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { decidePlatformAdmin, isPlatformAdminProfile, readOwnPlatformAdmin, IS_PLATFORM_ADMIN_RPC } = await jiti.import("./platform-admin-gate.ts");
const { resolveServerBootstrapFromClient } = await jiti.import("../api/server-bootstrap.ts");
const { resolveAuthSeed, shouldShowAdminNav } = await jiti.import("../../components/shell/bootstrap-seed.ts");

const ORG = { id: "org-1", name: "Dietl / Rockit", workspace_settings: [] };

/** A table-backed fake that honours eq/order/limit, so a query that forgot its user filter would show.
 *  SEC-6 (migration 375): profiles.is_platform_admin is no longer selectable by a signed-in user, so the fake
 *  REFUSES a profiles select that names it (as the database now does with 42501) and serves the flag only through
 *  rpc("is_platform_admin"), which answers for the session user alone. `rpcCalls` records every rpc. */
function tableClient({ sessionUser, memberships = [], profiles = [], profilesError = null, adminRpcError = null }) {
  const rpcCalls = [];
  return {
    rpcCalls,
    rpc(name, args) {
      rpcCalls.push([name, args]);
      if (name !== "is_platform_admin") throw new Error(`unexpected rpc ${name}`);
      if (adminRpcError) return Promise.resolve({ data: null, error: adminRpcError });
      const me = sessionUser ? profiles.find((r) => r.id === sessionUser.id) : null;
      return Promise.resolve({ data: !!(me && me.is_platform_admin === true), error: null });
    },
    auth: {
      async getClaims() {
        return sessionUser
          ? { data: { claims: { sub: sessionUser.id, email: sessionUser.email } }, error: null }
          : { data: null, error: null };
      },
      async getUser() {
        return { data: { user: sessionUser ? { id: sessionUser.id, email: sessionUser.email } : null }, error: null };
      },
    },
    from(table) {
      const source = table === "org_memberships" ? memberships : table === "profiles" ? profiles : null;
      if (!source) throw new Error(`unexpected table ${table}`);
      let rows = source.slice();
      const q = {
        select(cols) {
          if (/is_platform_admin/.test(String(cols))) {
            throw new Error("permission denied for table profiles (42501): is_platform_admin is not selectable by a signed-in user (migration 375)");
          }
          return q;
        },
        eq(col, val) { rows = rows.filter((r) => r[col] === val); return q; },
        order(col, opts) {
          const dir = opts && opts.ascending === false ? -1 : 1;
          rows.sort((a, b) => (a[col] < b[col] ? -dir : a[col] > b[col] ? dir : 0));
          return q;
        },
        limit(n) { rows = rows.slice(0, n); return q; },
        async maybeSingle() {
          if (table === "profiles" && profilesError) return { data: null, error: profilesError };
          return { data: rows[0] ?? null, error: null };
        },
      };
      return q;
    },
  };
}

function clientFor({ platformAdmin, workspaceOwner }) {
  const me = { id: "user-A", email: "a@example.com" };
  return tableClient({
    sessionUser: me,
    memberships: [{ user_id: me.id, org_id: ORG.id, role: workspaceOwner ? "owner" : "member", created_at: "2026-04-05", organizations: ORG }],
    profiles: [{ id: me.id, sector_overrides: [], is_platform_admin: platformAdmin }],
  });
}

for (const platformAdmin of [true, false]) {
  for (const workspaceOwner of [true, false]) {
    test(`ONE admin gate: platform admin ${platformAdmin ? "yes" : "no"} x workspace owner ${workspaceOwner ? "yes" : "no"} -> nav and /admin agree (${platformAdmin ? "shown + admitted" : "hidden + denied"})`, async () => {
      const client = clientFor({ platformAdmin, workspaceOwner });
      const seed = resolveAuthSeed(await resolveServerBootstrapFromClient(client));
      const nav = shouldShowAdminNav({ status: seed.status, isPlatformAdmin: seed.isPlatformAdmin });
      const decision = await decidePlatformAdmin(client);
      const route = decision.kind === "admitted";
      assert.equal(nav, route, "the nav shows Admin exactly when the route admits");
      assert.equal(route, platformAdmin, "the platform bit alone decides; the workspace role does not");
      assert.equal(decision.kind, platformAdmin ? "admitted" : "denied");
    });
  }
}

test("sanity (non-vacuous): the OLD nav predicate (workspace role owner|admin) disagreed with the route in exactly two of the four combinations", async () => {
  let disagreements = 0;
  for (const platformAdmin of [true, false]) {
    for (const workspaceOwner of [true, false]) {
      const client = clientFor({ platformAdmin, workspaceOwner });
      const bootstrap = await resolveServerBootstrapFromClient(client);
      const oldNav = bootstrap.role === "owner" || bootstrap.role === "admin";
      const route = (await decidePlatformAdmin(client)).kind === "admitted";
      if (oldNav !== route) disagreements += 1;
    }
  }
  assert.equal(disagreements, 2);
});

test("a profiles read error: the bootstrap THROWS and the nav hides (the lookup is an error, not an answer)", async () => {
  const client = tableClient({
    sessionUser: { id: "user-A", email: "a@example.com" },
    memberships: [{ user_id: "user-A", org_id: ORG.id, role: "owner", created_at: "2026-04-05", organizations: ORG }],
    profiles: [{ id: "user-A", sector_overrides: [], is_platform_admin: true }],
    profilesError: { message: "canceling statement due to statement timeout" },
  });
  // The route gate no longer reads profiles at all (SEC-6): its only read is the rpc, which here succeeds, so the
  // profiles error is the bootstrap's alone. The gate's own fail-closed leg is the next test.
  await assert.rejects(() => resolveServerBootstrapFromClient(client), /identity lookup failed at profiles/);
  const seed = resolveAuthSeed(null); // what the client holds when the route answers 503
  assert.equal(shouldShowAdminNav({ status: seed.status, isPlatformAdmin: seed.isPlatformAdmin }), false);
});

test("SEC-6: an is_platform_admin rpc error: the route DENIES (fails closed) and the bootstrap THROWS (the bit is unknown, not false)", async () => {
  const client = tableClient({
    sessionUser: { id: "user-A", email: "a@example.com" },
    memberships: [{ user_id: "user-A", org_id: ORG.id, role: "owner", created_at: "2026-04-05", organizations: ORG }],
    profiles: [{ id: "user-A", sector_overrides: [], is_platform_admin: true }],
    adminRpcError: { message: "canceling statement due to statement timeout" },
  });
  assert.equal((await decidePlatformAdmin(client)).kind, "denied");
  await assert.rejects(() => resolveServerBootstrapFromClient(client), /identity lookup failed at is_platform_admin/);
});

test("SEC-6: the gate reads the flag only through rpc('is_platform_admin') with no arguments, never from the profiles column", async () => {
  const client = clientFor({ platformAdmin: true, workspaceOwner: true });
  const decision = await decidePlatformAdmin(client);
  assert.equal(decision.kind, "admitted");
  assert.deepEqual(client.rpcCalls, [[IS_PLATFORM_ADMIN_RPC, undefined]]);
  assert.equal(IS_PLATFORM_ADMIN_RPC, "is_platform_admin");
  // readOwnPlatformAdmin: only a literal true admits; an error is reported, never turned into false silently.
  const rpcOf = (r) => ({ rpc: async () => r });
  assert.deepEqual(await readOwnPlatformAdmin(rpcOf({ data: true, error: null })), { admin: true, error: null });
  for (const v of [false, null, undefined, "true", 1]) assert.equal((await readOwnPlatformAdmin(rpcOf({ data: v, error: null }))).admin, false);
  const failed = await readOwnPlatformAdmin(rpcOf({ data: null, error: { message: "boom" } }));
  assert.equal(failed.admin, false);
  assert.equal(failed.error.message, "boom");
});

test("anonymous: the route sends to /login and the nav shows no Admin", async () => {
  const client = tableClient({ sessionUser: null });
  assert.equal((await decidePlatformAdmin(client)).kind, "anonymous");
  const seed = resolveAuthSeed(await resolveServerBootstrapFromClient(client));
  assert.equal(shouldShowAdminNav({ status: seed.status, isPlatformAdmin: seed.isPlatformAdmin }), false);
});

test("isPlatformAdminProfile admits only a literal true", () => {
  assert.equal(isPlatformAdminProfile({ is_platform_admin: true }), true);
  for (const v of [false, null, undefined, "true", 1]) assert.equal(isPlatformAdminProfile({ is_platform_admin: v }), false);
  assert.equal(isPlatformAdminProfile(null), false);
});

// ── Live finding 1 (brief-live-findings.md, 2026-09-24): "the nav footer shows jasonlosh@gmail.com ·
// owner while the server session is hotmail". Two OWNER accounts in ONE org: each session's identity
// (the email the nav's account menu renders, the role, the platform bit) must derive from that
// session's authenticated user id, never from an org-level pick such as "the first owner". The fake
// honours the user_id filter, and the org's FIRST owner by created_at is the OTHER account for the
// second session, so a query that dropped its filter would return the wrong person here. ──
test("two owners in one org: each session sees only its own email, id, role and platform bit", async () => {
  const hotmail = { id: "2b7d21eb", email: "owner-a@example.com" };
  const gmail = { id: "a0764ff3", email: "owner-b@example.com" };
  const memberships = [
    { user_id: hotmail.id, org_id: ORG.id, role: "owner", created_at: "2026-04-05", organizations: ORG },
    { user_id: gmail.id, org_id: ORG.id, role: "owner", created_at: "2026-05-28", organizations: ORG },
  ];
  const profiles = [
    { id: hotmail.id, sector_overrides: [], is_platform_admin: true },
    { id: gmail.id, sector_overrides: [], is_platform_admin: false },
  ];
  for (const me of [hotmail, gmail]) {
    const other = me === hotmail ? gmail : hotmail;
    const client = tableClient({ sessionUser: me, memberships, profiles });
    const seed = resolveAuthSeed(await resolveServerBootstrapFromClient(client));
    assert.equal(seed.user.id, me.id);
    assert.equal(seed.user.email, me.email);
    assert.notEqual(seed.user.email, other.email);
    assert.equal(seed.orgId, ORG.id);
    assert.equal(seed.role, "owner");
    assert.equal(seed.isPlatformAdmin, me === hotmail);
    const route = await decidePlatformAdmin(client);
    assert.equal(route.kind === "admitted" ? route.email : null, me === hotmail ? me.email : null);
  }
});

// Where the nav's identity text comes from: the account menu renders `user.email`, and `user` is the
// provider's session user, never a store or member-list field. The only "email · role" text on the
// site is /admin's "Newest join" tile (WorkspacesUsageRow), which is a members-table figure by design.
{
  const SIDEBAR = readFileSync(resolve(ROOT, "src", "components", "Sidebar.tsx"), "utf8");
  const MENU = readFileSync(resolve(ROOT, "src", "components", "auth", "UserMenuDropdown.tsx"), "utf8");
  test("the nav's displayed identity derives from the authenticated session user only", () => {
    assert.match(SIDEBAR, /const \{ user, signOut, identityStatus, isPlatformAdmin \} = useAuth\(\);/);
    assert.match(SIDEBAR, /user=\{user\}/);
    assert.match(MENU, /\{user\.email\}/);
    assert.doesNotMatch(SIDEBAR, /\.email\b/, "the nav card itself renders no email from any other source");
  });
}

// Both sides import the one module: a future edit that re-derives either gate locally reds here.
{
  const ADMIN = readFileSync(resolve(HERE, "admin.ts"), "utf8");
  const BOOT = readFileSync(resolve(HERE, "..", "api", "server-bootstrap.ts"), "utf8");
  const SIDEBAR = readFileSync(resolve(ROOT, "src", "components", "Sidebar.tsx"), "utf8");
  test("requirePlatformAdmin, the identity bootstrap and the nav all route through the one gate", () => {
    assert.match(ADMIN, /decidePlatformAdmin\(supabase\)/);
    assert.match(BOOT, /isPlatformAdmin: adminRes\.admin/);
    assert.match(BOOT, /readOwnPlatformAdmin\(supabase\)/);
    assert.match(SIDEBAR, /const isAdmin = shouldShowAdminNav\(\{ status: identityStatus, isPlatformAdmin \}\);/);
    assert.doesNotMatch(SIDEBAR, /const isAdmin = userRole === "owner"/);
  });
}
