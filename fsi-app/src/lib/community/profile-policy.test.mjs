import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeMemberWrite,
  projectOwnProfile,
  REGIONS,
  MEMBER_WRITE_FORBIDDEN_COLUMNS,
} from "./profile-policy.mjs";

// ── sanitizeMemberWrite ─────────────────────────────────────────────────────────────────────────

test("sanitizeMemberWrite: accepts a valid minimal body (org_type only)", () => {
  const r = sanitizeMemberWrite({ org_type: "forwarder" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, { org_type: "forwarder", role: null, sector: null, region: null });
});

test("sanitizeMemberWrite: accepts all four self-service fields", () => {
  const r = sanitizeMemberWrite({ org_type: "carrier", role: "Ops Manager", sector: "cold-chain", region: "EU" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, { org_type: "carrier", role: "Ops Manager", sector: "cold-chain", region: "EU" });
});

test("sanitizeMemberWrite: rejects a missing or unrecognised org_type", () => {
  assert.equal(sanitizeMemberWrite({}).ok, false);
  assert.equal(sanitizeMemberWrite({ org_type: "not-a-real-type" }).ok, false);
});

test("sanitizeMemberWrite: rejects an unrecognised region", () => {
  const r = sanitizeMemberWrite({ org_type: "shipper", region: "MARS" });
  assert.equal(r.ok, false);
  assert.match(r.error, /region/);
});

test("sanitizeMemberWrite: a blank/omitted region collapses to null, not an error", () => {
  assert.equal(sanitizeMemberWrite({ org_type: "shipper", region: "" }).data.region, null);
  assert.equal(sanitizeMemberWrite({ org_type: "shipper" }).data.region, null);
});

test("sanitizeMemberWrite: STRIPS verified/verified_at/verification_method/organisation_key/user_id even when present on the body", () => {
  const r = sanitizeMemberWrite({
    org_type: "forwarder",
    verified: true,
    verified_at: "2026-01-01T00:00:00Z",
    verification_method: "corporate-email",
    organisation_key: "attacker-supplied-value",
    user_id: "11111111-1111-1111-1111-111111111111",
  });
  assert.equal(r.ok, true);
  const keys = Object.keys(r.data);
  for (const forbidden of MEMBER_WRITE_FORBIDDEN_COLUMNS) {
    assert.ok(!keys.includes(forbidden), `${forbidden} must not appear in sanitizeMemberWrite's output`);
  }
  assert.deepEqual(Object.keys(r.data).sort(), ["org_type", "region", "role", "sector"]);
});

test("sanitizeMemberWrite: rejects a non-object body", () => {
  assert.equal(sanitizeMemberWrite(null).ok, false);
  assert.equal(sanitizeMemberWrite("org_type=forwarder").ok, false);
  assert.equal(sanitizeMemberWrite([1, 2, 3]).ok, false);
});

test("sanitizeMemberWrite: trims and length-caps role/sector", () => {
  const r = sanitizeMemberWrite({ org_type: "3pl", role: "  Trade Lane Manager  ", sector: "  " });
  assert.equal(r.data.role, "Trade Lane Manager");
  assert.equal(r.data.sector, null); // blank collapses to null
});

test("REGIONS is schema-identical to migration 293/294's CHECK constraint", () => {
  assert.deepEqual([...REGIONS].sort(), ["APAC", "EU", "GLOBAL", "HK", "LATAM", "MEA", "UK", "US"].sort());
});

// ── projectOwnProfile ───────────────────────────────────────────────────────────────────────────

test("projectOwnProfile: null/undefined row projects to the empty, unverified shape", () => {
  assert.deepEqual(projectOwnProfile(null), {
    orgType: null, role: null, sector: null, region: null,
    verified: false, verifiedAt: null, verificationMethod: null,
  });
});

test("projectOwnProfile: carries the caller's OWN verification status (unlike the public projection)", () => {
  const row = {
    org_type: "forwarder", role: "Compliance Manager", sector: "cold-chain", region: "EU",
    verified: true, verified_at: "2026-08-01T00:00:00Z", verification_method: "corporate-email",
  };
  const projected = projectOwnProfile(row);
  assert.equal(projected.verified, true);
  assert.equal(projected.verifiedAt, "2026-08-01T00:00:00Z");
  assert.equal(projected.verificationMethod, "corporate-email");
});

test("projectOwnProfile: never carries organisation_key even if present on the row", () => {
  const projected = projectOwnProfile({ org_type: "forwarder", verified: true, organisation_key: "leaked-value" });
  assert.ok(!("organisationKey" in projected));
  assert.ok(!JSON.stringify(projected).includes("leaked-value"));
});

test("projectOwnProfile: verified is strictly boolean, never truthy-coerced", () => {
  assert.equal(projectOwnProfile({ verified: "true" }).verified, false);
  assert.equal(projectOwnProfile({ verified: 1 }).verified, false);
  assert.equal(projectOwnProfile({ verified: true }).verified, true);
});
