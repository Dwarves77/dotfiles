// @ts-check
// Negative self-tests for the spend chokepoint (operator ruling 2026-07-04). Red-then-green on the three
// guarantees: a ticketless call THROWS, a deterministically-resolvable item is REJECTED from the paid path,
// and a ceiling breach THROWS. Pure guard logic only (assertTicket / assertBudget) — no real API call.

import { test } from "node:test";
import assert from "node:assert/strict";
import { assertTicket, assertBudget, STANDING_TICKET_CLASSES, __resetSpendForTest, __addSpendForTest } from "./spend-client.ts";
import { SPEND_CEILING_USD } from "../agent/generation-config.ts";

test("TICKETLESS call THROWS (the chokepoint — no untracked spend)", () => {
  assert.throws(() => assertTicket(undefined), /SPEND_TICKET_REQUIRED/);
  assert.throws(() => assertTicket(null), /SPEND_TICKET_REQUIRED/);
  assert.throws(() => assertTicket(/** @type {any} */ ({})), /SPEND_TICKET_REQUIRED/); // no purpose
});

test("DETERMINISTICALLY-RESOLVABLE item is REJECTED from the paid path (necessity gate)", () => {
  // fact_below_authority_floor with an exercisable 4b re-home = a $0 lever unexercised → reject.
  assert.throws(
    () => assertTicket({ purpose: "regen item X", itemId: "x", failureClasses: ["fact_below_authority_floor"], necessity: { rehomableFacts: 3 } }),
    /SPEND_REJECTED[\s\S]*4b-re-home/,
  );
});

test("GENERATION-need item PASSES the necessity gate (no $0 lever)", () => {
  assert.doesNotThrow(() =>
    assertTicket({ purpose: "regen item Y", itemId: "y", failureClasses: ["unlabeled_assertion", "missing_required_slot"], necessity: { rehomableFacts: 0 } }),
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
  assert.doesNotThrow(() => assertBudget(ticket)); // $0 spent, under cap
  __addSpendForTest(1.5); // simulate spend past the per-ticket cap
  assert.throws(() => assertBudget(ticket), /SPEND_CEILING[\s\S]*1\.5000/);
  __resetSpendForTest();
});

test("STANDING CEILING is enforced even when a ticket sets a higher per-call cap", () => {
  __resetSpendForTest();
  __addSpendForTest(SPEND_CEILING_USD + 0.01); // past the standing ceiling
  assert.throws(() => assertBudget({ purpose: "over standing", budgetCapUsd: 1000 }), /SPEND_CEILING/);
  __resetSpendForTest();
});
