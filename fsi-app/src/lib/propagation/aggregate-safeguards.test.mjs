// aggregate-safeguards.test.mjs — proves the JS mirror agrees with migration 287's SQL self-check on the
// SAME literal fixtures (see that migration's DO block, "bucket_value() / bucket_width_multiplier() proven
// directly" section, and its wage_per_hour/capacity_teu/saf_premium_pct self-check calls) so the SQL gate
// and this CI-testable mirror never silently drift apart. Pure — zero npm dependencies.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bucketWidthMultiplier,
  bucketValue,
  computeDominanceShare,
  isDominant,
  isExactComplement,
  findComplementOfPrior,
  isWithinFreezeWindow,
  isForwardLookingRefusal,
} from "./aggregate-safeguards.mjs";

// ── bucketWidthMultiplier — same fixtures as migration 287's self-check ───────────────────────────────
test("bucketWidthMultiplier: n = k_min doubles the width", () => {
  assert.equal(bucketWidthMultiplier(5, 5), 2);
});
test("bucketWidthMultiplier: n = 2*k_min stops widening (spec's own '2x minimum' threshold)", () => {
  assert.equal(bucketWidthMultiplier(10, 5), 1);
});
test("bucketWidthMultiplier: n between k_min and 2*k_min still widens", () => {
  assert.equal(bucketWidthMultiplier(6, 5), 2);
});
test("bucketWidthMultiplier: n well above 2*k_min stays at 1 (never below baseline)", () => {
  assert.equal(bucketWidthMultiplier(15, 5), 1);
});
test("bucketWidthMultiplier: n=0 does not divide by zero (clamped to >= 1 denominator)", () => {
  assert.equal(bucketWidthMultiplier(0, 5), 10);
});

// ── bucketValue — same fixtures as migration 287's self-check ─────────────────────────────────────────
test("bucketValue: abs:100 rounds to the nearest 100", () => {
  assert.equal(bucketValue(1234, "abs:100", 1), 1200);
});
test("bucketValue: pct:5 rounds to the nearest 5", () => {
  assert.equal(bucketValue(1234, "pct:5", 1), 1235);
});
test("bucketValue: log2, multiplier 1, rounds down to the nearest power of 2", () => {
  assert.equal(bucketValue(2000, "log2", 1), 1024);
});
test("bucketValue: log2, multiplier 3, groups three octaves per bucket (widens further)", () => {
  assert.equal(bucketValue(2000, "log2", 3), 512);
});
test("bucketValue: unrecognised scheme returns null, never the raw value", () => {
  assert.equal(bucketValue(100, "nonsense_scheme", 1), null);
});
test("bucketValue: null/undefined value returns null", () => {
  assert.equal(bucketValue(null, "abs:100", 1), null);
  assert.equal(bucketValue(undefined, "abs:100", 1), null);
});
test("bucketValue: log2 of a non-positive value returns 0, never negative/NaN", () => {
  assert.equal(bucketValue(0, "log2", 1), 0);
  assert.equal(bucketValue(-5, "log2", 1), 0);
});
test("bucketValue: multiplier below 1 is clamped to 1, never narrows the bucket", () => {
  assert.equal(bucketValue(1234, "abs:100", 0), bucketValue(1234, "abs:100", 1));
});
test("bucketValue: rejects a non-numeric, non-null value", () => {
  assert.throws(() => bucketValue("1234", "abs:100", 1), TypeError);
});

// ── dominance — mirrors migration 287's capacity_teu self-check cohorts ───────────────────────────────
test("computeDominanceShare: 92.6% single-contributor share, matching the refused capacity_teu fixture", () => {
  const share = computeDominanceShare({ c1: 1000, c2: 20, c3: 20, c4: 20, c5: 20 });
  assert.equal(share.total, 1080);
  assert.equal(share.max, 1000);
  assert.ok(Math.abs(share.maxSharePct - (1000 / 1080) * 100) < 1e-9);
  assert.ok(share.maxSharePct > 25); // exceeds the seeded policy's max_share_pct
});
test("computeDominanceShare: balanced 20% share, matching the granted capacity_teu fixture", () => {
  const share = computeDominanceShare({ c1: 200, c2: 200, c3: 200, c4: 200, c5: 200 });
  assert.equal(share.total, 1000);
  assert.equal(share.maxSharePct, 20);
  assert.ok(share.maxSharePct <= 25);
});
test("computeDominanceShare: no member values supplied returns null (check does not apply)", () => {
  assert.equal(computeDominanceShare(null), null);
  assert.equal(computeDominanceShare(undefined), null);
  assert.equal(computeDominanceShare({}), null);
});
test("isDominant: refuses the 92.6%-share cohort against max_share_pct=25, grants the balanced one", () => {
  assert.equal(isDominant({ c1: 1000, c2: 20, c3: 20, c4: 20, c5: 20 }, 25), true);
  assert.equal(isDominant({ c1: 200, c2: 200, c3: 200, c4: 200, c5: 200 }, 25), false);
});
test("isDominant: no member values never refuses", () => {
  assert.equal(isDominant(null, 25), false);
});

