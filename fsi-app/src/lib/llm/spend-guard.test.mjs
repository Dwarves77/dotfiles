// @ts-check
// Negative self-tests for the spend chokepoint's pure guard (operator ruling 2026-07-04). Red-then-green on
// the four guarantees: ticketless THROWS · deterministically-resolvable REJECTED · DELETE-disposition
// REJECTED · ceiling THROWS. Pure (no API/DB).

import { test } from "node:test";
import assert from "node:assert/strict";
import { assertTicket, assertBudget, STANDING_TICKET_CLASSES, __resetSpendForTest, __addSpendForTest } from "./spend-guard.mjs";

const CEIL = 10;

test("TICKETLESS call THROWS (the chokepoint — no untracked spend)", () => {
  assert.throws(() => assertTicket(undefined), /SPEND_TICKET_REQUIRED/);
  assert.throws(() => assertTicket(null), /SPEND_TICKET_REQUIRED/);
  assert.throws(() => assertTicket(/** @type {any} */ ({})), /SPEND_TICKET_REQUIRED/); // no purpose
});

test("DETERMINISTICALLY-RESOLVABLE item is REJECTED from the paid path (necessity gate)", () => {
  assert.throws(
    () => assertTicket({ purpose: "regen X", itemId: "x", failureClasses: ["fact_below_authority_floor"], necessity: { rehomableFacts: 3 } }),
    /SPEND_REJECTED[\s\S]*4b-re-home/,
  );
});

test("DELETE-disposition item is REJECTED (held dup-loser, never pay to regenerate)", () => {
  assert.throws(
    () => assertTicket({ purpose: "regen loser", itemId: "d5ee6ab8", disposition: "DELETE", failureClasses: ["missing_required_slot"], necessity: { rehomableFacts: 0 } }),
    /SPEND_REJECTED[\s\S]*disposition is DELETE/,
  );
  // even with NO failure evidence, DELETE alone rejects
  assert.throws(() => assertTicket({ purpose: "regen loser", itemId: "9c5d1d17", disposition: "delete" }), /disposition is DELETE/);
});

test("GENERATION-need item PASSES the necessity gate (no $0 lever, not DELETE)", () => {
  assert.doesNotThrow(() =>
    assertTicket({ purpose: "regen Y", itemId: "y", failureClasses: ["unlabeled_assertion", "missing_required_slot"], necessity: { rehomableFacts: 0 } }),
  );
});

test("STANDING CLASS bypasses the necessity gate but must be in the Rule 016 set", () => {
  assert.doesNotThrow(() => assertTicket({ purpose: "classify a source", standingClass: "recommend-classification" }));
  assert.throws(() => assertTicket({ purpose: "sneaky", standingClass: "not-a-real-class" }), /unknown standing class/);
  assert.ok(STANDING_TICKET_CLASSES.has("first-fetch-classify"));
});

test("CEILING breach THROWS with the running total", () => {
  __resetSpendForTest();
  const ticket = { purpose: "big pass", budgetCapUsd: 1.0 };
  assert.doesNotThrow(() => assertBudget(ticket, CEIL)); // $0 spent, under cap
  __addSpendForTest(1.5); // simulate spend past the per-ticket cap
  assert.throws(() => assertBudget(ticket, CEIL), /SPEND_CEILING[\s\S]*1\.5000/);
  __resetSpendForTest();
});

test("STANDING CEILING is enforced even when a ticket sets a higher per-call cap", () => {
  __resetSpendForTest();
  __addSpendForTest(CEIL + 0.01); // past the standing ceiling
  assert.throws(() => assertBudget({ purpose: "over standing", budgetCapUsd: 1000 }, CEIL), /SPEND_CEILING/);
  __resetSpendForTest();
});
