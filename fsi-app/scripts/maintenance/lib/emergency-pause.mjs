// emergency-pause.mjs: the operator's emergency stop, read by the tier and trust-score maintenance steps
// (lane TRUST-RET, 2026-10-07).
//
// WHY. POST /api/admin/recompute-trust skips its whole run when the global processing pause is set. The two
// maintenance steps that replace the retired trust-recompute.yml (recompute-tiers, recompute-trust-scores)
// did not read it (S1-E decision table, 2026-10-05), so an operator stop halted the route and left the steps
// running. Both now read it here, once per run, through the one function below.
//
// WHAT IS READ. system_state.global_processing_paused, the independent emergency stop. It is a HARD halt for
// every caller (src/lib/api/pause.ts evaluateGenerationPause: "the operator's stop is inviolable"). The
// scrape cadence is NOT read here: cadence 'off' is the build-mode dormancy, which these two DB-only steps
// already honour in their own way (recompute-tiers holds the scan-timestamp demotion trigger, section 58;
// the trust-score pass reads no scan timestamp). Treating cadence 'off' as a stop would switch both steps
// off for the whole build, which rule 16 does not ask for.
//
// FAIL CLOSED. A read that throws returns paused true with the error named, so a step that cannot tell
// whether the operator has stopped it does not write. A missing singleton row reads as not paused (the same
// default src/lib/api/pause.ts uses).

/**
 * @param {(table: string, columns: string) => Promise<Array<Record<string, unknown>>>} readAll
 * @returns {Promise<{ paused: boolean, error: string|null }>}
 */
export async function readEmergencyPause(readAll) {
  try {
    const rows = await readAll("system_state", "global_processing_paused");
    return { paused: !!rows?.[0]?.global_processing_paused, error: null };
  } catch (e) {
    return { paused: true, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * The summary a step returns when the emergency stop is set: nothing planned, nothing written, exit 0 (an
 * operator stop is the system working, not a failure), the reason on the record.
 */
export function pausedSummary({ step, mode, pause }) {
  return {
    step,
    mode,
    paused: true,
    pause_reason: pause?.error
      ? `could not read system_state.global_processing_paused (${pause.error}); failing closed`
      : "system_state.global_processing_paused is set (operator emergency stop)",
    counts: {},
    applied: 0,
    read_back: {},
    exitCode: 0,
  };
}
