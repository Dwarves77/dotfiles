// @ts-check
// PURE guard core for the spend chokepoint (operator ruling 2026-07-04). No I/O — so the three guarantees
// (ticketless THROWS, deterministically-resolvable REJECTED, ceiling THROWS) are red-then-green node --test.
// spend-client.ts wraps this with the actual Anthropic API call, model→cost mapping, and the agent_runs
// telemetry write; it passes the ceiling in (so this module stays env-free, rule-017-clean).

import { paidQueueVerdict } from "../agent/deterministic-lever.mjs";

/**
 * @typedef {{ purpose: string, itemId?: string|null, failureClasses?: string[],
 *   necessity?: { rehomableFacts?: number, repointableSpans?: number },
 *   disposition?: string|null, budgetCapUsd?: number, authorizationRef?: string, standingClass?: string }} SpendTicket
 * disposition — the item's standing disposition; "DELETE" (held dup-loser) is REJECTED from the paid queue.
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

// ── budget state (per process) ──
let runningSpentUsd = 0;                                    // standing-ceiling accumulator (never reset)
let itemLedger = { inputTokens: 0, outputTokens: 0, calls: 0, costUsd: 0 };

export function spentUsd() { return runningSpentUsd; }
export function resetItemLedger() { itemLedger = { inputTokens: 0, outputTokens: 0, calls: 0, costUsd: 0 }; }
export function takeItemLedger() { return { ...itemLedger }; }
export function __resetSpendForTest() { runningSpentUsd = 0; resetItemLedger(); }
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
  // necessity gate: DELETE-disposition items are rejected even with no failure-class evidence supplied.
  const verdict = paidQueueVerdict(ticket.failureClasses ?? [], ticket.necessity ?? {}, ticket.disposition);
  if (!verdict.eligible) throw new SpendError(`SPEND_REJECTED (${ticket.itemId ?? "?"}): ${verdict.reason}`);
}

/**
 * Enforce the budget BEFORE a call: if the running total already meets the per-ticket cap OR the standing
 * ceiling, THROW with the running total. The caller passes the standing ceiling (env-free here).
 * @param {SpendTicket} ticket
 * @param {number} standingCeilingUsd
 */
export function assertBudget(ticket, standingCeilingUsd) {
  const cap = ticket.budgetCapUsd ?? standingCeilingUsd;
  if (runningSpentUsd >= cap) {
    throw new SpendError(`SPEND_CEILING: running total $${runningSpentUsd.toFixed(4)} has reached the cap $${cap.toFixed(2)} (ticket "${ticket.purpose}"). No further spend without a fresh ceiling.`);
  }
  if (runningSpentUsd >= standingCeilingUsd) {
    throw new SpendError(`SPEND_CEILING(standing): running total $${runningSpentUsd.toFixed(4)} >= standing ceiling $${standingCeilingUsd.toFixed(2)}.`);
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
}
