// community-identity-routes.npmtest.mjs: lane SEC-5 (2026-10-08, migration 372).
// After migration 372 a signed-in user cannot read another organisation's profiles row, so every Community route
// that shows another member reads identity through the community_identity RPC. This proves, on the real handlers
// with a stubbed guard and a fake client: (1) no handler reads the profiles table across organisations any more,
// (2) the RPC is the one source of names and headshots, (3) per-post anonymity (community_posts.anonymous) nulls
// the identity fields at the row while the verified marker stays, (4) per-user anonymity (the RPC already withheld
// the name) stays withheld on a post that is not anonymous, (5) search and invite candidates pass the query to the
// RPC and never match on a name the RPC withheld.
//
// Run: node --test fsi-app/src/app/api/community/community-identity-routes.npmtest.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const dir = mkdtempSync(resolve(tmpdir(), "community-identity-routes-"));
const f = (name, body) => {
  const p = resolve(dir, name);
  writeFileSync(p, body);
  return p;
};

const G = "99999999-9999-4999-8999-999999999999";
const U_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; // shown author
const U_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"; // shown author whose POST is anonymous
const U_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"; // default-anonymous author (the RPC withholds the name)
const ME = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const post = (id, author, anonymous, parent = null) => ({
  id, group_id: G, parent_post_id: parent, author_user_id: author, title: parent ? null : "t", body: "b",
  created_at: "2026-10-08T00:00:00Z", last_reply_at: null, reply_count: 0, attribution: null,
  promoted_from_post_id: null, anonymous,
});
const identity = (id, name, over = {}) => ({
  user_id: id, display_name: name, company_name: name ? `${name} Ltd` : null, job_title: "Ops lead", region: "EU",
  avatar_url: name ? `https://img.invalid/${name}.png` : null, verified: true, anonymous: name === null, ...over,
});

const state = {
  tables: {},
  rpcRows: [],
  calls: [],
};
globalThis.__sec5State = state;

const stubs = {
  "@/lib/api/route-guard": f("guard.mjs", `
export function isRefusal(r) { return r instanceof Response; }
export async function requireCommunityRoute() {
  const s = globalThis.__sec5State;
  function builder(rows) {
    const b = {};
    for (const m of ["select", "eq", "is", "order", "limit", "lt", "gt", "in", "ilike", "not", "neq"]) b[m] = () => b;
    b.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
    b.then = (res, rej) => Promise.resolve({ data: rows, error: null }).then(res, rej);
    return b;
  }
  return {
    userId: "${ME}",
    supabase: {
      from(t) { s.calls.push("from:" + t); return builder(s.tables[t] ?? []); },
      rpc(fn, args) {
        s.calls.push("rpc:" + fn);
        // DFIX-1: the viewer's own platform-admin answer (readOwnPlatformAdmin), kept apart from the identity RPC.
        if (fn === "is_platform_admin") return Promise.resolve({ data: s.isAdmin === true, error: null });
        s.lastRpc = { fn, args };
        return Promise.resolve({ data: s.rpcRows, error: null });
      },
    },
  };
}
`),
  "@/lib/api/rate-limit": f("limit.mjs", `export function rateLimitHeaders() { return {}; }\n`),
  "@/lib/notifications/dispatch": f("disp.mjs", `export async function dispatchNotification() { return null; }\n`),
};

const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false, alias: { ...stubs, "@": resolve(ROOT, "src") } });
const { NextRequest } = await jiti.import("next/server");
const mk = (url) => new NextRequest("http://x" + url);
const ctx = (id) => ({ params: Promise.resolve({ id }) });

function reset(tables, rpcRows) {
  state.tables = tables;
  state.rpcRows = rpcRows;
  state.calls.length = 0;
  state.lastRpc = null;
  state.isAdmin = false;
}
const neverProfiles = () => assert.ok(!state.calls.includes("from:profiles"), "no handler may read the profiles table across organisations");

const memberProfiles = [
  { user_id: U_A, org_type: "forwarder", role: null, sector: null, region: null, verified: true },
  { user_id: U_B, org_type: "carrier", role: null, sector: null, region: null, verified: true },
  { user_id: U_C, org_type: "shipper", role: null, sector: null, region: null, verified: true },
];

