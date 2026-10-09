// bias-tag-pipeline: split a Haiku classification's `bias_tags` recommendation
// by confidence band and write the qualifying rows into `source_bias_tags`.
//
// Context. `/api/admin/sources/recommend-classification` (route.ts) has Haiku
// propose `bias_tags` (three dimensions: funding / methodology / stakeholder,
// per source-credibility-model references/bias-tag-vocabulary.md Section 6) and caches the raw
// recommendation onto `provisional_sources.recommended_classification`. The
// route's own comment says the shape is validated "before it reaches... the
// bias-tag write path", but nothing downstream ever inserted into
// `source_bias_tags`. Audit triage 2026-09-28 (docs/ops/session-log.d/
// 2026-09-28-audit-triage.md, finding B `source_bias_tags.*`) confirmed the
// gap: designed, documented, never built.
//
// Where this wires in. `source_bias_tags.source_id` is a NOT NULL FK to
// `sources.id` (migration 092). A provisional source has no `sources` row
// until `/api/admin/sources/promote` approves it and inserts one, so the
// write CANNOT happen at recommend-classification return time (no source_id
// exists yet). It can only happen at candidate-approval time, in
// `promote/route.ts`'s `decision === "approve"` branch, once `inserted.id`
// is known. That is where this module is called from.
//
// Confidence bands (migration 092 `source_bias_tags_assignment_source_chk`,
// mirrored in the recommend-classification system prompt's own guidance,
// Section 6 of source-credibility-model references/bias-tag-vocabulary.md "Assignment"):
//   >= 0.80        -> insert, assignment_source = 'haiku_auto_high_confidence'
//   0.65 - 0.79    -> insert, assignment_source = 'haiku_auto_high_confidence'
//                     with the real confidence kept in `confidence` (lane
//                     S1-B, 2026-10-04: no tag waits on a confirm click; the
//                     admin PATCH route stays as an OPTIONAL override, confirm
//                     or remove. Migration 092's CHECK admits no other
//                     automatic value, and migration 097 already set the
//                     precedent of 0.75+ rows stored under this value, so no
//                     new vocabulary token and no migration is needed.)
//   < 0.65         -> discard, never written
//
// Vocabulary (dimension -> tag) is copied verbatim from migration 092's
// `source_bias_tags_vocabulary_chk` / the route's own BIAS_TAG_VOCAB, so a
// tag or dimension outside the CHECK list is rejected here before it ever
// reaches the database (belt-and-suspenders: the CHECK constraint would also
// reject it, but failing a batch insert on one bad row is worse than
// filtering it out with a reported reason).

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
export const LOW_CONFIDENCE_THRESHOLD = 0.65;

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
