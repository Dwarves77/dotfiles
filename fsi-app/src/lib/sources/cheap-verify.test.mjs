// @ts-check
// Tests for cheap-verify: pure span matching, $0, no I/O. CHECKPOINT 1 proof — no model call anywhere.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeForMatch, spanPresent, cheapVerifyClaims } from "./cheap-verify.mjs";

test("normalizeForMatch: strips tags + collapses whitespace", () => {
  assert.equal(normalizeForMatch("<p>Article  4</p>\n<b>SAF</b>"), "Article 4 SAF");
  assert.equal(normalizeForMatch("a&nbsp;b"), "a b");
});

test("spanPresent: matches across tag/whitespace drift; empty never matches", () => {
  const text = normalizeForMatch("<div>The blend  target is 2% from <i>January 2025</i></div>");
  assert.equal(spanPresent("blend target is 2%", text), true);
  assert.equal(spanPresent("January 2025", text), true);
  assert.equal(spanPresent("3% blend", text), false);
  assert.equal(spanPresent("", text), false);
});

const SNAP = "<html><body>Regulation (EU) 2099/1 sets a 2% SAF blend from January 2025. Penalty is 700 EUR per tonne.</body></html>";

test("cheapVerifyClaims: PASS when all FACT spans present", () => {
  const r = cheapVerifyClaims([
    { claim_kind: "fact", claim_text: "blend", source_span: "2% SAF blend from January 2025" },
    { claim_kind: "fact", claim_text: "penalty", source_span: "700 EUR per tonne" },
    { claim_kind: "analysis", claim_text: "context", source_span: "not present in source at all" },
  ], SNAP);
  assert.equal(r.pass, true);
  assert.equal(r.factTotal, 2);
  assert.equal(r.factMatched, 2);
  assert.equal(r.allFactsMatched, true);
  // the analysis claim is unmatched but does not fail the pass
  assert.equal(r.unmatched.length, 1);
  assert.equal(r.unmatched[0].claim_kind, "analysis");
});

test("cheapVerifyClaims: FAIL when a FACT span is missing", () => {
  const r = cheapVerifyClaims([
    { claim_kind: "fact", claim_text: "blend", source_span: "2% SAF blend from January 2025" },
    { claim_kind: "fact", claim_text: "wrong", source_span: "5% SAF blend from 2030" },
  ], SNAP);
  assert.equal(r.pass, false);
  assert.equal(r.factMatched, 1);
  assert.match(r.reason, /1 of 2 FACT span\(s\) NOT present/);
});

test("cheapVerifyClaims: no FACT claims -> cannot confirm (pass false)", () => {
  const r = cheapVerifyClaims([{ claim_kind: "analysis", source_span: "whatever" }], SNAP);
  assert.equal(r.hasFacts, false);
  assert.equal(r.pass, false);
  assert.match(r.reason, /never span-grounded/);
});

test("cheapVerifyClaims: empty claim list -> cannot confirm", () => {
  const r = cheapVerifyClaims([], SNAP);
  assert.equal(r.pass, false);
  assert.equal(r.total, 0);
});
