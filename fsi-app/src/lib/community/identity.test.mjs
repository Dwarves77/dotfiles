import { test } from "node:test";
import assert from "node:assert/strict";
import {
  projectAuthorIdentity,
  ORG_TYPES,
  resolveEffectiveAnonymous,
  buildAuthorIdentityForRender,
} from "./identity.mjs";

const EMPTY_SHAPE = {
  orgType: null, role: null, sector: null, region: null, verified: false,
  name: null, company: null, anonymous: false,
};

test("projectAuthorIdentity: null/undefined profile projects to the empty, unverified shape", () => {
  assert.deepEqual(projectAuthorIdentity(null), EMPTY_SHAPE);
  assert.deepEqual(projectAuthorIdentity(undefined), EMPTY_SHAPE);
});

test("projectAuthorIdentity: never leaks email or user id, and never leaks RAW column names (full_name/company_name) even when present on the row", () => {
  const profile = {
    user_id: "11111111-1111-1111-1111-111111111111",
    full_name: "Jane Forwarder",
    email: "jane@acme-forwarding.com",
    company_name: "Acme Forwarding Ltd",
    org_type: "forwarder",
    role: "Compliance Manager",
    sector: "cold-chain",
    region: "EU",
    verified: true,
  };
  const projected = projectAuthorIdentity(profile);
  // full_name/company_name are RAW db column names, not this function's own name/company inputs ,
  // the caller is responsible for mapping profiles.full_name/organizations.name onto this function's
  // `name`/`company` params before calling it (see the GET /api/community/posts route).
  assert.deepEqual(projected, {
    orgType: "forwarder", role: "Compliance Manager", sector: "cold-chain", region: "EU", verified: true,
    name: null, company: null, anonymous: false,
  });
  const keys = Object.keys(projected);
  assert.ok(!keys.includes("full_name"));
  assert.ok(!keys.includes("email"));
  assert.ok(!keys.includes("company_name"));
  assert.ok(!keys.includes("user_id"));
  assert.deepEqual(JSON.stringify(projected).match(/Jane|Acme|@/g), null);
});

test("projectAuthorIdentity (R8.7): shows name and company by default (identity shown unless anonymous)", () => {
  const projected = projectAuthorIdentity({
    org_type: "forwarder", verified: true, name: "Jane Forwarder", company: "Acme Forwarding Ltd",
  });
  assert.equal(projected.name, "Jane Forwarder");
  assert.equal(projected.company, "Acme Forwarding Ltd");
  assert.equal(projected.anonymous, false);
});

test("projectAuthorIdentity (R8.7): anonymous:true withholds name/company but KEEPS the verified-member marker", () => {
  const projected = projectAuthorIdentity({
    org_type: "forwarder", verified: true, name: "Jane Forwarder", company: "Acme Forwarding Ltd",
    anonymous: true,
  });
  assert.equal(projected.name, null);
  assert.equal(projected.company, null);
  assert.equal(projected.anonymous, true);
  // the carve-out: verified and the pseudonymous fields are unaffected by anonymity.
  assert.equal(projected.verified, true);
  assert.equal(projected.orgType, "forwarder");
});

test("projectAuthorIdentity: accepts camelCase orgType too", () => {
  const projected = projectAuthorIdentity({ orgType: "carrier", role: "Ops", sector: "ecommerce", region: "US", verified: false });
  assert.equal(projected.orgType, "carrier");
});

test("projectAuthorIdentity: an org_type outside the closed vocabulary is dropped, not passed through", () => {
  const projected = projectAuthorIdentity({ org_type: "definitely-not-a-real-type", verified: true });
  assert.equal(projected.orgType, null);
});

test("projectAuthorIdentity: verified is strictly boolean, never truthy-coerced from a non-true value", () => {
  assert.equal(projectAuthorIdentity({ verified: "true" }).verified, false);
  assert.equal(projectAuthorIdentity({ verified: 1 }).verified, false);
  assert.equal(projectAuthorIdentity({ verified: true }).verified, true);
});

test("projectAuthorIdentity: blank-string role/sector/region collapse to null rather than an empty label", () => {
  const projected = projectAuthorIdentity({ role: "  ", sector: "", region: "\t", verified: true });
  assert.equal(projected.role, null);
  assert.equal(projected.sector, null);
  assert.equal(projected.region, null);
});

test("ORG_TYPES is a small closed, freight-domain vocabulary", () => {
  assert.ok(ORG_TYPES.includes("forwarder"));
  assert.ok(ORG_TYPES.includes("carrier"));
  assert.ok(ORG_TYPES.length < 15);
});

// ── resolveEffectiveAnonymous (R8.7 fallback rule, migration 336) ─────────────────────────────────

