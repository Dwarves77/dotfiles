// operations-ask-context.mjs — pure formatting for the Intelligence Assistant's Operations-data
// grounding block (WO-11, docs/plans/operations-lane-spec-from-repo.md §WO-11).
//
// WHAT THIS IS NOT: it makes no DB call and no model call. src/app/api/ask/route.ts fetches
// `regional_data_facts` (joined to `regions` for the code and to `sources` for the name), `regions`
// (the full roster, for the coverage-gap header), and `state_cost_facts` (joined to `sources`) via its
// OWN service-role client — the same three tables fetchOperationsCoverage()/fetchStateCostFacts()
// already read in fsi-app/src/lib/supabase-server.ts, re-implemented locally per the WO-11 spec's
// instruction to avoid a write to that reader-lane file. This module only turns already-fetched rows
// into the "AVAILABLE OPERATIONS DATA" text block appended to route.ts's `dynamicTail`.
//
// GROUNDING DISCIPLINE THIS MODULE ENFORCES (platform standing doctrine — grounded, provenanced
// answers only; see src/lib/contracts/provenance-envelope.mjs and
// src/lib/regional/regional-facts-envelope.mjs for the envelope this mirrors):
//   - Every fact line carries a source, or is EXPLICITLY marked "no canonical source on record" — the
//     exact phrase route.ts's own itemsContext already uses for a sourceless intelligence_item, so the
//     Assistant's context never uses two different words for the same gap. A row is never silently
//     presented as sourced when it is not.
//   - An ENVELOPED row (migration 267: value_numeric + unit populated) renders unit, currency,
//     origin_class, derivation and an as-of date/reference-period explicitly — never a bare number.
//     Rule-0.15 re-confirmation this session (2026-08-30, live query against kwrsbpiseruzbfwjpvsp):
//     0 of 75 regional_data_facts rows are enveloped today (value_numeric/source_id/origin_class all
//     0/75; both WO-17 producers are kill-switched OFF). So formatRegionalDataFactLine's enveloped
//     branch is exercised by the synthetic fixture in operations-ask-context.test.mjs only, until a
//     WO-17 producer actually lands a row — this module is written to work correctly today on 100%
//     legacy rows AND light up automatically the moment an enveloped row arrives, per the WO-11 brief.
//   - A LEGACY row (75/75 regional_data_facts rows today) renders its free-text `value`, its `status`
//     state-of-market phrase when present, its `source_note` (a full citation string — confirmed live
//     75/75 populated, this is the actual source for every row today since `source_id` is 0/75), and
//     `last_updated` labelled honestly as "last updated" — NEVER as the source's own as-of date, because
//     `as_at_date` is NULL on every legacy row (0/75 live) and asserting one it doesn't have would be
//     exactly the fabrication this platform's "never impute" doctrine (spec 04 §3) forbids. `last_updated`
//     is when this row was ingested, not when the source asserted the figure — a real distinction, kept
//     honest here rather than blurred into one "date" label.
//   - `state_cost_facts` (13/13 rows carry unit/source_id/statute_citation live; origin_class is 0/13
//     populated) has no value_numeric/derivation envelope of its own (confirmed live: that table's
//     columns are id, region_id, state_code, state_label, dimension, fact_label, value, unit, trend,
//     source_id, statute_citation, effective_date, last_updated, created_at, origin_class — a different,
//     narrower shape than regional_data_facts). formatStateCostFactLine renders what that shape actually
//     carries: value+unit, the statute citation as source-of-record, the joined source name when present,
//     origin_class when present, and effective_date as the as-of date (a real column here, unlike
//     regional_data_facts's legacy rows).

const NO_SOURCE = "no canonical source on record";

/** Trim an ISO timestamp or date string down to its YYYY-MM-DD prefix. Pure — no wall-clock read. */
function dateOnly(value) {
  if (!value) return null;
  const s = String(value);
  const m = s.match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : s;
}

/**
 * True iff `fact` carries a usable migration-267 numeric envelope (value_numeric + unit). This is the
 * ONLY signal this module uses to pick the enveloped-vs-legacy rendering branch — matches the same
 * co-nullability contract regional-facts-envelope.mjs's formatDisplayValue documents ("a populated
 * value_numeric with a NULL unit is a malformed envelope, not a valid one").
 * @param {{value_numeric?: number|null, unit?: string|null}} fact
 */
export function isEnveloped(fact) {
  return (
    typeof fact?.value_numeric === "number" &&
    Number.isFinite(fact.value_numeric) &&
    typeof fact?.unit === "string" &&
    fact.unit.length > 0
  );
}

/**
 * Format one `regional_data_facts` row (already joined to its region code and, when source_id is set,
 * its source name) as one grounding line. Never throws on a sparse/legacy row — every field is optional
 * except region_code, dimension, fact_label and value (the four NOT NULL columns on the live table).
 * @param {{
 *   region_code: string, dimension: string, fact_label: string, value: string,
 *   status?: string|null, trend?: string|null, source_name?: string|null, source_note?: string|null,
 *   last_updated?: string|null, value_numeric?: number|null, unit?: string|null, currency?: string|null,
 *   derivation?: string|null, origin_class?: string|null, source_key?: string|null, source_ref?: string|null,
 *   n_observations?: number|null, method_version?: string|null, as_at_date?: string|null,
 *   reference_period?: string|null,
 * }} fact
 * @returns {string}
 */
