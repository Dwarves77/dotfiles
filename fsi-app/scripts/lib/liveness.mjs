// D3 section 3 — self-liveness (the meta-level of the whole investigation).
//
// THE TRAP (recursion): D3 attesting its own liveness is a proxy. A dead D3 writes
// nothing AND checks nothing -> silent. A liveness check that only runs when D3 runs
// can never detect D3's own non-running. If the (unbuilt) trigger silently dies, D3
// stops and a green badge implies coverage that's gone — the deepest version of the
// disease (findings doc S0 at the meta-level).
//
// THE ESCAPE (structural, not self-referential):
//   1. D3 only WRITES a heartbeat — a FACT ("a run happened at T"), never a verdict
//      about itself.
//   2. The liveness VERDICT is computed by an EXTERNAL consumer at READ time, from
//      that timestamp. The writer (D3) is not consulted about whether it is alive.
//   3. The inversion that makes not-run LOUD: absence of a fresh heartbeat renders as
//      UNKNOWN (loud), NEVER as clean. "0 flags" is trustworthy ONLY when paired with
//      "a fresh run exists." The consumer binds the two; D3 cannot present green while
//      dead.
//
// IRREDUCIBLE ASSUMPTION (named, not hidden): liveness cannot be bootstrapped from
// nothing — SOME external reader must eventually evaluate freshness. We minimize and
// name it: the freshness check rides on the surface humans already read (the
// integrity_flags queue) AND on any gate that consumes D3's verdict. The only way to
// miss it is "no one ever reads D3's output and no gate consumes it" — at which point
// D3 has no function. We do NOT claim D3 detects its own death in a vacuum; we claim a
// dead D3 cannot present as GREEN to any reader.

export const LIVENESS = Object.freeze({ LIVE: "LIVE", STALE: "STALE", NEVER: "NEVER" });

// PURE: verdict from a timestamp + now + window. STALE and NEVER are LOUD — distinct
// from LIVE by construction; nothing collapses "didn't run" into "ran clean."
export function assessLiveness(lastRunAtMs, nowMs, windowMs) {
  if (lastRunAtMs == null || Number.isNaN(Number(lastRunAtMs)))
    return { state: LIVENESS.NEVER, ageMs: null, lastRunAtMs: null };
  const ageMs = nowMs - Number(lastRunAtMs);
  return { state: ageMs <= windowMs ? LIVENESS.LIVE : LIVENESS.STALE, ageMs, lastRunAtMs: Number(lastRunAtMs) };
}

// PURE: max run timestamp (ms) across heartbeat rows; null if none. The READER's
// view of "when did D3 last run" — computed from stored facts, not from D3 asserting.
export function latestRunAtMs(rows, tsField = "ran_at") {
  let max = null;
  for (const r of rows ?? []) {
    const t = r[tsField] instanceof Date ? r[tsField].getTime() : new Date(r[tsField]).getTime();
    if (!Number.isNaN(t) && (max == null || t > max)) max = t;
  }
  return max;
}

// THE FAIL-CLOSED CONSUMER VIEW — the inversion. A reader must NOT see "clean" unless
// liveness is LIVE. Not-LIVE => UNKNOWN (loud), regardless of how few findings exist.
// This is what makes a silently-dead D3 render loud, never green.
export function consumerView(findings, liveness) {
  const n = findings?.length ?? 0;
  if (liveness.state !== LIVENESS.LIVE)
    return {
      render: "UNKNOWN", loud: true,
      message: `D3 ${liveness.state} — last run ${liveness.ageMs == null ? "NEVER" : Math.round(liveness.ageMs / 1000) + "s ago"}; "${n} flags" is NOT trustworthy (coverage unknown until D3 re-runs).`,
      findings,
    };
  return n === 0
    ? { render: "CLEAN", loud: false, message: "D3 LIVE within window and 0 open flags.", findings }
    : { render: "FLAGS", loud: true, message: `D3 LIVE; ${n} open flag(s) to triage.`, findings };
}