test("resolveEffectiveAnonymous: an explicit post-level boolean always wins, even over a true default", () => {
  assert.equal(resolveEffectiveAnonymous({ postAnonymous: false, profileDefaultAnonymous: true }), false);
  assert.equal(resolveEffectiveAnonymous({ postAnonymous: true, profileDefaultAnonymous: false }), true);
});

test("resolveEffectiveAnonymous: falls back to the profile default when the post did not set it", () => {
  assert.equal(resolveEffectiveAnonymous({ postAnonymous: undefined, profileDefaultAnonymous: true }), true);
  assert.equal(resolveEffectiveAnonymous({ postAnonymous: null, profileDefaultAnonymous: true }), true);
});

test("resolveEffectiveAnonymous: no post value and no profile default resolves to false (R8.7's identity-shown default)", () => {
  assert.equal(resolveEffectiveAnonymous({}), false);
  assert.equal(resolveEffectiveAnonymous(), false);
});

// ── buildAuthorIdentityForRender (route composition helper) ────────────────────────────────────────

test("buildAuthorIdentityForRender: shows name/company/verified when neither the post nor the profile opted into anonymity", () => {
  const identity = buildAuthorIdentityForRender({
    memberProfile: { org_type: "forwarder", role: "Ops", sector: "cold-chain", region: "EU", verified: true, default_anonymous: false },
    name: "Jane Forwarder",
    company: "Acme Forwarding Ltd",
    postAnonymous: undefined,
  });
  assert.equal(identity.name, "Jane Forwarder");
  assert.equal(identity.company, "Acme Forwarding Ltd");
  assert.equal(identity.verified, true);
  assert.equal(identity.anonymous, false);
});

test("buildAuthorIdentityForRender: a per-post anonymous:true withholds name/company even when the profile default is false", () => {
  const identity = buildAuthorIdentityForRender({
    memberProfile: { org_type: "forwarder", verified: true, default_anonymous: false },
    name: "Jane Forwarder",
    company: "Acme Forwarding Ltd",
    postAnonymous: true,
  });
  assert.equal(identity.name, null);
  assert.equal(identity.company, null);
  assert.equal(identity.verified, true); // the R8.7 carve-out
  assert.equal(identity.anonymous, true);
});

test("buildAuthorIdentityForRender: falls back to the profile's default_anonymous when the post does not set it", () => {
  const identity = buildAuthorIdentityForRender({
    memberProfile: { org_type: "forwarder", verified: false, default_anonymous: true },
    name: "Jane Forwarder",
    company: null,
    postAnonymous: undefined,
  });
  assert.equal(identity.name, null);
  assert.equal(identity.anonymous, true);
});

test("buildAuthorIdentityForRender: no member profile at all still projects a safe empty shape", () => {
  const identity = buildAuthorIdentityForRender({ name: "Jane Forwarder", company: "Acme" });
  assert.equal(identity.orgType, null);
  assert.equal(identity.verified, false);
  assert.equal(identity.name, "Jane Forwarder");
});

// ── SEC-5 (migration 372): who may read which profile columns ────────────────────────────────────────────
// The identity rule lives in TWO places, each once: per USER in the community_identity RPC (default_anonymous
// withholds name, company and avatar in SQL, verified stays), per POST here (community_posts.anonymous nulls the
// identity fields at the row, verified stays). These tests prove the per-post half and the loader contract.
import {
  COMMUNITY_IDENTITY_RPC,
  MY_PROFILE_RPC,
  effectiveAnonymous,
  authorBlockForPost,
  authorIdForViewer,
  authorIdForRow,
  idWithheldForAnonymity,
  viewerAdminIfNeeded,
  loadCommunityIdentities,
  loadMyProfile,
} from "./identity.mjs";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const idRow = (over = {}) => ({
  user_id: U1, display_name: "Jane Forwarder", company_name: "Acme Forwarding Ltd", job_title: "Ops lead",
  region: "EU", avatar_url: "https://img.invalid/jane.png", verified: true, anonymous: false, ...over,
});

test("effectiveAnonymous: the post flag or the user default (carried in the identity row) withholds identity", () => {
  assert.equal(effectiveAnonymous({ postAnonymous: false, identity: idRow() }), false);
  assert.equal(effectiveAnonymous({ postAnonymous: true, identity: idRow() }), true);
  assert.equal(effectiveAnonymous({ postAnonymous: false, identity: idRow({ anonymous: true }) }), true);
  assert.equal(effectiveAnonymous({ postAnonymous: undefined, identity: null }), false);
});

test("authorBlockForPost: a non-anonymous post shows the name and headshot the RPC returned", () => {
  assert.deepEqual(authorBlockForPost({ authorUserId: U1, identity: idRow(), postAnonymous: false }), {
    user_id: U1, name: "Jane Forwarder", headshot_url: "https://img.invalid/jane.png",
  });
});

