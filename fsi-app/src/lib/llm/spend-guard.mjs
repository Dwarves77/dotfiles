// @ts-check
// PURE guard core for the spend chokepoint (operator ruling 2026-07-04; spend-control refactor 2026-07-13).
// No I/O — so the guarantees are red-then-green node --test. spend-client.ts wraps this with the actual
// Anthropic API call, model→cost mapping, and the agent_runs telemetry write.
//
// SPEND-CONTROL REFACTOR (operator final rulings 2026-07-13): the fixed-constant HALTS are RETIRED — there is
// no monthly ceiling, no per-item circuit breaker, and no standing SPEND_CEILING comparison here anymore. The
// SOLE dollar authorization is the operator-priced line (priced-line.mjs): a spend must carry a line with an
// operator-set cost + an inventory-miss citation, and it halts per pricedLineHalts. The INTEGRITY gates
// (ticket-required, verified-item, junk-pool, deterministic-$0-lever rejection, and the unlogged-telemetry
// invariant) are NOT dollar limits and REMAIN. assertBudget survives ONLY as the unlogged-telemetry invariant
// plus an optional per-ticket (operator-supplied) ledger cap — it no longer enforces any standing machine figure.

import { paidQueueVerdict } from "../agent/deterministic-lever.mjs";
import { assertPricedLine, pricedLineHalts, PricedLineError } from "./priced-line.mjs";

// Re-export the operator-priced-line gate so the spend client + callers import the whole guard surface from here.
export { assertPricedLine, pricedLineHalts, PricedLineError } from "./priced-line.mjs";

/**
 * @typedef {{ purpose: string, itemId?: string|null, sourceId?: string|null, failureClasses?: string[],
 *   necessity?: { rehomableFacts?: number, repointableSpans?: number },
 *   disposition?: string|null, provenanceStatus?: string|null, junkPool?: boolean, budgetCapUsd?: number, authorizationRef?: string, standingClass?: string,
 *   pricedLine?: { operatorCostUsd: number, inventoryMiss: string, toleranceUsd?: number } }} SpendTicket
 * pricedLine — the OPERATOR-PRICED LINE authorizing this spend (operator-set cost + inventory-miss citation).
 *   When present, the spend client composes assertPricedSpend so the item halts at the operator's per-line price.
 * sourceId — the canonical source the spend is attributed to; written to agent_runs.source_id so a paid row is
 *   never both item- AND source-anonymous (invariant I1 — the $65.36 July attribution hole). At least one of
 *   itemId / sourceId MUST be set on any ticket that will spend.
 * disposition — the item's standing disposition; "DELETE" (held dup-loser) is REJECTED from the paid queue.
 * provenanceStatus — the item's live provenance_status; "verified" is REJECTED (no paid re-ground of a
 *   verified item — l1 is the live example: re-grounding a clean item only risks the thinning guard for $0 gain).
 * junkPool — true when the item's remaining failure classes can only be satisfied by content that exists ONLY
 *   behind failed-fetch captures (bot wall / 403 / 404 / nav shell). REJECTED: paying to re-ground an unwinnable
 *   junk pool is deterministic-first waste; the item is event-bound to re-collection at hold-lift.
 */

/** Rule 016 permitted always-cheap classifiers — named, not exempted. Each still counts against the budget. */
export const STANDING_TICKET_CLASSES = new Set([
  "first-fetch-classify",
  "recommend-classification",
  "canonical-recommend-classification",
  "bulk-classify",
  "spot-check-recurring",
  "source-discovery",
]);

export class SpendError extends Error {
  /** @param {string} msg */
  constructor(msg) { super(msg); this.name = "SpendError"; }
}

// RETIRED (spend-control refactor 2026-07-13): MonthlyCeilingError / assertMonthlyCeiling. The monthly ceiling
// was a STANDING DOLLAR FIGURE used as a hard stop — the operator's final rulings forbid any such machine limit.
// Spend is now authorized ONLY by an operator-priced line (assertPricedSpend below). A monthly-total figure may
// still be READ for informational display, but it MUST NOT gate/halt spend, so no ceiling guard lives here.

// ── budget state (per process) ──
let runningSpentUsd = 0;                                    // program-total ledger accumulator (never reset)
let itemLedger = { inputTokens: 0, outputTokens: 0, calls: 0, costUsd: 0 };

