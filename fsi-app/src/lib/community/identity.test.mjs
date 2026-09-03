import { test } from "node:test";
import assert from "node:assert/strict";
import { projectAuthorIdentity, ORG_TYPES } from "./identity.mjs";

test("projectAuthorIdentity: null/undefined profile projects to the empty, unverified shape", () => {
  assert.deepEqual(projectAuthorIdentity(null), { orgType: null, role: null, sector: null, region: null, verified: false });
  assert.deepEqual(projectAuthorIdentity(undefined), { orgType: null, role: null, sector: null, region: null, verified: false });
});

test("projectAuthorIdentity: never leaks name, email, company or user id even when present on the row", () => {
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
  assert.deepEqual(projected, { orgType: "forwarder", role: "Compliance Manager", sector: "cold-chain", region: "EU", verified: true });
  const keys = Object.keys(projected);
  assert.ok(!keys.includes("full_name"));
  assert.ok(!keys.includes("email"));
  assert.ok(!keys.includes("company_name"));
  assert.ok(!keys.includes("user_id"));
  assert.deepEqual(JSON.stringify(projected).match(/Jane|Acme|@/g), null);
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
