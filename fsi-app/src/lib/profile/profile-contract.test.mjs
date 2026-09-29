import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ORG_ROLES,
  ORG_SIZE_DIMENSIONS,
  findBand,
  validateProfileInput,
  parseOrgProfile,
  DEFAULT_ORG_PROFILE,
  PROFILE_JSON_KEYS,
} from "./profile-contract.mjs";

test("ORG_ROLES carries the eight ADR-034 role ids", () => {
  const ids = ORG_ROLES.map((r) => r.id).sort();
  assert.deepEqual(ids, [
    "carrier",
    "exporter",
    "forwarder",
    "importer_of_record",
    "lender_borrower_of_goods",
    "public_body",
    "shipper",
    "warehouse_operator",
  ]);
});

test("ORG_SIZE_DIMENSIONS carries headcount, revenue, shipment_volume as ordered bands", () => {
  assert.deepEqual(Object.keys(ORG_SIZE_DIMENSIONS).sort(), ["headcount", "revenue", "shipment_volume"]);
  for (const dim of Object.values(ORG_SIZE_DIMENSIONS)) {
    const ranks = dim.bands.map((b) => b.rank);
    assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), `${dim.id} bands must be rank-ordered`);
  }
});

test("findBand resolves a known band and returns undefined for an unknown one", () => {
  assert.equal(findBand("headcount", "medium")?.rank, 2);
  assert.equal(findBand("headcount", "gigantic"), undefined);
  assert.equal(findBand("not_a_dimension", "medium"), undefined);
});

test("validateProfileInput accepts a well-formed profile", () => {
  const { valid, errors } = validateProfileInput({
    orgRoles: ["forwarder", "importer_of_record"],
    orgSize: { headcount_band: "small", revenue_band: "medium", shipment_volume_band: "high" },
  });
  assert.equal(valid, true);
  assert.deepEqual(errors, []);
});

test("validateProfileInput rejects unknown role and band ids", () => {
  const { valid, errors } = validateProfileInput({
    orgRoles: ["forwarder", "spaceship_operator"],
    orgSize: { headcount_band: "colossal" },
  });
  assert.equal(valid, false);
  assert.equal(errors.length, 2);
});

test("validateProfileInput treats unset size bands as valid (needs-input is a downstream concern)", () => {
  const { valid, errors } = validateProfileInput({ orgRoles: [], orgSize: {} });
  assert.equal(valid, true);
  assert.deepEqual(errors, []);
});

test("parseOrgProfile falls back to DEFAULT_ORG_PROFILE shape on malformed input", () => {
  assert.deepEqual(parseOrgProfile(null), DEFAULT_ORG_PROFILE);
  assert.deepEqual(parseOrgProfile(undefined), DEFAULT_ORG_PROFILE);
  assert.deepEqual(parseOrgProfile("not an object"), DEFAULT_ORG_PROFILE);
});

test("parseOrgProfile reads PROFILE_JSON_KEYS and drops unknown vocabulary entries", () => {
  const raw = {
    [PROFILE_JSON_KEYS.orgRoles]: ["forwarder", "not_a_role"],
    [PROFILE_JSON_KEYS.orgSize]: { headcount_band: "large", revenue_band: "not_a_band" },
  };
  const parsed = parseOrgProfile(raw);
  assert.deepEqual(parsed.orgRoles, ["forwarder"]);
  assert.equal(parsed.orgSize.headcount_band, "large");
  assert.equal(parsed.orgSize.revenue_band, null);
  assert.equal(parsed.orgSize.shipment_volume_band, null);
});

test("parseOrgProfile does not collide with the existing free-text profile.roles key", () => {
  // The existing migration-251 key is `roles` (free text); this module owns `org_roles` only.
  const raw = { roles: ["freight forwarder", "importer"], org_roles: ["forwarder"] };
  const parsed = parseOrgProfile(raw);
  assert.deepEqual(parsed.orgRoles, ["forwarder"]);
});