// ── AUTOMATIC-TELEMETRY INVARIANT (operator ruling 2026-07-06, dispatch item 1). Every account()ed spend call
// MUST leave a ledger row. account() increments unloggedCalls; the spend client decrements it via
// markCallLogged() ONLY after the agent_runs row is written. assertBudget (run before EVERY spend call) THROWS
// if a prior call went unlogged, and assertLedgerDrained() catches the final one at close-out. RATIONALE ON
// RECORD: $0.41 of 4c judge spend ran UNMETERED — unlogged spend corrupts every future seed (the ceiling
// derives from the agent_runs SUM) and stop conditions cannot fire on spend they never see. This makes an
// unlogged spend mechanically IMPOSSIBLE (the next call throws; the last is asserted). ──
let unloggedCalls = 0;

export function spentUsd() { return runningSpentUsd; }
/** The spend client calls this AFTER the per-call agent_runs row is written — never the caller. */
export function markCallLogged() { if (unloggedCalls > 0) unloggedCalls -= 1; }
/** Count of account()ed calls not yet confirmed logged (a telemetry gap when > 0). */
export function unloggedCallCount() { return unloggedCalls; }
/** Close-out assertion: THROWS if any accounted spend never got a ledger row. */
export function assertLedgerDrained() {
  if (unloggedCalls > 0) throw new SpendError(`SPEND_LEDGER_UNLOGGED: ${unloggedCalls} accounted spend call(s) left no agent_runs row — unlogged spend corrupts the seeded ceiling and blinds the stop conditions.`);
}
/** Seed the standing-ceiling accumulator with the PROGRAM total (from a paginated agent_runs read) at process
 *  start, so the per-process ceiling accounts for prior spend ("program total ≤ cap", not per-process). The
 *  runner MUST call this before the first paid call; a fresh process otherwise starts at $0. @param {number} usd */
export function seedSpend(usd) { runningSpentUsd = Number(usd) || 0; }
export function resetItemLedger() { itemLedger = { inputTokens: 0, outputTokens: 0, calls: 0, costUsd: 0 }; }
export function takeItemLedger() { return { ...itemLedger }; }
export function __resetSpendForTest() { runningSpentUsd = 0; resetItemLedger(); unloggedCalls = 0; }
/** @param {number} usd */
export function __addSpendForTest(usd) { runningSpentUsd += usd; }

/**
 * Validate the ticket + necessity gate. THROWS on a ticketless or fully-$0-resolvable call.
 * @param {SpendTicket | null | undefined} ticket
 */
export function assertTicket(ticket) {
  if (!ticket || typeof ticket !== "object" || !ticket.purpose) {
    throw new SpendError("SPEND_TICKET_REQUIRED: every model call needs a SpendTicket { purpose, … }. Ticketless spend is forbidden (the chokepoint).");
  }
  if (ticket.standingClass) {
    if (!STANDING_TICKET_CLASSES.has(ticket.standingClass)) {
      throw new SpendError(`SPEND_TICKET_INVALID: unknown standing class "${ticket.standingClass}" (not in the Rule 016 permitted set).`);
    }
    return; // sanctioned cheap classifier — bypasses the necessity gate (still budget-checked separately)
  }
  // VERIFIED-ITEM gate: an already-verified item is mechanically rejected from any paid re-ground queue (no $0
  // gain, and re-extraction only risks the thinning guard). This is the l1 class — a clean item never pays.
  if (String(ticket.provenanceStatus || "").toLowerCase() === "verified") {
    throw new SpendError(`SPEND_REJECTED (${ticket.itemId ?? "?"}): item is already provenance_status=verified — no paid re-ground of a verified item (mechanical necessity gate).`);
  }
  // JUNK-POOL gate (2026-07-06): the item's remaining failures can only be satisfied by content behind failed-
  // fetch captures — re-grounding an unwinnable junk pool is deterministic-first waste. Event-bound to re-collect.
  if (ticket.junkPool === true) {
    throw new SpendError(`SPEND_REJECTED (${ticket.itemId ?? "?"}): junk-pool — the item's remaining failure classes can only be satisfied by content behind failed-fetch captures (bot wall / 403 / 404 / nav shell); paid re-ground is unwinnable until re-collection at hold-lift.`);
  }
  // necessity gate: DELETE-disposition items are rejected even with no failure-class evidence supplied.
  const verdict = paidQueueVerdict(ticket.failureClasses ?? [], ticket.necessity ?? {}, ticket.disposition);
  if (!verdict.eligible) throw new SpendError(`SPEND_REJECTED (${ticket.itemId ?? "?"}): ${verdict.reason}`);
}

