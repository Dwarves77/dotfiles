/** @typedef {"emissions"|"fuels"|"packaging"|"carbon"|"cold-chain"|"last-mile"|"disclosure"} ThemeKey */
/** @typedef {"action"|"cost"|"monitor"|"background"} Severity */
/** Canonical theme order (also the keyword-match precedence order). @type {ReadonlyArray<ThemeKey>} */

export const THEME_KEYS = [
  "emissions",
  "fuels",
  "packaging",
  "carbon",
  "cold-chain",
  "last-mile",
  "disclosure",
];

/** Display label per theme - identical text in both former copies. @type {Record<ThemeKey, string>} */
export const THEME_LABELS = {
  emissions: "Emissions accounting",
  fuels: "Fuels & SAF",
  packaging: "Packaging & circular",
  carbon: "Carbon markets",
  "cold-chain": "Cold-chain & art",
  "last-mile": "Last-mile electrification",
  disclosure: "Disclosure regimes",
};

/**
 * One-line description per theme, shown on the /research theme cards (artboard 06/id="p6": each
 * theme card is "LABEL · count · +N new" over a one-line description). The four strings below are
 * the artboard's own, verbatim; the three themes the artboard does not draw (packaging, carbon,
 * cold-chain) carry no description rather than an invented one, and their card renders the head
 * row alone, logged in docs/design/handoff-2026-09-06/DEVIATION-LOG.md.
 * @type {Partial<Record<ThemeKey, string>>}
 */
export const THEME_DESCRIPTIONS = {
  emissions: "Methodology shifts that change how the workspace reports Scope 3.",
  fuels: "Production capacity, feedstock constraints, price trajectory.",
  "last-mile": "EV cargo capacity, charging rollout, zero-emission cargo bays.",
  disclosure: "CSRD omnibus, ISSB S2, emerging frameworks.",
};

/**
 * Maps the migration-102 `theme` DB column's canonical values to a ThemeKey. Identical in both
 * former copies. When a row carries a live `theme` column value, this wins over the keyword
 * regexes below (see assignTheme).
 * @type {Record<string, ThemeKey>}
 */
export const THEME_COLUMN_TO_KEY = {
  emissions_accounting: "emissions",
  fuels_saf: "fuels",
  packaging_circular: "packaging",
  carbon_markets: "carbon",
  cold_chain_art: "cold-chain",
  last_mile_electrification: "last-mile",
  disclosure_regimes: "disclosure",
};

/**
 * Regex fallback used when a row has no `theme` column value. See the file header for the
 * per-category provenance of every entry below - packaging and carbon were already identical
 * between the two former copies; emissions/fuels/cold-chain/disclosure adopt the superset that
 * had zero false positives on the live corpus; last-mile is the one hybrid (see header item 1).
 * @type {Record<ThemeKey, RegExp[]>}
 */
export const THEME_KEYWORDS = {
  emissions: [/scope ?3/i, /ghg/i, /emission/i, /co2|carbon footprint|tco2e|mtco2e/i, /accounting/i, /lca/i, /lifecycle/i],
  fuels: [/\bsaf\b/i, /sustainable aviation fuel/i, /hydrogen/i, /ammonia/i, /\bhefa\b/i, /e-saf/i, /biofuel/i, /alternative fuel/i, /marine fuel/i, /\blng\b/i],
  packaging: [/packaging/i, /\bppwr\b/i, /reuse/i, /crate/i, /pfas/i, /recyclable/i, /circular/i, /pet resin/i],
  carbon: [/\beu ets\b/i, /\bets\b/i, /carbon market/i, /carbon price/i, /\bcbam\b/i, /\beua\b/i, /allowance/i, /carbon pricing/i],
  "cold-chain": [/cold[- ]?chain/i, /climate[- ]?control/i, /refrigerant/i, /art handling/i, /fine art/i, /conservation/i, /vip|vacuum insulated/i],
  // HYBRID (header item 1): qualified EV pattern kept for precision; ehgv + electric truck kept
  // (evidence-clean on the live corpus); bare `\bev\b` and generic `battery` dropped (both
  // produced live false positives - a warehouse solar/battery-storage piece and two general
  // EV-market-outlook pieces, none of them last-mile-freight content).
  "last-mile": [/last[- ]?mile/i, /\bev\b.*(fleet|charging|cargo)/i, /ehgv/i, /electric truck/i, /urban delivery/i, /zero[- ]?emission/i, /\bzev\b/i],
  disclosure: [/\bcsrd\b/i, /\bissb\b/i, /\bsfdr\b/i, /\btcfd\b/i, /disclosure/i, /reporting standard/i, /\bs2\b/i, /verifier/i],
};

/**
 * Classify one item's research theme. `themeColumn` (the migration-102 `theme` DB value, when the
 * caller's row shape carries it) wins when present and recognized; otherwise falls back to a
 * keyword scan of `text` in THEME_KEYS order, first match wins. Returns null when nothing matches
 * (honest "no theme" - never a guessed default).
 * @param {string} text
 * @param {string | null | undefined} [themeColumn]
 * @returns {ThemeKey | null}
 */