test("authorBlockForPost (per post): community_posts.anonymous nulls name and headshot at the row", () => {
  assert.deepEqual(authorBlockForPost({ authorUserId: U1, identity: idRow(), postAnonymous: true, viewer: { userId: U1 } }), {
    user_id: U1, name: null, headshot_url: null,
  });
  // DFIX-1: to anyone but the author or an admin the block keeps its shape but not the id
  assert.deepEqual(authorBlockForPost({ authorUserId: U1, identity: idRow(), postAnonymous: true }), {
    user_id: null, name: null, headshot_url: null,
  });
});

test("authorBlockForPost (per user): an identity row the RPC already withheld stays withheld even on a post that is not anonymous", () => {
  const withheld = idRow({ display_name: null, company_name: null, avatar_url: null, anonymous: true });
  assert.deepEqual(authorBlockForPost({ authorUserId: U1, identity: withheld, postAnonymous: false }), {
    user_id: null, name: null, headshot_url: null,
  });
});

test("authorBlockForPost: never trusts a leaked name when the identity says anonymous", () => {
  const leaky = idRow({ anonymous: true });
  const block = authorBlockForPost({ authorUserId: U1, identity: leaky, postAnonymous: false });
  assert.equal(block.name, null);
  assert.equal(block.headshot_url, null);
});

test("authorBlockForPost: no author or no identity row is null, never a stand-in", () => {
  assert.equal(authorBlockForPost({ authorUserId: null, identity: idRow(), postAnonymous: false }), null);
  assert.equal(authorBlockForPost({ authorUserId: U1, identity: null, postAnonymous: false }), null);
});

test("per-post anonymity keeps the verified marker (R8.7 carve-out) through buildAuthorIdentityForRender", () => {
  const identity = buildAuthorIdentityForRender({
    memberProfile: { org_type: "forwarder", verified: true },
    name: idRow().display_name,
    company: idRow().company_name,
    postAnonymous: effectiveAnonymous({ postAnonymous: true, identity: idRow() }),
  });
  assert.equal(identity.name, null);
  assert.equal(identity.company, null);
  assert.equal(identity.verified, true);
  assert.equal(identity.anonymous, true);
});

function fakeClient(handler) {
  const calls = [];
  return { calls, rpc: async (fn, args) => { calls.push({ fn, args }); return handler(fn, args); } };
}

test("loadCommunityIdentities: one RPC call with deduped ids, rows keyed by user_id", async () => {
  const c = fakeClient(() => ({ data: [idRow(), idRow({ user_id: U2, display_name: null, anonymous: true })], error: null }));
  const out = await loadCommunityIdentities(c, [U1, U2, U1, "", null]);
  assert.equal(c.calls.length, 1);
  assert.equal(c.calls[0].fn, COMMUNITY_IDENTITY_RPC);
  assert.deepEqual(c.calls[0].args, { p_ids: [U1, U2], p_query: null });
  assert.equal(out.error, null);
  assert.equal(out.byId.get(U1).display_name, "Jane Forwarder");
  assert.equal(out.byId.get(U2).anonymous, true);
});

test("loadCommunityIdentities: no ids and no query means no call and an empty map", async () => {
  const c = fakeClient(() => ({ data: [], error: null }));
  const out = await loadCommunityIdentities(c, []);
  assert.equal(c.calls.length, 0);
  assert.equal(out.byId.size, 0);
  assert.deepEqual(out.rows, []);
});

test("loadCommunityIdentities: a name query passes p_query and no ids, rows keep RPC order", async () => {
  const c = fakeClient(() => ({ data: [idRow(), idRow({ user_id: U2, display_name: "Jo Carrier" })], error: null }));
  const out = await loadCommunityIdentities(c, null, "J");
  assert.deepEqual(c.calls[0].args, { p_ids: null, p_query: "J" });
  assert.deepEqual(out.rows.map((r) => r.user_id), [U1, U2]);
});

test("loadCommunityIdentities: an RPC error degrades to an empty map and carries the message (fail soft, never a stand-in)", async () => {
  const c = fakeClient(() => ({ data: null, error: { message: "permission denied for function community_identity" } }));
  const out = await loadCommunityIdentities(c, [U1]);
  assert.equal(out.byId.size, 0);
  assert.match(out.error, /permission denied/);
});

