// ── Core Resource Types ──

export interface TimelineEntry {
  date: string;
  label: string;
  status?: "past" | "current" | "future";
}

export interface ImpactScores {
  cost: number;        // 0-3
  compliance: number;  // 0-3
  client: number;      // 0-3
  operational: number; // 0-3
}

export interface ImpactReasoning {
  cost?: string;
  compliance?: string;
  client?: string;
  operational?: string;
}

export interface Dispute {
  resource: string;
  note: string;
  sources: { name: string; url: string }[];
}

export interface ChangeLogEntry {
  id: string;
  date: string;
  type: "NEW" | "UPDATED";
  fields?: string[];
  prev?: string;
  now?: string;
  impact?: string;
}

export interface Supersession {
  old: string;
  new: string;
  oldTitle?: string;
  newTitle?: string;
  date: string;
  severity: "major" | "minor" | "replacement";
  note: string;
}

export interface CrossRef {
  from: string;
  to: string;
  relationship: string;
}

/**
 * A single item_cross_references row, from the OTHER item's point of view relative to whichever item
 * fetchIntelligenceItem was called for (flywheel U9, D1). `surface` is pre-resolved via surfaceOf so the
 * connections card never has to know about item_type/domain routing rules itself.
 */
export interface ItemConnection {
  id: string;
  direction: "outgoing" | "incoming";
  relationship: string;
  origin: string;
  basis: Array<{ signal: string; detail: string; weight: number }> | null;
  score: number | null;
  surface: string;
}

export interface Cluster {
  name: string;
  ids: string[];
  why: string;
}

// ── Skill-Standard Intelligence Sections ──
// These match the 7-section format from the environmental-policy-and-innovation skill

export interface OperationalImpact {
  mode: string;                 // "ocean", "air", "road", "customs", "reporting", "procurement"
  function: string;             // "contracts", "pricing", "compliance", "data", "operations"
  impact: string;               // What this means operationally
  severity: "low" | "medium" | "high";
}

export interface RiskRegisterEntry {
  risk: string;                 // Description of the risk
  severity: "low" | "medium" | "high";
  likelihood: "low" | "medium" | "high";
  deadline?: string;            // ISO date or description
}

export interface RecommendedAction {
  action: string;               // What to do
  owner: string;                // Who should own it (e.g. "Ocean Product + Finance")
  timeframe: string;            // e.g. "30 days", "Q2 2026", "Immediate"
  priority: number;             // 1 = highest priority
}

export interface SourceReference {
  name: string;                 // e.g. "EUR-Lex", "Federal Register"
  url: string;                  // Direct URL
  tier?: number;                // 1-5 source tier
  type?: "primary_text" | "official_guidance" | "intergovernmental" | "expert_analysis" | "industry";
}

export interface Resource {
  id: string;
  cat: string;           // primary mode: ocean, air, road
  sub: string;           // subcategory label
  title: string;
  url: string;
  note: string;          // Status + action summary (card preview)
  type: string;          // framework, regulation, law, standard, innovation, etc.
  priority: "CRITICAL" | "HIGH" | "MODERATE" | "LOW";
  added: string;         // ISO date
  reasoning: string;     // why this priority
  tags: string[];
  whatIsIt: string;       // Executive summary — what the regulation/item IS
  whyMatters: string;     // Why it matters to freight forwarders specifically
  keyData: string[];      // Key data points and figures
  timeline?: TimelineEntry[];

  // Skill-standard structured intelligence (7-section format)
  operationalImpact?: OperationalImpact[];   // Impact by mode + business function
  riskRegister?: RiskRegisterEntry[];        // Compliance risk register
  recommendedActions?: RecommendedAction[];  // Prioritized actions with owners
  openQuestions?: string[];                  // Unresolved questions / info gaps
  sourceUrls?: SourceReference[];            // Primary source documents

  // Full intelligence brief — the deep regulatory playbook (markdown)
  // This is the primary content field. whatIsIt/whyMatters/keyData are card previews.
  // The brief follows the skill standard: article references, legal confirmation flags,
  // operational impact by business function, tables, source citations per claim.
  fullBrief?: string;

  // Intelligence domain (1=regulatory, 2=tech, 3=regional, 4=market, 5=sources, 6=facility, 7=research)
  domain?: number;

  // Applied from REMAP
  modes?: string[];
  topic?: string;
  jurisdiction?: string;

  // Phase 3 schema columns (migration 102, 2026-05-24). Optional
  // because RPC outputs do not yet return them and rows are NULL
  // until the agent classifier emits them on next regeneration.
  // When populated, the per-surface classifiers (ResearchView
  // assignTheme, MarketPage assignBand, deriveSeverity, etc.) read
  // from these fields and skip the regex fallback.
  /** Per-surface severity vocab. See migration 102 enum. */
  severity?: string;
  /** Market Intel band: price | corporate | corridor. */
  signalBand?: "price" | "corporate" | "corridor";
  /** Research theme, one of the 7 canonical themes. */
  theme?: string;
  /**
   * B1 Price signal time-series for TrajectoryBars rendering
   * (migration 107). Non-null only when signalBand === 'price'
   * (DB CHECK constraint intelligence_items_trajectory_band_check).
   * Sprint 3 A4 (2026-05-27).
   */
  trajectoryPoints?: {
    points: Array<{ date: string; value: number }>;
    base_date: string;
    base_label: string;
  };

