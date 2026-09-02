// ruling.mjs — validation shared by every apply-<queue>.mjs (Lane R1, 2026-09-02).
//
// Two guards every apply script needs, both pure (no DB):
//   validateRuling  — every group in the ruling file must carry a decision from the queue's own
//                      vocabulary before ANYTHING is applied. A ruling half-filled-in is refused whole,
//                      not applied group-by-group — a partial apply is how a queue rots silently (some
//                      groups actioned, others forgotten, no record of which).
//   isRulingStale   — the ruling file's `generated_at` must not be older than the newest row the live
//                      queue now holds. New rows can arrive between "the digest was built" and "the
//                      operator ruled" (worker discovery, another session's insert); applying a ruling
//                      that never saw those rows would silently leave them out of every group's count —
//                      the apply refuses and asks for a fresh digest instead.

/**
 * @param {{queue?:string, generated_at?:string, groups?:Array<{key:string, decision:any}>}} ruling
 * @param {string[]} allowedDecisions — includes "skip" if the queue defines one.
 * @returns {{ok:true}|{ok:false, errors:string[]}}
 */
export function validateRuling(ruling, allowedDecisions) {
  const errors = [];
  if (!ruling || typeof ruling !== "object") return { ok: false, errors: ["ruling file is not a JSON object"] };
  if (!ruling.generated_at) errors.push("ruling.generated_at is required");
  if (!Array.isArray(ruling.groups) || ruling.groups.length === 0) {
    errors.push("ruling.groups must be a non-empty array");
    return { ok: false, errors };
  }
  const allowed = new Set(allowedDecisions);
  for (const g of ruling.groups) {
    if (!g || typeof g.key !== "string" || !g.key) {
      errors.push(`group missing a string "key": ${JSON.stringify(g)}`);
      continue;
    }
    if (g.decision === null || g.decision === undefined || g.decision === "") {
      errors.push(`group "${g.key}": decision is missing — every group must be ruled before apply`);
      continue;
    }
    if (!allowed.has(g.decision)) {
      errors.push(`group "${g.key}": decision "${g.decision}" is not one of [${allowedDecisions.join(", ")}]`);
    }
    if (!Array.isArray(g.row_ids) || g.row_ids.length === 0) {
      errors.push(`group "${g.key}": row_ids must be a non-empty array`);
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, errors: [] };
}

/**
 * @param {string} generatedAtIso — ruling.generated_at
 * @param {string|null} freshestRowIso — the newest relevant timestamp among the queue's LIVE rows right now
 * @returns {boolean} true when the ruling predates a row the live queue now holds (stale — refuse apply)
 */
export function isRulingStale(generatedAtIso, freshestRowIso) {
  if (!freshestRowIso) return false; // nothing to compare against (empty queue, or no timestamped rows)
  const ruled = new Date(generatedAtIso);
  const freshest = new Date(freshestRowIso);
  if (Number.isNaN(ruled.getTime()) || Number.isNaN(freshest.getTime())) return false;
  return freshest > ruled;
}