export function assignTheme(text, themeColumn) {
  if (themeColumn && THEME_COLUMN_TO_KEY[themeColumn]) return THEME_COLUMN_TO_KEY[themeColumn];
  const t = text || "";
  for (const key of THEME_KEYS) {
    for (const re of THEME_KEYWORDS[key]) {
      if (re.test(t)) return key;
    }
  }
  return null;
}

/** Canonical severity order. @type {ReadonlyArray<Severity>} */
export const SEVERITY_KEYS = ["action", "cost", "monitor", "background"];

/** Display label per severity - identical text in both former copies. @type {Record<Severity, string>} */
export const SEVERITY_LABELS = {
  action: "Action required",
  cost: "Cost alert",
  monitor: "Monitor",
  background: "Background",
};

/**
 * FIX (lane W2-R, 2026-10-01, per lane W2-C's live-corpus finding): the item-3 defect this file's own
 * header named ("the column check is preserved EXACTLY ... dead-on-live-data and all") is fixed here,
 * not deferred again. Migration 102's REAL CHECK constraint admits 13 values of two shapes
 * (`supabase/migrations/102_severity_band_theme_columns.sql`): the Market Intel vocabulary
 * (`action_required`, `cost_alert`, `window_closing`, `competitive_edge`, `monitoring`), the
 * Operations/Regulations priority vocabulary (`critical`, `high`, `moderate`, `low`), and the
 * catch-all "other" vocabulary (`immediate`, `watch`, `reference`, `background`) Research's own rows
 * draw from. The PRIOR short-circuit compared against the literal strings "action"/"cost"/"monitor"/
 * "background" - none of which is a real stored value except "background" - so every live row with a
 * populated severity column (any of the other 12 real values) fell through to the text/recency
 * heuristic below and typically landed on "background" by default, independent of what was actually
 * stored. This map is the ONE place the 13-value live enum is translated to this module's 4-key
 * display band; every value maps to exactly one key, documented per mapping below.
 * @type {Record<string, Severity>}
 */
export const SEVERITY_COLUMN_TO_KEY = {
  // Market Intel vocabulary - identical-name pairs map directly; the other three are judgment calls
  // stated here rather than left implicit: a closing window is time-pressured ("action"); a
  // competitive edge is an opportunity to track, not an open task or a cost line ("monitor").
  action_required: "action",
  cost_alert: "cost",
  window_closing: "action",
  competitive_edge: "monitor",
  monitoring: "monitor",
  // Operations/Regulations priority vocabulary - a priority tier, not this module's own severity
  // shape, but still a real value this shared column can carry. critical/high both read as
  // action-pressure; moderate/low read as background-tier, matching the four-tier urgency mapping
  // environmental-policy-and-innovation's own severity->priority table uses elsewhere in this codebase
  // (ACTION REQUIRED/COST ALERT -> CRITICAL/HIGH, MONITORING -> LOW) as the closest sanctioned analogy.
  critical: "action",
  high: "cost",
  moderate: "monitor",
  low: "background",
  // Catch-all "other" vocabulary - Research's own likely real values.
  immediate: "action",
  watch: "monitor",
  reference: "background",
  background: "background",
};

/**
 * Classify one item's research severity. `severityColumn` (the migration-102 `severity` DB value, when
 * the caller's row shape carries it) wins when it is any of the 13 real CHECK-constrained values
 * (`SEVERITY_COLUMN_TO_KEY`), mapped to this module's own 4-key display band - the fix for the item-3
 * defect this file's header previously documented and deferred (see `SEVERITY_COLUMN_TO_KEY`'s own
 * comment). Only when `severityColumn` is null/undefined/unrecognized (the honest "nothing stored"
 * case - the absence state) does this fall through to the text/recency heuristic: an action-required
 * phrase in `text` wins, then a cost/pricing phrase, then recency (< 14 days old counts as "monitor"),
 * else "background".
 * @param {string} text
 * @param {string | null | undefined} [addedDate] ISO date string
 * @param {string | null | undefined} [severityColumn]
 * @returns {Severity}
 */
export function deriveSeverity(text, addedDate, severityColumn) {
  const sev = typeof severityColumn === "string" ? severityColumn.toLowerCase() : null;
  if (sev && SEVERITY_COLUMN_TO_KEY[sev]) {
    return SEVERITY_COLUMN_TO_KEY[sev];
  }
  const t = (text || "").toLowerCase();
  if (/\b(action required|immediate|deadline|must file|cease)\b/.test(t)) return "action";
  if (/\b(cost|surcharge|pass[- ]?through|price|margin|\/kwh|tco)\b/.test(t)) return "cost";
  if (addedDate) {
    const age = Date.now() - new Date(addedDate).getTime();
    if (age >= 0 && age < 14 * 24 * 60 * 60 * 1000) return "monitor";
  }
  return "background";
}
