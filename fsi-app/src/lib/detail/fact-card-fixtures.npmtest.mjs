// fact-card-fixtures.npmtest.mjs, lane w10-factcard-b (2026-09-20), Amendment 1 section B.2.
// Pins the /admin/parts/fact-card sign-off page's coverage requirements: every one of the nine
// kinds, the no-lead case, a long claim, a card with no provenance, and both density="matrix"
// branches (figure and no-figure). Uses jiti to import the .ts fixture/model modules, the same
// pattern src/lib/detail/fact-paragraphs.npmtest.mjs already uses.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": APP } });
const {
  KIND_FIXTURES,
  NO_LEAD_FIXTURE,
  LONG_CLAIM_FIXTURE,
  NO_PROVENANCE_FIXTURE,
  DEFAULT_DENSITY_FIXTURES,
  MATRIX_FIXTURES,
} = jiti("./fact-card-fixtures.ts");
const { FACT_CARD_KINDS } = jiti("./fact-card-model.ts");

test("every one of the nine FACT_CARD_KINDS has a fixture", () => {
  const kinds = KIND_FIXTURES.map((f) => f.model.kind).sort();
  assert.deepEqual(kinds, [...FACT_CARD_KINDS].sort());
});

test("the no-lead fixture carries figureLead: null on a non-inference kind", () => {
  assert.equal(NO_LEAD_FIXTURE.model.figureLead, null);
  assert.notEqual(NO_LEAD_FIXTURE.model.kind, "ANALYTICAL INFERENCE");
});

test("the long-claim fixture exceeds the 66ch measure the claim column carries", () => {
  const text = LONG_CLAIM_FIXTURE.model.claim.map((n) => n.text).join("");
  assert.ok(text.length > 66, `expected > 66 chars, got ${text.length}`);
});

test("the no-provenance fixture has provenance: null and is not the inference kind", () => {
  assert.equal(NO_PROVENANCE_FIXTURE.model.provenance, null);
  assert.notEqual(NO_PROVENANCE_FIXTURE.model.kind, "ANALYTICAL INFERENCE");
});

test("DEFAULT_DENSITY_FIXTURES is the union of all four groups", () => {
  assert.equal(
    DEFAULT_DENSITY_FIXTURES.length,
    KIND_FIXTURES.length + 1 /* no-lead */ + 1 /* long claim */ + 1 /* no provenance */
  );
});

test("MATRIX_FIXTURES covers both factHeadline branches: figure and no-figure", () => {
  assert.equal(MATRIX_FIXTURES.length, 2);
  const [figureCase, noFigureCase] = MATRIX_FIXTURES;
  assert.ok(typeof figureCase.fact.valueNumeric === "number", "figure branch carries a numeric value");
  assert.equal(noFigureCase.fact.valueNumeric, undefined, "no-figure branch has no numeric value");
});
