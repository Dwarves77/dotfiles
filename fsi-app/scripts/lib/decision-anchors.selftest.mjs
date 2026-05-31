// D3 section 3 — decision-anchor engine LAYER 1 (known-answer) + LAYER 2 (mutation).
// Run: node --test scripts/lib/decision-anchors.selftest.mjs
//
// The four-verdict truth table is the heart; PENDING is the new, scrutinized piece.
// The pairs fix every cell; the mutations prove the trigger is load-bearing — that a
// deferred obligation goes LOUD when due, and that breaking the trigger would let a
// due-and-unmet obligation (the #40 Phase-2 binding forgotten at the moment it binds)
// stay silently quiet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { VERDICT, LOUD, resolveVerdict, TRIGGERS } from "./decision-anchors.mjs";

// ───────── LAYER 1 — known-answer pairs (the full truth table) ─────────

test("L1 resolveVerdict — code/schema: present->IMPLEMENTED, absent->DRIFTED (loud)", () => {
  assert.equal(resolveVerdict({ kind: "code", present: true }), VERDICT.IMPLEMENTED);
  assert.equal(resolveVerdict({ kind: "schema", present: false }), VERDICT.DRIFTED);
  assert.equal(LOUD.has(VERDICT.DRIFTED), true);
  assert.equal(LOUD.has(VERDICT.IMPLEMENTED), false);
});

test("L1 resolveVerdict — governance QUIET; unconfirmable LOUD (the distinction operator required)", () => {
  assert.equal(resolveVerdict({ kind: "governance" }), VERDICT.GOVERNANCE);
  assert.equal(LOUD.has(VERDICT.GOVERNANCE), false);              // quiet — no code claim by design
  assert.equal(resolveVerdict({ kind: "unconfirmable" }), VERDICT.UNCONFIRMABLE);
  assert.equal(LOUD.has(VERDICT.UNCONFIRMABLE), true);            // loud — should-confirm-now, can't
});

test("L1 resolveVerdict — PENDING 4-cell table (the new verdict)", () => {
  // trigger NOT met -> PENDING quiet, regardless of present
  assert.equal(resolveVerdict({ kind: "pending", triggerMet: false, present: false }), VERDICT.PENDING);
  assert.equal(resolveVerdict({ kind: "pending", triggerMet: false, present: true }), VERDICT.PENDING);
  assert.equal(LOUD.has(VERDICT.PENDING), false);                // correctly absent now = quiet
  // trigger MET -> due: present->IMPLEMENTED, absent->LOUD violation
  assert.equal(resolveVerdict({ kind: "pending", triggerMet: true, present: true }), VERDICT.IMPLEMENTED);
  assert.equal(resolveVerdict({ kind: "pending", triggerMet: true, present: false }), VERDICT.PENDING_VIOLATION);
  assert.equal(LOUD.has(VERDICT.PENDING_VIOLATION), true);       // due-and-unmet = loud
});

test("L1 triggers — phase2/phase4 read live observables (off now, armed by the right signals)", () => {
  const offBranch = "sprint4/d3-verification";
  const zero = { flippedCount: 0, gatedGenCount: 0, scpCount: 0 };
  assert.equal(TRIGGERS.phase2({ branch: offBranch, signals: zero }), false);
  assert.equal(TRIGGERS.phase4({ branch: offBranch, signals: zero }), false);
  // armed by a provenance flip (Phase-2) / a gated-generation signal (Phase-4)
  assert.equal(TRIGGERS.phase2({ branch: offBranch, signals: { ...zero, flippedCount: 1 } }), true);
  assert.equal(TRIGGERS.phase4({ branch: offBranch, signals: { ...zero, scpCount: 1 } }), true);
  // or by the working branch naming the phase
  assert.equal(TRIGGERS.phase2({ branch: "sprint4/phase-2-reconcile", signals: zero }), true);
  assert.equal(TRIGGERS.phase4({ branch: "sprint4/block-4-generation", signals: zero }), true);
});

// ───────── LAYER 2 — mutation (test the test) ─────────

test("L2 mutation — a resolveVerdict that ignores the trigger lets a DUE-and-unmet obligation stay quiet", () => {
  const due = { kind: "pending", triggerMet: true, present: false };
  const real = resolveVerdict(due);                              // PENDING_VIOLATION (loud)
  const brokenAlwaysPending = () => VERDICT.PENDING;             // mutation: never escalates
  assert.equal(real, VERDICT.PENDING_VIOLATION);
  assert.equal(LOUD.has(real), true);
  assert.notEqual(real, brokenAlwaysPending());                 // the #40-forgotten failure: broken stays quiet
});

test("L2 mutation — a trigger stuck false hides the obligation forever (degrades PENDING to quiet-forever)", () => {
  const ctxDue = { branch: "sprint4/phase-2-reconcile", signals: { flippedCount: 5, gatedGenCount: 0, scpCount: 0 } };
  const realTrig = TRIGGERS.phase2(ctxDue);                      // true — Phase-2 underway
  const brokenTrig = () => false;                                // mutation: never fires
  assert.equal(realTrig, true);
  // with the real trigger the unmet anchor is loud; with the broken trigger it is quiet
  assert.equal(resolveVerdict({ kind: "pending", triggerMet: realTrig, present: false }), VERDICT.PENDING_VIOLATION);
  assert.equal(resolveVerdict({ kind: "pending", triggerMet: brokenTrig(), present: false }), VERDICT.PENDING);
  assert.notEqual(VERDICT.PENDING_VIOLATION, VERDICT.PENDING);   // trigger is load-bearing
});
