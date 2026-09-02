// credibility-grade-modifiers.test.mjs — DB-free node --test proof for the GRADE modifier ledger's
// pure logic (docs/specs/03-research.md §4 "two scores, never merged"; Lane DASH, 2026-09-02).

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGradeModifiers } from "./credibility-grade-modifiers.mjs";

const GRADE_KEYS = [
  "risk_of_bias",
  "indirectness",
  "imprecision",
  "inconsistency",
  "publication_bias",
  "upgrades",
];

test("buildGradeModifiers: no bias tags -> every modifier is not_assessed, no detail", () => {
  const modifiers = buildGradeModifiers([]);
  assert.deepEqual(modifiers.map((m) => m.key), GRADE_KEYS);
  for (const m of modifiers) {
    assert.equal(m.status, "not_assessed");
    assert.equal(m.detail, null);
  }
});

test("buildGradeModifiers: null biasTags behaves the same as empty (never throws)", () => {
  const modifiers = buildGradeModifiers(null);
  assert.equal(modifiers.length, 6);
  assert.ok(modifiers.every((m) => m.status === "not_assessed"));
});

test("buildGradeModifiers: a bias tag flags ONLY 'risk_of_bias', every other row stays not_assessed", () => {
  const modifiers = buildGradeModifiers([{ dimension: "funding", tag: "vendor-funded", confidence: 0.8 }]);
  const byKey = Object.fromEntries(modifiers.map((m) => [m.key, m]));
  assert.equal(byKey.risk_of_bias.status, "flagged");
  for (const key of GRADE_KEYS.filter((k) => k !== "risk_of_bias")) {
    assert.equal(byKey[key].status, "not_assessed");
    assert.equal(byKey[key].detail, null);
  }
});

test("buildGradeModifiers: risk_of_bias detail formats dimension, tag, and rounded confidence percent", () => {
  const [risk] = buildGradeModifiers([{ dimension: "funding", tag: "vendor-funded", confidence: 0.845 }]);
  assert.equal(risk.detail, "funding: vendor-funded (confidence 85%)");
});

test("buildGradeModifiers: confidence null omits the confidence fragment entirely", () => {
  const [risk] = buildGradeModifiers([{ dimension: "methodology", tag: "small-sample", confidence: null }]);
  assert.equal(risk.detail, "methodology: small-sample");
});

test("buildGradeModifiers: multiple bias tags join with '; ', in input order", () => {
  const [risk] = buildGradeModifiers([
    { dimension: "funding", tag: "vendor-funded", confidence: 0.9 },
    { dimension: "stakeholder", tag: "industry-association", confidence: null },
  ]);
  assert.equal(risk.detail, "funding: vendor-funded (confidence 90%); stakeholder: industry-association");
});

test("buildGradeModifiers: never fabricates a score — GRADE ledger status is always exactly 'flagged' or 'not_assessed'", () => {
  const modifiers = buildGradeModifiers([{ dimension: "funding", tag: "x", confidence: 0.5 }]);
  for (const m of modifiers) {
    assert.ok(m.status === "flagged" || m.status === "not_assessed");
  }
});