test("posts GET: identity from the RPC; per-post anonymity nulls the row; per-user withholding stays; verified stays", async () => {
  reset(
    { community_posts: [post("p1", U_A, false), post("p2", U_B, true), post("p3", U_C, false)], community_member_profiles: memberProfiles },
    [identity(U_A, "Ann"), identity(U_B, "Bob"), identity(U_C, null)]
  );
  const { GET } = await jiti.import("./posts/route.ts");
  const res = await GET(mk(`/api/community/posts?group_id=${G}`));
  assert.equal(res.status, 200);
  const { posts } = await res.json();
  neverProfiles();
  assert.equal(state.calls.filter((c) => c === "rpc:community_identity").length, 1);
  assert.deepEqual([...state.lastRpc.args.p_ids].sort(), [U_A, U_B, U_C].sort());

  const [p1, p2, p3] = posts;
  assert.equal(p1.author.name, "Ann");
  assert.equal(p1.author_identity.name, "Ann");
  assert.equal(p1.author_identity.company, "Ann Ltd");
  assert.equal(p1.author_identity.anonymous, false);

  assert.equal(p2.author.name, null, "per-post anonymity nulls the legacy author name");
  assert.equal(p2.author.headshot_url, null, "per-post anonymity nulls the headshot");
  assert.equal(p2.author_identity.name, null);
  assert.equal(p2.author_identity.company, null);
  assert.equal(p2.author_identity.anonymous, true);
  assert.equal(p2.author_identity.verified, true, "an anonymous post keeps the verified marker");

  assert.equal(p3.author.name, null, "per-user withholding (RPC) holds on a post that is not anonymous");
  assert.equal(p3.author_identity.name, null);
  assert.equal(p3.author_identity.anonymous, true);
  assert.equal(p3.author_identity.verified, true);
});

test("posts GET: an RPC failure degrades to no author, never a stand-in and never a profiles read", async () => {
  reset({ community_posts: [post("p1", U_A, false)], community_member_profiles: memberProfiles }, []);
  const { GET } = await jiti.import("./posts/route.ts");
  const res = await GET(mk(`/api/community/posts?group_id=${G}`));
  const { posts } = await res.json();
  neverProfiles();
  assert.equal(posts[0].author, null);
  assert.equal(posts[0].author_identity.name, null);
});

test("replies GET: same two rules at the row", async () => {
  reset({ community_posts: [post("r1", U_A, false, "p1"), post("r2", U_B, true, "p1"), post("r3", U_C, false, "p1")] },
    [identity(U_A, "Ann"), identity(U_B, "Bob"), identity(U_C, null)]);
  const { GET } = await jiti.import("./posts/[id]/replies/route.ts");
  const res = await GET(mk("/api/community/posts/x/replies"), ctx("11111111-1111-4111-8111-111111111111"));
  assert.equal(res.status, 200);
  const { replies } = await res.json();
  neverProfiles();
  assert.deepEqual(replies.map((r) => [r.author.name, r.author.headshot_url !== null]), [["Ann", true], [null, false], [null, false]]);
});

test("post GET: same two rules at the row", async () => {
  const id = "22222222-2222-4222-8222-222222222222";
  reset({ community_posts: [post(id, U_B, true)] }, [identity(U_B, "Bob")]);
  const { GET } = await jiti.import("./posts/[id]/route.ts");
  const res = await GET(mk("/api/community/posts/x"), ctx(id));
  const body = await res.json();
  neverProfiles();
  assert.equal(body.post.author.name, null);
  assert.equal(body.post.author.headshot_url, null);
});

test("search people: the query goes to the RPC (no profiles read) and only named rows are returned", async () => {
  reset({}, [identity(U_A, "Ann"), identity(U_C, null)]);
  const { GET } = await jiti.import("./search/route.ts");
  const res = await GET(mk("/api/community/search?q=an&scope=people"));
  assert.equal(res.status, 200);
  const body = await res.json();
  neverProfiles();
  assert.deepEqual(state.lastRpc.args, { p_ids: null, p_query: "an" });
  assert.deepEqual(body.people.map((p) => p.name), ["Ann"]);
});

