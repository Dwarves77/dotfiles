// @ts-check
// Negative self-tests for the spend chokepoint's pure guard (operator ruling 2026-07-04). Red-then-green on
// the four guarantees: ticketless THROWS · deterministically-resolvable REJECTED · DELETE-disposition
// REJECTED · ceiling THROWS. Pure (no API/DB).

import { test } from "node:test";
import assert from "node:assert/strict";
import { assertTicket, assertBudget, STANDING_TICKET_CLASSES, __resetSpendForTest, __addSpendForTest, itemBreakerTripped, PER_ITEM_CIRCUIT_BREAKER_USD, account, markCallLogged, unloggedCallCount, assertLedgerDrained } from "./spend-guard.mjs";

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

test("VERIFIED item is REJECTED from any paid re-ground queue (the l1 class — never pay to re-ground a clean item)", () => {
  assert.throws(
    () => assertTicket({ purpose: "re-ground l1", itemId: "l1", provenanceStatus: "verified", failureClasses: [], necessity: { rehomableFacts: 0 } }),
    /SPEND_REJECTED[\s\S]*already provenance_status=verified/,
  );
  // case-insensitive; a non-verified status does not trip this gate
  assert.throws(() => assertTicket({ purpose: "re-ground", provenanceStatus: "VERIFIED" }), /already provenance_status=verified/);
  assert.doesNotThrow(() => assertTicket({ purpose: "re-ground q", provenanceStatus: "quarantined", failureClasses: ["missing_required_slot"], necessity: { rehomableFacts: 0 } }));
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

test("AUTOMATIC TELEMETRY: an accounted spend that leaves NO ledger row is RED (unlogged spend impossible)", () => {
  __resetSpendForTest();
  const ticket = { purpose: "judge call" };
  // RED: account() a call but never markCallLogged() → the NEXT assertBudget refuses (prior call unlogged),
  // and the close-out assertion throws. This is the $0.41-unmetered class made mechanically impossible.
  account(0.0014, 300, 40);
  assert.equal(unloggedCallCount(), 1);
  assert.throws(() => assertBudget(ticket, 85), /SPEND_LEDGER_UNLOGGED/);
  assert.throws(() => assertLedgerDrained(), /SPEND_LEDGER_UNLOGGED/);
  // GREEN: the spend client marks it logged AFTER writing the agent_runs row → next spend allowed, drained.
  markCallLogged();
  assert.equal(unloggedCallCount(), 0);
  assert.doesNotThrow(() => assertBudget(ticket, 85));
  assert.doesNotThrow(() => assertLedgerDrained());
  __resetSpendForTest();
});

test("PER-ITEM CIRCUIT BREAKER trips on a single item's spend at $3.00 (ceiling-correction delta)", () => {
  assert.equal(PER_ITEM_CIRCUIT_BREAKER_USD, 3.0);
  // ground-only ≈ $1/item measured — well under the breaker; a normal item does NOT trip.
  assert.equal(itemBreakerTripped(0.98).tripped, false);
  assert.equal(itemBreakerTripped(2.99).tripped, false);
  // a runaway item at/over $3.00 trips → stop THIS item and surface (not the whole pass).
  const trip = itemBreakerTripped(3.0);
  assert.equal(trip.tripped, true);
  assert.match(trip.reason, /PER_ITEM_CIRCUIT_BREAKER/);
  assert.equal(itemBreakerTripped(4.25).tripped, true);
});
