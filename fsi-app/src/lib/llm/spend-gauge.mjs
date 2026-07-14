// @ts-check
// SPEND GAUGE (Phase 2, snapshot-first rebuild; spend-control refactor 2026-07-13). A FREE, read-only status
// view of the spend ledger — the thing that "already held all of this; it just was never read."
//
// SPEND-CONTROL REFACTOR: the gauge no longer frames spend against a machine limit. Per the operator's final
// rulings there are NO standing dollar figures as limits, so there is NO "of $N" denominator, NO pct-of-ceiling,
// and NO frozen / at-cap threshold here. The gauge reports MTD (and today, and per-item) actuals as pure
// INFORMATION, plus paid-run TRACEABILITY coverage: how many paid runs trace to an operator-priced line. It
// NEVER gates or halts — the only halt is the operator-priced line (priced-line.mjs / assertPricedSpend).
//
// It NEVER spends. It reads agent_runs.cost_usd_estimated — the same ledger everything else reads.

/**
 * @typedef {{
 *   monthSpentUsd: number,
 *   todaySpentUsd: number,
 *   itemSpentUsd?: number,
 *   paidRuns?: number, tracedPaidRuns?: number,
 * }} GaugeInput
 */

/** Round to cents for display without lying about the underlying float. @param {number} n */
function usd(n) { return `$${(Number(n) || 0).toFixed(2)}`; }

/**
 * Pure gauge. No I/O, no env, NO limit. Returns MTD/today/item actuals as information + a one-line human header.
 * @param {GaugeInput} input
 * @returns {{
 *   month: { spentUsd: number },
 *   day: { spentUsd: number },
 *   item: { spentUsd: number } | null,
 *   trace: { paidRuns: number, tracedPaidRuns: number, untracedPaidRuns: number, clean: boolean },
 *   header: string,
 * }}
 */
export function computeGauge(input) {
  const monthSpentUsd = Number(input.monthSpentUsd) || 0;
  const todaySpentUsd = Number(input.todaySpentUsd) || 0;

  const item = input.itemSpentUsd === undefined
    ? null
    : { spentUsd: Number(input.itemSpentUsd) || 0 };

  const paidRuns = Number(input.paidRuns) || 0;
  const tracedPaidRuns = Number(input.tracedPaidRuns) || 0;
  const untracedPaidRuns = Math.max(0, paidRuns - tracedPaidRuns);
  const trace = {
    paidRuns,
    tracedPaidRuns,
    untracedPaidRuns,
    clean: untracedPaidRuns === 0,
  };

  const traceTag = trace.clean
    ? `${tracedPaidRuns}/${paidRuns} traced to a priced line`
    : `⚠ ${untracedPaidRuns} UNTRACED paid run(s)`;
  const itemTag = item ? ` · item ${usd(item.spentUsd)}` : "";
  const header =
    `SPEND GAUGE — MTD ${usd(monthSpentUsd)} (actual, informational) · ` +
    `today ${usd(todaySpentUsd)}${itemTag} · paid-run ${traceTag}`;

  return { month: { spentUsd: monthSpentUsd }, day: { spentUsd: todaySpentUsd }, item, trace, header };
}

/**
 * FREE async reader. Sums this UTC month + today from agent_runs and counts how many paid runs trace to an
 * operator-priced line marker, then returns computeGauge(...). Injects the supabase client + clock so it stays
 * testable and env-light. NO ceilings/caps are read — the gauge carries no limit.
 * @param {import("@supabase/supabase-js").SupabaseClient} svc
 * @param {{ nowMs?: number }} [opts]
 */
export async function readSpendGauge(svc, opts = {}) {
  const now = opts.nowMs ? new Date(opts.nowMs) : new Date();
  const monthStartIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const dayStartIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();

  const { data, error } = await svc
    .from("agent_runs")
    .select("cost_usd_estimated, started_at, fetch_method, errors")
    .gte("started_at", monthStartIso);
  if (error) throw new Error(`spend-gauge read failed: ${error.message}`);

  const rows = data ?? [];
  let monthSpentUsd = 0;
  let todaySpentUsd = 0;
  let paidRuns = 0;
  let tracedPaidRuns = 0;
  for (const r of rows) {
    const cost = Number(r.cost_usd_estimated) || 0;
    monthSpentUsd += cost;
    if (String(r.started_at) >= dayStartIso) todaySpentUsd += cost;
    if (cost > 0) {
      paidRuns += 1;
      if (hasPricedLineMarker(r)) tracedPaidRuns += 1;
    }
  }
  return computeGauge({ monthSpentUsd, todaySpentUsd, paidRuns, tracedPaidRuns });
}

/** Does an agent_runs row carry an operator-priced-line marker (traceable spend)? Pure, defensive.
 *  A marker is fetch_method==='priced-line' OR an errors[] entry with a truthy `pricedLine`. @param {any} row */
export function hasPricedLineMarker(row) {
  if (row && row.fetch_method === "priced-line") return true;
  const errors = row && row.errors;
  if (!Array.isArray(errors)) return false;
  return errors.some((e) => e && typeof e === "object" && "pricedLine" in e && Boolean(/** @type {any} */ (e).pricedLine));
}
