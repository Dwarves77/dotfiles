export const BIAS_TAG_VOCAB = Object.freeze({
  funding: Object.freeze([
    "industry-funded",
    "government-funded",
    "foundation-funded",
    "subscription-supported",
    "academic-institutional",
    "mixed-funded",
    "funding-opaque",
  ]),
  methodology: Object.freeze([
    "peer-reviewed",
    "methodologically-transparent",
    "analytical-synthesis",
    "editorial-opinion",
    "advocacy",
    "factual-reporting",
    "standards-defining",
  ]),
  stakeholder: Object.freeze([
    "industry-incumbent",
    "industry-challenger",
    "regulator-aligned",
    "environmental-advocate",
    "independent-research",
    "customer-perspective",
    "labor-perspective",
    "investor-perspective",
  ]),
});

export const ASSIGNMENT_SOURCE = Object.freeze({
  HIGH_CONFIDENCE: "haiku_auto_high_confidence",
  // LEGACY: no writer produces this value any more (S1-B). Rows written before 2026-10-04 may still carry
  // it; bias-tags/logic.ts still treats it as overridable.
  LOW_CONFIDENCE: "haiku_proposed_low_confidence",
});

export const HIGH_CONFIDENCE_THRESHOLD = 0.80;
const LOW_CONFIDENCE_THRESHOLD = 0.65;

/**
 * Pure. Splits a Haiku `bias_tags` recommendation object into rows to insert
 * (with their target assignment_source already resolved) and rows discarded,
 * each discard carrying a reason. Never throws on malformed input; malformed
 * shapes are discarded with a reason instead, since a bad classifier response
 * must not crash the approval flow that calls this.
 *
 * @param {unknown} biasTags recommendation.bias_tags, shaped
 *   { funding?: {tag, confidence}[], methodology?: [...], stakeholder?: [...] }
 * @returns {{
 *   insertRows: Array<{dimension: string, tag: string, confidence: number, assignment_source: string}>,
 *   discarded: Array<{dimension: string, tag: unknown, confidence: unknown, reason: string}>,
 * }}
 */
export function splitBiasTagsByConfidence(biasTags) {
  const insertRows = [];
  const discarded = [];

  if (biasTags === null || biasTags === undefined) {
    return { insertRows, discarded };
  }
  if (typeof biasTags !== "object" || Array.isArray(biasTags)) {
    discarded.push({ dimension: null, tag: null, confidence: null, reason: "bias_tags is not an object" });
    return { insertRows, discarded };
  }

  for (const dimension of Object.keys(BIAS_TAG_VOCAB)) {
    const entries = biasTags[dimension];
    if (entries === undefined) continue;
    if (!Array.isArray(entries)) {
      discarded.push({ dimension, tag: null, confidence: null, reason: "dimension value is not an array" });
      continue;
    }
    for (const entry of entries) {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        discarded.push({ dimension, tag: null, confidence: null, reason: "entry is not an object" });
        continue;
      }
      const tag = entry.tag;
      const confidence = entry.confidence;

      if (typeof tag !== "string" || !BIAS_TAG_VOCAB[dimension].includes(tag)) {
        discarded.push({ dimension, tag, confidence, reason: "off-vocabulary tag" });
        continue;
      }
      if (typeof confidence !== "number" || Number.isNaN(confidence) || confidence < 0 || confidence > 1) {
        discarded.push({ dimension, tag, confidence, reason: "invalid confidence" });
        continue;
      }

      if (confidence >= HIGH_CONFIDENCE_THRESHOLD) {
        insertRows.push({ dimension, tag, confidence, assignment_source: ASSIGNMENT_SOURCE.HIGH_CONFIDENCE });
      } else if (confidence >= LOW_CONFIDENCE_THRESHOLD) {
        insertRows.push({ dimension, tag, confidence, assignment_source: ASSIGNMENT_SOURCE.HIGH_CONFIDENCE });
      } else {
        discarded.push({ dimension, tag, confidence, reason: "below 0.65 threshold" });
      }
    }
  }

  // Reject keys that aren't one of the three dimensions -- same guard the
  // route's own validateBiasTags applies, so classifier drift surfaces here
  // too rather than being silently ignored.
  for (const key of Object.keys(biasTags)) {
    if (!Object.prototype.hasOwnProperty.call(BIAS_TAG_VOCAB, key)) {
      discarded.push({ dimension: key, tag: null, confidence: null, reason: "unknown dimension key" });
    }
  }

  return { insertRows, discarded };
}

/**
 * Deps-injected writer. Splits `biasTags` and inserts the qualifying rows
 * into `source_bias_tags` for `sourceId`, via `deps.insertRows` (so tests run
 * without a database, pattern per lane-common-contract.md "DB access is
 * injected via a deps object").
 *
 * @param {{ insertRows: (rows: object[]) => Promise<{ error?: { message: string } | null }> }} deps
 * @param {string} sourceId
 * @param {unknown} biasTags recommendation.bias_tags
 * @returns {Promise<{ inserted: number, discarded: Array }>}
 */
export async function writeBiasTags(deps, sourceId, biasTags) {
  if (!deps || typeof deps.insertRows !== "function") {
    throw new Error("writeBiasTags requires deps.insertRows(rows)");
  }
  if (!sourceId || typeof sourceId !== "string") {
    throw new Error("writeBiasTags requires a sourceId");
  }

  const { insertRows, discarded } = splitBiasTagsByConfidence(biasTags);
  if (insertRows.length === 0) {
    return { inserted: 0, discarded };
  }

  const rows = insertRows.map((r) => ({
    source_id: sourceId,
    dimension: r.dimension,
    tag: r.tag,
    confidence: r.confidence,
    assignment_source: r.assignment_source,
  }));

  const { error } = await deps.insertRows(rows);
  if (error) {
    throw new Error(`bias-tag insert failed: ${error.message}`);
  }

  return { inserted: rows.length, discarded };
}
