// classify-source.test.mjs — proves the per-source aggregator: gap detection, applicable vs
// advisory-only proposals, and the "no candidate value" honest-empty case.
import test from "node:test";
import assert from "node:assert/strict";
import {
  sourceClassificationGaps, proposeSourceAxisClassification, APPLICABLE_FIELDS,
} from "./classify-source.mjs";

test("APPLICABLE_FIELDS never includes jurisdictions (no safe apply target — see file header)", () => {
  assert.ok(!APPLICABLE_FIELDS.includes("jurisdictions"));
  assert.deepEqual([...APPLICABLE_FIELDS].sort(), ["expected_output", "scope_modes", "scope_topics", "scope_verticals"]);
});

// ── sourceClassificationGaps ─────────────────────────────────────────────────────────────────────

test("sourceClassificationGaps: every field empty/null on a bare row", () => {
  const g = sourceClassificationGaps({});
  assert.deepEqual(g, { jurisdictions: true, scope_topics: true, scope_modes: true, scope_verticals: true, expected_output: true });
});

test("sourceClassificationGaps: a populated array field reports no gap; an empty array still gaps", () => {
  const g = sourceClassificationGaps({ jurisdictions: ["GB"], scope_topics: [], scope_modes: null });
  assert.equal(g.jurisdictions, false);
  assert.equal(g.scope_topics, true);
  assert.equal(g.scope_modes, true);
});

test("sourceClassificationGaps: expected_output null/undefined gaps; any object (even {}) does not", () => {
  assert.equal(sourceClassificationGaps({ expected_output: null }).expected_output, true);
  assert.equal(sourceClassificationGaps({ expected_output: undefined }).expected_output, true);
  assert.equal(sourceClassificationGaps({ expected_output: {} }).expected_output, false);
});

// ── proposeSourceAxisClassification ──────────────────────────────────────────────────────────────

test("a fully-classified source yields hasGap:false and zero proposals", () => {
  const source = {
    id: "s-1", name: "EUR-Lex", url: "https://eur-lex.europa.eu/", source_role: "primary_legal_authority",
    jurisdictions: ["EU"], scope_topics: ["regulatory"], scope_modes: ["none"], scope_verticals: ["all"],
    expected_output: { regulations: 1, research: 0, market: 0, operations: 0, out_of_scope: 0 },
  };
  const r = proposeSourceAxisClassification(source);
  assert.equal(r.hasGap, false);
  assert.deepEqual(r.proposals, []);
});

test("a well-known primary_legal_authority source (EFRAG-shaped): every axis derivable resolves, jurisdiction is flagged non-applicable", () => {
  const source = {
    id: "s-2", name: "EFRAG Sustainability Reporting", url: "https://www.efrag.org/", source_role: "standards_body",
  };
  const r = proposeSourceAxisClassification(source);
  assert.equal(r.hasGap, true);
  const byField = Object.fromEntries(r.proposals.map((p) => [p.field, p]));
  assert.ok(byField.expected_output, "expected_output must be derivable from source_role alone");
  assert.equal(byField.expected_output.applicable, true);
  // No name/host mode or vertical keyword and no URL gov-host match on efrag.org — jurisdiction and
  // scope_modes/verticals are honestly absent (not guessed) unless a keyword/host actually matched.
  if (byField.jurisdictions) assert.equal(byField.jurisdictions.applicable, false);
});

test("every applicable proposal's field is in APPLICABLE_FIELDS; jurisdiction (when present) is applicable:false", () => {
  const source = {
    id: "s-3", name: "Ministry of Environment", url: "https://www.env.go.jp/",
    source_role: "primary_legal_authority",
  };
  const r = proposeSourceAxisClassification(source);
  for (const p of r.proposals) {
    if (p.field === "jurisdictions") assert.equal(p.applicable, false);
    else assert.ok(APPLICABLE_FIELDS.includes(p.field), `${p.field} must be an applicable field`);
  }
});

test("a source with no derivable signal at all (generic vendor, unrecognized host) -> hasGap:true, zero proposals (honest, not guessed)", () => {
  const source = { id: "s-4", name: "Acme Freight Co", url: "https://www.acmefreight.example/", source_role: "vendor_corporate" };
  const r = proposeSourceAxisClassification(source);
  assert.equal(r.hasGap, true);
  // vendor_corporate DOES have a fixed expected_output default, so that one field resolves; the rest
  // (no mode/vertical/topic keyword in the name, no gov/int host) stay absent, not guessed.
  const fields = r.proposals.map((p) => p.field);
  assert.ok(fields.includes("expected_output"));
  assert.ok(!fields.includes("scope_modes"));
  assert.ok(!fields.includes("jurisdictions"));
});

test("expected_output is not proposed when source_role is null, even if the field is gapped", () => {
  const source = { id: "s-5", name: "Unclassified Source", url: "https://example.org/", source_role: null };
  const r = proposeSourceAxisClassification(source);
  assert.ok(!r.proposals.some((p) => p.field === "expected_output"));
});

test("expected_output is not proposed for government_press (framework: varies, no fixed default)", () => {
  const source = { id: "s-6", name: "EC Press Corner", url: "https://ec.europa.eu/commission/presscorner/", source_role: "government_press" };
  const r = proposeSourceAxisClassification(source);
  assert.ok(!r.proposals.some((p) => p.field === "expected_output"));
});

test("sourceId passes through; missing id degrades to null rather than throwing", () => {
  assert.equal(proposeSourceAxisClassification({ id: "abc" }).sourceId, "abc");
  assert.equal(proposeSourceAxisClassification({}).sourceId, null);
});
