// tag-presence-check.mjs — MINT-TIME PREVENTION for the empty-connection-tag defect (lane TAG,
// 2026-09-01). NOT a mint governing file: scripts/mint/validate-mint-payload.mjs, payload-schema.json,
// item-type-required-slots.json, and the lib/gate-a-*.mjs / canonicalize-citation-url.mjs files are
// MINT_GOVERNING_FILES (run-mint-batch.mjs's own export, hashed by F28) and belong to another lane —
// this module is deliberately a NEW file, outside that list, so mint-time tag-presence checking can
// land without touching any of them.
//
// THE DEFECT THIS CATCHES BEFORE IT REPEATS: items minted by the August census wave carry EMPTY
// operational_scenario_tags/compliance_object_tags/topic_tags. Confirmed by reading both governing
// files (2026-09-01): payload-schema.json's `item` object schema declares NONE of these three
// properties (additionalProperties:true at every level means a payload COULD carry them, but nothing
// requires or documents it), and validate-mint-payload.mjs's C1-C7 gate never reads them — a text
// search for operational_scenario_tags / compliance_object_tags / topic_tags across both files returns
// zero hits. That silent gap is exactly how a payload can clear the whole mint gate while carrying no
// connection signature at all: discover.mjs (src/lib/connections/discover.mjs) scores a connection
// ONLY from shared_source, shared_scenario (operational_scenario_tags overlap),
// shared_compliance_object (compliance_object_tags overlap), or shared_jurisdiction_topic (jurisdiction
// AND topic_tags together) — an item with all three arrays empty can never contribute any of those
// bases, so it scores ZERO edges against the whole corpus regardless of how connected its real content
// actually is.
//
// PURE. No I/O, no DB, no network, no mutation of its input. This module only REPORTS; it never blocks
// a mint and never invents a tag. See WHY A WARNING (not a hard C1-C7-style failure) below.
//
// WIRING (this lane's write set does not include run-mint-batch.mjs — see this lane's dispatch report
// for the exact call site the coordinator should add; documented here too so the intent travels with
// the check itself): runBatch() in scripts/mint/run-mint-batch.mjs calls validateMintPayload(payload,
// {baseDir}) per payload (see that file's per-payload loop) and pushes one report.results[i] /
// perItem[i] entry per payload. The natural hook is right alongside that call: also call
// checkTagPresence(payload) and attach its result as a NEW, non-blocking field on that same
// report.results[i] entry (e.g. `tag_presence: checkTagPresence(payload)`), and fold a short note into
// perItem[i].verdict when `allEmpty` is true (e.g. append " — WARNING: all three connection-signature
// tags are empty, see tag_presence.warnings") so a human running the batch sees the empty-tag state in
// the SAME run report that already shows validation results, before the coordinator ever applies the
// payload — never as a separate pass discovered only after propose-tags.mjs flags it days later. This
// is intentionally NOT wired into validCount/applyReady: an empty operational_scenario_tags is
// sometimes the honest, correct answer (see below), so it must never turn a valid payload invalid.

/** The three connection-signature fields discover.mjs scores a connection from (see that module's own
 * header comment for the exact basis names: shared_scenario / shared_compliance_object /
 * shared_jurisdiction_topic — jurisdiction_topic additionally needs topic_tags). */
export const SIGNATURE_TAG_FIELDS = Object.freeze(["operational_scenario_tags", "compliance_object_tags", "topic_tags"]);

const BASIS_NAME = Object.freeze({
  operational_scenario_tags: "shared_scenario",
  compliance_object_tags: "shared_compliance_object",
  topic_tags: "shared_jurisdiction_topic (also needs a shared jurisdiction)",
});

function isEmptyTagArray(v) {
  return !Array.isArray(v) || v.length === 0;
}

/**
 * Report empty signature-tag arrays on a mint PAYLOAD's `item` object. PURE. Never throws on a
 * malformed/absent `item` — degrades to "all three fields empty," which is the honest reading of a
 * payload that carries no tag data at all.
 *
 * WHY A WARNING, NOT A HARD FAILURE (never blocks a mint, unlike validateMintPayload's C1-C7 criteria):
 * operational_scenario_tags is legitimately OPEN vocabulary and CAN be genuinely empty — system-prompt.ts's
 * own guidance: "Empty array allowed when the item has no clear operational scenario (e.g. background
 * research). Better to emit nothing than to invent a tag." The same honesty applies to
 * compliance_object_tags for a pure research_finding with no named compliance object. Blocking every
 * empty-tag payload would force exactly the "invent a plausible tag" behavior the operator rule (no
 * assumptions, never silent auto-tagging) forbids. So this module only makes the state VISIBLE, at the
 * point a human can still act on it (author the payload's tags, or consciously accept the gap and plan
 * a propose-tags.mjs follow-up) — never a silent skip and never an invented value.
 *
 * @param {{item?: Record<string, unknown>}} payload - a mint payload (see payload-schema.json's `item`)
 * @returns {{
 *   allEmpty: boolean,
 *   emptyFields: string[],
 *   presentFields: string[],
 *   warnings: Array<{field:string, reason:string}>,
 * }}
 */
export function checkTagPresence(payload) {
  const item = payload && typeof payload === "object" && payload.item && typeof payload.item === "object" ? payload.item : {};
  const emptyFields = [];
  const presentFields = [];
  const warnings = [];

  for (const field of SIGNATURE_TAG_FIELDS) {
    if (isEmptyTagArray(item[field])) {
      emptyFields.push(field);
      warnings.push({
        field,
        reason:
          `payload.item.${field} is empty or absent — this item will mint with no ${field} value, so ` +
          `discover.mjs cannot ever score it a ${BASIS_NAME[field]} basis against another item.`,
      });
    } else {
      presentFields.push(field);
    }
  }

  const allEmpty = emptyFields.length === SIGNATURE_TAG_FIELDS.length;
  if (allEmpty) {
    warnings.push({
      field: "*",
      reason:
        "ALL THREE connection-signature tag fields are empty or absent — this item will score ZERO " +
        "discover.mjs edges at mint (the exact August-census-wave defect scripts/connections/derive-tags.mjs " +
        "/ propose-tags.mjs / apply-tags.mjs exist to remediate after the fact). Prefer authoring real tags " +
        "into this payload before minting; if that is not possible, plan a follow-up: " +
        "node scripts/connections/propose-tags.mjs --ids <item-id> --execute once the item has an id.",
    });
  }

  return { allEmpty, emptyFields, presentFields, warnings };
}
