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
