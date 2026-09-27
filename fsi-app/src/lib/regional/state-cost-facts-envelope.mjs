// state-cost-facts-envelope.mjs, pure grounding + row-building + upsert-planning for the
// state_cost_facts producer (lane STATE-COST-PRODUCER, docs/plans/data-machine-tool-gaps-2026-09-25.md
// "Collect" table row "state_cost_facts producer", operator ruling 2026-09-25 "build the producer").
//
// SCOPE, DELIBERATELY GENERAL (CLAUDE.md rule 19, examples-are-not-scope). migration 152's own comment
// names "minimum wage, labor rates, fuel taxes" as EXAMPLES of what this table holds ("etc."), never an
// exhaustive list, and the dimension CHECK is the SAME 6-value vocabulary regional_data_facts already
// shares (regulatory_feasibility, regional_resources, labor_markets, materials_sourcing, infrastructure,
// operational_cost). Every function below is generic over dimension/fact_label/state, nothing here is
// anchored to one state or one cost type. A caller (the CLI orchestrator, a test, a future live feed)
// supplies the candidate facts; this module only grounds, rates and shapes them.
//
// NO ENVELOPE COLUMNS HERE, unlike regional_data_facts (migration 267's full number envelope:
// value_numeric/unit/currency/derivation/source_key/...), state_cost_facts got ONLY `origin_class`
// (migration 267, nullable) added to its original migration-152 shape: value TEXT, unit, trend,
// source_id (FK -> sources), statute_citation, effective_date. This module targets the LIVE shape, not
// the regional_data_facts shape, see run-envelope-producer.mjs for why that table needed
// buildEnvelopeRow(); this table's `value` is already the display value, nothing derives it.
//
// GROUNDING (CLAUDE.md standing rule 18: "any span that is not verbatim in a capture (ADR-016)"). ADR-016
// ("Storage-side uncap", 2026-07-21) is the correct citation for this rule as a PAIR, not a mismatch: it
// is what keeps `agent_run_searches.result_content` the FULL captured source text rather than a sliced
// excerpt, which is the precondition for a verbatim-span check to mean anything (migration 264's own
// header, renaming `result_content_excerpt` -> `result_content`: "the column is not an excerpt, it is the
// FULL captured source content and the whole grounding pool -- `validate_item_provenance` criterion 3
// checks every FACT `source_span` verbatim against it"). This module applies the SAME discipline to
// state_cost_facts candidates: `span_text` must be a verbatim substring of the candidate's own capture,
// exactly what criterion 3 checks for a regulatory FACT against its stored capture.
//
// SOURCE RATING (CLAUDE.md rule 18: "the source is found and rated, never the figure refused... tier
// from the institution class table, never hand-typed"). Tier comes from
// src/lib/sources/host-authority.ts's classTierForHost, THE deterministic register-at-grounding class
// table (SC-13), via the orchestrator's registerSource call, never guessed or hand-typed here.

/** Collapse whitespace runs to a single space and trim, for a tolerant-but-honest verbatim match (the
 * same normalisation class every capture/grounding path in this repo applies before a substring check, * never a fuzzy/semantic match, only whitespace-insensitive). */
