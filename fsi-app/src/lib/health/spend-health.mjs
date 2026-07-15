// @ts-check
// SPEND-WATCH VERDICT (pure core). The health decision behind /api/health/spend, extracted so it is
// node-testable and so the uptime workflow can trust ONE boolean instead of re-deriving an alarm from raw %.
//
// SPEND-CONTROL REFACTOR (operator final rulings 2026-07-13, RECONCILED to the operator-priced model 2026-07-15):
// spend-watch is a PURE ALARM. There are NO standing dollar limits, so the verdict is NOT "% of a ceiling" (that
// framing is retired). The alarm is about paid `agent_runs` rows AFTER the acquisition-freeze baseline and ONE
// question: does each such paid row trace to an OPERATOR-PRICED LINE (an authorization)? Any post-freeze paid row
// that does NOT trace to a priced line is the anomaly, at ANY amount.
//
//   FROZEN-AND-QUIET     — zero paid rows since the freeze baseline. HEALTHY.
//   TRACED               — there ARE paid rows since the freeze AND every one traces to a pre-logged operator-
//                          priced line marker (same item/source, logged at or before the paid call). HEALTHY — a
//                          deliberate operator spend window. The app acquire lock is REPORTED but NOT gated.
//   ANOMALY              — any post-freeze paid row that does NOT trace to a priced line (untraceable spend /
//                          missing authorization). UNHEALTHY.
//
// 2026-07-15 RECONCILIATION: the app acquire lock is NO LONGER the master gate. Under the operator-priced model
// the lock is armed only inside the local funded-pass runner process (never the deployed app), so "app lock OFF"
// is the normal post-run state; gating on it false-reds every legitimate priced run. Traceability to an operator-
// priced line — written ONLY by an operator-bounded run — is the sole go/no-go. This supersedes the 2026-07-13
// lock-as-master-gate rule (the retired frozen-state posture). acquireEnabled is retained as an informational
// field. A "priced-line marker" row is fetch_method='priced-line' (or an errors[] entry with a truthy
// `pricedLine`), cost 0, carrying the item/source it authorizes; funded-pass writes one per authorized item.

/** Is this a pre-logged OPERATOR-PRICED-LINE marker row? @param {any} r */
function isPricedLineRow(r) {
  if (r?.fetch_method === "priced-line") return true;
  const errs = /** @type {any[]} */ (Array.isArray(r?.errors) ? r.errors : []);
  return errs.some((e) => e && typeof e === "object" && e.pricedLine);
}
/** Extract the priced-line reference string from a marker row (or null). @param {any} r */
function pricedLineRef(r) {
  const errs = /** @type {any[]} */ (Array.isArray(r?.errors) ? r.errors : []);
  const hit = errs.find((e) => e && typeof e === "object" && e.pricedLine);
  return hit ? String(hit.pricedLine) : (r?.fetch_method === "priced-line" ? "priced-line" : null);
}
/** Do a paid row P and a priced-line row J refer to the same item or source? @param {any} j @param {any} p */
function sameSubject(j, p) {
  if (p?.intelligence_item_id != null && j?.intelligence_item_id === p.intelligence_item_id) return true;
  if (p?.source_id != null && j?.source_id === p.source_id) return true;
  return false;
}

/**
 * PURE verdict. Given this month's agent_runs rows (already month-filtered by the caller), the freeze
 * baseline, and the CURRENT acquire-lock state, decide health. No I/O, no clock. The monthlyCeilingUsd is
 * accepted for backward-compatible INFORMATIONAL fields (mtdUsd/pct/frozen) only — it NEVER gates the verdict.
 * @param {Array<{ cost_usd_estimated?: number|null, started_at?: string|null, fetch_method?: string|null, intelligence_item_id?: string|null, source_id?: string|null, errors?: any }>} rows
 * @param {{ freezeSinceIso: string, monthlyCeilingUsd?: number, acquireEnabled?: boolean }} opts
 * @returns {{ mtdUsd: number, pct: number, frozen: boolean, latestPaidAt: string|null, paidAfterFreeze: number, acquireEnabled: boolean, allJustified: boolean, healthy: boolean, reason: string, paidAfterRows: Array<{ itemId: string|null, sourceId: string|null, costUsd: number, startedAt: string|null, justification: string|null }> }}
 */
