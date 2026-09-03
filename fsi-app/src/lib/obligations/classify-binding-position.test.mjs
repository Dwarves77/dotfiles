import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyBindingPosition, BINDING_POSITION_RULES } from "./classify-binding-position.mjs";

test("classifies CountEmissions EU as direct_duty (spec-01 §1 table 1)", () => {
  const r = classifyBindingPosition({ title: "CountEmissions EU, Regulation (EU) 2026/1030" });
  assert.equal(r.position, "direct_duty");
  assert.match(r.citation, /spec-01 §1/);
});

test("classifies by ELI/CELEX-shaped number alone (no instrument name in title)", () => {
  const r = classifyBindingPosition({ title: "Regulation 2026/1030 on transport emissions calculation" });
  assert.equal(r.position, "direct_duty");
});

test("classifies CBAM as direct_duty regardless of case", () => {
  const r = classifyBindingPosition({ title: "Carbon Border Adjustment Mechanism — definitive regime" });
  assert.equal(r.position, "direct_duty");
});

test("classifies FuelEU Maritime as carrier_passthrough", () => {
  const r = classifyBindingPosition({ title: "FuelEU Maritime Regulation — compliance balance" });
  assert.equal(r.position, "carrier_passthrough");
});

test("classifies EU ETS maritime as carrier_passthrough, not the plain EU ETS2 rule", () => {
  const r = classifyBindingPosition({ title: "EU ETS maritime phase-in 2026" });
  assert.equal(r.position, "carrier_passthrough");
});

test("classifies EUDR as customer_contract", () => {
  const r = classifyBindingPosition({ title: "EU Deforestation Regulation (EUDR) due diligence statement" });
  assert.equal(r.position, "customer_contract");
});

test("classifies CSDDD as customer_contract", () => {
  const r = classifyBindingPosition({ legalInstrument: "Corporate Sustainability Due Diligence Directive" });
  assert.equal(r.position, "customer_contract");
});

test("matches on legalInstrument/shortName even when title is generic", () => {
  const r = classifyBindingPosition({ title: "Update to the packaging rules", shortName: "PPWR" });
  assert.equal(r.position, "direct_duty");
});

test("returns null (never guesses) for an unmapped instrument", () => {
  const r = classifyBindingPosition({ title: "California SB 253 climate disclosure" });
  assert.equal(r, null);
});

test("returns null for an empty/missing item — never throws, never guesses", () => {
  assert.equal(classifyBindingPosition({}), null);
  assert.equal(classifyBindingPosition({ title: null, legalInstrument: undefined }), null);
  assert.equal(classifyBindingPosition(undefined), null);
});

test("every rule cites spec-01 §1 and carries one of the four real BINDING_POSITION codes", () => {
  const VALID = new Set(["direct_duty", "carrier_passthrough", "customer_contract", "monitoring_only"]);
  for (const rule of BINDING_POSITION_RULES) {
    assert.match(rule.citation, /spec-01 §1/, `rule for ${rule.position} must cite spec-01 §1`);
    assert.ok(VALID.has(rule.position), `rule position "${rule.position}" must be a real BINDING_POSITION code`);
  }
});

test("rule table has no duplicate regex objects (each row is its own literal)", () => {
  const seen = new Set();
  for (const rule of BINDING_POSITION_RULES) {
    const key = rule.test.source;
    assert.ok(!seen.has(key), `duplicate test pattern: ${key}`);
    seen.add(key);
  }
});
