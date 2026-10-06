// Single source of truth for the constrained metadata vocabulary AT THE DB BOUNDARY.
//
// The skill / system-prompt / parser speak the DISPLAY form (severity = UPPERCASE space,
// e.g. "ACTION REQUIRED"). intelligence_items stores the DB form (severity = lowercase_underscore,
// e.g. "action_required") — migration 102 converted the column and declared that form "canonical from
// here forward". The mismatch silently rejected the whole metadata UPDATE on a CHECK violation, which the
// unchecked write swallowed (the 2026-06-07 metadata-persist audit).
//
// This module is the ONE place the display<->db mapping lives, so the write boundary and (when the
// surface-severity consolidation follow-on lands) the read/display surfaces share one definition instead
// of the four divergent per-component vocabularies that exist today.
//
// The allowed-value sets are copied VERBATIM from the LIVE pg_constraint definitions on
// public.intelligence_items (dumped 2026-06-07, scripts/_diag/probe-live-checks.mjs) — the authoritative
// source, because the migration FILE and an old schema snapshot disagreed and the snapshot was stale.
// If a migration later changes a CHECK, update the matching set here in the same change.

// ── severity: display (skill/agent) <-> db (stored) ──
// The 5 SKILL.md decision-pressure labels. The DB severity CHECK also permits per-surface vocabularies
// (critical/high/moderate/low, immediate/watch/reference/background) used by non-agent writers; those are
// pass-through-valid and listed in DB_SEVERITY_VALUES below.
export const SEVERITY_DISPLAY_TO_DB = {
  "ACTION REQUIRED": "action_required",
  "COST ALERT": "cost_alert",
  "WINDOW CLOSING": "window_closing",
  "COMPETITIVE EDGE": "competitive_edge",
  MONITORING: "monitoring",
} as const;
export type SeverityDisplay = keyof typeof SEVERITY_DISPLAY_TO_DB;
export type SeverityDb = (typeof SEVERITY_DISPLAY_TO_DB)[SeverityDisplay];

export const SEVERITY_DB_TO_DISPLAY: Record<string, string> = Object.fromEntries(
  Object.entries(SEVERITY_DISPLAY_TO_DB).map(([display, db]) => [db, display]),
);

// ── LIVE allowed-value sets (verbatim from pg_constraint, 2026-06-07) ──
export const DB_SEVERITY_VALUES = new Set<string>([
  // SKILL.md 5-label set (lowercase_underscore — what agent writes map to)
  "action_required", "cost_alert", "window_closing", "competitive_edge", "monitoring",
  // per-surface vocabularies the column also accepts (non-agent writers)
  "critical", "high", "moderate", "low",
  "immediate", "watch", "reference", "background",
]);
// ── severity: DB form -> the 4-bucket Operations column key ──
// (Addendum 63, 2026-08-30.) This file's own header above says the read/display surfaces are
// meant to eventually share one definition instead of "the four divergent per-component
// vocabularies that exist today" — this is that follow-on for one concrete instance:
// two operations components (an items view since deleted, and OperationsLedger) each hand-copied
// this exact 13-entry map independently (byte-identical). Presentational tone/colour tokens stay local to each
// component (this module has no CSS knowledge); only the DB-value -> bucket-key mapping is
// shared, so the two copies cannot silently drift from each other again.
export const SEVERITY_TO_OPERATIONS_BUCKET: Readonly<Record<string, "critical" | "high" | "moderate" | "low">> = {
  critical: "critical", high: "high", moderate: "moderate", low: "low",
  action_required: "critical", cost_alert: "high", window_closing: "moderate",
  competitive_edge: "moderate", monitoring: "low", immediate: "critical",
  watch: "moderate", reference: "low", background: "low",
};