  /**
   * Sprint 3 R-A + M-A callout fields (migration 110, 2026-05-27).
   * All optional; renderers omit the callout when null.
   *   - whatItChanges     : every card on Research + Market
   *   - doesNotResolve    : Research featured items only
   *   - conversionTrigger : Market featured B1/B2 items
   *   - crossReferences   : Market featured B3 corridor items
   */
  whatItChanges?: string;
  doesNotResolve?: string;
  conversionTrigger?: string;
  crossReferences?: string;

  // ISO 3166-1/-2 + supranational jurisdiction codes from migration 033.
  // Preferred over the legacy `jurisdiction` (single string) when present.
  // Example: ["US-CA"] for SB 253, ["EU"] for FuelEU Maritime.
  jurisdictionIso?: string[];

  // Sub-jurisdiction (state, country within region, etc.)
  subJurisdiction?: string;        // e.g. "us-ca", "eu-norway", "asia-singapore"
  subJurisdictionLabel?: string;   // e.g. "California", "Norway", "Singapore"

  // Regulatory conflict tracking
  regulatoryConflict?: {
    type: "federal-state" | "international" | "trade" | "supersession" | "divergence";
    summary: string;               // e.g. "California mandate conflicts with EPA Phase 3"
    parties: string[];             // e.g. ["California CARB", "US EPA"]
    status: "active" | "pending" | "resolved";
  };

  // Authority and provenance (from skill)
  authorityLevel?: "primary_text" | "official_guidance" | "intergovernmental" | "expert_analysis" | "unconfirmed";
  sourceId?: string;           // FK to sources.id — used by SourceProvenanceBadge
  sourceUrl?: string;          // Direct URL to primary source document
  sourceName?: string;         // Name of the publishing body
  sourceTier?: number;         // Tier 1-5 from skill source hierarchy
  // Item tier (Lane POP, 2026-09-01; migration 278 intelligence_items.item_grade). "record" = extracted
  // FACT/GAP spans only, no synthesized brief yet — surfaces label these via RecordGradeBadge. Absent
  // (undefined) on any mapper the owning RPC doesn't yet project this column through — dormant
  // passthrough, same pattern as jurisdictionIso's migration-272 rollout; never defaulted client-side.
  itemGrade?: "record" | "brief";
  legalInstrument?: string;    // e.g. "Regulation (EU) 2023/1805", "40 CFR Part 86"
  enforcementBody?: string;    // e.g. "European Commission DG CLIMA", "US EPA"
  penaltyRange?: string;       // e.g. "€2,400/tonne shortfall", "Up to 4% EU turnover"
  complianceDeadline?: string; // Next critical deadline
  costMechanism?: string;      // How the cost flows to freight (surcharge, penalty, allowance)
  actionOwner?: string;        // Suggested internal owner: Legal, Sustainability, Ocean Product, etc.
  lastVerifiedDate?: string;   // ISO date when data was last verified against source

  // WO-13 B4 re-point (2026-08-30): the Market list-page key figure now
  // binds here instead of the removed `marketData.currentPrice` orphan
  // (no producer ever wrote it — WO-5 B4 finding, docs/ops/wo5-orphan-
  // disposition-2026-08-20.md row 4). Batch-decorated onto Market list
  // resources in getMarketIntelItems() (src/lib/data.ts) from
  // published_price_statistics, one row per item (lowest sort_order —
  // mirrors PriceBoard's own ordering convention). null/absent means "no
  // price dimension" for this item — render the honest em-dash, never
  // fabricate a figure. Present ONLY on /market list-page Resources; the
  // detail page's own PriceBoard fetch (market/[slug]/page.tsx) is a
  // separate, untouched reader of the same table.
  priceStat?: {
    label: string;
    valueDisplay: string;
    unit?: string | null;
    releasedAt?: string | null;
  } | null;

  // Taxonomy (Phase 2+)
  category?: string;
  lifecycleStage?: string;
  provenanceLevel?: string;
  lastVerified?: string;

  // Archive
  isArchived?: boolean;
  archiveReason?: string;
  archiveNote?: string;
  archivedDate?: string;
  replacedBy?: string;

  // Computed (set by scoring)
  urgencyScore?: number;
  impactScores?: ImpactScores;
  impactReasoning?: ImpactReasoning;

  // Agent integrity self-flag — populated from migration 035 columns.
  // Surfaced only to admin viewers via the RegulationDetailSurface banner.
  agentIntegrityFlag?: boolean;
  agentIntegrityPhrase?: string | null;
  agentIntegrityFlaggedAt?: string | null;

  // Q9 per-surface credibility signals (per source-credibility-model SKILL
  // Section 8). Populated by the category-routed fetchers when the source
  // has a row in intelligence_item_citations (via get_source_citation_stats,
  // migration 098). Build 8.1 wired these on /research; Build 9 wires them
  // on /operations. Null on rows whose source has no citations or whose
  // sourceId is absent, in which case the chips suppress themselves.
  citationCount?: number | null;
  lastCitedAt?: string | null;
}

// ── Share Package ──

export interface SharePackage {
  id: string;
  resourceIds: string[];
  format: "html" | "slack";
  level: "summary" | "standard" | "full";
  audience?: string;
  createdAt: string;
}

// ── Navigation ──

export type TabId =
  | "home"
  | "regulations"
  | "technology"
  | "regional"
  | "geopolitical"
  | "sources"
  | "facilities"
  | "research"
  | "settings"
  // Legacy (mapped to domain tabs)
  | "explore"
  | "map";

export interface FocusView {
  title: string;
  resourceIds: string[];
  why?: Record<string, string>; // resourceId → reason
}

export interface NavEntry {
  tab: TabId;
  focusView?: FocusView | null;
  scrollTo?: string;
}
