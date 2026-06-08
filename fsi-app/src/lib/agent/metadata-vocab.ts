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
export const DB_PRIORITY_VALUES = new Set<string>(["CRITICAL", "HIGH", "MODERATE", "LOW"]);
export const DB_URGENCY_TIER_VALUES = new Set<string>(["watch", "elevated", "stable", "informational"]);
export const DB_FORMAT_TYPE_VALUES = new Set<string>([
  "regulatory_fact_document", "technology_profile", "operations_profile", "market_signal_brief", "research_summary",
]);
export const DB_SIGNAL_BAND_VALUES = new Set<string>(["price", "corporate", "corridor"]);
// NOTE: the live theme CHECK uses the /research grouping vocabulary, which is DIFFERENT from the
// topic-tag set the agent/parser emit (no clean 1:1 map). Per the Emergence-Capture design decision
// (2026-06-07) theme is an OPEN-WORLD field heading for a reference table + governed promotion; until that
// follow-on lands, toDbTheme() writes null for an unmatched value rather than force-fitting it.
export const DB_THEME_VALUES = new Set<string>([
  "emissions_accounting", "fuels_saf", "packaging_circular", "carbon_markets",
  "cold_chain_art", "last_mile_electrification", "disclosure_regimes",
]);

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
