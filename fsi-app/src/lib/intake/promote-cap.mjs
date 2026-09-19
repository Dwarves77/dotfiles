// promote-cap.mjs: the pure max-promote cap slicer for ledger-consume's apply path (Lane M2, 2026-09-18,
// docs/plans/complete-system-build-plan-2026-09-04.md section 6.1 row M2).
//
// LEDGER_CONSUME_APPLY_ENABLED (a source-constant human-reviewed gate, run-ledger-consume.mjs) is retired.
// The 2026-09-18 stage audit (docs/audits/stage-audit-2026-09-18/s2-mint-gate.md, finding 1) found it
// permanently true and gating nothing real: the apply half had never fired across two full audits three
// weeks apart. The guard that replaces it is THIS cap. Once apply is armed (D26's rule, an explicit
// --verdicts <path>, see isApplyArmed in run-ledger-consume.mjs, unchanged by this lane), a single run
// may promote at most `cap` of the eligible (would-mint) candidates, oldest-eligible first, bounding
// blast radius by COUNT PER RUN instead of by a human flip.
//
// PURE, zero imports, same reuse discipline as html-to-text.mjs, charset-decode.mjs and pdf-extract.mjs in
// this codebase (a plain .mjs module imported by both a .ts caller, src/lib/intake/portal-harvest.ts, and
// a plain node:test file, scripts/turns/run-ledger-consume.test.mjs) so the cap logic is independently
// unit-testable without a DB, a jiti import, or the mint chokepoint.
//
// "oldest-eligible first": this function does no sorting of its own. It trusts `items`' own order. The
// caller (portal-harvest.ts's consumePortalCandidates) already walks candidates in the ledger's own
// (first_seen_at, id) ascending keyset order by default (selectCandidateLedgerPage), so `items` arrives
// oldest-first unless the run was dispatched with --newest-first.
//
// HARD CEILING (200): enforced by the CALLER (run-ledger-consume.mjs's parseArgs, --max-promote), not
// here. A `cap` above 200 should never reach this function; if it does anyway, this function does not
// re-validate it (it is not this module's job to guess why the caller's own contract was violated).

/**
 * Split `items` into the ones a run may promote and the ones it must defer.
 * @template T
 * @param {T[]} items the eligible (would-mint) candidates, oldest-eligible first
 * @param {number} cap max_promote for this run. A non-finite or negative value is treated as "no cap"
 *   (every item promotable), the same permissive default `opts.maxPromote === undefined` gets at the
 *   call site in portal-harvest.ts.
 * @returns {{toPromote: T[], deferred: T[]}} toPromote = items.slice(0, cap); deferred = the remainder,
 *   left completely untouched by the caller (ledger status stays 'candidate') for a later apply run.
 */
export function applyPromoteCap(items, cap) {
  const n = Number.isFinite(cap) && cap >= 0 ? Math.floor(cap) : items.length;
  return {
    toPromote: items.slice(0, n),
    deferred: items.slice(n),
  };
}
