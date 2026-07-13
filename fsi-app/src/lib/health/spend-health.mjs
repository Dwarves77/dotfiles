// @ts-check
// SPEND-WATCH VERDICT (pure core). The health decision behind /api/health/spend, extracted so it is
// node-testable and so the uptime workflow can trust ONE boolean instead of re-deriving an alarm from raw %.
//
// The old probe alarmed at `pct >= 80` — an ABSOLUTE fraction of the ceiling. In the acquisition-freeze
// state (MTD $75.25 ≥ the frozen $75 ceiling = 100.3%) that alarm is PERMANENTLY red by design, which
// trains everyone to ignore red (the rendering-guard precedent). This verdict distinguishes the two states
// the operator actually cares about:
//   - FROZEN-AND-QUIET (expected) → HEALTHY: no paid row has landed since the freeze baseline. The MTD may be
//     at/over the ceiling; that is the KNOWN frozen state, not news.
//   - NEW SPEND (a leak / lock-OFF violation) → UNHEALTHY: any paid `agent_runs` row with started_at AFTER
//     the freeze baseline. During the freeze the invariant is "zero new paid rows"; one is the alarm.
// (Gauge-unreadable is handled by the route: a non-200 / ok:false response fails before this runs.)

/**
 * PURE verdict. Given this month's agent_runs rows (already month-filtered by the caller) and the freeze
 * baseline, decide health. No I/O, no clock.
 * @param {Array<{ cost_usd_estimated?: number|null, started_at?: string|null }>} rows
 * @param {{ freezeSinceIso: string, monthlyCeilingUsd: number }} opts
 * @returns {{ mtdUsd: number, pct: number, frozen: boolean, latestPaidAt: string|null, paidAfterFreeze: number, healthy: boolean, reason: string }}
 */
export function computeSpendHealth(rows, opts) {
  const list = Array.isArray(rows) ? rows : [];
  const ceiling = Number(opts?.monthlyCeilingUsd) || 0;
  const freezeMs = Date.parse(String(opts?.freezeSinceIso ?? ""));
  const freezeValid = !Number.isNaN(freezeMs);

  let mtdUsd = 0;
  let latestPaidAt = /** @type {string|null} */ (null);
  let latestMs = -Infinity;
  let paidAfterFreeze = 0;

  for (const r of list) {
    const cost = Number(r?.cost_usd_estimated ?? 0) || 0;
    mtdUsd += cost;
    if (cost > 0) {
      const started = r?.started_at ? String(r.started_at) : null;
      const ms = started ? Date.parse(started) : NaN;
      if (!Number.isNaN(ms) && ms > latestMs) { latestMs = ms; latestPaidAt = started; }
      // A paid row counts as "after the freeze" only when we can prove its timestamp is strictly newer than
      // the baseline. If the baseline is unparseable, we CANNOT prove quiet — treat every paid row as after
      // (fail closed: an unreadable freeze line must not mask a leak).
      if (!freezeValid || (!Number.isNaN(ms) && ms > freezeMs)) paidAfterFreeze += 1;
    }
  }

  mtdUsd = Math.round(mtdUsd * 1e6) / 1e6;
  const pct = ceiling > 0 ? Math.round((mtdUsd / ceiling) * 1000) / 10 : 0;
  const frozen = ceiling > 0 && mtdUsd >= ceiling;
  const healthy = paidAfterFreeze === 0;
  const reason = !freezeValid
    ? `freeze baseline unreadable ("${opts?.freezeSinceIso}") — failing closed; ${paidAfterFreeze} paid row(s) this month`
    : healthy
      ? (frozen
          ? `frozen-and-quiet: MTD $${mtdUsd.toFixed(2)} at ${pct}% of the $${ceiling} ceiling (frozen), ZERO paid rows since the freeze baseline ${opts.freezeSinceIso}`
          : `under ceiling ($${mtdUsd.toFixed(2)}, ${pct}%), ZERO paid rows since the freeze baseline`)
      : `NEW SPEND: ${paidAfterFreeze} paid row(s) since the freeze baseline ${opts.freezeSinceIso} (latest ${latestPaidAt}) — investigate: a leak or a lock-OFF violation`;

  return { mtdUsd, pct, frozen, latestPaidAt, paidAfterFreeze, healthy, reason };
}
