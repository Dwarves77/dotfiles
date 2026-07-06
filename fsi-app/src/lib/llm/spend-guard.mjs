// @ts-check
// PURE guard core for the spend chokepoint (operator ruling 2026-07-04). No I/O — so the three guarantees
// (ticketless THROWS, deterministically-resolvable REJECTED, ceiling THROWS) are red-then-green node --test.
// spend-client.ts wraps this with the actual Anthropic API call, model→cost mapping, and the agent_runs
// telemetry write; it passes the ceiling in (so this module stays env-free, rule-017-clean).

import { paidQueueVerdict } from "../agent/deterministic-lever.mjs";

/**
 * @typedef {{ purpose: string, itemId?: string|null, failureClasses?: string[],
 *   necessity?: { rehomableFacts?: number, repointableSpans?: number },
 *   disposition?: string|null, provenanceStatus?: string|null, budgetCapUsd?: number, authorizationRef?: string, standingClass?: string }} SpendTicket
 * disposition — the item's standing disposition; "DELETE" (held dup-loser) is REJECTED from the paid queue.
 * provenanceStatus — the item's live provenance_status; "verified" is REJECTED (no paid re-ground of a
 *   verified item — l1 is the live example: re-grounding a clean item only risks the thinning guard for $0 gain).
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
  // Automatic-telemetry gate: refuse a new spend call while a PRIOR one has no ledger row. This is what makes
  // "a ledger row per call" mechanical rather than caller-remembered — you cannot spend again until the last
  // spend was written.
  if (unloggedCalls > 0) {
    throw new SpendError(`SPEND_LEDGER_UNLOGGED: ${unloggedCalls} prior spend call(s) left no agent_runs row — refusing further spend (unlogged spend corrupts the seed + blinds stop conditions).`);
  }
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
  unloggedCalls += 1;                                        // this call now OWES a ledger row (see the invariant)
}

// ── PER-ITEM CIRCUIT BREAKER (operator ruling 2026-07-04, ceiling-correction delta: "unchanged at $3.00") ──
// Distinct from the program ceiling (runningSpentUsd vs SPEND_CEILING) and the batch buffer: this bounds what a
// SINGLE item may cost, measured on the PER-ITEM ledger (reset per item), so one runaway item cannot burn the
// whole headroom. The funded-pass runner resets the item ledger before each item and, after each call, trips
// the breaker on itemLedger.costUsd — stopping THAT item (not the whole pass) so the anomaly is contained and
// surfaced. Pure helper (env-free); the runner owns reset-per-item + the stop action.
export const PER_ITEM_CIRCUIT_BREAKER_USD = 3.0;

/** Has THIS item's accumulated spend reached the per-item breaker? Pure.
 * @param {number} itemSpentUsd  the current item's ledger cost (takeItemLedger().costUsd)
 * @param {number} [breakerUsd]  the per-item breaker (default PER_ITEM_CIRCUIT_BREAKER_USD)
 * @returns {{ tripped: boolean, reason: string }} */
export function itemBreakerTripped(itemSpentUsd, breakerUsd = PER_ITEM_CIRCUIT_BREAKER_USD) {
  const spent = Number(itemSpentUsd) || 0;
  if (spent >= breakerUsd) {
    return { tripped: true, reason: `PER_ITEM_CIRCUIT_BREAKER: this item spent $${spent.toFixed(4)} >= breaker $${breakerUsd.toFixed(2)} — stop this item and surface (runaway containment).` };
  }
  return { tripped: false, reason: `item spend $${spent.toFixed(4)} < breaker $${breakerUsd.toFixed(2)}` };
}
