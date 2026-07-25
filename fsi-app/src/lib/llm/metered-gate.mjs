// @ts-check
// metered-gate.mjs — STANDING FINANCIAL LAW enforcement (operator ruling 2026-07-25, post account-spend incident).
// The wall in the shared model-call path: metered Anthropic API spend is FORBIDDEN BY DEFAULT. Only ONE call class
// is ever eligible for the metered route — batch-classification — and only with a recorded operator token, an
// allowlisted model, and a hard dollar cap. Every other class (grounding, extraction, repair, mint, synthesis,
// re-ground, ask) runs FREE on the subscription executor and MUST refuse the metered route with a named error.
// Prose rules failed (the incident: grounding ran metered when it runs free) — this is the mechanical enforcement.
//
// Usage at the single sanctioned metered call site:  assertMeteredCallAllowed({ callClass, model, env })
// It throws MeteredCallForbiddenError unless every condition holds. There is no bypass argument.

export class MeteredCallForbiddenError extends Error {
  /** @param {string} reason */
  constructor(reason) { super(`METERED_CALL_FORBIDDEN: ${reason}`); this.name = "MeteredCallForbiddenError"; }
}

// The ONLY metered-eligible call class. Everything else routes free (subscription executor) or does not run.
export const METERED_ELIGIBLE_CLASS = "batch-classification";

// Grounding-shaped classes — these have a FREE subscription-executor path and may NEVER be metered, regardless of
// framing. Named explicitly so a future caller cannot relabel grounding as something else to slip the gate.
export const FREE_ONLY_CLASSES = Object.freeze(new Set([
  "grounding", "reground", "re-ground", "extraction", "ledger-extraction", "repair", "mint", "synthesis",
  "generate", "generate-stored", "ask", "search", "verification",
]));

// Allowlisted models for the one eligible class (the cheap classifier tier only).
export const METERED_MODEL_ALLOWLIST = Object.freeze(new Set([
  "claude-haiku-4-5-20251001", "claude-haiku-4-5",
]));

/**
 * The gate. Throws MeteredCallForbiddenError unless: (1) callClass is exactly the batch-classification class,
 * (2) the model is on the allowlist, (3) a recorded operator token is present in env (METERED_BATCH_TOKEN,
 * non-empty), and (4) a positive hard dollar cap is supplied. A grounding-shaped class refuses with a named
 * error pointing at the free executor. Any unknown class is refused (default-deny).
 * @param {{ callClass?: string, model?: string, capUsd?: number, env?: Record<string,string|undefined> }} o
 */
export function assertMeteredCallAllowed({ callClass, model, capUsd, env = process.env } = {}) {
  const cls = String(callClass || "").trim();
  if (!cls) throw new MeteredCallForbiddenError("no callClass supplied — default-deny (RULE 2).");
  if (FREE_ONLY_CLASSES.has(cls)) {
    throw new MeteredCallForbiddenError(`class '${cls}' is grounding-shaped and runs FREE on the subscription executor — it may NEVER be metered (RULE 1). Route it to the executor, not the API.`);
  }
  if (cls !== METERED_ELIGIBLE_CLASS) {
    throw new MeteredCallForbiddenError(`class '${cls}' is not metered-eligible; the ONLY eligible class is '${METERED_ELIGIBLE_CLASS}' (RULE 2a).`);
  }
  if (!METERED_MODEL_ALLOWLIST.has(String(model || ""))) {
    throw new MeteredCallForbiddenError(`model '${model}' is off the metered allowlist (batch-classification is Haiku-only) (RULE 2a).`);
  }
  const token = String(env?.METERED_BATCH_TOKEN ?? "").trim();
  if (!token) {
    throw new MeteredCallForbiddenError(`no recorded operator token (METERED_BATCH_TOKEN) — a batch-classification run requires a written same-session operator authorization (RULE 2b). "It's only a few dollars" and inherited ceilings are NOT authorization.`);
  }
  if (!(typeof capUsd === "number" && Number.isFinite(capUsd) && capUsd > 0)) {
    throw new MeteredCallForbiddenError(`no positive hard dollar cap supplied — a metered run must carry an operator-set cap with a hard stop (RULE 2c/2d).`);
  }
  return { allowed: true, callClass: cls, model, capUsd, token };
}

/** Convenience predicate (non-throwing) for reporting. */
export function isMeteredCallAllowed(o) { try { assertMeteredCallAllowed(o); return true; } catch { return false; } }
