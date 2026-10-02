import { test } from "node:test";
import assert from "node:assert/strict";
import { computeApplicability } from "./compute-applicability.mjs";

const FULL_PROFILE = {
  orgRoles: ["forwarder", "importer_of_record"],
  orgSize: { headcount_band: "medium", revenue_band: "medium", shipment_volume_band: "high" },
};

test("no roleScope and no sizeThreshold: applies unconditionally", () => {
  const r = computeApplicability({}, FULL_PROFILE);
  assert.equal(r.status, "applies");
  assert.equal(r.missingDimensions.length, 0);
});

test("multi-role org: matches when ANY held role is in the obligation's roleScope", () => {
  const r = computeApplicability({ roleScope: ["carrier", "importer_of_record"] }, FULL_PROFILE);
  assert.equal(r.status, "applies");
});

test("multi-role org: does not apply when none of its roles are in scope", () => {
  const r = computeApplicability({ roleScope: ["carrier", "warehouse_operator"] }, FULL_PROFILE);
  assert.equal(r.status, "does_not_apply");
  assert.match(r.reasons[0], /role/i);
});

test("missing role dimension: needs_profile_input names 'role'", () => {
  const r = computeApplicability(
    { roleScope: ["forwarder"] },
    { orgRoles: [], orgSize: FULL_PROFILE.orgSize }
  );
  assert.equal(r.status, "needs_profile_input");
  assert.deepEqual(r.missingDimensions, ["role"]);
  assert.match(r.reasons[0], /role/i);
});

test("missing size dimension: needs_profile_input names the specific dimension", () => {
  const r = computeApplicability(
    { sizeThreshold: { dimension: "headcount", band: "medium", comparison: "at_least" } },
    { orgRoles: FULL_PROFILE.orgRoles, orgSize: { headcount_band: null, revenue_band: "medium", shipment_volume_band: "high" } }
  );
  assert.equal(r.status, "needs_profile_input");
  assert.deepEqual(r.missingDimensions, ["headcount"]);
});

test("both dimensions missing: reports both, not just the first", () => {
  const r = computeApplicability(
    { roleScope: ["forwarder"], sizeThreshold: { dimension: "revenue", band: "small", comparison: "at_least" } },
    { orgRoles: [], orgSize: {} }
  );
  assert.equal(r.status, "needs_profile_input");
  assert.deepEqual(r.missingDimensions.sort(), ["revenue", "role"]);
});

test("threshold edge: profile band exactly equal to the threshold band passes 'at_least'", () => {
  const r = computeApplicability(
    { sizeThreshold: { dimension: "headcount", band: "medium", comparison: "at_least" } },
    { orgRoles: [], orgSize: { headcount_band: "medium" } }
  );
  assert.equal(r.status, "applies");
});

test("threshold edge: one band below the 'at_least' threshold fails", () => {
  const r = computeApplicability(
    { sizeThreshold: { dimension: "headcount", band: "medium", comparison: "at_least" } },
    { orgRoles: [], orgSize: { headcount_band: "small" } }
  );
  assert.equal(r.status, "does_not_apply");
});

test("threshold edge: 'below' comparison, a carve-out that applies only under a band", () => {
  const underThreshold = computeApplicability(
    { sizeThreshold: { dimension: "headcount", band: "medium", comparison: "below" } },
    { orgRoles: [], orgSize: { headcount_band: "small" } }
  );
  assert.equal(underThreshold.status, "applies");

  const atThreshold = computeApplicability(
    { sizeThreshold: { dimension: "headcount", band: "medium", comparison: "below" } },
    { orgRoles: [], orgSize: { headcount_band: "medium" } }
  );
  assert.equal(atThreshold.status, "does_not_apply");
});

test("role scope passes but size threshold fails: does_not_apply, not needs_profile_input", () => {
  const r = computeApplicability(
    {
      roleScope: ["forwarder"],
      sizeThreshold: { dimension: "revenue", band: "large", comparison: "at_least" },
    },
    { orgRoles: ["forwarder"], orgSize: { revenue_band: "small" } }
  );
  assert.equal(r.status, "does_not_apply");
});

test("unknown dimension or band on the obligation fails open (does not block on the gate's own bad input)", () => {
  const r1 = computeApplicability(
    { sizeThreshold: { dimension: "not_a_real_dimension", band: "x", comparison: "at_least" } },
    FULL_PROFILE
  );
  assert.equal(r1.status, "applies");

  const r2 = computeApplicability(
    { sizeThreshold: { dimension: "headcount", band: "not_a_real_band", comparison: "at_least" } },
    FULL_PROFILE
  );
  assert.equal(r2.status, "applies");
});
