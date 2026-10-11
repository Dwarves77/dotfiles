// @ts-check

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
