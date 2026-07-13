// @ts-check
// SPEND-WATCH VERDICT (pure core). The health decision behind /api/health/spend, extracted so it is
// node-testable and so the uptime workflow can trust ONE boolean instead of re-deriving an alarm from raw %.
//
// The verdict is NOT "% of the ceiling" (that is permanently red while the ceiling is frozen — the
// rendering-guard permanent-red anti-pattern). It is about paid `agent_runs` rows AFTER the acquisition-
// freeze baseline, and whether each such row is SANCTIONED:
//
//   FROZEN-AND-QUIET   — zero paid rows since the freeze baseline. HEALTHY. (MTD may be at/over the ceiling;
//                        that is the KNOWN frozen state, not news.)
//   SANCTIONED-JUSTIFIED — there ARE paid rows since the freeze, AND the acquire lock is ON, AND every paid
//                        row carries a pre-logged I2 justification (an `acquire-justification` agent_runs row
//                        for the same item/source, logged at or before the paid call). HEALTHY — this is a
//                        deliberate operator spend window. The sanctioned rows are enumerated.
//   LEAK               — any paid row since the freeze while the lock is OFF (justified or not — the lock is
//                        the master gate, so justified-but-lock-off is STILL a leak), OR any paid row with no
//                        pre-logged justification while the lock is ON. UNHEALTHY.
//
// (Gauge-unreadable is handled by the route: a non-200 / ok:false response fails before this runs.)
// Justification rows are the I2 ledger rows written by verify-item.logAcquireJustification:
// fetch_method='acquire-justification', cost 0, errors:[{ justification: <reason> }], carrying item/source.

/** Is this row a pre-logged I2 acquire-justification? @param {any} r */
function isJustificationRow(r) {
  if (r?.fetch_method === "acquire-justification") return true;
  const errs = /** @type {any[]} */ (Array.isArray(r?.errors) ? r.errors : []);
  return errs.some((e) => e && typeof e === "object" && e.justification);
}
/** Extract the justification reason string from a justification row (or null). @param {any} r */
function justificationReason(r) {
  const errs = /** @type {any[]} */ (Array.isArray(r?.errors) ? r.errors : []);
  const hit = errs.find((e) => e && typeof e === "object" && e.justification);
  return hit ? String(hit.justification) : (r?.fetch_method === "acquire-justification" ? "acquire" : null);
}
/** Do a paid row P and a justification row J refer to the same item or source? @param {any} j @param {any} p */
function sameSubject(j, p) {
  if (p?.intelligence_item_id != null && j?.intelligence_item_id === p.intelligence_item_id) return true;
  if (p?.source_id != null && j?.source_id === p.source_id) return true;
  return false;
}

/**
 * PURE verdict. Given this month's agent_runs rows (already month-filtered by the caller), the freeze
 * baseline, and the CURRENT acquire-lock state, decide health. No I/O, no clock.
 * @param {Array<{ cost_usd_estimated?: number|null, started_at?: string|null, fetch_method?: string|null, intelligence_item_id?: string|null, source_id?: string|null, errors?: any }>} rows
 * @param {{ freezeSinceIso: string, monthlyCeilingUsd: number, acquireEnabled?: boolean }} opts
 * @returns {{ mtdUsd: number, pct: number, frozen: boolean, latestPaidAt: string|null, paidAfterFreeze: number, acquireEnabled: boolean, allJustified: boolean, healthy: boolean, reason: string, paidAfterRows: Array<{ itemId: string|null, sourceId: string|null, costUsd: number, startedAt: string|null, justification: string|null }> }}
 */
