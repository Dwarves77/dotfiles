// switch.mjs: the drain's STEP 0 reader (lane G6-DRAIN, 2026-10-06). Reads the three things that can stop the
// scheduled judgement drain, and nothing else:
//   1. system_state.judgement_drain (migration 354): the drain's own switch, default off.
//   2. system_state.global_processing_paused: the operator's emergency stop.
//   3. an open `fleet-budget-halt` integrity_flags row (docs/runbooks/fleet-budget-control.md STEP 0).
// Any one of them halts the drain. Every read fails CLOSED: an unreadable switch is off, an unreadable halt row
// is a halt, missing credentials are off. A broken read can never start a drain.
//
// Zero npm dependency (a raw Supabase REST call through the built-in fetch), the same shape and for the same
// reason as scripts/lib/chained-dry-guard.mjs's readScrapeCadence: the planner's STEP 0 must run before
// anything else is installed or imported, and src/lib/api/pause.ts (the app-side reader of the same three
// facts, getJudgementDrain / isFleetBudgetHalted / judgementDrainHaltReason) imports next/server, unavailable
// outside the Next.js runtime. Two contexts, two readers, one meaning.

/**
 * @typedef {object} DrainSwitchState
 * @property {boolean} on            true only when every layer allows the drain
 * @property {string|null} reason    why it may not run (null when on)
 * @property {"off"|"on"} judgementDrain
 * @property {boolean} emergencyPaused
 * @property {boolean} fleetHalted
 * @property {boolean} readFailed    any of the reads failed (the failure already counted as a halt)
 */

/**
 * Pure. Combine the three reads into one decision. Order of the reason: emergency stop, fleet halt, switch.
 * @param {{judgementDrain: unknown, emergencyPaused: unknown, fleetHalted: unknown, readFailed?: boolean}} reads
 * @returns {DrainSwitchState}
 */
export function decideDrainSwitch({ judgementDrain, emergencyPaused, fleetHalted, readFailed = false }) {
  const jd = judgementDrain === "on" ? "on" : "off";
  const paused = emergencyPaused === true;
  const halted = fleetHalted !== false; // anything but a clean false is a halt
  let reason = null;
  if (paused) reason = "emergency pause is set (global_processing_paused)";
  else if (halted) reason = readFailed ? "fleet-budget-halt could not be read (failing closed)" : "fleet-budget-halt is open";
  else if (jd !== "on") reason = "judgement_drain is off";
  return { on: reason === null, reason, judgementDrain: jd, emergencyPaused: paused, fleetHalted: halted, readFailed };
}

/**
 * Impure. Read the three switches through a raw REST client. `fetchImpl` is injected for tests.
 * @param {string|undefined} supabaseUrl
 * @param {string|undefined} serviceRoleKey
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<DrainSwitchState>}
 */
export async function readDrainSwitch(supabaseUrl, serviceRoleKey, fetchImpl = fetch) {
  if (!supabaseUrl || !serviceRoleKey) {
    return decideDrainSwitch({ judgementDrain: "off", emergencyPaused: false, fleetHalted: true, readFailed: true });
  }
  const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
  let failed = false;
  /** @param {string} path */
  const get = async (path) => {
    try {
      const res = await fetchImpl(`${supabaseUrl}/rest/v1/${path}`, { headers });
      if (!res.ok) { failed = true; return null; }
      return await res.json();
    } catch {
      failed = true;
      return null;
    }
  };
  const stateRows = await get("system_state?select=judgement_drain,global_processing_paused&id=eq.true");
  const haltRows = await get("integrity_flags?select=id&subject_ref=eq.fleet-budget-halt&status=eq.open&limit=1");
  const state = Array.isArray(stateRows) ? stateRows[0] : null;
  return decideDrainSwitch({
    judgementDrain: state?.judgement_drain,
    emergencyPaused: state?.global_processing_paused,
    fleetHalted: Array.isArray(haltRows) ? haltRows.length > 0 : true,
    readFailed: failed,
  });
}