export const DB_PRIORITY_VALUES = new Set<string>(["CRITICAL", "HIGH", "MODERATE", "LOW"]);
export const DB_URGENCY_TIER_VALUES = new Set<string>(["watch", "elevated", "stable", "informational"]);
export const DB_FORMAT_TYPE_VALUES = new Set<string>([
  "regulatory_fact_document", "technology_profile", "operations_profile", "market_signal_brief", "research_summary",
]);
export const DB_SIGNAL_BAND_VALUES = new Set<string>(["price", "corporate", "corridor"]);
// THEME — the SINGLE vocabulary home (Wave-α C3, 2026-07-11). The live DB CHECK
// (intelligence_items_theme_check, migration 102; re-confirmed against pg_constraint 2026-07-11) is the
// authoritative set, listed here in canonical order. The parser (parse-output.ts THEME_VALUES) and the
// synthesis prompt's theme guidance IMPORT/mirror THIS list — the prior state had the parser validating
// theme against the 7 topic-tag values (a disjoint vocabulary), so toDbTheme() nulled EVERY agent-emitted
// theme and /research theme routing never received pipeline data by construction (CODE-1 F-10).
// theme_candidate capture (INV-1, migration 136) still banks any out-of-vocab residual.
export const DB_THEME_VALUE_LIST = [
  "emissions_accounting", "fuels_saf", "packaging_circular", "carbon_markets",
  "cold_chain_art", "last_mile_electrification", "disclosure_regimes",
] as const;
export type DbTheme = (typeof DB_THEME_VALUE_LIST)[number];
export const DB_THEME_VALUES = new Set<string>(DB_THEME_VALUE_LIST);

// Deterministic legacy-candidate map (Wave-α C3 backfill; consumed by
// scripts/_wave-alpha/backfill-themes.mjs). ONLY name-level 1:1 mappings from the RETIRED parser
// vocabulary (the 7 topic tags the agent emitted pre-C3, banked in theme_candidate) to the DB theme
// vocabulary. Ambiguous candidates are deliberately ABSENT: "emissions" could be emissions_accounting
// OR carbon_markets; "reporting" could be disclosure_regimes OR emissions_accounting; "transport" /
// "corridors" / "research" have no DB counterpart. Those stay banked in theme_candidate for the
// Emergence-Capture follow-on — a guessed backfill on a customer-routing column is worse than null.
export const THEME_CANDIDATE_DETERMINISTIC_MAP: Readonly<Record<string, DbTheme>> = Object.freeze({
  fuels: "fuels_saf",
  packaging: "packaging_circular",
});

/** Map the agent's DISPLAY severity to the DB form. Already-db-form values pass through (defensive).
 *  Throws on an unmappable value — that is a contract break (the agent emitted a non-vocabulary severity),
 *  caught loudly here rather than silently rejected by the DB CHECK. null/undefined -> null (severity is nullable). */
export function toDbSeverity(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  const mapped = SEVERITY_DISPLAY_TO_DB[value as SeverityDisplay];
  if (mapped) return mapped;
  if (DB_SEVERITY_VALUES.has(value)) return value; // already canonical db form
  throw new Error(`metadata-vocab: unmappable severity "${value}" (expected a SKILL.md display label or a db-form value)`);
}

/** Reverse map for display surfaces (DB form -> skill display label). Falls back to the raw value. */
export function toDisplaySeverity(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  return SEVERITY_DB_TO_DISPLAY[value] ?? value;
}

/** Gate a theme value to the LIVE DB vocabulary. An out-of-vocabulary theme returns null (honest, no
 *  force-fit) — its value is preserved by toThemeCandidate() below (capture-not-null), not lost. */
export function toDbTheme(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  return DB_THEME_VALUES.has(value) ? value : null;
}

/** Capture-not-null (Emergence-Capture INV-1, migration 136): the agent-proposed theme value to BANK in
 *  intelligence_items.theme_candidate when it matched no live theme vocabulary. Returns the residual value,
 *  or null when theme is DB-valid (clear the candidate) or absent. Banked WITH the row's provenance so the
 *  follow-on recurrence detector can mine it — never silently dropped. */
