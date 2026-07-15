// @ts-check
// FUNDED-PASS RUNNER CORE (pure, node-testable) — the sanctioned machine-gated run (operator 2026-07-14).
// The runner (scripts/funded-pass.mjs) wraps these with jiti + DB I/O. Pure here so the HALT paths and BOTH
// lock-disarm paths are red-then-green without the pipeline/DB.

const ACQUIRE_FLAG = "GROUNDING_ACQUIRE_ENABLED";

/**
 * Classify a per-item failure. The operator's rule: an ITEM misbehaving (fetch/floor/ground wall) halts the
 * ITEM and the run continues; the RUN halts only on an unnamed MECHANISM, a gate bypass, or an unticketed
 * paid row. So: an arm/hold-gate error (the mechanism itself failing) OR a clearly-internal bug → 'run_halt';
 * an expected external wall (network / API / floor / ground) → 'named_wall' (hold the item, continue).
 * @param {string} errName
 * @param {string} [message]
 * @returns {'named_wall'|'run_halt'}
 */
export function classifyFailure(errName, message = "") {
  const m = String(message).toLowerCase();
  // The GATE MECHANISM failed (lock did not arm / hold engaged unexpectedly) → run-level halt.
  if (errName === "AcquireLockError" || errName === "FetchHoldError") return "run_halt";
  // Internal bug in the runner/pipeline (not an external wall) → run-level halt (never hide a code defect).
  if (/is not a function|cannot read propert|undefined is not|reading '|null is not|does not exist|violates|constraint|assertion|assert failed|referenceerror|syntaxerror/.test(m)) {
    return "run_halt";
  }
  // Everything else is an expected external/item wall (fetch/network/API/floor/ground/no-source) → hold + continue.
  return "named_wall";
}

/**
 * Run `fn` with the acquire lock armed for the run's lifetime, disarming on BOTH the normal-return path AND
 * the throw/halt path (the operator's "lock returns OFF at run end AND at any run-level halt"). Restores a
 * pre-existing value, otherwise removes the key. Pure over the passed env object.
 * @template T
 * @param {Record<string, string|undefined>} env
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withArmedLock(env, fn) {
  const had = Object.prototype.hasOwnProperty.call(env, ACQUIRE_FLAG);
  const prev = env[ACQUIRE_FLAG];
  env[ACQUIRE_FLAG] = "1";
  try {
    return await fn();
  } finally {
    if (had) env[ACQUIRE_FLAG] = prev;
    else delete env[ACQUIRE_FLAG];
  }
}

/** Is the acquire lock currently armed on this env? */
export function lockArmed(env) {
  return env?.[ACQUIRE_FLAG] === "1";
}

/**
 * HARD divergence check (dry-run + apply): an item whose path contradicts its worklist line goes HELD, run
 * proceeds without it. Returns a reason string, or null when the item is a valid target. NOT a soft risk flag
 * (low fact-match is resolved at run time, not pre-held).
 * @param {{cls:string, deltaUrl?:string|null}} item
 * @param {{provenance_status?:string|null, source_url?:string|null}|null} row
 * @returns {string|null}
 */
