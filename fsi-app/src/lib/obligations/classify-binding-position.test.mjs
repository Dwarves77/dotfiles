import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyBindingPosition, classifyInstrumentIdentity, BINDING_POSITION_RULES } from "./classify-binding-position.mjs";

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
  const r = classifyBindingPosition({ title: "Carbon Border Adjustment Mechanism — definitive regime", jurisdictionIso: ["EU"] });
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

// ── Class coverage (lane W2-F, WS10, 2026-09-29; rule 19 "examples are not scope") ──────────────
// Before this test, only about 8 of the 16 spec-01 S1 instruments (CountEmissions, CBAM, FuelEU
// Maritime, EU ETS maritime, EUDR, CSDDD, PPWR, plus the unmapped/empty cases) had ANY test exercising
// them. Empowering Consumers Directive, SOLAS VGM, CSRD, ReFuelEU Aviation, CORSIA, EU ETS2, IMO
// CII/EEXI, IMO Net-Zero Framework and SBTi could each silently stop matching and nothing here would
// fail, exactly the "proof that does not execute is not a proof" gap (CLAUDE.md rule 15). This drives
// the class ("for any instrument spec-01 S1 names, not just the ones someone happened to spot-test")
// from BINDING_POSITION_RULES's own `label` field, so a 17th instrument added to the table is
// automatically covered too, the test never hand-copies a second instrument-name list to go stale
// against the first.
test("class coverage: every RULES entry classifies its own label to its own position (no rule is untested)", () => {
  assert.ok(BINDING_POSITION_RULES.length >= 16, "expected at least the 16 spec-01 S1 instruments");
  for (const rule of BINDING_POSITION_RULES) {
    assert.ok(rule.label && rule.label.length > 0, `rule for ${rule.citation} must carry a label`);
    const r = classifyBindingPosition({ title: rule.label });
    assert.ok(r, `label "${rule.label}" (${rule.citation}) must classify to something, not null`);
    assert.equal(r.position, rule.position, `label "${rule.label}" must classify as ${rule.position}, got ${r.position}`);
  }
});

// Two real, named instances per non-trivial position (rule 2: never fabricate, both instruments
// below are real spec-01 S1 rows, not invented names), proving the mechanism covers the CLASS of
// "carrier pass-through" instruments, not one hand-picked example.
test("class coverage: two distinct real carrier_passthrough instruments both resolve via the same mechanism", () => {
  const corsia = classifyBindingPosition({ title: "CORSIA offsetting requirements for 2026" });
  const refueleu = classifyBindingPosition({ title: "ReFuelEU Aviation SAF blending mandate" });
  assert.equal(corsia.position, "carrier_passthrough");
  assert.equal(refueleu.position, "carrier_passthrough");
  assert.notEqual(corsia.citation, refueleu.citation, "two distinct instruments must cite two distinct spec-01 rows");
});

// ── Lane OBL-2 (2026-10-08): identity first, generic title phrases no longer classify other instruments ────────
// (OBL-1 register section 8 item 9; the census titles are the real ones from the tracked census fixture.)

test("generic phrase: the packaging and packaging waste title phrase is not PPWR (1994 directive amendments, derogation decisions, national producer regulations)", () => {
  for (const title of [
    "Directive 2004/12/EC of the European Parliament and of the Council of 11 February 2004 amending Directive 94/62/EC on packaging and packaging waste - Statement by the Council",
    "The Producer Responsibility Obligations (Packaging and Packaging Waste) Regulations 2024",
    "2001/171/EC: Commission Decision establishing the conditions for a derogation for glass packaging in Directive 94/62/EC on packaging and packaging waste",
  ]) assert.equal(classifyBindingPosition({ title, jurisdictionIso: ["EU"] }), null, title);
});

test("generic phrase: the carbon border adjustment phrase counts for an EU item only, never the UK mechanism", () => {
  const title = "The Carbon Border Adjustment Mechanism (Transitory Provision) Regulations 2026";
  assert.equal(classifyBindingPosition({ title, jurisdictionIso: ["GB"] }), null);
  assert.equal(classifyBindingPosition({ title }), null);
  assert.equal(classifyBindingPosition({ title: "Carbon Border Adjustment Mechanism definitive regime", jurisdictionIso: ["EU"] }).position, "direct_duty");
});

test("identity: the instrument number and CELEX of CBAM (2023/956) and PPWR (2025/40) classify; a different instrument that applies Regulation 2023/956 is the CBAM family", () => {
  assert.equal(classifyBindingPosition({ title: "Commission Implementing Regulation (EU) 2025/2621 laying down rules for the application of Regulation (EU) 2023/956" }).position, "direct_duty");
  assert.equal(classifyInstrumentIdentity({ instrumentIdentifiers: ["32023R0956"] }).position, "direct_duty");
  assert.equal(classifyInstrumentIdentity({ instrumentIdentifiers: [null, "32025R0040"] }).position, "direct_duty");
  assert.equal(classifyInstrumentIdentity({ legalInstrument: "Regulation (EU) 2025/40" }).position, "direct_duty");
});

test("classifyInstrumentIdentity never reads a generic phrase and never guesses", () => {
  assert.equal(classifyInstrumentIdentity({ legalInstrument: "Carbon Border Adjustment Mechanism", instrumentIdentifiers: ["UK uksi 2026/830"] }), null);
  assert.equal(classifyInstrumentIdentity({}), null);
  assert.equal(classifyInstrumentIdentity(undefined), null);
});
