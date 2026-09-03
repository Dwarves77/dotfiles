// grid-queue.mjs — spec 09 §1.6's electrification feasibility GATE. "Grid queue becomes a gate, not a
// cost line. A region with cheap power and a 36-month queue is BLOCKED for a 2027 electrification
// decision regardless of €/kWh, and no amount of cheap electricity un-blocks it." No fs, no I/O.

import { labelled, missing } from "./label.mjs";

/**
 * Feasibility gate for an electrification decision by a stated horizon. `horizonMonths` is the caller's
 * OWN decision horizon (e.g. months until a target 2027 date), never invented here — this function is a
 * pure comparison, not a source of the deadline. Uses queue_months_p90 (the worse case) by DESIGN: a gate
 * decision that only checked p50 would call a coin-flip queue "clear" half the time it is not, and a gate
 * is exactly the place a caller cannot afford that — BESS payback (spec text's own paired mitigation) is
 * the place a p50/typical-case number belongs, not this gate.
 *
 * Returns 'BLOCKED' | 'CLEAR' | 'UNKNOWN' (queue_months_p90 absent — never defaults to CLEAR on missing
 * data, which would silently un-gate a decision spec text says must stay gated).
 */
export function evaluateGridQueueGate({ queueMonthsP90, horizonMonths }) {
  if (typeof horizonMonths !== "number" || !Number.isFinite(horizonMonths) || horizonMonths < 0) {
    return missing("horizonMonths (the caller's own decision horizon) must be a non-negative finite number.");
  }
  if (queueMonthsP90 === null || queueMonthsP90 === undefined) {
    return labelled("UNKNOWN", "calculated", {
      status: "UNKNOWN",
      reason: "no queue_months_p90 on file for this DSO/capacity band — never treated as CLEAR (spec 09 §1.6: a gate, not a cost line).",
    });
  }
  if (typeof queueMonthsP90 !== "number" || !Number.isFinite(queueMonthsP90) || queueMonthsP90 < 0) {
    return missing("queueMonthsP90 must be a non-negative finite number when present.");
  }
  const status = queueMonthsP90 > horizonMonths ? "BLOCKED" : "CLEAR";
  return labelled(status, "calculated", {
    status,
    queueMonthsP90,
    horizonMonths,
    note: status === "BLOCKED"
      ? `the p90 connection queue (${queueMonthsP90} mo) exceeds the ${horizonMonths}-month decision horizon — BLOCKED regardless of €/kWh.`
      : `the p90 connection queue (${queueMonthsP90} mo) clears the ${horizonMonths}-month decision horizon.`,
  });
}