// ── complementary-cell suppression — mirrors migration 287's wage_per_hour self-check ─────────────────
const PARENT_10 = ["w1", "w2", "w3", "w4", "w5", "w6", "w7", "w8", "w9", "w10"];
const FIRST_HALF = ["w1", "w2", "w3", "w4", "w5"];
const SECOND_HALF = ["w6", "w7", "w8", "w9", "w10"];

test("isExactComplement: the second half of a 10-member parent is the exact complement of the first half", () => {
  assert.equal(isExactComplement(SECOND_HALF, PARENT_10, FIRST_HALF), true);
});
test("isExactComplement: a fresh, unrelated cohort is not a complement", () => {
  assert.equal(isExactComplement(["w11", "w12", "w13", "w14", "w15"], PARENT_10, FIRST_HALF), false);
});
test("isExactComplement: overlapping (non-disjoint) sets are never complements", () => {
  assert.equal(isExactComplement(["w5", "w6", "w7", "w8", "w9"], PARENT_10, FIRST_HALF), false);
});
test("isExactComplement: a union that leaves a gap in the parent is not a complement", () => {
  assert.equal(isExactComplement(["w6", "w7", "w8"], PARENT_10, FIRST_HALF), false);
});
test("isExactComplement: empty parent set never matches", () => {
  assert.equal(isExactComplement(SECOND_HALF, [], FIRST_HALF), false);
});

test("findComplementOfPrior: finds the complementary prior cohort among several granted ones", () => {
  const priorGranted = [["w1", "w2", "w3"], FIRST_HALF, ["w20", "w21"]];
  assert.deepEqual(findComplementOfPrior(SECOND_HALF, PARENT_10, priorGranted), FIRST_HALF);
});
test("findComplementOfPrior: returns null when no parent set is supplied (check does not apply)", () => {
  assert.equal(findComplementOfPrior(SECOND_HALF, null, [FIRST_HALF]), null);
  assert.equal(findComplementOfPrior(SECOND_HALF, [], [FIRST_HALF]), null);
});
test("findComplementOfPrior: returns null when nothing matches", () => {
  assert.equal(findComplementOfPrior(["w11", "w12", "w13", "w14", "w15"], PARENT_10, [FIRST_HALF]), null);
});

// ── longitudinal freeze window — mirrors migration 287's rate_per_feu/capacity_teu freeze self-checks ──
test("isWithinFreezeWindow: an immediate repeat is within any positive window", () => {
  const now = new Date("2026-09-02T00:00:00Z");
  assert.equal(isWithinFreezeWindow(now, now, 90), true);
});
test("isWithinFreezeWindow: 45 days ago is within a 90-day window", () => {
  const now = new Date("2026-09-02T00:00:00Z");
  const requestedAt = new Date(now.getTime() - 45 * 86_400_000);
  assert.equal(isWithinFreezeWindow(requestedAt, now, 90), true);
});
test("isWithinFreezeWindow: 91 days ago is outside a 90-day window", () => {
  const now = new Date("2026-09-02T00:00:00Z");
  const requestedAt = new Date(now.getTime() - 91 * 86_400_000);
  assert.equal(isWithinFreezeWindow(requestedAt, now, 90), false);
});
test("isWithinFreezeWindow: exactly at the boundary is still within the window (spec's own '>' vs '>=' — inclusive)", () => {
  const now = new Date("2026-09-02T00:00:00Z");
  const requestedAt = new Date(now.getTime() - 90 * 86_400_000);
  assert.equal(isWithinFreezeWindow(requestedAt, now, 90), true);
});

// ── forward-looking refusal — mirrors migration 287's saf_premium_pct self-check ──────────────────────
test("isForwardLookingRefusal: a future period_end refuses when forward_looking_allowed is false", () => {
  const now = new Date("2026-09-02T00:00:00Z");
  assert.equal(isForwardLookingRefusal({ periodEnd: "2026-10-02" }, false, now), true);
});
test("isForwardLookingRefusal: a past period_end never refuses", () => {
  const now = new Date("2026-09-02T00:00:00Z");
  assert.equal(isForwardLookingRefusal({ periodEnd: "2026-08-03" }, false, now), false);
});
test("isForwardLookingRefusal: a future period is allowed when forward_looking_allowed is true", () => {
  const now = new Date("2026-09-02T00:00:00Z");
  assert.equal(isForwardLookingRefusal({ periodEnd: "2026-10-02" }, true, now), false);
});
test("isForwardLookingRefusal: no period named never refuses (not period-scoped)", () => {
  const now = new Date("2026-09-02T00:00:00Z");
  assert.equal(isForwardLookingRefusal({}, false, now), false);
  assert.equal(isForwardLookingRefusal(undefined, false, now), false);
});
test("isForwardLookingRefusal: falls back to period_start when period_end is absent", () => {
  const now = new Date("2026-09-02T00:00:00Z");
  assert.equal(isForwardLookingRefusal({ periodStart: "2026-10-02" }, false, now), true);
  assert.equal(isForwardLookingRefusal({ periodStart: "2026-08-03" }, false, now), false);
});
test("isForwardLookingRefusal: period_end takes precedence over period_start when both are given", () => {
  const now = new Date("2026-09-02T00:00:00Z");
  assert.equal(isForwardLookingRefusal({ periodStart: "2026-08-03", periodEnd: "2026-10-02" }, false, now), true);
});
