export const DOMAIN_LABELS = {
  1: "Regulations",
  2: "Market Intel - Tech",
  3: "Operations - Regional",
  4: "Market Intel - Price/Signals",
  5: "(unused; legacy)",
  6: "Operations - Facility",
  7: "Research",
} as const;

export type Domain = keyof typeof DOMAIN_LABELS;

// Named exports per customer-facing surface. Consumers should import these
// constants instead of writing literal integers.
export const REGULATIONS_DOMAIN: Domain = 1;
export const MARKET_TECH_DOMAIN: Domain = 2;
export const OPERATIONS_REGIONAL_DOMAIN: Domain = 3;
export const MARKET_SIGNALS_DOMAIN: Domain = 4;
export const OPERATIONS_FACILITY_DOMAIN: Domain = 6;
export const RESEARCH_DOMAIN: Domain = 7;

// Convenience: the set of domain values that belong to each customer-facing
// surface. Multi-domain surfaces (Market Intel = 2 + 4; Operations = 3 + 6)
// pre-aggregate the integers here so consumers can do
// `MARKET_INTEL_DOMAINS.has(r.domain)` without re-stating the math.
export const REGULATIONS_DOMAINS: ReadonlySet<Domain> = new Set([
  REGULATIONS_DOMAIN,
]);
export const MARKET_INTEL_DOMAINS: ReadonlySet<Domain> = new Set([
  MARKET_TECH_DOMAIN,
  MARKET_SIGNALS_DOMAIN,
]);
export const OPERATIONS_DOMAINS: ReadonlySet<Domain> = new Set([
  OPERATIONS_REGIONAL_DOMAIN,
  OPERATIONS_FACILITY_DOMAIN,
]);
export const RESEARCH_DOMAINS: ReadonlySet<Domain> = new Set([
  RESEARCH_DOMAIN,
]);

// All allowed values (matches the DB CHECK constraint).
export const ALL_DOMAINS: ReadonlySet<Domain> = new Set([1, 2, 3, 4, 5, 6, 7]);

// ─────────────────────────────────────────────────────────────────────
// Server-side routing helper.
//
// Mirrors the CASE in migration 101 (lines 130-161). Inputs are the
// classifier's item_type plus the parent source's category. Returns a
// Domain 1-7 or NULL when the classifier output is unrecognized.
//
// NULL return policy is deliberate: callers must NOT silently coerce to 1
// (the historical hardcoded-default that caused the leakage). Insert sites
// should pass NULL through to the column; downstream the strict surface
// filter (per regulations hotfix 2026-05-22) ensures NULL-domain items
// land in the triage queue rather than rendering on /regulations.
//
// `sourceCategory` is the value of public.sources.category for the parent
// source (see migration 084 source_role -> category mapping). Pass null
// when unknown.
// ─────────────────────────────────────────────────────────────────────

export type SourceCategory =
  | "regulatory"
  | "research"
  | "market_news"
  | "operational_data"
  | null
  | undefined;

export function domainForItemType(
  itemType: string | null | undefined,
  sourceCategory: SourceCategory
): Domain | null {
  if (!itemType) return null;
  switch (itemType) {
    case "regulation":
    case "directive":
    case "standard":
    case "guidance":
    case "law":
      return REGULATIONS_DOMAIN;
    case "framework":
      if (sourceCategory === "research") return RESEARCH_DOMAIN;
      if (sourceCategory === "market_news") return MARKET_SIGNALS_DOMAIN;
      if (sourceCategory === "operational_data") return OPERATIONS_REGIONAL_DOMAIN;
      return REGULATIONS_DOMAIN;
    case "research_finding":
      return RESEARCH_DOMAIN;
    case "regional_data":
      return OPERATIONS_REGIONAL_DOMAIN;
    case "market_signal":
      return MARKET_SIGNALS_DOMAIN;
    case "technology":
    case "innovation":
      return MARKET_TECH_DOMAIN;
    case "tool":
      if (sourceCategory === "research") return RESEARCH_DOMAIN;
      if (sourceCategory === "operational_data") return OPERATIONS_REGIONAL_DOMAIN;
      return MARKET_TECH_DOMAIN;
    case "initiative":
      if (sourceCategory === "regulatory") return REGULATIONS_DOMAIN;
      if (sourceCategory === "research") return RESEARCH_DOMAIN;
      if (sourceCategory === "operational_data") return OPERATIONS_REGIONAL_DOMAIN;
      // initiative + market_news OR null/unknown: default to Market Intel
      // (low confidence; reviewable via the ambiguous-rows audit when the
      // source.category is later set).
      return MARKET_SIGNALS_DOMAIN;
    default:
      return null;
  }
}

// Validate a raw value from a classifier or external input. Returns the
// value as a Domain when it lies in 1-7, otherwise null. Use at insert
// sites so the column never receives an out-of-range integer.
export function asDomain(value: unknown): Domain | null {
  if (typeof value !== "number") return null;
  if (!Number.isInteger(value)) return null;
  if (value < 1 || value > 7) return null;
  return value as Domain;
}