export function formatRegionalDataFactLine(fact) {
  const head = `[${fact.region_code}/${fact.dimension}] ${fact.fact_label}`;
  const bits = [];

  if (isEnveloped(fact)) {
    const currency = fact.currency ? ` ${fact.currency}` : "";
    bits.push(`value: ${fact.value_numeric} ${fact.unit}${currency}`);
    if (fact.origin_class) bits.push(`origin: ${fact.origin_class}`);
    if (fact.derivation) bits.push(`derivation: ${fact.derivation}`);
    const asOf = dateOnly(fact.as_at_date) || (fact.reference_period ? `period ${fact.reference_period}` : null);
    bits.push(asOf ? `as of: ${asOf}` : "as of: unknown");
    if (typeof fact.n_observations === "number" && fact.n_observations > 0) bits.push(`n=${fact.n_observations}`);
    const src =
      fact.source_name ||
      (fact.source_key ? `${fact.source_key}${fact.source_ref ? " " + fact.source_ref : ""}` : null);
    bits.push(src ? `source: ${src}` : `source: ${NO_SOURCE}`);
  } else {
    bits.push(`value: ${fact.value}`);
    if (fact.status) bits.push(`status: ${fact.status}`);
    if (fact.trend) bits.push(`trend: ${fact.trend}`);
    const src = fact.source_name || fact.source_note || null;
    bits.push(src ? `source: ${src}` : `source: ${NO_SOURCE}`);
    const lu = dateOnly(fact.last_updated);
    bits.push(lu ? `last updated: ${lu}` : "last updated: unknown");
  }

  return `- ${head} — ${bits.join(" | ")}`;
}

/**
 * Format one `state_cost_facts` row as one grounding line. See the module header for why this table's
 * shape (statute_citation + effective_date, no value_numeric envelope) is rendered differently from
 * regional_data_facts.
 * @param {{
 *   state_code: string, state_label?: string|null, dimension?: string|null, fact_label: string,
 *   value: string, unit?: string|null, trend?: string|null, statute_citation?: string|null,
 *   effective_date?: string|null, source_name?: string|null, origin_class?: string|null,
 * }} fact
 * @returns {string}
 */
export function formatStateCostFactLine(fact) {
  const label = fact.state_label ? `${fact.state_code} ${fact.state_label}` : fact.state_code;
  const head = `[${label}] ${fact.fact_label}`;
  const bits = [];

  const unit = fact.unit ? ` ${fact.unit}` : "";
  bits.push(`value: ${fact.value}${unit}`);
  if (fact.origin_class) bits.push(`origin: ${fact.origin_class}`);
  if (fact.trend) bits.push(`trend: ${fact.trend}`);
  const src = fact.source_name || fact.statute_citation || null;
  bits.push(src ? `source: ${src}` : `source: ${NO_SOURCE}`);
  const eff = dateOnly(fact.effective_date);
  bits.push(eff ? `effective: ${eff}` : "effective: unknown");

  return `- ${head} — ${bits.join(" | ")}`;
}

/**
 * Assemble the full "AVAILABLE OPERATIONS DATA" block appended to route.ts's `dynamicTail`. Pure: every
 * input is already-fetched data, nothing here reads the DB, the model, or the clock.
 *
 * The coverage-gap header is COMPUTED, not hard-coded, from whichever region codes actually appear in
 * `regionalFacts` versus the full `regionCodes` roster — so it states today's true gap (live: ASIA, UAE,
 * UK sourced; EU, US not) and updates itself the moment a WO-17 producer lands an EU/US row, with no
 * code change required.
 * @param {{
 *   regionCodes: string[],
 *   regionalFacts: Array<Parameters<typeof formatRegionalDataFactLine>[0]>,
 *   stateCostFacts: Array<Parameters<typeof formatStateCostFactLine>[0]>,
 * }} input
 * @returns {string}
 */
export function buildOperationsAskContext({ regionCodes, regionalFacts, stateCostFacts }) {
  const codes = Array.isArray(regionCodes) ? regionCodes : [];
  const facts = Array.isArray(regionalFacts) ? regionalFacts : [];
  const states = Array.isArray(stateCostFacts) ? stateCostFacts : [];

  const factRegionCodes = new Set(facts.map((f) => f.region_code));
  const sourced = codes.filter((c) => factRegionCodes.has(c));
  const unsourced = codes.filter((c) => !factRegionCodes.has(c));

  const header = codes.length
    ? `Regions with sourced Operations data: ${sourced.length ? sourced.join(", ") : "none"}.` +
      (unsourced.length ? ` ${unsourced.join(", ")}: no sourced Operations data yet.` : "")
    : "No Operations region roster available.";

  const factLines = facts.map(formatRegionalDataFactLine).join("\n");
  const stateLines = states.map(formatStateCostFactLine).join("\n");

  return [
    "AVAILABLE OPERATIONS DATA (regional cost/labour/materials/infrastructure facts and per-state cost",
    "facts from the Operations tables — background reference data, like AVAILABLE SOURCES above, NOT",
    "individually citable [Item: ...] entries; do not fabricate an [Item: ...] citation for a row below):",
    header,
    "",
    "Regional facts:",
    factLines || "(none fetched)",
    "",
    "Per-state cost facts:",
    stateLines || "(none fetched)",
  ].join("\n");
}
