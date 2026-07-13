// @ts-check
// GROUNDING ACQUIRE LOCK (Phase 1, operator ruling 2026-07-13, snapshot-first rebuild). The paid-acquire path
// of the snapshot-first pipeline (fetch new external content + model-ground it) is BUILT but LOCKED: it may run
// ONLY when the operator has explicitly turned the acquire flag ON. Default is OFF — so wiring the pipeline does
// not silently re-enable spend, and no leaked/inherited env accidentally opens it (the flag must be an explicit
// affirmative token). This is the grounding-side analog of the fetch-hold gate (SCRAPE_HOLD); the two COMPOSE —
// a paid acquire must clear BOTH this lock AND the transport hold.
//
// The lock is DELIBERATELY env-driven (unlike the monthly ceiling, which is code-only) because it is an
// operational go/no-go the operator flips per sanctioned run, not a standing dollar cap. Turning it on is a
// deliberate act recorded in the run's environment; the default and the "unset = OFF" semantics are the safety.

/** The one env var that opens the paid-acquire path. Affirmative tokens only; anything else (incl. unset) = OFF. */
export const ACQUIRE_FLAG = "GROUNDING_ACQUIRE_ENABLED";
const ON_TOKENS = new Set(["1", "on", "true", "enabled", "yes"]);

export class AcquireLockError extends Error {
  /** @param {string} context */
  constructor(context) {
    super(
      `GROUNDING_ACQUIRE_LOCKED: paid acquisition (external fetch + model grounding) is locked. ${context} ` +
      `The snapshot-first cheap path is the default; paid acquire runs ONLY when ${ACQUIRE_FLAG} is explicitly ` +
      `set to an affirmative value (1|on|true|enabled|yes) for a sanctioned run. It is OFF by default and stays OFF.`,
    );
    this.name = "AcquireLockError";
  }
}

/**
 * Is the paid-acquire path open? OFF unless the flag is an explicit affirmative token. Pure.
 * @param {Record<string, string|undefined>} [env]
 * @returns {boolean}
 */
export function acquireEnabled(env = /** @type {any} */ (typeof process !== "undefined" ? process.env : {})) {
  const raw = env?.[ACQUIRE_FLAG];
  return typeof raw === "string" && ON_TOKENS.has(raw.trim().toLowerCase());
}

/**
 * Gate a paid-acquire attempt. THROWS AcquireLockError unless the flag is affirmatively ON. Call this at the
 * top of the paid-acquire branch — BEFORE any fetch or model call.
 * @param {string} context  a short reason the caller is attempting acquire (e.g. "missing_snapshot: <itemId>")
 * @param {Record<string, string|undefined>} [env]
 */
export function assertAcquireAllowed(context, env) {
  if (!acquireEnabled(env)) throw new AcquireLockError(context);
}
