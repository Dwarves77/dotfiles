/**
 * One row: `{label, decision:"adopt"|"decline", reason}` (extra fields on the input are dropped --
 * only these three are stable across families).
 * @typedef {{label:string, decision:"adopt"|"decline", reason:string}} Decision
 */
/**
 * Build a resolution_note recording every decision made on a flag's proposal set. PURE.
 * @param {string} summaryPrefix - short, human, family-specific lead-in (e.g. "tag-ratification (auto)")
 * @param {Decision[]} decisions - every proposal's terminal decision, already resolved (no pending state)
 * @returns {string}
 */

export function buildDecisionNote(summaryPrefix, decisions) {
  const list = Array.isArray(decisions) ? decisions : [];
  const adopted = list.filter((d) => d.decision === "adopt");
  const declined = list.filter((d) => d.decision === "decline");
  const summary = `${summaryPrefix}: decided ${list.length} (adopted ${adopted.length}, declined ${declined.length}).`;
  const json = list.map((d) => ({ label: d.label, decision: d.decision, reason: d.reason }));
  return `${summary}\n\nDECISIONS_JSON: ${JSON.stringify(json)}`;
}

/**
 * Parse a resolution_note this module built back into its decision rows. PURE. Returns null when the
 * note carries no parseable DECISIONS_JSON tail (e.g. a flag closed by an unrelated resolver).
 * @param {string|null|undefined} note
 * @returns {Decision[]|null}
 */
export function parseDecisionNote(note) {
  const m = /DECISIONS_JSON:\s*(\[[\s\S]*\])\s*$/.exec(String(note || ""));
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1]);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
