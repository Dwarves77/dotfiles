// @ts-check
/**
 * @typedef {{ operatorCostUsd: number, inventoryMiss: string, toleranceUsd?: number }} PricedLine
 * operatorCostUsd — the operator's per-line price. The ONLY spend authority. Must be an operator-set positive
 *   finite number; there is NO default (a missing/zero/negative/non-finite/non-number value is REFUSED).
 * inventoryMiss   — the data-existence citation: what was checked in holdings + the specific miss. Non-empty.
 * toleranceUsd    — OPTIONAL operator-set slack above the price before the halt fires. NO default (absent = 0).
 */

export class PricedLineError extends Error {
  /** @param {string} msg */
  constructor(msg) { super(msg); this.name = "PricedLineError"; }
}

/**
 * Assert an operator-priced line. THROWS PricedLineError when there is no operator-set positive finite cost
 * (NO default price), or when the inventory-miss citation is missing/empty. Returns the validated line so it
 * can be used inline. Pure, env-free.
 * @param {PricedLine | null | undefined} line
 * @returns {PricedLine}
 */
export function assertPricedLine(line) {
  if (!line || typeof line !== "object") {
    throw new PricedLineError(
      "PRICED_LINE_REQUIRED: a spend needs an operator-priced line { operatorCostUsd, inventoryMiss } — " +
      "the machine never proposes/defaults a price; spend authority is solely the operator's per-line cost.",
    );
  }
  const cost = /** @type {any} */ (line).operatorCostUsd;
  if (typeof cost !== "number" || !Number.isFinite(cost) || cost <= 0) {
    throw new PricedLineError(
      `PRICED_LINE_NO_COST: operatorCostUsd must be an operator-set positive finite number (got ${JSON.stringify(cost)}). ` +
      "The machine never defaults or anchors a price — nothing runs without an operator-set cost.",
    );
  }
  const miss = /** @type {any} */ (line).inventoryMiss;
  if (typeof miss !== "string" || miss.trim() === "") {
    throw new PricedLineError(
      "PRICED_LINE_NO_INVENTORY_MISS: the paid path requires a non-empty inventory-miss citation naming what " +
      "was checked in holdings and the specific miss (data-existence-before-acquisition).",
    );
  }
  const tol = /** @type {any} */ (line).toleranceUsd;
  if (tol !== undefined && (typeof tol !== "number" || !Number.isFinite(tol) || tol < 0)) {
    throw new PricedLineError(
      `PRICED_LINE_BAD_TOLERANCE: toleranceUsd, when supplied, must be a non-negative finite number (got ${JSON.stringify(tol)}). ` +
      "There is no default tolerance.",
    );
  }
  return /** @type {PricedLine} */ (line);
}

/**
 * Has this item's spend reached the operator-priced line (plus its optional operator-set tolerance)? Returns
 * true = HALT. There is NO default tolerance (absent = 0). Pure; caller validates the line via assertPricedLine.
 * @param {number} itemSpentUsd  the current item's ledger cost
 * @param {{ operatorCostUsd: number, toleranceUsd?: number }} line
 * @returns {boolean}
 */
export function pricedLineHalts(itemSpentUsd, line) {
  const spent = Number(itemSpentUsd);
  const price = Number(line?.operatorCostUsd);
  const tolerance = Number(line?.toleranceUsd ?? 0);
  return spent >= price + tolerance;
}