test("invite candidates: the query goes to the RPC; members, pending invitees and the caller are excluded", async () => {
  reset(
    { community_group_members: [{ role: "admin", user_id: U_B }], community_group_invitations: [] },
    [identity(U_A, "Ann"), identity(U_B, "Bob"), identity(ME, "Me")]
  );
  const { GET } = await jiti.import("./groups/[id]/invite-candidates/route.ts");
  const res = await GET(mk("/api/community/groups/x/invite-candidates?q=an"), ctx(G));
  assert.equal(res.status, 200);
  const body = await res.json();
  neverProfiles();
  assert.deepEqual(state.lastRpc.args, { p_ids: null, p_query: "an" });
  assert.deepEqual(body.candidates.map((c) => c.name), ["Ann"]);
});

test("group members: names and headshots come from the RPC; a withheld member has none", async () => {
  reset({ community_group_members: [{ user_id: U_A, role: "member", joined_at: "2026-01-01" }, { user_id: U_C, role: "member", joined_at: "2026-01-02" }] },
    [identity(U_A, "Ann"), identity(U_C, null)]);
  const { GET } = await jiti.import("./groups/[id]/members/route.ts");
  const res = await GET(mk("/api/community/groups/x/members"), ctx(G));
  const body = await res.json();
  neverProfiles();
  const byId = Object.fromEntries(body.members.map((m) => [m.user_id, m]));
  assert.equal(byId[U_A].name, "Ann");
  assert.equal(byId[U_C].name, null);
  assert.equal(byId[U_C].headshot_url, null);
});

test("group invitations: invitee name and avatar come from the RPC", async () => {
  reset(
    { community_group_members: [{ role: "admin" }], community_group_invitations: [{ id: "i1", invitee_user_id: U_A, inviter_user_id: ME, status: "pending", created_at: "2026-01-01" }] },
    [identity(U_A, "Ann")]
  );
  const { GET } = await jiti.import("./groups/[id]/invitations/route.ts");
  const res = await GET(mk("/api/community/groups/x/invitations"), ctx(G));
  const body = await res.json();
  neverProfiles();
  assert.equal(body.invitations[0].invitee_name, "Ann");
});

// ---------------------------------------------------------------------------------------------------------
// DFIX-1 (2026-10-08, SEC-5 residual, row 08-sec5): `author_user_id` (and `author.user_id`) used to come back on
// anonymous posts, so a reader could link an anonymous author's posts to each other by the bare id. The id now
// reaches only the author and a platform admin; every other viewer gets null, in the READ path (these handlers),
// so no client can be trusted to hide it. Anonymous means the post flag OR the author's account default (the
// identity row says so); an author the identity read could not resolve is treated as anonymous (fail closed).
// ---------------------------------------------------------------------------------------------------------

const ids = (posts) => posts.map((p) => [p.author_user_id, p.author?.user_id ?? null]);

test("anonymous posts: a stranger gets no author id, in either field; a named post keeps it (posts GET)", async () => {
  reset(
    { community_posts: [post("p1", U_A, false), post("p2", U_B, true), post("p3", U_C, false)], community_member_profiles: memberProfiles },
    [identity(U_A, "Ann"), identity(U_B, "Bob"), identity(U_C, null)]
  );
  const { GET } = await jiti.import("./posts/route.ts");
  const { posts } = await (await GET(mk(`/api/community/posts?group_id=${G}`))).json();
  assert.deepEqual(ids(posts), [[U_A, U_A], [null, null], [null, null]], "p2 anonymous by post flag, p3 anonymous by the author's default");
  assert.equal(state.calls.filter((c) => c === "rpc:is_platform_admin").length, 1, "the admin answer is read once because a hidden id was in play");
});

test("anonymous posts: the author sees their own id (edit and delete need it), and no admin read is spent on it", async () => {
  reset(
    { community_posts: [post("p1", ME, true), post("p2", U_A, false)], community_member_profiles: memberProfiles },
    [identity(ME, "Me"), identity(U_A, "Ann")]
  );
  const { GET } = await jiti.import("./posts/route.ts");
  const { posts } = await (await GET(mk(`/api/community/posts?group_id=${G}`))).json();
  assert.deepEqual(ids(posts), [[ME, ME], [U_A, U_A]]);
  assert.equal(state.calls.includes("rpc:is_platform_admin"), false, "nothing was hidden, so the admin flag is not read");
});

