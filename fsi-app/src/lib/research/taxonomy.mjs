// taxonomy.mjs — the ONE home for the Research theme + severity classifiers.
//
// WHY THIS FILE EXISTS. `THEMES` / `THEME_KEYWORDS` / `THEME_COLUMN_TO_KEY` / `assignTheme` /
// `deriveSeverity` existed, separately typed and separately maintained, in BOTH
// ResearchLedger.tsx (the /research index) and ResearchFindingDetailSurface.tsx (the
// /research/[slug] detail page). In Wave 6, WO-15 and WO-25 each touched one of those files in
// parallel and both were correctly told not to extract the taxonomy — a shared extraction
// attempted by two parallel lanes produces two extractions, which is worse than one duplication.
// It was deferred to a single lane (this file) that owns both consumers. See
// docs/ops/session-log.md's "Owed, and named rather than quietly skipped" note, 2026-08-30.
//
// THE COPIES HAD DRIFTED — this was not a mechanical extraction. Read side-by-side (2026-08-30),
// against the LIVE corpus (project kwrsbpiseruzbfwjpvsp, `intelligence_items` where
// domain=7 or item_type='research_finding', is_archived=false, provenance_status='verified',
// 39 rows), the two copies disagreed in three ways:
//
//   1. THEME_KEYWORDS: ResearchLedger.tsx (the actively-maintained /research index, touched by
//      WO-15 this same wave) carried keyword additions ResearchFindingDetailSurface.tsx did not:
//      emissions +mtco2e, fuels +ammonia/+lng, cold-chain +vip|vacuum insulated, disclosure
//      +verifier. ResearchFindingDetailSurface.tsx's own header says its vocab "mirrors
//      ResearchView.tsx" — a filename that no longer exists anywhere in this repo (grep confirms;
//      it predates the redesign that produced ResearchLedger.tsx) — direct evidence its copy is
//      the one that stopped being updated, not the one that drifted by design.
//
//      last-mile was the one category where Ledger's version was NOT a safe superset: it matched
//      bare `/\bev\b/i` and generic `/battery/i`, where Detail's matched only
//      `/\bev\b.*(fleet|charging|cargo)/i` (no bare EV, no battery, no ehgv, no electric-truck).
//      Run against the live 39-row corpus, Ledger's bare patterns produced two live
//      misclassifications Detail's narrower pattern did not: "Warehouse Solar & BESS ROI
//      Analysis" (a warehouse energy-storage ROI piece, not last-mile freight at all) picked up
//      last-mile purely via the generic /battery/i hit, and both "Global EV Outlook 2024" items
//      (general EV-market analysis, not last-mile-freight-specific) picked up last-mile purely via
//      bare "EV". Meanwhile Ledger's OTHER last-mile additions — /ehgv/i and /electric truck/i —
//      hit ONLY the two live "Project JOLT" eHGV-freight-trial items, correctly, with zero false
//      positives. So last-mile is a HYBRID below, not a straight pick of either file: Detail's
//      qualified EV pattern (kept, for precision) plus Ledger's /ehgv/i and /electric truck/i
//      (kept, evidence-clean) minus Ledger's bare /\bev\b/i and generic /battery/i (dropped,
//      evidence of live false positives). This is a disclosed, evidence-based fix bundled into the
//      extraction, not a silent pick of "the newer file" — see the session/handoff report for the
//      before/after live-corpus diff (8 theme reclassifications under Ledger's raw keywords, 0
//      questionable ones under this hybrid).
//
//   2. deriveSeverity's "cost" bucket: Ledger's regex carried two extra alternatives Detail's did
//      not — `\/kwh` and `tco`. Both are legitimate cost-economics abbreviations and neither
//      produced a live false positive on the same 39-row corpus (the one live diff, "Project JOLT"
//      matching on "TCO", is a genuinely cost/economics-bearing sentence — "capital costs,
//      payload, range, TCO, and battery performance"). Kept as Ledger's superset, below.
//
//   3. deriveSeverity's DB-column short-circuit: ONLY ResearchFindingDetailSurface.tsx checked a
//      stored `r.severity` value first ("Honor migration-102 severity column when present"),
//      short-circuiting to it when it equals the literal string "action" | "cost" | "monitor" |
//      "background". ResearchLedger.tsx never did this. This is NOT actually a live behavioral
//      difference today: (a) migration 102's own CHECK constraint
//      (supabase/migrations/102_severity_band_theme_columns.sql) never allows those four literal
//      values — the real enum is action_required/cost_alert/window_closing/competitive_edge/
//      monitoring (Market Intel vocab) or critical/high/moderate/low (Operations/Regulations) or
//      immediate/watch/reference/background (other) — so Detail's check has never matched a real
//      row (confirmed live: `severity` values seen on the research candidate population are
//      competitive_edge / cost_alert / monitoring / NULL only; none is "action", "cost", or
//      "monitor"). (b) ResearchPipelineRow (src/lib/supabase-server.ts fetchResearchPipelineRows)
//      never selects `severity` or `theme` from `intelligence_items` in the first place, so
//      ResearchLedger.tsx's row type structurally cannot carry either column regardless of what
//      this module does with one. The mismatch between the checked literals and the real enum is a
//      genuine latent bug, but fixing the vocabulary mapping is a separate, larger decision (which
//      of ~9 real enum values maps to which of the 4 UI buckets) that this taxonomy-extraction lane
//      does not have the mandate to make unilaterally, and fixing the missing SELECT columns
//      requires editing src/lib/supabase-server.ts, outside this lane's write set. Both are named
//      here, neither is fixed here. The column check is preserved EXACTLY as
//      ResearchFindingDetailSurface.tsx had it (dead-on-live-data and all) so this extraction
//      changes zero rendered behavior on that axis; deriveSeverity() below simply accepts an
//      optional `severityColumn` and ResearchLedger.tsx's call site continues to omit it, exactly
//      as before.
//
// NET EFFECT ON RENDERED OUTPUT: ResearchLedger.tsx is unchanged (its own keyword/regex sets were
// already the superset baseline this module adopts, item-2 above already matched its behavior
// exactly, and the DB-column checks were already no-ops for it). ResearchFindingDetailSurface.tsx
// changes for any live finding whose text matches one of the additions in items 1-2 above; see the
// handoff report for the exact live IDs affected today (Project JOLT x2 gain last-mile + one gains
// "cost"; the emissions/fuels/cold-chain/disclosure additions matched zero rows in the live
// corpus at extraction time, so they change nothing today but are available going forward).
//
// PLAIN ESM, ZERO DEPENDENCIES — same constraint as surface-of.mjs and surface-candidate.mjs, so
// the drift/discipline test suite (no tsc, no bundler) can import this directly, and so a
// consuming .tsx can `import ... from ".../taxonomy.mjs"` under this project's allowJs tsconfig
// without a build step.

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

