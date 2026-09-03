// scope.test.mjs — proves the three Axis 4 classifiers (topics / modes / verticals): keyword matching,
// role priors, and the honest-null contract for undeterminable inputs.
import test from "node:test";
import assert from "node:assert/strict";
import { classifyScopeModes, classifyScopeVerticals, classifyScopeTopics } from "./scope.mjs";
import { isValidScopeMode, isValidScopeVertical, isValidScopeTopic } from "./vocab.mjs";

// ── 4b. Modes ────────────────────────────────────────────────────────────────────────────────────

test("classifyScopeModes: single-mode name keyword -> high confidence, that one mode", () => {
  const r = classifyScopeModes({ name: "International Air Cargo Association" });
  assert.deepEqual(r.value, ["air"]);
  assert.equal(r.confidence, "high");
});

test("classifyScopeModes: multi-mode keyword match -> medium confidence, all matched modes", () => {
  const r = classifyScopeModes({ name: "Ocean and Rail Freight Transport News" });
  assert.deepEqual(r.value.sort(), ["ocean", "rail"]);
  assert.equal(r.confidence, "medium");
});

test("classifyScopeModes: a direct mode keyword in the name wins even when the source is intergovernmental (name-keyword branch runs first)", () => {
  const r = classifyScopeModes({ name: "International Maritime Organization", sourceRole: "intergovernmental_body" });
  assert.deepEqual(r.value, ["ocean"]);
  assert.equal(r.confidence, "high");
});

test("classifyScopeModes: intergovernmental body with a generic transport remit and no direct mode keyword -> ['all']", () => {
  const r = classifyScopeModes({ name: "International Energy Agency (freight and logistics programme)", sourceRole: "intergovernmental_body" });
  assert.deepEqual(r.value, ["all"]);
  assert.match(r.basis, /IEA\/IMO\/ICAO example/);
});

test("classifyScopeModes: standards_body / statistical_data_agency roles default to ['none'] absent a mode keyword", () => {
  assert.deepEqual(classifyScopeModes({ name: "IFRS Foundation", sourceRole: "standards_body" }).value, ["none"]);
  assert.deepEqual(classifyScopeModes({ name: "Bureau of Labor Statistics", sourceRole: "statistical_data_agency" }).value, ["none"]);
});

test("classifyScopeModes: no keyword, no applicable role prior -> null (never guessed)", () => {
  assert.equal(classifyScopeModes({ name: "Some Generic Vendor Corp", sourceRole: "vendor_corporate" }), null);
  assert.equal(classifyScopeModes({}), null);
});

test("classifyScopeModes: every non-null result is vocab-valid", () => {
  const cases = [
    { name: "Air Cargo News" }, { name: "TradeWinds Ocean Shipping" },
    { name: "IFRS Foundation", sourceRole: "standards_body" },
    { name: "IEA transport programme", sourceRole: "intergovernmental_body" },
  ];
  for (const c of cases) {
    const r = classifyScopeModes(c);
    if (!r) continue;
    for (const m of r.value) assert.ok(isValidScopeMode(m), `${m} must be vocab-valid`);
  }
});

// ── 4c. Verticals ────────────────────────────────────────────────────────────────────────────────

test("classifyScopeVerticals: name keyword match -> high confidence", () => {
  const r = classifyScopeVerticals({ name: "Gallery Climate Coalition" });
  assert.deepEqual(r.value, ["fine_art"]);
  assert.equal(r.confidence, "high");
});

test("classifyScopeVerticals: cross-vertical role prior (standards/intergovernmental) -> ['all']", () => {
  assert.deepEqual(classifyScopeVerticals({ name: "ISO", sourceRole: "standards_body" }).value, ["all"]);
  assert.deepEqual(classifyScopeVerticals({ name: "IMO", sourceRole: "intergovernmental_body" }).value, ["all"]);
});

test("classifyScopeVerticals: freight-general role prior -> ['freight_general']", () => {
  assert.deepEqual(classifyScopeVerticals({ name: "Journal of Commerce", sourceRole: "trade_press" }).value, ["freight_general"]);
});

test("classifyScopeVerticals: name keyword wins over role prior when both would apply", () => {
  const r = classifyScopeVerticals({ name: "albert (film and TV sustainability)", sourceRole: "trade_press" });
  assert.deepEqual(r.value, ["film_tv"]);
});

test("classifyScopeVerticals: no keyword, no applicable role -> null", () => {
  assert.equal(classifyScopeVerticals({ name: "Random Institute", sourceRole: "academic_research" }), null);
});

test("classifyScopeVerticals: every non-null result is vocab-valid", () => {
  const cases = [
    { name: "A Greener Future" }, { name: "UNHRD" }, { name: "ISO", sourceRole: "standards_body" },
    { name: "FreightWaves", sourceRole: "trade_press" },
  ];
  for (const c of cases) {
    const r = classifyScopeVerticals(c);
    if (!r) continue;
    for (const v of r.value) assert.ok(isValidScopeVertical(v));
  }
});

// ── 4a. Topics ───────────────────────────────────────────────────────────────────────────────────

test("classifyScopeTopics: multiple keyword matches -> all matched topics, medium confidence", () => {
  const r = classifyScopeTopics({ name: "Climate and Finance Regulatory Bulletin" });
  assert.equal(r.confidence, "medium");
  assert.ok(r.value.includes("environmental"));
  assert.ok(r.value.includes("finance"));
  assert.ok(r.value.includes("regulatory"));
});

test("classifyScopeTopics: primary_legal_authority / government_press role always adds 'regulatory'", () => {
  const r = classifyScopeTopics({ name: "Federal Register", sourceRole: "primary_legal_authority" });
  assert.ok(r.value.includes("regulatory"));
});

test("classifyScopeTopics: role-added 'regulatory' merges with, never duplicates, a keyword-matched 'regulatory'", () => {
  const r = classifyScopeTopics({ name: "EU Regulatory Update", sourceRole: "primary_legal_authority" });
  assert.equal(r.value.filter((t) => t === "regulatory").length, 1);
});

test("classifyScopeTopics: no keyword and non-regulatory role -> null", () => {
  assert.equal(classifyScopeTopics({ name: "Maersk", sourceRole: "vendor_corporate" }), null);
});

test("classifyScopeTopics: every non-null result is vocab-valid", () => {
  const r = classifyScopeTopics({ name: "Packaging, Customs and Conservation Weekly" });
  for (const t of r.value) assert.ok(isValidScopeTopic(t));
});
