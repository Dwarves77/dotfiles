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
