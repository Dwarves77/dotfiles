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
  INLINE_LIST_FIXTURE,
  EMBEDDED_LINK_FIXTURE,
  FOUR_LINE_PROVENANCE_FIXTURE,
  TWO_LINE_NAME_FIXTURE,
  DEFAULT_DENSITY_FIXTURES,
  MATRIX_FIXTURES,
} = jiti("./fact-card-fixtures.ts");
const { FACT_CARD_KINDS } = jiti("./fact-card-model.ts");
const { PANEL_21C_GROUPS } = jiti("./fact-card-panel21c-fixture.ts");

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

test("DEFAULT_DENSITY_FIXTURES is the union of all eight groups", () => {
  assert.equal(
    DEFAULT_DENSITY_FIXTURES.length,
    KIND_FIXTURES.length +
      1 /* no-lead */ +
      1 /* long claim */ +
      1 /* no provenance */ +
      1 /* lane w10-factcard-c: inline list + bold */ +
      1 /* lane w10-factcard-c: embedded link */ +
      1 /* sign-off 2026-09-22 build item 4: four-line provenance */ +
      1 /* sign-off 2026-09-22 build item 4: two-line source name */
  );
});

// Operator sign-off 2026-09-22, correction 2 (binding on every future part lane's fixtures too):
// "A test fails if any fixture text matches /example\.(org|com)|Example (Regulation|Regulatory)/i."
test("no fixture (default density, matrix, or panel-21c group) carries generic placeholder text", () => {
  const BANNED = /example\.(org|com)|Example (Regulation|Regulatory)/i;
  const collected = [];
  for (const f of DEFAULT_DENSITY_FIXTURES) {
    collected.push(JSON.stringify(f.model));
  }
  for (const f of MATRIX_FIXTURES) {
    collected.push(JSON.stringify(f.fact), JSON.stringify(f.baseFact));
  }
  for (const g of PANEL_21C_GROUPS) {
    collected.push(g.title, g.qualifier, g.actionStrip?.text ?? "");
    for (const f of g.cards) collected.push(JSON.stringify(f.model));
  }
  const offenders = collected.filter((s) => BANNED.test(s));
  assert.deepEqual(offenders, [], "no fixture text may match the banned generic-placeholder pattern");
});

// Build item 4's two acceptance cases, as fixture DATA (FactCard.npmtest.mjs covers the component
// logic that consumes this data - sourceNameWrapsToTwoLines - by reading FactCard.tsx's own
// source; this file only asserts the fixtures carry the shape that logic is meant to react to).
test("the four-line-provenance fixture carries all four provenance fields (source, org, link, accessed) with a short source name that does not trip the wrap heuristic", () => {
  const p = FOUR_LINE_PROVENANCE_FIXTURE.model.provenance;
  assert.ok(p.source && p.org && p.href && p.accessed, "all four provenance fields are present");
  // Mirrors FactCard.tsx's own sourceNameWrapsToTwoLines threshold (5.0px/char, 109px budget):
  // this fixture's source name must stay UNDER that budget so all four rows render.
  assert.ok(p.source.length * 5.0 <= 109, `source "${p.source}" must fit the first-line budget`);
});

test("the two-line-name fixture carries a source name long enough to wrap (dropping organisation) while still carrying its own link and accessed date", () => {
  const p = TWO_LINE_NAME_FIXTURE.model.provenance;
  assert.ok(p.source.length * 5.0 > 109, `source "${p.source}" must exceed the first-line budget to trigger the wrap heuristic`);
  assert.ok(p.href, "link is still present");
  assert.ok(p.accessed, "accessed date is still present (never the field that gets dropped)");
  assert.ok(p.org, "the fixture still CARRIES an org value - the component's render logic drops it, not the fixture data");
});

// Lane w10-factcard-c (2026-09-21), item 3: the two measured live-leftover fixtures render through
// the real toClaimNodes, so the sign-off page shows the actual fix, never a re-typed reproduction.
test("the inline-list fixture's claim carries no '*' and no leading '- ', with the name as its own bold node", () => {
  const rendered = INLINE_LIST_FIXTURE.model.claim.map((n) => n.text).join("");
  assert.ok(!rendered.includes("*"), "no literal asterisk survives");
  assert.ok(!/(^|\s)-\s/.test(rendered), "no leading list-marker dash survives");
  assert.ok(INLINE_LIST_FIXTURE.model.claim.some((n) => n.bold), "the name stays a distinct bold node");
});

test("the embedded-link fixture's claim carries at least one link node (href set), text is the host via hostFromUrl", () => {
  const linkNodes = EMBEDDED_LINK_FIXTURE.model.claim.filter((n) => n.href);
  assert.ok(linkNodes.length > 0, "at least one embedded url survives as a link node");
  for (const n of linkNodes) {
    assert.doesNotMatch(n.text, /https?:\/\//, "the link node's visible text is never the raw url");
  }
});

test("MATRIX_FIXTURES covers both factHeadline branches: figure and no-figure", () => {
  assert.equal(MATRIX_FIXTURES.length, 2);
  const [figureCase, noFigureCase] = MATRIX_FIXTURES;
  assert.ok(typeof figureCase.fact.valueNumeric === "number", "figure branch carries a numeric value");
  assert.equal(noFigureCase.fact.valueNumeric, undefined, "no-figure branch has no numeric value");
});
