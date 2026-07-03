// Single classification source-of-truth: (item_type, domain) -> customer-facing surface.
//
// WHY THIS FILE EXISTS (binding 3, count-integrity build 2026-07-02).
// Surface classification was expressed in TWO homes that could drift across a language boundary:
//   - JS: `classifyItem` in src/lib/dashboard/surface-coverage.ts (its own REGULATION_ITEM_TYPES /
//     MARKET_ITEM_TYPES sets) drove the dashboard rail.
//   - SQL: the surface pages restated the mapping as per-page scope arrays (MARKET_SCOPE, RESEARCH_SCOPE)
//     passed to get_workspace_intelligence_aggregates_scoped (migration 069).
// Migration #170 killed exactly this drift class inside domains.ts; the count-integrity RPC (migration
// 148 `surface_of`) would have RE-CREATED it in SQL. This module is the one home both sides derive from:
// `surfaceOf()` is the runtime authority for JS; `renderSurfaceOfSql()` emits the SQL CASE body that
// migration 148 embeds verbatim. The vocab-drift guard (.discipline/vocab-drift-guard.test.mjs) imports
// this file, regenerates the SQL, and fails the build if migration 148 diverges by a single byte — so
// the mapping cannot drift between the two languages without tripping CI.
//
// PLAIN ESM, ZERO DEPENDENCIES. The drift guard runs in the depless discipline CI (no tsc / no bundler),
// so this must be importable as-is by `node --test`. Do not add imports of .ts modules here.
//
// The four intelligence surfaces are the ratified five-surface model minus Community (which is NOT an
// intelligence_items query — it is groups/threads, counted separately). See caros-ledge-platform-intent.
//
// PRECEDENCE (first matching rule wins). Regulation item_types win outright (a regulation stays on
// /regulations even if its domain is stale or null); then the post-#170 domain is authoritative
// (domain is the routing SoT that domainForItemType writes at ingest); then item_type is the fallback
// for rows whose domain is null or legacy-5. Anything unmatched is 'uncategorized' — a defect signal,
// never a customer surface (binding 4).

/** The four customer-facing intelligence surfaces surface_of can assign. */
export const SURFACES = /** @type {const} */ (["regulations", "market", "operations", "research"]);

/** Returned for any (item_type, domain) that matches no rule. Never rendered customer-side. */
export const DEFAULT_SURFACE = "uncategorized";

// Ordered precedence rules — the SINGLE source of truth. `surfaceOf` (runtime) and `renderSurfaceOfSql`
// (SQL codegen) both derive from this array, so editing a rule moves both languages together and the
// drift guard forces migration 148 to be regenerated. Each rule matches on item_type membership OR
// domain membership (never both); rules are evaluated top-to-bottom.
export const SURFACE_RULES = [
  { itemTypeIn: ["regulation", "directive", "standard", "guidance", "framework", "law"], surface: "regulations" },
  { domainIn: [1], surface: "regulations" },
  { domainIn: [3, 6], surface: "operations" },
  { domainIn: [7], surface: "research" },
  { domainIn: [2, 4], surface: "market" },
  { itemTypeIn: ["regional_data"], surface: "operations" },
  { itemTypeIn: ["research_finding"], surface: "research" },
  { itemTypeIn: ["market_signal", "initiative", "technology", "innovation"], surface: "market" },
];

/**
 * Classify an intelligence_items row to its customer-facing surface.
 * @param {string | null | undefined} itemType intelligence_items.item_type
 * @param {number | null | undefined} domain   intelligence_items.domain (INT 1-7)
 * @returns {"regulations" | "market" | "operations" | "research" | "uncategorized"}
 */
export function surfaceOf(itemType, domain) {
  const t = itemType == null ? null : itemType;
  const d = typeof domain === "number" ? domain : null;
  for (const rule of SURFACE_RULES) {
    if (rule.itemTypeIn && t !== null && rule.itemTypeIn.includes(t)) return rule.surface;
    if (rule.domainIn && d !== null && rule.domainIn.includes(d)) return rule.surface;
  }
  return DEFAULT_SURFACE;
}

/**
 * Emit the SQL CASE body for the `surface_of(p_item_type text, p_domain int)` function, derived from
 * SURFACE_RULES so it can never drift from `surfaceOf`. Migration 148 embeds the returned string
 * verbatim; the vocab-drift guard asserts the migration contains exactly this text. Deterministic:
 * no dates, no ordering ambiguity.
 * @returns {string}
 */
export function renderSurfaceOfSql() {
  const lines = SURFACE_RULES.map((rule) => {
    const cond = rule.itemTypeIn
      ? `p_item_type IN (${rule.itemTypeIn.map((x) => `'${x}'`).join(", ")})`
      : `p_domain IN (${rule.domainIn.join(", ")})`;
    return `      WHEN ${cond} THEN '${rule.surface}'`;
  });
  return ["    CASE", ...lines, `      ELSE '${DEFAULT_SURFACE}'`, "    END"].join("\n");
}
