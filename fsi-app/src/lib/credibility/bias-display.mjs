// bias-display: the pure display model for a source's bias tags on customer surfaces (lane P1,
// 2026-10-05). GOVERNING SKILL(S): source-credibility-model
//
// WHAT IT DECIDES, once, for every page: the human label of a stored tag, which tags a dense
// context (a list row) shows, which wait behind one disclosure (a detail page), and which tags read
// as lower confidence. Components render this model; none of them re-derives any of it.
//
// REUSE, not construction: the bounded slice comes from `selectBiasChipsForDisplay`
// (chip-selection.mjs, the hotfix 2026-05-22 contract: confidence desc, then dimension, then tag);
// the confidence line comes from `HIGH_CONFIDENCE_THRESHOLD` (bias-tag-pipeline.mjs, 0.80); the
// vocabulary is checked against `BIAS_TAG_VOCAB` in this module's test so a vocabulary change
// cannot leave a tag without a label.
//
// SCOPE (skill Section 6 and 8, ADR-041): bias applies to external publisher sources only. Callers
// pass the tags of a SOURCES-registry row; Community content never reaches this module.
//
// ABSENCE: no tags, or no usable tags, is an empty model and the component renders nothing. A tag
// is never invented and a missing one is never shown as a placeholder.

import { selectBiasChipsForDisplay } from "./chip-selection.mjs";
import { HIGH_CONFIDENCE_THRESHOLD } from "../sources/bias-tag-pipeline.mjs";

/** Human labels for the stored vocabulary (migration 092's CHECK list, source-credibility-model references/bias-tag-vocabulary.md Section 6). The
 *  stored token is a slug; the customer reads a phrase. `funding-opaque` reads "Funding undisclosed"
 *  because undisclosed is not the same as independent (spec 03 section 4, funding independence). */
export const BIAS_TAG_LABELS = Object.freeze({
  // Funding / institutional affiliation
  "industry-funded": "Industry funded",
  "government-funded": "Government funded",
  "foundation-funded": "Foundation funded",
  "subscription-supported": "Subscription supported",
  "academic-institutional": "Academic institution",
  "mixed-funded": "Mixed funding",
  "funding-opaque": "Funding undisclosed",
  // Methodological orientation
  "peer-reviewed": "Peer reviewed",
  "methodologically-transparent": "Method disclosed",
  "analytical-synthesis": "Analytical synthesis",
  "editorial-opinion": "Editorial opinion",
  advocacy: "Advocacy",
  "factual-reporting": "Factual reporting",
  "standards-defining": "Standards defining",
  // Stakeholder position
  "industry-incumbent": "Industry incumbent",
  "industry-challenger": "Industry challenger",
  "regulator-aligned": "Regulator aligned",
  "environmental-advocate": "Environmental advocate",
  "independent-research": "Independent research",
  "customer-perspective": "Customer perspective",
  "labor-perspective": "Labour perspective",
  "investor-perspective": "Investor perspective",
});

export const BIAS_DIMENSION_LABELS = Object.freeze({
  funding: "Funding",
  methodology: "Method",
  stakeholder: "Position",
});

const DIMENSIONS = ["funding", "methodology", "stakeholder"];

/** Label for a stored tag. A tag outside the vocabulary (legacy or fixture rows) is humanized from
 *  its slug rather than dropped or shown raw, so display never throws on drift. */
export function biasTagLabel(tag) {
  const key = String(tag ?? "").trim();
  if (Object.prototype.hasOwnProperty.call(BIAS_TAG_LABELS, key)) return BIAS_TAG_LABELS[key];
  const spaced = key.replace(/[-_]+/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : "";
}

/** The words a lower-confidence tag carries. Confidence below the adopt-as-high threshold means the
 *  tag was adopted automatically in the 0.65 to 0.79 band (lane S1-B: stored as
 *  haiku_auto_high_confidence with the real confidence kept). A tag with no stored confidence is
 *  not claimed to be lower confidence. */
export const LOWER_CONFIDENCE_WORDS = "lower confidence";

/** True when a stored tag is below the adopt-as-high line. Pure. */
export function isLowerConfidence(confidence) {
  return typeof confidence === "number" && Number.isFinite(confidence) && confidence < HIGH_CONFIDENCE_THRESHOLD;
}

/**
 * @typedef {Object} BiasChipModel
 * @property {string} key
 * @property {string} tag
 * @property {'funding'|'methodology'|'stakeholder'|null} dimension
 * @property {string} label
 * @property {boolean} lowerConfidence
 * @property {number|null} confidencePct
 */

/** @returns {BiasChipModel} */
function toChip(t) {
  /** @type {BiasChipModel['dimension']} */
  const dimension = DIMENSIONS.includes(t.dimension) ? t.dimension : null;
  return {
    key: `${t.dimension}:${t.tag}`,
    tag: String(t.tag),
    dimension,
    label: biasTagLabel(t.tag),
    lowerConfidence: isLowerConfidence(t.confidence),
    confidencePct: typeof t.confidence === "number" && Number.isFinite(t.confidence) ? Math.round(t.confidence * 100) : null,
  };
}

/**
 * The display model for one source's tags.
 *
 * @param {Array<{dimension: string, tag: string, confidence?: number|null}>|null|undefined} tags
 * @param {number} maxChips how many chips are shown before the remainder (a list row passes 2, a
 *   detail page 3). Non-positive shows everything, matching selectBiasChipsForDisplay.
 * @returns {{ shown: BiasChipModel[], rest: BiasChipModel[], remaining: number, total: number }}
 *   `shown` is the bounded slice, `rest` the chips behind the disclosure (the same tags
 *   selectBiasChipsForDisplay counted in `remaining`), `total` every usable tag.
 */
export function buildBiasDisplay(tags, maxChips) {
  const usable = (Array.isArray(tags) ? tags : []).filter(
    (t) => t && typeof t.tag === "string" && t.tag.trim() !== "" && DIMENSIONS.includes(t.dimension),
  );
  if (usable.length === 0) return { shown: [], rest: [], remaining: 0, total: 0 };
  const { displayed, remaining } = selectBiasChipsForDisplay(usable, maxChips);
  const shownSet = new Set(displayed);
  // The disclosure holds every usable tag the slice did not show. Sorted by "dimension:tag", which
  // is dimension order (funding, methodology, stakeholder) then tag, so the order never depends on
  // the order the database returned the rows in.
  const rest = usable
    .filter((t) => !shownSet.has(t))
    .map(toChip)
    .sort((a, b) => a.key.localeCompare(b.key));
  return { shown: displayed.map(toChip), rest, remaining, total: usable.length };
}

/** True when `tags` holds at least one usable tag, the same test buildBiasDisplay applies, so a
 *  caller that gates a wrapper or a line on "has bias" can never disagree with the chips. */
export function hasBiasTags(tags) {
  return buildBiasDisplay(tags, 1).total > 0;
}

/** The whole vocabulary grouped by dimension with labels, for a legend. Built from the label table,
 *  never typed per page. */
export function biasLegendGroups(vocab) {
  return DIMENSIONS.map((dimension) => ({
    dimension,
    label: BIAS_DIMENSION_LABELS[dimension],
    tags: (vocab?.[dimension] ?? []).map((tag) => ({ tag, label: biasTagLabel(tag) })),
  }));
}
