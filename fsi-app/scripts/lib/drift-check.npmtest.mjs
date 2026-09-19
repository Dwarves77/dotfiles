// D3 drift-check — LAYER 1 (known-answer pairs) + LAYER 2 (mutation).
// Run: node --test scripts/lib/drift-check.selftest.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { DRIFT, evalPredicate } from "./drift-check.mjs";

// Two fixtures differing ONLY in whether the fn is CALLED vs merely MENTIONED.
const CALL_IN_CODE = `async function f(){ const r = await browserlessRender(src.url); return r; }`;
const TOKEN_IN_COMMENT = `// NOTE: browserlessRender is overkill here; we use plain fetch.\nasync function f(){ const r = await fetch(src.url); return r; }`;

// ───────── LAYER 1 — known-answer pairs ─────────
test("L1 calls — real call → IMPLEMENTED; token-only-in-comment → DRIFTED (behavioral, not text)", () => {
  assert.equal(evalPredicate(CALL_IN_CODE, { kind: "calls", callee: "browserlessRender" }).verdict, DRIFT.IMPLEMENTED);
  assert.equal(evalPredicate(TOKEN_IN_COMMENT, { kind: "calls", callee: "browserlessRender" }).verdict, DRIFT.DRIFTED);
  // the trap: the token IS present in text on the DRIFTED fixture — AST is not fooled.
  assert.ok(TOKEN_IN_COMMENT.includes("browserlessRender"));
});

test("L1 noRawSourceFetch — canonical-only → IMPLEMENTED; raw source fetch → DRIFTED", () => {
  assert.equal(evalPredicate(CALL_IN_CODE, { kind: "noRawSourceFetch" }).verdict, DRIFT.IMPLEMENTED);
  assert.equal(evalPredicate(TOKEN_IN_COMMENT, { kind: "noRawSourceFetch" }).verdict, DRIFT.DRIFTED);
});

test("L1 runtime / textOnly → UNCONFIRMABLE (loud, never PASS/IMPLEMENTED)", () => {
  assert.equal(evalPredicate("", { kind: "runtime", desc: "middleware loads" }).verdict, DRIFT.UNCONFIRMABLE);
  assert.equal(evalPredicate("", { kind: "textOnly", desc: "x" }).verdict, DRIFT.UNCONFIRMABLE);
});

// ───────── LAYER 2 — mutation (test the test) ─────────
// Swap the BEHAVIORAL(AST) predicate for a TEXT one; the comment-only fixture then
// WRONGLY reports IMPLEMENTED. real(DRIFTED) != broken(IMPLEMENTED) proves the fixture
// exercises the AST-vs-text distinction — and that the real predicate is the correct one.
test("L2 mutation — calls is BEHAVIORAL not text (comment fixture flips under a text mutation)", () => {
  const real = evalPredicate(TOKEN_IN_COMMENT, { kind: "calls", callee: "browserlessRender" }).verdict;
  const brokenText = TOKEN_IN_COMMENT.includes("browserlessRender") ? DRIFT.IMPLEMENTED : DRIFT.DRIFTED;
  assert.equal(real, DRIFT.DRIFTED);
  assert.equal(brokenText, DRIFT.IMPLEMENTED);
  assert.notEqual(real, brokenText); // the trap: text would false-IMPLEMENT; AST does not
});

test("L2 mutation — noRawSourceFetch fixture exercises the AST scan", () => {
  const real = evalPredicate(TOKEN_IN_COMMENT, { kind: "noRawSourceFetch" }).verdict; // DRIFTED
  const brokenAlwaysOk = DRIFT.IMPLEMENTED; // mutation: ignore the scan, always implemented
  assert.equal(real, DRIFT.DRIFTED);
  assert.notEqual(real, brokenAlwaysOk);
});
