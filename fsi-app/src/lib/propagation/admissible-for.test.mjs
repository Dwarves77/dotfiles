// admissible-for.test.mjs — proves admissibleFor() (the pollution barrier, spec §3.3) against every named
// refusal path AND the pass path, in the exact order the function itself checks them. Pure — zero npm
// dependencies (FLOOR/isContractable/isMissing are all plain-ESM, zero-dependency modules — see admissible-
// for.ts's own header). Node's native TS type-stripping runs admissible-for.ts directly, no build step.
import { test } from "node:test";
import assert from "node:assert/strict";
import { admissibleFor } from "./admissible-for.ts";

const NOW = new Date("2026-09-02T00:00:00Z");

function baseValue(overrides = {}) {
  return {
    valueId: "11111111-1111-1111-1111-111111111111",
    entityId: null,
    methodId: "m",
    methodVersion: "1",
    value: 1,
    valueLow: null,
    valueHigh: null,
    unit: "unit",
    currency: null,
    derivation: "calculated",
    originClass: "verified",
    lifecycle: "verified",
    admissibility: "filing_ok",
    baseConfidence: 0.95,
    assertedAt: NOW.toISOString(),
    halfLifeDays: null,
    inputs: [],
    supersedes: null,
    computedAt: NOW.toISOString(),
    computedBy: "m@1",
    ...overrides,
  };
}

test("admissibleFor: a fresh, verified, contractable value passes for filing", () => {
  const v = baseValue();
  const verdict = admissibleFor(v, "filing", NOW);
  assert.equal(verdict.ok, true);
  if (verdict.ok) {
    assert.equal(verdict.effectiveConfidence, 0.95);
    assert.equal(verdict.mustLabel, "verified");
  }
});

test("admissibleFor RED: falsified lifecycle refuses for every use, including display", () => {
  const v = baseValue({ lifecycle: "falsified" });
  for (const use of ["display", "analysis", "calculation", "filing"]) {
    const verdict = admissibleFor(v, use, NOW);
    assert.equal(verdict.ok, false);
    if (!verdict.ok) assert.equal(verdict.reason, "lifecycle");
  }
});

test("admissibleFor RED: obsolete lifecycle refuses", () => {
  const v = baseValue({ lifecycle: "obsolete" });
  const verdict = admissibleFor(v, "display", NOW);
  assert.equal(verdict.ok, false);
});

test("admissibleFor RED: stale admissibility refuses (pending recompute)", () => {
  const v = baseValue({ admissibility: "stale" });
  const verdict = admissibleFor(v, "analysis", NOW);
  assert.equal(verdict.ok, false);
  if (!verdict.ok) assert.equal(verdict.reason, "pending recompute");
});

test("admissibleFor RED: community is never admissible in a calculation, at any corroboration level", () => {
  for (const originClass of ["community", "community-corroborated"]) {
    const v = baseValue({ originClass });
    const calcVerdict = admissibleFor(v, "calculation", NOW);
    assert.equal(calcVerdict.ok, false, `${originClass} must refuse calculation`);
    const filingVerdict = admissibleFor(v, "filing", NOW);
    assert.equal(filingVerdict.ok, false, `${originClass} must refuse filing`);
  }
});

test("admissibleFor: community IS admissible for display/analysis (the hard floor is calculation/filing only)", () => {
  const v = baseValue({ originClass: "community" });
  assert.equal(admissibleFor(v, "display", NOW).ok, true);
  assert.equal(admissibleFor(v, "analysis", NOW).ok, true);
});

test("admissibleFor RED: missing (obs_status) is never admissible in calculation/filing", () => {
  const v = baseValue({ obsStatus: "M" }); // OBS_STATUS.M: Missing, reason unknown
  const calcVerdict = admissibleFor(v, "calculation", NOW);
  assert.equal(calcVerdict.ok, false);
  if (!calcVerdict.ok) assert.equal(calcVerdict.reason, "missing is not zero");
});

test("admissibleFor: a present obs_status (e.g. A, Normal) does not trigger the missing refusal", () => {
  const v = baseValue({ obsStatus: "A" });
  assert.equal(admissibleFor(v, "calculation", NOW).ok, true);
});

test("admissibleFor RED: filing additionally requires a contractable derivation", () => {
  const v = baseValue({ derivation: "modelled" }); // non-contractable
  const filingVerdict = admissibleFor(v, "filing", NOW);
  assert.equal(filingVerdict.ok, false);
  if (!filingVerdict.ok) assert.equal(filingVerdict.reason, "non-contractable derivation");
  // but the SAME value is fine for calculation (filing's extra bar doesn't apply there)
  assert.equal(admissibleFor(v, "calculation", NOW).ok, true);
});

test("admissibleFor: every contractable derivation clears filing's contractability check", () => {
  for (const derivation of ["statutory_fixed", "statutory_formula", "observed", "transacted_index", "assessed", "calculated"]) {
    const v = baseValue({ derivation });
    const verdict = admissibleFor(v, "filing", NOW);
    assert.equal(verdict.ok, true, `${derivation} should be contractable`);
  }
});

test("admissibleFor RED: decayed effective confidence below FLOOR[use] refuses", () => {
  // FLOOR.filing = 0.90 (ADR-024 decision 3). base 0.95 decayed hard over a long half-life-100-day gap.
  const asserted = new Date(NOW.getTime() - 500 * 86_400_000);
  const v = baseValue({ baseConfidence: 0.95, assertedAt: asserted.toISOString(), halfLifeDays: 100 });
  const verdict = admissibleFor(v, "filing", NOW);
  assert.equal(verdict.ok, false);
  if (!verdict.ok) assert.match(verdict.reason, /decayed below floor/);
});

test("admissibleFor: display is NEVER subject to the FLOOR decay check (spec §3.3: 'use !== display')", () => {
  const asserted = new Date(NOW.getTime() - 5000 * 86_400_000);
  const v = baseValue({ baseConfidence: 0.95, assertedAt: asserted.toISOString(), halfLifeDays: 10 });
  const verdict = admissibleFor(v, "display", NOW);
  assert.equal(verdict.ok, true);
});

test("admissibleFor: FLOOR is monotonically stricter with what is at stake (analysis < calculation < filing)", () => {
  // A confidence that clears analysis's floor (0.50) but not calculation's (0.75) or filing's (0.90).
  const asserted = new Date(NOW.getTime() - 100 * 86_400_000);
  const v = baseValue({ baseConfidence: 0.6, assertedAt: asserted.toISOString(), halfLifeDays: 100000 }); // negligible decay, stays ~0.6
  assert.equal(admissibleFor(v, "analysis", NOW).ok, true);
  assert.equal(admissibleFor(v, "calculation", NOW).ok, false);
  assert.equal(admissibleFor(v, "filing", NOW).ok, false);
});
