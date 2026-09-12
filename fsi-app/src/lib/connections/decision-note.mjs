// decision-note.mjs — shared resolution_note grammar for "every proposal is decided" flag closes
// (brief-chain-build-plan-2026-09-11 Part 7 task 7.2 / ADR-030 rider: "no queue on the admin page may
// require a human click to resolve; every flag is closed by a runtime with its decision recorded, and a
// decision of 'no action, and why' is a valid close"). PURE, no I/O.
//
// FORMAT CHOICE (task 7.2 item 4: "a compact JSON tail or a fixed line grammar; state which in the
// README of the step"): a compact JSON tail. Reasoning: the three families this closes flags for
// (tag proposals, classification proposals, signal candidates) carry structurally different payloads —
// a fixed line grammar would need per-family escaping/quoting rules a JSON array does not. One human
// summary line first (readable without parsing), then:
//
//   DECISIONS_JSON: [{"label":string, "decision":"adopt"|"decline", "reason":string}, ...]
//
// `label` is family-specific and self-describing (e.g. "operational_scenario_tags:ocean-bunkering",
// "scope_topics:emissions", "shared_title_entity:pair") — an admin page renders it directly with no
// need to re-derive it from the original proposal shape. Every caller (apply-tags.mjs,
// apply-classifications.mjs, analyze-corpus.mjs / resolve-signals.mjs) uses this SAME module so a
// resolution_note is parseable the same way regardless of which resolver closed the flag.

/**
 * One row: `{label, decision:"adopt"|"decline", reason}` (extra fields on the input are dropped —
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
  const summary = `${summaryPrefix} — decided ${list.length} (adopted ${adopted.length}, declined ${declined.length}).`;
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
