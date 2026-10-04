// read-assessments.mjs -- the ONE home for turning a migration-344 `research_assessments_current` row
// into the render-ready view model Research's surfaces consume. Lane W2-R, 2026-10-01.
//
// PLAIN ESM, ZERO DEPENDENCIES, NO I/O -- same constraint as theme-brief.mjs and taxonomy.mjs in this
// same directory, so this has a portable `node --test` proof and the detail/list pages can import it
// under this project's allowJs tsconfig with no build step. The actual Supabase read happens at the call
// site (src/app/research/page.tsx, src/app/research/[slug]/page.tsx), mirroring theme-brief.mjs's own
// division of labor exactly: this module selects and shapes, the page fetches.
//
// WHAT "ABSENCE" MEANS HERE (spec-03's own rule, carried into every view this module builds): "a value
// that exists is shown; one that cannot exist yet names the data it needs." Every field below is either
// a real value or an explicit, worded absence -- never a blank, never a zero, never a guessed default.
//
/**
 * @typedef {{
 *   item_id: string,
 *   technical_maturity_low: number|null, technical_maturity_high: number|null, technical_maturity_method: string|null,
 *   commercial_maturity_low: number|null, commercial_maturity_high: number|null, commercial_maturity_method: string|null,
 *   horizon_kind: string|null, horizon_band: string|null, horizon_rule: string|null, horizon_confidence: string|null,
 *   horizon_trigger_note: string|null, refusal_reason: string|null,
 *   credibility_evidence_score: string|null, credibility_authority_score: object|null,
 *   status_token: string, computed_at: string,
 * }} ResearchAssessmentRow
 */

/**
 * @typedef {{
 *   itemId: string,
 *   technicalMaturity: { low: number, high: number, method: string|null } | null,
 *   commercialMaturity: { low: number, high: number, method: string|null } | null,
 *   horizon: { kind: string, band: string, rule: string, confidence: string, triggerNote: string|null } | null,
 *   isRefusal: boolean,
 *   refusalReason: string|null,
 *   credibilityEvidenceScore: string|null,
 *   credibilityAuthorityScore: object|null,
 *   statusToken: "CONFIRMED"|"HYPOTHESIS",
 *   computedAt: string,
 * }} ResearchAssessmentView
 */

/** Shown on the horizon section when the assessment itself is a mandatory refusal (spec-03 section 6). */
export function refusalDisplayText(reason) {
  return reason || "not forecastable, and the conditional structure could not be determined";
}

/**
 * Build the render-ready view model for one `research_assessments_current` row. Returns null for no row
 * (the honest "no assessment yet" state -- the caller renders its own absence wording, never this
 * module's business).
 * @param {ResearchAssessmentRow | null | undefined} row
 * @returns {ResearchAssessmentView | null}
 */
export function selectAssessmentView(row) {
  if (!row) return null;
  const tm =
    row.technical_maturity_low != null && row.technical_maturity_high != null
      ? { low: row.technical_maturity_low, high: row.technical_maturity_high, method: row.technical_maturity_method ?? null }
      : null;
  const cm =
    row.commercial_maturity_low != null && row.commercial_maturity_high != null
      ? { low: row.commercial_maturity_low, high: row.commercial_maturity_high, method: row.commercial_maturity_method ?? null }
      : null;
  const horizon =
    row.horizon_band && row.horizon_rule
      ? {
          kind: row.horizon_kind,
          band: row.horizon_band,
          rule: row.horizon_rule,
          confidence: row.horizon_confidence,
          triggerNote: row.horizon_trigger_note ?? null,
        }
      : null;
  return {
    itemId: row.item_id,
    technicalMaturity: tm,
    commercialMaturity: cm,
    horizon,
    isRefusal: !horizon,
    refusalReason: row.refusal_reason ?? null,
    credibilityEvidenceScore: row.credibility_evidence_score ?? null,
    credibilityAuthorityScore: row.credibility_authority_score ?? null,
    statusToken: row.status_token,
    computedAt: row.computed_at,
  };
}

/**
 * Batch form for a list surface: turns an array of rows into a Map keyed by item_id, so a ledger can do
 * one `O(1)` lookup per row instead of scanning the array per render.
 * @param {ResearchAssessmentRow[] | null | undefined} rows
 * @returns {Map<string, ResearchAssessmentView>}
 */
export function selectAssessmentViewsByItemId(rows) {
  const map = new Map();
  for (const row of rows ?? []) {
    const view = selectAssessmentView(row);
    if (view) map.set(view.itemId, view);
  }
  return map;
}

/** Short horizon label for a list row's meta line, e.g. "NEAR horizon (R3)". Null when there is no
 *  horizon read (the refusal state) -- the caller decides whether to show a "not forecastable" marker
 *  instead, never this module inventing display copy for the list-row context. */
export function horizonMetaLabel(view) {
  if (!view || !view.horizon) return null;
  return `${view.horizon.band} horizon (${view.horizon.rule})`;
}

/** Short maturity-corridor label, e.g. "TRL 8-9". Null when no technical-maturity corridor exists. */
export function technicalMaturityLabel(view) {
  if (!view || !view.technicalMaturity) return null;
  const { low, high } = view.technicalMaturity;
  return low === high ? `TRL ${low}` : `TRL ${low}-${high}`;
}

/** Short commercial-maturity corridor label, e.g. "CRI 3-4". Null when no corridor exists. */
export function commercialMaturityLabel(view) {
  if (!view || !view.commercialMaturity) return null;
  const { low, high } = view.commercialMaturity;
  return low === high ? `CRI ${low}` : `CRI ${low}-${high}`;
}