function normaliseWhitespace(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Is `span` verbatim (whitespace-insensitive, case-sensitive) inside `captureText`? Pure. This is the
 * ADR-016-class check: a fact's supporting span must be a real substring of what was actually captured
 * from the source, never inferred or paraphrased.
 * @param {string} captureText
 * @param {string} span
 * @returns {boolean}
 */
export function isVerbatimSpan(captureText, span) {
  const normSpan = normaliseWhitespace(span);
  if (!normSpan) return false;
  const normCapture = normaliseWhitespace(captureText);
  return normCapture.includes(normSpan);
}

/**
 * Ground one candidate fact against its capture text. Refuses (never silently drops) a candidate whose
 * `span_text` is not verbatim in the capture, or whose `span_text` is absent, a figure with no
 * supporting span is exactly the "ungrounded" case CLAUDE.md rule 18 still refuses (the source may be
 * fine; the SPAN is what is missing).
 * @param {{span_text?: string|null}} candidate
 * @param {string|null|undefined} captureText
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function groundCandidate(candidate, captureText) {
  const span = candidate?.span_text;
  if (!span || !String(span).trim()) {
    return { ok: false, reason: "no span_text supplied, a figure with no supporting span is ungrounded, refused per ADR-016 / rule 18" };
  }
  if (!captureText || !String(captureText).trim()) {
    return { ok: false, reason: "no capture text available for this candidate's source_url, cannot verify verbatim span" };
  }
  if (!isVerbatimSpan(captureText, span)) {
    return { ok: false, reason: "span_text is not a verbatim (whitespace-insensitive) substring of the captured source text" };
  }
  return { ok: true };
}

/**
 * Deterministic origin_class from a resolved source tier, by DIRECT ANALOGY to
 * regional-facts-envelope.mjs's own reasoning (that file's header: "item_type='regional_data' + sources
 * tier T1-T3 -> 'official'... Official statistical and regulatory bodies... publishing their own
 * regional figures"). state_cost_facts is the SAME shape one grain down (a government body publishing
 * its own state-level statute/cost figure), so the same T1-T3 -> 'official' rule applies unmodified.
 * T4 (verifier/academic/association, host-authority.ts's own class table) -> 'verified': a credible
 * third party attesting to the figure, not the primary body itself. Anything weaker, or an
 * unclassifiable host (tier null), returns null rather than inventing a class, migration 267's own
 * comment: "a row this migration cannot confidently classify stays NULL, documented as pre-vocabulary,
 * rather than being forced into the weakest class it might not deserve."
 * @param {number|null|undefined} tier
 * @returns {"official"|"verified"|null}
 */
export function originClassForTier(tier) {
  if (typeof tier !== "number" || !Number.isFinite(tier)) return null;
  if (tier >= 1 && tier <= 3) return "official";
  if (tier === 4) return "verified";
  return null;
}

/**
 * Build one state_cost_facts row from a grounded candidate + its resolved source + region id. PURE, * the caller is responsible for having already grounded the candidate (groundCandidate) and resolved
 * the source (registerSource / classTierForHost) before calling this.
 * @param {object} candidate {state_code, state_label, dimension, fact_label, value, unit, trend,
 *   effective_date, statute_citation}
 * @param {{source_id: string, tier: number|null}} source
 * @param {string} regionId live `regions.id` for the candidate's parent region
 * @returns {object} a state_cost_facts row shape (no `id`/`created_at`/`last_updated`, DB defaults)
 */
export function buildStateCostFactRow(candidate, source, regionId) {
  return {
    region_id: regionId,
    state_code: candidate.state_code,
    state_label: candidate.state_label,
    dimension: candidate.dimension,
    fact_label: candidate.fact_label,
    value: String(candidate.value),
    unit: candidate.unit ?? null,
    trend: candidate.trend ?? null,
    source_id: source.source_id,
    statute_citation: candidate.statute_citation ?? null,
    effective_date: candidate.effective_date ?? null,
    origin_class: originClassForTier(source.tier),
  };
}

/** The live UNIQUE constraint key: (state_code, dimension, fact_label), migration 152's own
 * `UNIQUE (state_code, dimension, fact_label)`. */
export function naturalKey(row) {
  return `${row.state_code}|${row.dimension}|${row.fact_label}`;
}

const UPDATE_FIELDS = ["value", "unit", "trend", "source_id", "statute_citation", "effective_date", "origin_class"];

function rowsDiffer(existing, candidate) {
  return UPDATE_FIELDS.some((f) => (existing[f] ?? null) !== (candidate[f] ?? null));
}

/**
 * Idempotent upsert plan against the live (state_code, dimension, fact_label) unique constraint. Same
 * shape as regional-facts-envelope.mjs's planUpsert (insert / update / unchanged), scoped to this
 * table's own columns.
 * @param {Array<object>} existingRows current state_cost_facts rows (must carry `id` + the UPDATE_FIELDS)
 * @param {Array<object>} candidateRows buildStateCostFactRow() output
 * @returns {{toInsert: object[], toUpdate: Array<{id: string, patch: object}>, unchanged: number}}
 */
export function planUpsert(existingRows, candidateRows) {
  const byKey = new Map((existingRows ?? []).map((r) => [naturalKey(r), r]));
  const toInsert = [];
  const toUpdate = [];
  let unchanged = 0;
  for (const candidate of candidateRows ?? []) {
    const key = naturalKey(candidate);
    const existing = byKey.get(key);
    if (!existing) {
      toInsert.push(candidate);
      continue;
    }
    if (rowsDiffer(existing, candidate)) {
      const patch = {};
      for (const f of UPDATE_FIELDS) patch[f] = candidate[f] ?? null;
      toUpdate.push({ id: existing.id, patch });
    } else {
      unchanged += 1;
    }
  }
  return { toInsert, toUpdate, unchanged };
}
