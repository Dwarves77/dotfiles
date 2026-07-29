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

// SCOPED CLASS AMENDMENTS — the ONLY way a call class OTHER than batch-classification is ever metered-
// eligible (operator authorization protocol: named task + named call class + Haiku-only + named cap +
// expiry, written operator authorization). The wall's DEFAULT stays batch-classification-only; a call in
// any other class with no matching amendment still refuses. Each entry is scope-limited to a NAMED task,
// hard-capped, and EXPIRES on completion (REMOVE the entry once the task's run is done).
export const SCOPED_CLASS_AMENDMENTS = Object.freeze([
  {
    task: "P2 proof batch: depth-brief generation from catalogued instruments",
    callClass: "depth-brief-generation",
    models: Object.freeze(new Set(["claude-haiku-4-5-20251001", "claude-haiku-4-5"])), // Haiku only
    capUsd: 6, // $6.00 hard cap
    authority: "operator authorization 2026-07-29 (scoped metered-gate amendment for the P2 proof batch; 5–10 briefs; Haiku-only; document capture $0 free-ladder, Browserless frozen)",
    // EXPIRES 48h from authorization OR on completion of the 5–10 brief proof batch — REMOVE this entry then.
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
  // Class gate: the base eligible class (batch-classification) OR a scoped-CLASS amendment for the named task.
  let classAmendment = null;
  if (cls !== METERED_ELIGIBLE_CLASS) {
    classAmendment = SCOPED_CLASS_AMENDMENTS.find((a) => a.task === String(task || "") && a.callClass === cls) || null;
    if (!classAmendment) {
      throw new MeteredCallForbiddenError(`class '${cls}' is not metered-eligible; base eligible class is '${METERED_ELIGIBLE_CLASS}' and NO scoped-class amendment authorizes '${cls}' for task '${task || "(none)"}' (RULE 2a). A non-base class requires an operator-ruled scoped amendment: named task + named call class + named cap + expiry.`);
    }
  }
  const m = String(model || "");
  // Model gate: base Haiku allowlist, OR the matching class amendment's own model set, OR a scoped-model amendment.
  let amendment = classAmendment;
  if (!METERED_MODEL_ALLOWLIST.has(m) && !(classAmendment && classAmendment.models.has(m))) {
    amendment = SCOPED_MODEL_AMENDMENTS.find((a) => a.task === String(task || "") && a.models.has(m)) || null;
    if (!amendment) {
      throw new MeteredCallForbiddenError(`model '${model}' is off the metered allowlist and NO scoped amendment authorizes it for task '${task || "(none)"}' (RULE 2a). A non-Haiku model requires an operator-ruled scoped amendment: named task + named cap + expiry.`);
    }
  }
  const token = String(env?.METERED_BATCH_TOKEN ?? "").trim();
  if (!token) {
    throw new MeteredCallForbiddenError(`no recorded operator token (METERED_BATCH_TOKEN) — a metered run requires a written same-session operator authorization (RULE 2b). "It's only a few dollars" and inherited ceilings are NOT authorization.`);
  }
  if (!(typeof capUsd === "number" && Number.isFinite(capUsd) && capUsd > 0)) {
    throw new MeteredCallForbiddenError(`no positive hard dollar cap supplied — a metered run must carry an operator-set cap with a hard stop (RULE 2c/2d).`);
  }
  const capLimit = classAmendment ? classAmendment.capUsd : amendment && amendment !== classAmendment ? amendment.capUsd : null;
  if (capLimit != null && capUsd > capLimit) {
    throw new MeteredCallForbiddenError(`cap $${capUsd} exceeds the scoped-amendment hard cap $${capLimit} for task '${task}' (RULE 2c). The amendment is cap-limited by operator ruling.`);
  }
  return { allowed: true, callClass: cls, model: m, capUsd, token, ...(amendment ? { amendment: amendment.task } : {}) };
}

/** Convenience predicate (non-throwing) for reporting. */
export function isMeteredCallAllowed(o) { try { assertMeteredCallAllowed(o); return true; } catch { return false; } }