/** Display label per theme — identical text in both former copies. @type {Record<ThemeKey, string>} */
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
 * per-category provenance of every entry below — packaging and carbon were already identical
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
  // produced live false positives — a warehouse solar/battery-storage piece and two general
  // EV-market-outlook pieces, none of them last-mile-freight content).
  "last-mile": [/last[- ]?mile/i, /\bev\b.*(fleet|charging|cargo)/i, /ehgv/i, /electric truck/i, /urban delivery/i, /zero[- ]?emission/i, /\bzev\b/i],
  disclosure: [/\bcsrd\b/i, /\bissb\b/i, /\bsfdr\b/i, /\btcfd\b/i, /disclosure/i, /reporting standard/i, /\bs2\b/i, /verifier/i],
};

/**
 * Classify one item's research theme. `themeColumn` (the migration-102 `theme` DB value, when the
 * caller's row shape carries it) wins when present and recognized; otherwise falls back to a
 * keyword scan of `text` in THEME_KEYS order, first match wins. Returns null when nothing matches
 * (honest "no theme" — never a guessed default).
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

/** Display label per severity — identical text in both former copies. @type {Record<Severity, string>} */
export const SEVERITY_LABELS = {
  action: "Action required",
  cost: "Cost alert",
  monitor: "Monitor",
  background: "Background",
};

/**
 * Classify one item's research severity. `severityColumn` (the migration-102 `severity` DB value,
 * when the caller's row shape carries it) short-circuits when it is literally "action" | "cost" |
 * "monitor" | "background" — preserved exactly as ResearchFindingDetailSurface.tsx had it; see the
 * file header (item 3) for why this never actually fires against the live enum today, and why
 * fixing that mapping is out of this extraction's scope. Otherwise: an action-required phrase in
 * `text` wins, then a cost/pricing phrase, then recency (< 14 days old counts as "monitor"), else
 * "background".
 * @param {string} text
 * @param {string | null | undefined} [addedDate] ISO date string
 * @param {string | null | undefined} [severityColumn]
 * @returns {Severity}
 */
export function deriveSeverity(text, addedDate, severityColumn) {
  const sev = typeof severityColumn === "string" ? severityColumn.toLowerCase() : null;
  if (sev === "action" || sev === "cost" || sev === "monitor" || sev === "background") {
    return /** @type {Severity} */ (sev);
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