export function hardDivergence(item, row) {
  if (!row) return "item not found in DB";
  if (row.provenance_status === "verified") return "already verified (not a quarantined target — the run never mutates verified briefs)";
  // PER-PATH KEYING (portal-guard resynth fix, 2026-07-14): the source_url checks below are ACQUIRE-only. A
  // RESYNTH re-grounds from the HELD pool and NEVER fetches source_url, so a portal/paywall source_url — or even
  // a missing one — is irrelevant to it; guarding it there falsely HELD covers_grounding items whose stored pool
  // is fine (IEA×2, EPA, C376, nashville — the 5 portal-held). ACQUIRE genuinely fetches source_url, so it must
  // be fetchable AND not a SKIP-flagged portal. (The held-pool-first structure + assertFetchAllowed + the
  // holdings-gate are the real fetch safety; this pre-filter only screens the ACQUIRE path.)
  if (item?.cls === "acquire") {
    if (!row.source_url || !/^https?:\/\//.test(String(row.source_url))) return `no fetchable source_url (${row.source_url ?? "null"})`;
    if (/nashville\.gov|support\.usgbc\.org|(?:\/\/|\.)iea\.org|gov\.uk\/guidance|epa\.gov\/greenvehicles\/fast-facts|participate\.melbourne/.test(String(row.source_url))) {
      return `source_url is a SKIP-flagged portal/paywall (${row.source_url})`;
    }
  }
  return null;
}

/**
 * Per-item spend-watch verdict from the item's ledger rows for THIS run window. Returns the run-level halt
 * reason (unticketed paid row) or null. `rows` = agent_runs rows created during the item with cost>0.
 * @param {Array<{cost:number, itemId:string|null, sourceId:string|null}>} rows
 * @param {string} expectItemId
 * @returns {string|null}
 */
export function spendWatchHalt(rows, expectItemId) {
  for (const r of rows) {
    if (Number(r.cost) > 0 && r.itemId == null && r.sourceId == null) {
      return `unticketed paid row ($${Number(r.cost).toFixed(4)}) — attribution-blind spend during ${expectItemId}`;
    }
  }
  return null;
}

/** Runaway-size/cost per-item guard: an item whose single-pass cost exceeds the soft cap is flagged runaway
 *  (held, run continues). Not a run-level halt. */
export const RUNAWAY_ITEM_USD = 3.0;
export function isRunaway(itemCostUsd) {
  return Number(itemCostUsd) > RUNAWAY_ITEM_USD;
}

/** OPERATOR SPEND-BOUND halt ("halt at the bound", 2026-07-14). The run STOPS before starting the next item once
 *  this run's cumulative actuals reach the operator-set $ bound. The bound is a HARD ceiling (checked at loop
 *  top so at most one item's cost overshoots), NOT a target — a lift of the bound removes the halt, it does not
 *  authorize spending up to it. Returns a halt string or null. No bound set (null/<=0) -> no halt (unbounded).
 *  @param {number} cumulativeUsd  this run's total actuals so far
 *  @param {number|null|undefined} boundUsd  the operator-set total $ bound
 *  @returns {string|null} */
export function totalBoundHalt(cumulativeUsd, boundUsd) {
  const bound = Number(boundUsd);
  if (!boundUsd || !(bound > 0)) return null;
  return Number(cumulativeUsd) >= bound
    ? `spend bound reached: run actuals $${(Number(cumulativeUsd) || 0).toFixed(4)} >= operator bound $${bound.toFixed(2)} — halting before the next item (bound is a hard ceiling, not a target)`
    : null;
}

/** AUTHORITATIVE run cumulative for the BOUND check (2026-07-15). Sums cost across EVERY run-window agent_runs
 *  row regardless of attribution — item-attributed, source-only (`item_id` null / `source_id` set), or fully
 *  unattributed. The per-item `itemLedger` sum used for the gain/runaway tripwires counts only item-attributed
 *  rows, so a source-only paid row (a ground/classify call not tied to an item) escaped the bound silently:
 *  `spendWatchHalt` only halts a row that is BOTH item- AND source-null, so an `item_id`-null / `source_id`-set
 *  row was neither halted nor counted. Gating the bound on this sum (over `started_at >= runStart`) makes the
 *  ceiling read the exact number the DB shows at close, so it can never be reconstructed below the DB total.
 *  Accepts either the pure `{cost}` shape or the raw DB `{cost_usd_estimated}` row; coerces + defaults to 0.
 *  @param {Array<{cost?:number|string, cost_usd_estimated?:number|string}>|null|undefined} rows
 *  @returns {number} */
export function authoritativeCumulative(rows) {
  return (rows || []).reduce((a, r) => a + (Number(r?.cost ?? r?.cost_usd_estimated ?? 0) || 0), 0);
}