test("loadCommunityIdentities: more than 200 ids go out in chunks of 200 so the RPC cap never silently drops an author", async () => {
  const ids = Array.from({ length: 450 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
  const c = fakeClient(() => ({ data: [], error: null }));
  await loadCommunityIdentities(c, ids);
  assert.deepEqual(c.calls.map((x) => x.args.p_ids.length), [200, 200, 50]);
});

test("loadMyProfile: calls my_profile and returns the single own row, null when the RPC returns none", async () => {
  const row = { id: U1, email: "jane@acme.invalid", is_platform_admin: false };
  const c = fakeClient(() => ({ data: [row], error: null }));
  const out = await loadMyProfile(c);
  assert.equal(c.calls[0].fn, MY_PROFILE_RPC);
  assert.deepEqual(out.profile, row);
  const none = await loadMyProfile(fakeClient(() => ({ data: [], error: null })));
  assert.equal(none.profile, null);
  const err = await loadMyProfile(fakeClient(() => ({ data: null, error: { message: "boom" } })));
  assert.equal(err.profile, null);
  assert.equal(err.error, "boom");
});

// ---- DFIX-1 (2026-10-08): the author id is withheld on anonymous posts from everyone but the author and an admin

test("idWithheldForAnonymity: post flag, user default, or an unresolved identity (fail closed) all withhold", () => {
  assert.equal(idWithheldForAnonymity({ postAnonymous: false, identity: idRow() }), false);
  assert.equal(idWithheldForAnonymity({ postAnonymous: true, identity: idRow() }), true);
  assert.equal(idWithheldForAnonymity({ postAnonymous: false, identity: idRow({ anonymous: true }) }), true);
  assert.equal(idWithheldForAnonymity({ postAnonymous: false, identity: null }), true, "no identity row: not known to be public");
});

test("authorIdForViewer: a named author is public; an anonymous one only to the author and to an admin; no author is null", () => {
  assert.equal(authorIdForViewer({ authorUserId: U1, withheld: false, viewer: {} }), U1);
  assert.equal(authorIdForViewer({ authorUserId: U1, withheld: true, viewer: {} }), null);
  assert.equal(authorIdForViewer({ authorUserId: U1, withheld: true }), null, "no viewer at all is a stranger");
  assert.equal(authorIdForViewer({ authorUserId: U1, withheld: true, viewer: { userId: U2 } }), null);
  assert.equal(authorIdForViewer({ authorUserId: U1, withheld: true, viewer: { userId: U1 } }), U1);
  assert.equal(authorIdForViewer({ authorUserId: U1, withheld: true, viewer: { userId: U2, isAdmin: true } }), U1);
  assert.equal(authorIdForViewer({ authorUserId: U1, withheld: true, viewer: { userId: U2, isAdmin: "yes" } }), null, "only a real true counts");
  assert.equal(authorIdForViewer({ authorUserId: null, withheld: false, viewer: { userId: U2, isAdmin: true } }), null);
});

test("viewerAdminIfNeeded: the admin answer is read once, and only when some other author's id is withheld", async () => {
  let reads = 0;
  const readAdmin = async () => { reads += 1; return true; };
  const row = (author, anonymous) => ({ author_user_id: author, anonymous });
  const idents = new Map([[U1, idRow()], [U2, idRow({ user_id: U2 })]]);
  assert.equal(await viewerAdminIfNeeded({ rows: [row(U1, false), row(U2, false)], viewerUserId: "v", identitiesById: idents, readAdmin }), false);
  assert.equal(reads, 0, "nothing withheld, nothing read");
  assert.equal(await viewerAdminIfNeeded({ rows: [row(U1, true)], viewerUserId: U1, identitiesById: idents, readAdmin }), false);
  assert.equal(reads, 0, "the author's own anonymous post needs no admin answer");
  assert.equal(await viewerAdminIfNeeded({ rows: [row(U1, true), row(U2, true)], viewerUserId: "v", identitiesById: idents, readAdmin }), true);
  assert.equal(reads, 1);
  assert.equal(await viewerAdminIfNeeded({ rows: [row(U1, true)], viewerUserId: "v", identitiesById: idents, readAdmin: async () => { throw new Error("rpc down"); } }), false, "an admin read that fails is not an admin");
});

test("authorIdForRow: the one per-row call: withholding decided by the post flag, the account default or an unresolved identity", () => {
  const viewer = { userId: U2 };
  assert.equal(authorIdForRow({ authorUserId: U1, postAnonymous: false, identity: idRow(), viewer }), U1);
  assert.equal(authorIdForRow({ authorUserId: U1, postAnonymous: true, identity: idRow(), viewer }), null);
  assert.equal(authorIdForRow({ authorUserId: U1, postAnonymous: false, identity: idRow({ anonymous: true }), viewer }), null);
  assert.equal(authorIdForRow({ authorUserId: U1, postAnonymous: false, identity: null, viewer }), null);
  assert.equal(authorIdForRow({ authorUserId: U1, postAnonymous: true, identity: idRow(), viewer: { userId: U1 } }), U1);
});
