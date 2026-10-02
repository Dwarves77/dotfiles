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
