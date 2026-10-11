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
 * @param {number | null} [domain] intelligence_items.domain (INT 1-7). Genuinely optional — the body
 *   below already treats a non-number (including omitted/undefined) as `null`; the JSDoc now says so
 *   explicitly so a 1-arg call (item-type-only classification, e.g. discover.mjs's UNCONDITIONAL-type
 *   scoring) type-checks instead of arity-erroring. First surfaced by mint-item.ts (U4), this
 *   function's first typed (.ts) consumer via discover.mjs's surfaceOf callback.
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

/**
 * The {item_types, domains} scope filter for a surface, derived from SURFACE_RULES — the single vocab
 * home. Used as the FAIL-SOFT fallback for the surface pages: when get_surface_counts (migration 148)
 * is absent (pre-apply), the pages fall back to get_workspace_intelligence_aggregates_scoped (069) with
 * this filter, instead of the deleted per-page MARKET_SCOPE / RESEARCH_SCOPE={} constants. The 069 RPC
 * OR-combines the two keys, so this is an APPROXIMATE scope (it ignores surface_of's regulation
 * precedence); the exact, verified-gated count is the primary get_surface_counts path.
 * @param {string} surface
 * @returns {{ item_types: string[], domains: number[] }}
 */
export function scopeFilterForSurface(surface) {
  const item_types = [];
  const domains = [];
  for (const rule of SURFACE_RULES) {
    if (rule.surface !== surface) continue;
    if (rule.itemTypeIn) item_types.push(...rule.itemTypeIn);
    if (rule.domainIn) domains.push(...rule.domainIn);
  }
  return { item_types, domains };
}