export function computeSpendHealth(rows, opts) {
  const list = Array.isArray(rows) ? rows : [];
  const ceiling = Number(opts?.monthlyCeilingUsd) || 0; // informational only (no gating)
  const acquireEnabled = opts?.acquireEnabled === true;
  const freezeMs = Date.parse(String(opts?.freezeSinceIso ?? ""));
  const freezeValid = !Number.isNaN(freezeMs);

  let mtdUsd = 0;
  let latestPaidAt = /** @type {string|null} */ (null);
  let latestMs = -Infinity;
  const paidAfter = /** @type {any[]} */ ([]);
  const lineAfter = /** @type {any[]} */ ([]);

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
    } else if (afterFreeze && isPricedLineRow(r)) {
      lineAfter.push(r);
    }
  }

  // Match each post-freeze paid row to a pre-logged operator-priced line (same item/source, logged at/before it).
  const paidAfterRows = paidAfter.map((p) => {
    const pms = p?.started_at ? Date.parse(String(p.started_at)) : NaN;
    const j = lineAfter.find((jr) => {
      const jms = jr?.started_at ? Date.parse(String(jr.started_at)) : NaN;
      const preLogged = Number.isNaN(jms) || Number.isNaN(pms) ? false : jms <= pms;
      return sameSubject(jr, p) && preLogged;
    });
    return {
      itemId: p?.intelligence_item_id ?? null,
      sourceId: p?.source_id ?? null,
      costUsd: Math.round((Number(p?.cost_usd_estimated ?? 0) || 0) * 1e6) / 1e6,
      startedAt: p?.started_at ? String(p.started_at) : null,
      // Field name kept for the /api/health/spend route's response shape; it now carries the priced-line ref.
      justification: j ? pricedLineRef(j) : null,
    };
  });

  const paidAfterFreeze = paidAfterRows.length;
  const untraced = paidAfterRows.filter((r) => r.justification == null).length;
  const allJustified = paidAfterFreeze > 0 && untraced === 0; // allJustified === "all traced to a priced line"

  mtdUsd = Math.round(mtdUsd * 1e6) / 1e6;
  const pct = ceiling > 0 ? Math.round((mtdUsd / ceiling) * 1000) / 10 : 0; // informational only
  const frozen = ceiling > 0 && mtdUsd >= ceiling;                          // informational only

  // Verdict (OPERATOR-PRICED MODEL, operator ruling 2026-07-15) — actuals are INFORMATIONAL; the SOLE alarm is
  // a post-freeze paid row that does NOT trace to an operator-priced line (an authorization). The app acquire
  // lock is NO LONGER a gate here: under the priced model it is armed only inside the local funded-pass runner
  // process, never in the deployed app, so "app lock OFF" is the NORMAL post-run state — it is reported for
  // information, never gated. This SUPERSEDES the 2026-07-13 lock-as-master-gate rule (the retired frozen-state
  // posture): traceability to an operator-priced line — not the app lock — is the go/no-go. Safety is preserved
  // because a priced-line marker is only written by an operator-bounded run, so a traced row IS an authorized row.
  let healthy;
  let reason;
  const lockNote = acquireEnabled ? "ON" : "OFF (informational under the priced model)";
  if (!freezeValid) {
    healthy = false;
    reason = `freeze baseline unreadable ("${opts?.freezeSinceIso}") — failing closed; ${paidAfterFreeze} paid row(s) this month`;
  } else if (paidAfterFreeze === 0) {
    healthy = true;
    reason = `frozen-and-quiet: MTD $${mtdUsd.toFixed(2)}, ZERO paid rows since the freeze baseline ${opts.freezeSinceIso}`;
  } else if (untraced > 0) {
    healthy = false;
    reason = `ANOMALY: ${untraced} of ${paidAfterFreeze} paid row(s) since the freeze do NOT trace to an operator-priced line — untraceable spend at any amount (app lock ${lockNote})`;
  } else {
    healthy = true;
    reason = `traced: ${paidAfterFreeze} paid row(s) since the freeze, all trace to an operator-priced line (total $${paidAfterRows.reduce((s, r) => s + r.costUsd, 0).toFixed(2)}; app lock ${lockNote})`;
  }

  return { mtdUsd, pct, frozen, latestPaidAt, paidAfterFreeze, acquireEnabled, allJustified, healthy, reason, paidAfterRows };
}