export function toThemeCandidate(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  return DB_THEME_VALUES.has(value) ? null : value;
}

// ── RESEARCH ASSESSMENT + PLANNING-ASSUMPTION vocabulary (Lane L9, 2026-10-02) ──
// Mirrors migration 344 (research_assessments) CHECK
// constraints verbatim -- the single home system-prompt.ts's Research Summary "Planning assumption
// shift" instruction cites real column names against, never invented ones (spec 03S1: "a card that
// cannot populate planning_assumption_shifted does not ship as a card"). The table is not written by
// this module or by this lane -- no intelligence_items column exists for this field (no migration was
// requested; see docs/ops/session-log.d/2026-10-02-l9.md), so these sets are read-only reference
// vocabulary for the prompt's instruction text, not a write-boundary validator like toDbTheme above.
export const DB_HORIZON_KIND_VALUES = new Set<string>(["availability", "economic", "obligation"]);
export const DB_HORIZON_BAND_VALUES = new Set<string>(["NOW", "NEAR", "MID", "FAR"]);
export const DB_HORIZON_RULE_VALUES = new Set<string>(["R1", "R2", "R3", "R4"]);
export const DB_HORIZON_CONFIDENCE_VALUES = new Set<string>(["low", "medium", "high"]);
export const DB_CREDIBILITY_EVIDENCE_SCORE_VALUES = new Set<string>(["limited", "medium", "robust"]);
// IEA-extended TRL corridor bound (technical_maturity_low/high) and ARENA CRI corridor bound
// (commercial_maturity_low/high), migration 344's CHECK ranges, verbatim.
export const TECHNICAL_MATURITY_RANGE = Object.freeze({ min: 1, max: 11 });
export const COMMERCIAL_MATURITY_RANGE = Object.freeze({ min: 1, max: 6 });

// The mandatory non-null sentinel for a research_summary brief's "Planning assumption shift:" line
// (spec 03S1). Locked, exact string the agent must emit verbatim when the input context supplies
// no research_assessments read -- never invented prose. This is the brief-GENERATION sentinel token
// the non-null check below matches against.
export const PLANNING_ASSUMPTION_SHIFT_ABSENCE = "no shift grounded";

/** Enforces spec 03S1's own rule in CODE, not prompt convention (the brief's acceptance test: "a
 *  non-null constraint CHECK in the test, not just a convention comment in the prompt"): a research_
 *  summary brief's planning-assumption-shift line must never be null or blank. Throws loudly rather than
 *  let an empty line through silently -- "a card that cannot populate this does not ship as a card." The
 *  sentinel value (PLANNING_ASSUMPTION_SHIFT_ABSENCE) is itself a VALID non-null value; this function
 *  only rejects null/undefined/empty-after-trim, it does not require a grounded (non-sentinel) answer. */
export function assertPlanningAssumptionShifted(value: string | null | undefined): void {
  if (value == null || value.trim() === "") {
    throw new Error(
      `metadata-vocab: planning_assumption_shifted is required but null/blank -- a research_summary ` +
        `brief must emit either a grounded shift or the sentinel "${PLANNING_ASSUMPTION_SHIFT_ABSENCE}", never omit the line (spec 03S1).`,
    );
  }
}

/** Defensive validator for the pass-through enum fields (priority/urgency_tier/format_type/signal_band).
 *  The parser already validates these against sets identical to the DB, so a violation here means parser/DB
 *  drift — throw loudly with the field named rather than let the DB silently reject the whole row. */
export function assertDbValue(field: string, value: string | null | undefined, allowed: Set<string>, nullable = true): void {
  if (value == null || value === "") {
    if (nullable) return;
    throw new Error(`metadata-vocab: ${field} is required but null`);
  }
  if (!allowed.has(value)) {
    throw new Error(`metadata-vocab: ${field}="${value}" is not in the live DB allowed set {${[...allowed].join(", ")}}`);
  }
}