/**
 * LEDGER-INTEGRITY guard run BEFORE a call. Two responsibilities, NEITHER a standing dollar limit:
 *  1. Unlogged-telemetry invariant — refuse a new spend while a PRIOR call left no ledger row (so "a ledger row
 *     per call" is mechanical, not caller-remembered). This is integrity, not a dollar cap.
 *  2. Optional per-ticket ledger cap — if (and only if) the ticket carries an operator-supplied `budgetCapUsd`,
 *     THROW when the program-total ledger already meets it. This is a per-invocation operator figure (e.g. the
 *     program-total pagination gate seeds the true total then caps that pass), NOT a standing machine ceiling.
 * The retired standing SPEND_CEILING comparison is GONE: the `standingCeilingUsd` parameter is accepted for
 * signature stability but is NO LONGER used as a limit. Dollar authorization lives in assertPricedSpend.
 * @param {SpendTicket} ticket
 * @param {number} [standingCeilingUsd]  accepted for back-compat; informational only, never gates
 */
export function assertBudget(ticket, standingCeilingUsd) {
  if (unloggedCalls > 0) {
    throw new SpendError(`SPEND_LEDGER_UNLOGGED: ${unloggedCalls} prior spend call(s) left no agent_runs row — refusing further spend (unlogged spend corrupts the seed + blinds stop conditions).`);
  }
  const cap = ticket && ticket.budgetCapUsd;
  if (typeof cap === "number" && Number.isFinite(cap) && runningSpentUsd >= cap) {
    throw new SpendError(`SPEND_CEILING: program-total ledger $${runningSpentUsd.toFixed(4)} has reached the per-ticket cap $${cap.toFixed(2)} (ticket "${ticket.purpose}").`);
  }
  void standingCeilingUsd; // retired as a limit — no standing-ceiling comparison
}

/**
 * DOLLAR AUTHORIZATION (the sole spend gate). A spend must carry an operator-priced line. Composes
 * assertPricedLine (THROWS PricedLineError without an operator-set cost + inventory-miss citation) then halts
 * per pricedLineHalts against the item's ledger. THROWS SpendError when the item's spend has reached the
 * operator's per-line price (+ optional operator tolerance). No standing/monthly/per-item machine figure.
 * @param {{ operatorCostUsd: number, inventoryMiss: string, toleranceUsd?: number }} line
 * @param {number} [itemSpentUsd]  the item's ledger cost so far (defaults to the live per-item ledger)
 */
export function assertPricedSpend(line, itemSpentUsd = itemLedger.costUsd) {
  assertPricedLine(line); // no operator cost OR no inventory-miss citation → PricedLineError (refuse)
  if (pricedLineHalts(itemSpentUsd, line)) {
    const halt = Number(line.operatorCostUsd) + Number(line.toleranceUsd ?? 0);
    throw new SpendError(`SPEND_PRICED_LINE_REACHED: this item spent $${(Number(itemSpentUsd) || 0).toFixed(4)} >= operator-priced line $${halt.toFixed(2)} — stop this item; the operator's per-line price is the sole spend authority (no standing ceiling raises it).`);
  }
}

/** Record a completed call's cost into the running total + the per-item ledger.
 * @param {number} cost @param {number} inputTokens @param {number} outputTokens */
export function account(cost, inputTokens, outputTokens) {
  runningSpentUsd += cost;
  itemLedger.inputTokens += inputTokens || 0;
  itemLedger.outputTokens += outputTokens || 0;
  itemLedger.calls += 1;
  itemLedger.costUsd += cost;
  unloggedCalls += 1;                                        // this call now OWES a ledger row (see the invariant)
}

// RETIRED (spend-control refactor 2026-07-13): PER_ITEM_CIRCUIT_BREAKER_USD / itemBreakerTripped. The fixed
// $3.00 per-item breaker was a STANDING DOLLAR FIGURE used as a hard stop — forbidden by the operator's final
// rulings. Per-item containment is now the operator-priced line: pricedLineHalts(itemSpentUsd, line) halts at
// the operator's per-line price (see assertPricedSpend). There is no machine-set breaker constant.