test("anonymous posts: a platform admin sees the id (moderation)", async () => {
  reset({ community_posts: [post("p2", U_B, true)], community_member_profiles: memberProfiles }, [identity(U_B, "Bob")]);
  state.isAdmin = true;
  const { GET } = await jiti.import("./posts/route.ts");
  const { posts } = await (await GET(mk(`/api/community/posts?group_id=${G}`))).json();
  assert.deepEqual(ids(posts), [[U_B, U_B]]);
});

test("anonymous posts: an identity read that failed hides the id of every other author (fail closed)", async () => {
  reset({ community_posts: [post("p1", U_A, false)], community_member_profiles: memberProfiles }, []);
  const { GET } = await jiti.import("./posts/route.ts");
  const { posts } = await (await GET(mk(`/api/community/posts?group_id=${G}`))).json();
  assert.equal(posts[0].author_user_id, null);
});

test("replies GET: the same rule for a stranger, the author and an admin", async () => {
  const rows = () => [post("r1", U_A, false, "p1"), post("r2", U_B, true, "p1"), post("r3", ME, true, "p1")];
  const idents = () => [identity(U_A, "Ann"), identity(U_B, "Bob"), identity(ME, "Me")];
  const { GET } = await jiti.import("./posts/[id]/replies/route.ts");
  const call = async () => (await GET(mk("/api/community/posts/x/replies"), ctx("11111111-1111-4111-8111-111111111111"))).json();
  reset({ community_posts: rows() }, idents());
  let { replies } = await call();
  assert.deepEqual(ids(replies), [[U_A, U_A], [null, null], [ME, ME]]);
  reset({ community_posts: rows() }, idents());
  state.isAdmin = true;
  ({ replies } = await call());
  assert.deepEqual(ids(replies), [[U_A, U_A], [U_B, U_B], [ME, ME]]);
});

test("post GET: an anonymous post's id is withheld from a stranger and kept for its author", async () => {
  const id = "22222222-2222-4222-8222-222222222222";
  const { GET } = await jiti.import("./posts/[id]/route.ts");
  reset({ community_posts: [post(id, U_B, true)] }, [identity(U_B, "Bob")]);
  let body = await (await GET(mk("/api/community/posts/x"), ctx(id))).json();
  assert.deepEqual(ids([body.post]), [[null, null]]);
  reset({ community_posts: [post(id, ME, true)] }, [identity(ME, "Me")]);
  body = await (await GET(mk("/api/community/posts/x"), ctx(id))).json();
  assert.deepEqual(ids([body.post]), [[ME, ME]]);
});

const ENT = "cl:organisation:0123456789abcdef";
const threadRow = (postId, author, anonymous) => ({
  thread_id: postId, entity_id: ENT, entity_kind: "organisation", created_at: "2026-10-08T00:00:00Z",
  community_posts: { id: postId, group_id: G, title: "t", body: "b", author_user_id: author, anonymous, created_at: "2026-10-08T00:00:00Z", last_reply_at: null, reply_count: 0 },
});

test("entity threads: the id of an anonymous thread's author reaches only that author or an admin", async () => {
  const rows = () => [threadRow("t1", U_A, false), threadRow("t2", U_B, true), threadRow("t3", U_C, false), threadRow("t4", ME, true)];
  const idents = () => [identity(U_A, "Ann"), identity(U_B, "Bob"), identity(U_C, null), identity(ME, "Me")];
  const { GET } = await jiti.import("./entities/[entityId]/threads/route.ts");
  const call = async () => (await GET(mk(`/api/community/entities/${ENT}/threads`), { params: Promise.resolve({ entityId: ENT }) })).json();
  reset({ community_thread_entities: rows() }, idents());
  let { threads } = await call();
  assert.deepEqual(threads.map((t) => t.author_user_id), [U_A, null, null, ME]);
  reset({ community_thread_entities: rows() }, idents());
  state.isAdmin = true;
  ({ threads } = await call());
  assert.deepEqual(threads.map((t) => t.author_user_id), [U_A, U_B, U_C, ME]);
});
