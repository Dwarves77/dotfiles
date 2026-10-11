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
