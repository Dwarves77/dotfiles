// @ts-check
// SPEND GAUGE (Phase 2, operator ruling 2026-07-13, snapshot-first rebuild). A FREE, read-only status view of
// the spend ledger — the thing that "already held all of this; it just was never read." The pure core
// (computeGauge) takes plain numbers so the thresholds are red-then-green node-testable and env-free; the async
// reader (readSpendGauge) sums agent_runs for the current UTC month + day and counts paid-run justification
// coverage. computeGauge returns a structured status AND a one-line header string that is MANDATORY at the top
// of every window/grounding report (so spend is never again invisible while a runner burns the month).
//
// It NEVER spends. It reads agent_runs.cost_usd_estimated — the same ledger the monthly ceiling + daily cap read.

/**
 * @typedef {{
 *   monthSpentUsd: number, monthlyCeilingUsd: number,
 *   todaySpentUsd: number, dailyCapUsd: number,
 *   itemSpentUsd?: number, perItemBreakerUsd?: number,
 *   paidRuns?: number, justifiedPaidRuns?: number,
 * }} GaugeInput
 */

/** Round to cents for display without lying about the underlying float. @param {number} n */
function usd(n) { return `$${(Number(n) || 0).toFixed(2)}`; }
/** @param {number} num @param {number} den */
function pct(num, den) { return den > 0 ? Math.round((num / den) * 100) : 0; }

/**
 * Pure gauge. No I/O, no env. Returns the machine-readable status + a one-line human header.
 * @param {GaugeInput} input
 * @returns {{
 *   month: { spentUsd: number, ceilingUsd: number, pct: number, frozen: boolean, remainingUsd: number },
 *   day: { spentUsd: number, capUsd: number, pct: number, atCap: boolean, remainingUsd: number },
 *   item: { spentUsd: number, breakerUsd: number, tripped: boolean } | null,
 *   justification: { paidRuns: number, justifiedPaidRuns: number, unjustifiedPaidRuns: number, clean: boolean },
 *   header: string,
 * }}
 */
export function computeGauge(input) {
  const monthSpentUsd = Number(input.monthSpentUsd) || 0;
  const monthlyCeilingUsd = Number(input.monthlyCeilingUsd) || 0;
  const todaySpentUsd = Number(input.todaySpentUsd) || 0;
  const dailyCapUsd = Number(input.dailyCapUsd) || 0;

  // A ledger sum can round a hair over the ceiling (float); treat >= ceiling as frozen, not "over".
  const frozen = monthSpentUsd >= monthlyCeilingUsd && monthlyCeilingUsd > 0;
  const atCap = todaySpentUsd >= dailyCapUsd && dailyCapUsd > 0;

  const month = {
    spentUsd: monthSpentUsd,
    ceilingUsd: monthlyCeilingUsd,
    pct: pct(monthSpentUsd, monthlyCeilingUsd),
    frozen,
    remainingUsd: Math.max(0, monthlyCeilingUsd - monthSpentUsd),
  };
  const day = {
    spentUsd: todaySpentUsd,
    capUsd: dailyCapUsd,
    pct: pct(todaySpentUsd, dailyCapUsd),
    atCap,
    remainingUsd: Math.max(0, dailyCapUsd - todaySpentUsd),
  };

  const item = input.itemSpentUsd === undefined && input.perItemBreakerUsd === undefined
    ? null
    : {
        spentUsd: Number(input.itemSpentUsd) || 0,
        breakerUsd: Number(input.perItemBreakerUsd) || 0,
        tripped: (Number(input.itemSpentUsd) || 0) >= (Number(input.perItemBreakerUsd) || 0) && (Number(input.perItemBreakerUsd) || 0) > 0,
      };

  const paidRuns = Number(input.paidRuns) || 0;
  const justifiedPaidRuns = Number(input.justifiedPaidRuns) || 0;
  const unjustifiedPaidRuns = Math.max(0, paidRuns - justifiedPaidRuns);
  const justification = {
    paidRuns,
    justifiedPaidRuns,
    unjustifiedPaidRuns,
    clean: unjustifiedPaidRuns === 0,
  };

  const monthTag = frozen ? "FROZEN" : `${month.pct}%`;
  const dayTag = atCap ? "AT CAP" : `${day.pct}%`;
  const justTag = justification.clean
    ? `${justifiedPaidRuns}/${paidRuns} justified`
    : `⚠ ${unjustifiedPaidRuns} UNJUSTIFIED paid run(s)`;
  const header =
    `SPEND GAUGE — MTD ${usd(monthSpentUsd)}/${usd(monthlyCeilingUsd)} (${monthTag}) · ` +
    `today ${usd(todaySpentUsd)}/${usd(dailyCapUsd)} (${dayTag}) · ` +
    `paid-run justification ${justTag}`;

  return { month, day, item, justification, header };
}

/**
 * FREE async reader. Sums this UTC month + today from agent_runs and counts paid-run justification coverage,
 * then returns computeGauge(...). Injects the supabase client + ceilings so it stays testable and env-light.
 * A "justified" paid run is one whose telemetry carries a pre-logged acquire justification (Phase 1, I2):
 * errors[].justification present (missing_snapshot | content_changed). Until Phase 1's acquire path exists,
 * every real paid run is a legacy grounding call and justifiedPaidRuns is 0 by design — the gauge shows that
 * honestly rather than pretending coverage.
 * @param {import("@supabase/supabase-js").SupabaseClient} svc
 * @param {{ monthlyCeilingUsd: number, dailyCapUsd: number, nowMs?: number }} opts
 */
export async function readSpendGauge(svc, opts) {
  const now = opts.nowMs ? new Date(opts.nowMs) : new Date();
  const monthStartIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const dayStartIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();

  const { data, error } = await svc
    .from("agent_runs")
    .select("cost_usd_estimated, started_at, errors")
    .gte("started_at", monthStartIso);
  if (error) throw new Error(`spend-gauge read failed: ${error.message}`);

  const rows = data ?? [];
  let monthSpentUsd = 0;
  let todaySpentUsd = 0;
  let paidRuns = 0;
  let justifiedPaidRuns = 0;
  for (const r of rows) {
    const cost = Number(r.cost_usd_estimated) || 0;
    monthSpentUsd += cost;
    if (String(r.started_at) >= dayStartIso) todaySpentUsd += cost;
    if (cost > 0) {
      paidRuns += 1;
      if (hasJustification(r.errors)) justifiedPaidRuns += 1;
    }
  }
  return computeGauge({
    monthSpentUsd,
    monthlyCeilingUsd: opts.monthlyCeilingUsd,
    todaySpentUsd,
    dailyCapUsd: opts.dailyCapUsd,
    paidRuns,
    justifiedPaidRuns,
  });
}

/** Does an agent_runs.errors jsonb carry a pre-logged acquire justification? Pure, defensive. @param {unknown} errors */
export function hasJustification(errors) {
  if (!Array.isArray(errors)) return false;
  return errors.some((e) => e && typeof e === "object" && "justification" in e && Boolean(/** @type {any} */ (e).justification));
}
