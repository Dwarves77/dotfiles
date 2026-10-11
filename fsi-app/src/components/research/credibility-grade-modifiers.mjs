/**
 * @typedef {"flagged"|"not_assessed"} GradeModifierStatus
 * @typedef {{key: string, label: string, status: GradeModifierStatus, detail: string|null}} GradeModifier
 * @typedef {{dimension: "funding"|"methodology"|"stakeholder", tag: string, confidence: number|null}} ResearchBiasTag
 */
/**
 * The full GRADE-style modifier ledger spec-03 §4 names: indirectness, risk of bias, imprecision,
 * inconsistency, publication bias, and the two upgrades (large effect size, convergent independent
 * evidence). Only "risk of bias" has a live data path today (source_bias_tags); the rest render
 * `not_assessed` — this function is the ONE place that fact is stated, so a future data path lights
 * up its row here rather than requiring a second component to learn the same six-item list.
 *
 * @param {ResearchBiasTag[]} biasTags
 * @returns {GradeModifier[]}
 */

export function buildGradeModifiers(biasTags) {
  const tags = biasTags ?? [];
  const biasDetail =
    tags.length > 0
      ? tags
          .map((b) => `${b.dimension}: ${b.tag}${b.confidence != null ? ` (confidence ${Math.round(b.confidence * 100)}%)` : ""}`)
          .join("; ")
      : null;
  return [
    {
      key: "risk_of_bias",
      label: "Risk of bias",
      status: tags.length > 0 ? "flagged" : "not_assessed",
      detail: biasDetail,
    },
    { key: "indirectness", label: "Indirectness", status: "not_assessed", detail: null },
    { key: "imprecision", label: "Imprecision", status: "not_assessed", detail: null },
    { key: "inconsistency", label: "Inconsistency", status: "not_assessed", detail: null },
    { key: "publication_bias", label: "Publication bias", status: "not_assessed", detail: null },
    {
      key: "upgrades",
      label: "Upgrades (large effect size, convergent evidence)",
      status: "not_assessed",
      detail: null,
    },
  ];
}
