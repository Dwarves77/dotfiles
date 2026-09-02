// expected-output.test.mjs — proves the Axis 5 default-distribution lookup: normalization, the
// government_press "varies" (null) contract, and the well-shaped-distribution validator.
import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeDistribution, expectedOutputForRole, isValidDistribution, AXIS5_CATEGORIES,
} from "./expected-output.mjs";

test("normalizeDistribution: sums to 1, preserves relative weights", () => {
  const d = normalizeDistribution({ regulations: 60, research: 25, market: 5, operations: 5, out_of_scope: 5 });
  const sum = AXIS5_CATEGORIES.reduce((s, c) => s + d[c], 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.ok(Math.abs(d.regulations - 0.6) < 1e-9);
});

test("normalizeDistribution: missing keys default to 0, all-zero input returns all-zero (not NaN)", () => {
  const d = normalizeDistribution({});
  for (const c of AXIS5_CATEGORIES) assert.equal(d[c], 0);
});

test("normalizeDistribution: result is frozen", () => {
  const d = normalizeDistribution({ regulations: 1 });
  assert.throws(() => { d.regulations = 0; }, TypeError);
});

test("expectedOutputForRole: every one of the 9 fixed-distribution roles resolves to a valid distribution", () => {
  const roles = [
    "primary_legal_authority", "intergovernmental_body", "standards_body", "academic_research",
    "statistical_data_agency", "industry_data_provider", "trade_press", "industry_association",
    "vendor_corporate",
  ];
  for (const role of roles) {
    const d = expectedOutputForRole(role);
    assert.ok(d, `expected a distribution for ${role}`);
    assert.ok(isValidDistribution(d), `${role}'s distribution must be well-shaped`);
  }
});

test("expectedOutputForRole: primary_legal_authority is regulations-dominant, vendor_corporate is market-dominant", () => {
  const legal = expectedOutputForRole("primary_legal_authority");
  assert.ok(legal.regulations > legal.market);
  const vendor = expectedOutputForRole("vendor_corporate");
  assert.ok(vendor.market > vendor.regulations);
});

test("expectedOutputForRole: government_press is 'varies' -> null, never a fabricated default (framework's own explicit non-answer)", () => {
  assert.equal(expectedOutputForRole("government_press"), null);
});

test("expectedOutputForRole: an unrecognized or missing role -> null (never guessed)", () => {
  assert.equal(expectedOutputForRole("not_a_real_role"), null);
  assert.equal(expectedOutputForRole(null), null);
  assert.equal(expectedOutputForRole(undefined), null);
});

// ── isValidDistribution ──────────────────────────────────────────────────────────────────────────

test("isValidDistribution: rejects a distribution missing a category or carrying an extra key", () => {
  const d = expectedOutputForRole("academic_research");
  const missing = { ...d }; delete missing.out_of_scope;
  assert.ok(!isValidDistribution(missing));
  assert.ok(!isValidDistribution({ ...d, extra_bucket: 0.1 }));
});

test("isValidDistribution: rejects a distribution that does not sum to 1, or carries an out-of-range value", () => {
  assert.ok(!isValidDistribution({ regulations: 0.5, research: 0.5, market: 0.5, operations: 0, out_of_scope: 0 }));
  assert.ok(!isValidDistribution({ regulations: 1.5, research: 0, market: 0, operations: 0, out_of_scope: -0.5 }));
});

test("isValidDistribution: rejects non-object input without throwing", () => {
  assert.ok(!isValidDistribution(null));
  assert.ok(!isValidDistribution(undefined));
  assert.ok(!isValidDistribution("not an object"));
});
