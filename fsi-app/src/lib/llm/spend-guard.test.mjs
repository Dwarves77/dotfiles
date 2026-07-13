// @ts-check
// Negative self-tests for the spend chokepoint's pure guard (operator ruling 2026-07-04; spend-control refactor
// 2026-07-13). Red-then-green on the INTEGRITY gates that remain (ticketless THROWS · deterministically-
// resolvable REJECTED · DELETE-disposition REJECTED · verified/junk REJECTED · unlogged-telemetry invariant)
// AND on the SOLE dollar authorization — the operator-priced line (assertPricedSpend). The retired machine
// limits (monthly ceiling, per-item circuit breaker, standing SPEND_CEILING) are asserted GONE. Pure (no API/DB).

import { test } from "node:test";
import assert from "node:assert/strict";
import { assertTicket, assertBudget, assertPricedSpend, STANDING_TICKET_CLASSES, __resetSpendForTest, __addSpendForTest, account, markCallLogged, unloggedCallCount, assertLedgerDrained, PricedLineError } from "./spend-guard.mjs";

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

test("JUNK-POOL item is REJECTED (remaining failures need content only behind failed-fetch captures)", () => {
  assert.throws(
    () => assertTicket({ purpose: "re-ground junk", itemId: "j1", junkPool: true, provenanceStatus: "quarantined", failureClasses: ["missing_required_slot"], necessity: { rehomableFacts: 0 } }),
    /SPEND_REJECTED[\s\S]*junk-pool[\s\S]*unwinnable until re-collection/,
  );
  // a NON-junk quarantined item with a real generation need still passes
  assert.doesNotThrow(() => assertTicket({ purpose: "re-ground ok", itemId: "ok", junkPool: false, provenanceStatus: "quarantined", failureClasses: ["missing_required_slot"], necessity: { rehomableFacts: 0 } }));
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

// ── assertBudget: the unlogged-telemetry invariant + the OPTIONAL per-ticket (operator-supplied) ledger cap ──
test("PER-TICKET CAP breach THROWS with the running total (operator-supplied budgetCapUsd, not a standing figure)", () => {
  __resetSpendForTest();
  const ticket = { purpose: "big pass", budgetCapUsd: 1.0 };
  assert.doesNotThrow(() => assertBudget(ticket, CEIL)); // $0 spent, under the per-ticket cap
  __addSpendForTest(1.5); // simulate spend past the per-ticket cap
  assert.throws(() => assertBudget(ticket, CEIL), /SPEND_CEILING[\s\S]*1\.5000/);
  __resetSpendForTest();
});

test("RETIRED standing ceiling: a ticket with NO per-ticket cap NEVER halts on a standing figure", () => {
  __resetSpendForTest();
  __addSpendForTest(999); // way past any old standing ceiling
  // no budgetCapUsd → assertBudget's only remaining dollar check (the per-ticket cap) does not apply → no throw
  assert.doesNotThrow(() => assertBudget({ purpose: "no cap" }, CEIL));
  __resetSpendForTest();
});

test("RETIRED exports are removed from the guard surface (no fixed-constant halts)", async () => {
  const g = await import("./spend-guard.mjs");
  for (const gone of ["assertMonthlyCeiling", "MonthlyCeilingError", "itemBreakerTripped", "PER_ITEM_CIRCUIT_BREAKER_USD"]) {
    assert.equal(gone in g, false, `${gone} must be retired`);
  }
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

// ── OPERATOR-PRICED LINE — the sole dollar authorization (goldens a–d, composed through the guard) ──
test("(a) priced spend with NO inventory-miss citation is REFUSED (data-existence-before-acquisition)", () => {
  assert.throws(() => assertPricedSpend(/** @type {any} */ ({ operatorCostUsd: 2.0 }), 0), PricedLineError);
  assert.throws(() => assertPricedSpend(/** @type {any} */ ({ operatorCostUsd: 2.0, inventoryMiss: "" }), 0), /INVENTORY_MISS/);
});

test("(b) priced spend with a citation but NO operator price is REFUSED (machine never defaults a price)", () => {
  const miss = "checked snapshot_store + provisional_sources for src-9; no stored enacted text (miss)";
  assert.throws(() => assertPricedSpend(/** @type {any} */ ({ inventoryMiss: miss }), 0), PricedLineError);
  assert.throws(() => assertPricedSpend(/** @type {any} */ ({ inventoryMiss: miss, operatorCostUsd: 0 }), 0), /NO_COST/);
});

test("(c)+(d) citation + price is PERMITTED up to the price, then HALTS when the item ledger reaches it", () => {
  __resetSpendForTest();
  const line = { operatorCostUsd: 1.0, inventoryMiss: "checked holdings for item-x enacted text; miss" };
  // (c) permitted while the item ledger is under the operator price
  assert.doesNotThrow(() => assertPricedSpend(line, 0));
  account(0.6, 100, 20); markCallLogged();            // item ledger now $0.60 < $1.00
  assert.doesNotThrow(() => assertPricedSpend(line));  // defaults to the live per-item ledger
  // (d) item ledger reaches the operator price → HALT
  account(0.4, 100, 20); markCallLogged();            // item ledger now $1.00 >= $1.00
  assert.throws(() => assertPricedSpend(line), /SPEND_PRICED_LINE_REACHED/);
  __resetSpendForTest();
});
