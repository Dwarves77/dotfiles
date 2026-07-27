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

// SCOPED MODEL AMENDMENTS — the ONLY way a non-Haiku model is ever permitted on the metered route (operator ruling
// 2026-07-26, session-log "scoped wall amendment + judge selection"). Each entry is scope-limited to a NAMED task,
// hard-capped, carries its authority, and EXPIRES on completion (the entry is REMOVED once the task's run is done).
// The wall's DEFAULT stays Haiku-only; a bare Sonnet call with no matching task still refuses. Adding a model is
// never a silent bypass — it is an explicit, named, capped, expiring amendment recorded with operator authority.
export const SCOPED_MODEL_AMENDMENTS = Object.freeze([
  {
    task: "index-relevance-second-pass",
    models: Object.freeze(new Set(["claude-sonnet-4-6", "claude-sonnet-4-5", "claude-sonnet-5"])),
    capUsd: 25,
    authority: "operator ruling 2026-07-26 (session-log: scoped wall amendment + judge selection)",
    // EXPIRES on completion of the index relevance second-pass — REMOVE this entry once that pass is done.
  },
]);

/**
 * The gate. Throws MeteredCallForbiddenError unless: (1) callClass is exactly the batch-classification class,
 * (2) the model is on the allowlist, (3) a recorded operator token is present in env (METERED_BATCH_TOKEN,
 * non-empty), and (4) a positive hard dollar cap is supplied. A grounding-shaped class refuses with a named
 * error pointing at the free executor. Any unknown class is refused (default-deny).
 * @param {{ callClass?: string, model?: string, capUsd?: number, env?: Record<string,string|undefined> }} o
 */
export function assertMeteredCallAllowed({ callClass, model, capUsd, env = process.env, task } = {}) {
  const cls = String(callClass || "").trim();
  if (!cls) throw new MeteredCallForbiddenError("no callClass supplied — default-deny (RULE 2).");
  if (FREE_ONLY_CLASSES.has(cls)) {
    throw new MeteredCallForbiddenError(`class '${cls}' is grounding-shaped and runs FREE on the subscription executor — it may NEVER be metered (RULE 1). Route it to the executor, not the API.`);
  }
  if (cls !== METERED_ELIGIBLE_CLASS) {
    throw new MeteredCallForbiddenError(`class '${cls}' is not metered-eligible; the ONLY eligible class is '${METERED_ELIGIBLE_CLASS}' (RULE 2a).`);
  }
  const m = String(model || "");
  // Model gate: base allowlist (Haiku) OR a matching scoped amendment for the named task. No amendment, off-list model -> refuse.
  let amendment = null;
  if (!METERED_MODEL_ALLOWLIST.has(m)) {
    amendment = SCOPED_MODEL_AMENDMENTS.find((a) => a.task === String(task || "") && a.models.has(m)) || null;
    if (!amendment) {
      throw new MeteredCallForbiddenError(`model '${model}' is off the metered allowlist (batch-classification is Haiku-only) and NO scoped amendment authorizes it for task '${task || "(none)"}' (RULE 2a). A non-Haiku model requires an operator-ruled scoped amendment: named task + named cap + expiry.`);
    }
  }
  const token = String(env?.METERED_BATCH_TOKEN ?? "").trim();
  if (!token) {
    throw new MeteredCallForbiddenError(`no recorded operator token (METERED_BATCH_TOKEN) — a batch-classification run requires a written same-session operator authorization (RULE 2b). "It's only a few dollars" and inherited ceilings are NOT authorization.`);
  }
  if (!(typeof capUsd === "number" && Number.isFinite(capUsd) && capUsd > 0)) {
    throw new MeteredCallForbiddenError(`no positive hard dollar cap supplied — a metered run must carry an operator-set cap with a hard stop (RULE 2c/2d).`);
  }
  if (amendment && capUsd > amendment.capUsd) {
    throw new MeteredCallForbiddenError(`cap $${capUsd} exceeds the scoped-amendment hard cap $${amendment.capUsd} for task '${task}' (RULE 2c). The amendment is cap-limited by operator ruling.`);
  }
  return { allowed: true, callClass: cls, model: m, capUsd, token, ...(amendment ? { amendment: amendment.task } : {}) };
}

/** Convenience predicate (non-throwing) for reporting. */
export function isMeteredCallAllowed(o) { try { assertMeteredCallAllowed(o); return true; } catch { return false; } }
