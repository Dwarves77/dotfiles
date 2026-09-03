import { test } from "node:test";
import assert from "node:assert/strict";
import { spec09Label, isStatutoryLabel, labelled, missing, SPEC09_LABELS } from "./label.mjs";

test("SPEC09_LABELS is exactly the brief's three-value scheme", () => {
  assert.deepEqual(SPEC09_LABELS, ["statutory", "estimate", "M"]);
});

test("spec09Label classifies both statutory derivation classes as statutory", () => {
  assert.equal(spec09Label("statutory_fixed"), "statutory");
  assert.equal(spec09Label("statutory_formula"), "statutory");
});

test("spec09Label classifies every non-statutory contractable/non-contractable class as estimate", () => {
  for (const d of ["observed", "transacted_index", "assessed", "calculated", "interpolated", "modelled", "estimated"]) {
    assert.equal(spec09Label(d), "estimate", `${d} should classify as estimate`);
  }
});

test("spec09Label returns M for null, undefined and an unrecognised derivation", () => {
  assert.equal(spec09Label(null), "M");
  assert.equal(spec09Label(undefined), "M");
  assert.equal(spec09Label("not-a-real-derivation"), "M");
});

test("isStatutoryLabel mirrors spec09Label", () => {
  assert.equal(isStatutoryLabel("statutory_formula"), true);
  assert.equal(isStatutoryLabel("modelled"), false);
  assert.equal(isStatutoryLabel(null), false);
});

test("labelled() attaches the coarse label and preserves the precise derivation", () => {
  const v = labelled(42, "modelled", { unit: "EUR" });
  assert.equal(v.label, "estimate");
  assert.equal(v.derivation, "modelled");
  assert.equal(v.value, 42);
  assert.equal(v.unit, "EUR");
  assert.ok(Object.isFrozen(v));
});

test("labelled() refuses a null/undefined value — must go through missing() instead", () => {
  assert.throws(() => labelled(null, "modelled"), TypeError);
  assert.throws(() => labelled(undefined, "observed"), TypeError);
});

test("missing() requires a non-empty reason and always labels M", () => {
  assert.throws(() => missing(""), TypeError);
  assert.throws(() => missing("   "), TypeError);
  assert.throws(() => missing(), TypeError);
  const m = missing("density_basis is not pack-level");
  assert.equal(m.label, "M");
  assert.equal(m.value, null);
  assert.equal(m.derivation, null);
  assert.equal(m.reason, "density_basis is not pack-level");
  assert.ok(Object.isFrozen(m));
});