export function computeSpendHealth(rows, opts) {
  const list = Array.isArray(rows) ? rows : [];
  const ceiling = Number(opts?.monthlyCeilingUsd) || 0;
  const acquireEnabled = opts?.acquireEnabled === true;
  const freezeMs = Date.parse(String(opts?.freezeSinceIso ?? ""));
  const freezeValid = !Number.isNaN(freezeMs);

  let mtdUsd = 0;
  let latestPaidAt = /** @type {string|null} */ (null);
  let latestMs = -Infinity;
  const paidAfter = /** @type {any[]} */ ([]);
  const justAfter = /** @type {any[]} */ ([]);

  for (const r of list) {
    const cost = Number(r?.cost_usd_estimated ?? 0) || 0;
    mtdUsd += cost;
    const started = r?.started_at ? String(r.started_at) : null;
    const ms = started ? Date.parse(started) : NaN;
    // A row counts as "after the freeze" only when we can prove its timestamp is strictly newer than the
    // baseline. If the baseline is unparseable, fail closed: treat every paid row as after (never mask a leak).
    const afterFreeze = !freezeValid || (!Number.isNaN(ms) && ms > freezeMs);
    if (cost > 0) {
      if (!Number.isNaN(ms) && ms > latestMs) { latestMs = ms; latestPaidAt = started; }
      if (afterFreeze) paidAfter.push(r);
    } else if (afterFreeze && isJustificationRow(r)) {
      justAfter.push(r);
    }
  }

  // Match each post-freeze paid row to a pre-logged justification (same item/source, logged at or before it).
  const paidAfterRows = paidAfter.map((p) => {
    const pms = p?.started_at ? Date.parse(String(p.started_at)) : NaN;
    const j = justAfter.find((jr) => {
      const jms = jr?.started_at ? Date.parse(String(jr.started_at)) : NaN;
      const preLogged = Number.isNaN(jms) || Number.isNaN(pms) ? false : jms <= pms;
      return sameSubject(jr, p) && preLogged;
    });
    return {
      itemId: p?.intelligence_item_id ?? null,
      sourceId: p?.source_id ?? null,
      costUsd: Math.round((Number(p?.cost_usd_estimated ?? 0) || 0) * 1e6) / 1e6,
      startedAt: p?.started_at ? String(p.started_at) : null,
      justification: j ? justificationReason(j) : null,
    };
  });

  const paidAfterFreeze = paidAfterRows.length;
  const unjustified = paidAfterRows.filter((r) => r.justification == null).length;
  const allJustified = paidAfterFreeze > 0 && unjustified === 0;

  mtdUsd = Math.round(mtdUsd * 1e6) / 1e6;
  const pct = ceiling > 0 ? Math.round((mtdUsd / ceiling) * 1000) / 10 : 0;
  const frozen = ceiling > 0 && mtdUsd >= ceiling;

  // Verdict.
  let healthy;
  let reason;
  if (!freezeValid) {
    healthy = false;
    reason = `freeze baseline unreadable ("${opts?.freezeSinceIso}") — failing closed; ${paidAfterFreeze} paid row(s) this month`;
  } else if (paidAfterFreeze === 0) {
    healthy = true;
    reason = frozen
      ? `frozen-and-quiet: MTD $${mtdUsd.toFixed(2)} at ${pct}% of the $${ceiling} ceiling (frozen), ZERO paid rows since the freeze baseline ${opts.freezeSinceIso}`
      : `under ceiling ($${mtdUsd.toFixed(2)}, ${pct}%), ZERO paid rows since the freeze baseline`;
  } else if (!acquireEnabled) {
    // Lock is the master gate. Any paid row after the freeze while the lock is OFF is a leak — even if the
    // rows carry justifications (justified-but-lock-OFF is still a leak: the lock was not authorising spend).
    healthy = false;
    reason = `LEAK: ${paidAfterFreeze} paid row(s) since the freeze while GROUNDING_ACQUIRE_ENABLED is OFF (${paidAfterFreeze - unjustified} justified, ${unjustified} unjustified) — the lock did not authorise this spend`;
  } else if (!allJustified) {
    healthy = false;
    reason = `LEAK: lock is ON but ${unjustified} of ${paidAfterFreeze} paid row(s) since the freeze carry NO pre-logged I2 justification`;
  } else {
    healthy = true;
    reason = `sanctioned window: ${paidAfterFreeze} paid row(s) since the freeze, lock ON, all carry a pre-logged I2 justification (total $${paidAfterRows.reduce((s, r) => s + r.costUsd, 0).toFixed(2)})`;
  }

  return { mtdUsd, pct, frozen, latestPaidAt, paidAfterFreeze, acquireEnabled, allJustified, healthy, reason, paidAfterRows };
}
