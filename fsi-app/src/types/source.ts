// ══════════════════════════════════════════════════════════════
// Source Trust Framework — Type Definitions
// ══════════════════════════════════════════════════════════════
//
// A SOURCE is a public portal or official publication where
// legislation, regulation, or policy is published and made
// available to the public. EUR-Lex is a source. The Federal
// Register is a source. IMO.org is a source.
//
// A piece of legislation is NOT a source. It is an intelligence
// item that lives INSIDE a source.
//
// The system monitors sources. Sources produce intelligence items.
// ══════════════════════════════════════════════════════════════

// ── Source Tier Hierarchy ──
// Trust tiers are structural — they describe what kind of entity
// maintains the source, not how "good" the source is at reporting.
//
// A source can be promoted or demoted between tiers based on
// verified accuracy over time, but the tiers themselves have
// fixed meanings.

export type SourceTier = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const SOURCE_TIER_DEFINITIONS: Record<SourceTier, {
  label: string;
  description: string;
  examples: string[];
  authority: string;
}> = {
  1: {
    label: "Primary Legal Text",
    description: "Official journals, gazettes, and legal publication portals maintained by sovereign governments or supranational bodies. These ARE the law — not descriptions of it.",
    examples: ["EUR-Lex", "Federal Register", "UK legislation.gov.uk", "Gazette of India"],
    authority: "The published text is legally binding. No interpretation required.",
  },
  2: {
    label: "Regulator Implementation",
    description: "Official guidance, FAQs, implementation portals, and compliance tools published by the regulatory body that administers a law. One step removed from the legal text itself.",
    examples: ["EPA regulations portal", "EC DG CLIMA shipping pages", "CBAM portal", "THETIS-MRV"],
    authority: "Authoritative interpretation of how the law applies. Not the law itself, but the regulator's own reading of it.",
  },
  3: {
    label: "Intergovernmental Body",
    description: "Publications from international organizations that set frameworks, strategies, and standards adopted by member states. Their output becomes binding through national/regional transposition.",
    examples: ["IMO", "ICAO", "UNFCCC", "World Bank Carbon Pricing Dashboard", "IEA"],
    authority: "Frameworks and strategies that drive national regulation. Binding on members through adoption mechanisms.",
  },
  4: {
    label: "Expert Analysis",
    description: "High-quality analysis from think tanks, academic institutions, NGOs, and industry bodies with demonstrated domain expertise. They interpret and contextualize, they do not legislate.",
    examples: ["ICCT", "Climate Change Laws of the World", "Smart Freight Centre", "Sabin Center"],
    authority: "Informed interpretation. Useful for impact assessment and operational translation. Must be verified against T1-T3 sources for legal claims.",
  },
  5: {
    label: "Industry and Standards",
    description: "Standards bodies, industry associations, and professional organizations that publish frameworks, guidance, and position papers relevant to freight forwarding operations.",
    examples: ["ISO", "GHG Protocol", "FIATA", "IRU", "CDP", "SBTi"],
    authority: "Voluntary standards and industry consensus. Increasingly contractual requirements but not law.",
  },
  6: {
    label: "News and Commentary",
    description: "Law firm alerts, trade press, consultancy publications, and commercial regulatory intelligence services. They report on and interpret developments published elsewhere.",
    examples: ["Thomson Reuters Regulatory Intelligence", "law firm client alerts", "trade press"],
    authority: "Secondary reporting. Useful for early signal detection but every claim must trace back to a T1-T3 source.",
  },
  7: {
    label: "Provisional / Unverified",
    description: "Sources discovered through citation by other sources but not yet verified for reliability, accessibility, or authority. All new source discoveries enter at T7 until reviewed.",
    examples: ["Any newly discovered source before human review"],
    authority: "None until verified. Information from T7 sources is flagged as unconfirmed.",
  },
};

// ── Trust Metrics ──
// These are the quantitative signals that determine whether a
// source should be promoted, demoted, or held at its current tier.

export interface TrustMetrics {
  // Accuracy tracking
  confirmation_count: number;      // Times information from this source was independently confirmed by a higher-tier source
  conflict_count: number;          // Times this source was on the WRONG side of a factual dispute
  conflict_total: number;          // Total disputes this source was involved in (win + loss)
  accuracy_rate: number;           // confirmation_count / (confirmation_count + conflict_count), 0-1

  // Timeliness
  avg_lead_time_days: number;      // Mean days this source reports ahead of T1 confirmation. Negative = reports after T1. Null-safe: 0 means "same time as T1"
  lead_time_samples: number;       // How many data points the avg_lead_time_days is based on

  // Reliability
  consecutive_accessible: number;  // Current streak of successful accessibility checks
  total_checks: number;            // Total accessibility checks performed
  accessibility_rate: number;      // consecutive_accessible / total_checks is wrong — this is (successful_checks / total_checks)
  successful_checks: number;       // Total successful checks (for accessibility_rate calculation)
  last_accessible: string | null;  // ISO timestamp of last successful check
  last_inaccessible: string | null; // ISO timestamp of last failed check

  // Citation depth
  independent_citers: number;      // Count of UNIQUE T1-T3 sources that have cited this source
  total_citations: number;         // Total citation count (including duplicates from same source)
  highest_citing_tier: SourceTier | null; // The highest-tier source that has cited this one

  // Self-citation detection
  self_citation_count: number;     // Times this source cited itself (not a trust signal)
}

// ── Trust Score ──
// Computed from TrustMetrics. This is the single number that
// drives promotion/demotion decisions, but it is NEVER the
// sole input — human review is always required.

export interface TrustScore {
  overall: number;                 // 0-100 composite score
  accuracy_component: number;      // 0-40 (heaviest weight — accuracy is king)
  timeliness_component: number;    // 0-20
  reliability_component: number;   // 0-20
  citation_component: number;      // 0-20
  computed_at: string;             // ISO timestamp
}

// ── Trust Events ──
// Every action that affects a source's trust is logged as an
// immutable event. This is the audit trail.

export type TrustEventType =
  | "confirmation"         // Item from this source confirmed by higher-tier source
  | "conflict_opened"      // Dispute detected between this source and another
  | "conflict_resolved"    // Dispute resolved — records which source was correct
  | "accessibility_check"  // Scheduled check result (success or failure)
  | "citation_received"    // Another source cited this one
  | "tier_promotion"       // Source moved to a higher (lower number) tier
  | "tier_demotion"        // Source moved to a lower (higher number) tier
  | "manual_review"        // Human reviewed and made a trust decision
  | "stale_flag"           // Source flagged as stale (no substantive update in threshold period)
  | "paywall_change"       // Source changed from open to paywalled or vice versa
  | "self_citation"        // Detected self-citation (logged but does not affect trust)
  | "discovery";           // Source first discovered (initial event)

export interface TrustEvent {
  id: string;                      // UUID
  source_id: string;               // Which source this event is about
  event_type: TrustEventType;
  timestamp: string;               // ISO timestamp
  details: TrustEventDetails;
  created_by: "system" | "worker" | "human"; // What created this event
  reviewer_id?: string;            // If human, who reviewed
}

// Discriminated union for event details — each event type has
// specific data associated with it

export type TrustEventDetails =
  | ConfirmationDetails
  | ConflictOpenedDetails
  | ConflictResolvedDetails
  | AccessibilityCheckDetails
  | CitationReceivedDetails
  | TierChangeDetails
  | ManualReviewDetails
  | StaleFlagDetails
  | PaywallChangeDetails
  | SelfCitationDetails
  | DiscoveryDetails;

export interface ConfirmationDetails {
  type: "confirmation";
  item_id: string;                 // The intelligence item that was confirmed
  confirming_source_id: string;    // The higher-tier source that confirmed it
  confirming_source_tier: SourceTier;
}

export interface ConflictOpenedDetails {
  type: "conflict_opened";
  conflict_id: string;             // References source_conflicts table
  opposing_source_id: string;
  item_id: string;                 // The intelligence item in dispute
  claim_summary: string;           // What this source claims
  opposing_claim_summary: string;  // What the other source claims
}

export interface ConflictResolvedDetails {
  type: "conflict_resolved";
  conflict_id: string;
  resolution: "this_source_correct" | "this_source_wrong" | "both_partially_correct" | "inconclusive";
  resolved_by_source_id?: string;  // If a higher-tier source resolved it
  resolution_note: string;
}

export interface AccessibilityCheckDetails {
  type: "accessibility_check";
  success: boolean;
  http_status?: number;
  response_time_ms?: number;
  error_message?: string;
}

export interface CitationReceivedDetails {
  type: "citation_received";
  citing_source_id: string;
  citing_source_tier: SourceTier;
  context: string;                 // Where/how the citation appeared
  is_independent: boolean;         // True if this is a new unique citer (not a repeat)
}

export interface TierChangeDetails {
  type: "tier_promotion" | "tier_demotion";
  previous_tier: SourceTier;
  new_tier: SourceTier;
  reason: string;
  trust_score_at_change: number;
  triggered_by: string;            // What event or review triggered this change
}

export interface ManualReviewDetails {
  type: "manual_review";
  decision: "promote" | "demote" | "hold" | "flag_for_review";
  note: string;
  trust_score_at_review: number;
}

export interface StaleFlagDetails {
  type: "stale_flag";
  last_substantive_change: string; // ISO timestamp
  days_since_change: number;
  expected_frequency: string;      // What we expected based on update_frequency
}

export interface PaywallChangeDetails {
  type: "paywall_change";
  previous_state: boolean;         // was paywalled
  new_state: boolean;              // is now paywalled
}

export interface SelfCitationDetails {
  type: "self_citation";
  item_id: string;
  context: string;
}

export interface DiscoveryDetails {
  type: "discovery";
  discovered_via: "skill_recommendation" | "citation_detection" | "manual_add" | "worker_search";
  cited_by_source_id?: string;
  initial_tier: SourceTier;
}

// ── Source Conflicts ──
// When two sources disagree on the same fact about the same
// intelligence item, a conflict is created. Conflicts are the
// primary mechanism by which trust is gained or lost.

export type ConflictStatus = "open" | "resolved" | "inconclusive";
export type ConflictResolution =
  | "source_a_correct"
  | "source_b_correct"
  | "both_partially_correct"
  | "inconclusive"
  | "superseded";         // A newer publication made the conflict moot

export interface SourceConflict {
  id: string;                      // UUID
  item_id: string;                 // The intelligence item in dispute
  source_a_id: string;             // First source
  source_b_id: string;             // Second source
  source_a_tier: SourceTier;
  source_b_tier: SourceTier;
  source_a_claim: string;          // What source A says
  source_b_claim: string;          // What source B says
  field_in_dispute: string;        // Which field: "status", "deadline", "scope", "applicability", etc.
  status: ConflictStatus;
  resolution?: ConflictResolution;
  resolution_note?: string;
  resolved_by_source_id?: string;  // If a third source resolved it
  resolved_by_human?: string;      // If a human resolved it
  opened_at: string;               // ISO timestamp
  resolved_at?: string;            // ISO timestamp
}

// ── Promotion / Demotion Thresholds ──
// These are the exact criteria that must be met for a source
// to be eligible for tier change. Meeting the criteria does NOT
// automatically change the tier — it flags the source for
// human review.

export interface PromotionCriteria {
  from_tier: SourceTier;
  to_tier: SourceTier;
  min_trust_score: number;
  min_confirmation_count: number;
  max_conflict_rate: number;       // Maximum ratio of conflicts lost to total conflicts
  min_independent_citers: number;  // Minimum unique T1-T3 sources citing this source
  min_accessibility_rate: number;  // Minimum percentage of successful checks
  min_age_days: number;            // Minimum days in registry before eligible
  min_lead_time_samples: number;   // Minimum data points for timeliness assessment
  additional_requirements: string; // Human-readable extra conditions
}

export const PROMOTION_CRITERIA: PromotionCriteria[] = [
  // T7 → T6: Provisional to News/Commentary
  // Lowest bar — just prove you exist, are accessible, and someone credible cited you
  {
    from_tier: 7,
    to_tier: 6,
    min_trust_score: 20,
    min_confirmation_count: 0,
    max_conflict_rate: 1.0,        // No conflict history required at this stage
    min_independent_citers: 1,     // At least one T1-T5 source cited this
    min_accessibility_rate: 0.8,
    min_age_days: 7,
    min_lead_time_samples: 0,
    additional_requirements: "URL resolves, publishes structured content, can identify the publishing entity.",
  },
  // T6 → T5: News/Commentary to Industry/Standards
  // Prove consistent accuracy and multiple credible citations
  {
    from_tier: 6,
    to_tier: 5,
    min_trust_score: 40,
    min_confirmation_count: 3,
    max_conflict_rate: 0.2,        // Maximum 20% of conflicts lost
    min_independent_citers: 2,
    min_accessibility_rate: 0.9,
    min_age_days: 90,
    min_lead_time_samples: 3,
    additional_requirements: "Publishes original analysis or standards (not just reporting). Publishing entity is an identifiable organization with domain expertise.",
  },
  // T5 → T4: Industry/Standards to Expert Analysis
  // Demonstrated track record of accurate early reporting verified against T1 sources
  {
    from_tier: 5,
    to_tier: 4,
    min_trust_score: 60,
    min_confirmation_count: 10,
    max_conflict_rate: 0.1,        // Maximum 10% of conflicts lost
    min_independent_citers: 3,     // 3+ different T1-T3 sources cite this
    min_accessibility_rate: 0.95,
    min_age_days: 180,
    min_lead_time_samples: 5,
    additional_requirements: "Track record of early accurate reporting confirmed against T1 sources. Recognized as authoritative by at least one intergovernmental or government body.",
  },
  // T4 → T3: Expert Analysis to Intergovernmental
  // Rare. The source has become an official reference for an IGO or treaty body.
  {
    from_tier: 4,
    to_tier: 3,
    min_trust_score: 80,
    min_confirmation_count: 25,
    max_conflict_rate: 0.05,       // Maximum 5% of conflicts lost
    min_independent_citers: 5,
    min_accessibility_rate: 0.98,
    min_age_days: 365,
    min_lead_time_samples: 10,
    additional_requirements: "Source is operated by or formally partnered with an intergovernmental organization. Its publications are referenced in official IGO documents.",
  },
  // T3 → T2: Intergovernmental to Regulator Implementation
  // Almost never happens through promotion. A source is T2 because it IS the regulator's portal.
  {
    from_tier: 3,
    to_tier: 2,
    min_trust_score: 90,
    min_confirmation_count: 50,
    max_conflict_rate: 0.02,
    min_independent_citers: 10,
    min_accessibility_rate: 0.99,
    min_age_days: 730,
    min_lead_time_samples: 20,
    additional_requirements: "Source has become the official implementation channel for a specific regulatory body. This is a structural change in the source's role, not a quality improvement.",
  },
  // T2 → T1: Regulator to Primary Legal Text
  // Does not happen through the trust system. A source is T1 because it IS the official legal
  // publication. This is a fact about the institution, not something earned through performance.
  // Included here for completeness with impossible thresholds.
  {
    from_tier: 2,
    to_tier: 1,
    min_trust_score: 100,
    min_confirmation_count: 999999,
    max_conflict_rate: 0,
    min_independent_citers: 999999,
    min_accessibility_rate: 1.0,
    min_age_days: 999999,
    min_lead_time_samples: 999999,
    additional_requirements: "IMPOSSIBLE VIA PROMOTION. T1 status is assigned at source creation based on institutional role. A source either IS an official legal gazette or it is not.",
  },
];

// ── Demotion Triggers ──
// Unlike promotion (which requires meeting all criteria),
// demotion can be triggered by ANY SINGLE condition being met.

export interface DemotionTrigger {
  trigger: string;                 // Machine-readable trigger ID
  description: string;             // Human-readable description
  condition: string;               // What specifically triggers this
  severity: "immediate" | "flagged"; // "immediate" = demote now, "flagged" = queue for review
  tiers_affected: SourceTier[];    // Which tiers this trigger applies to
}

export const DEMOTION_TRIGGERS: DemotionTrigger[] = [
  {
    trigger: "high_conflict_rate",
    description: "Source has lost more than 30% of factual disputes",
    condition: "conflict_count / conflict_total > 0.30 AND conflict_total >= 3",
    severity: "flagged",
    tiers_affected: [2, 3, 4, 5, 6],
  },
  {
    trigger: "critical_conflict",
    description: "Source published information directly contradicting T1 legal text",
    condition: "Any conflict where this source contradicts a T1 source AND the T1 source is confirmed correct",
    severity: "immediate",
    tiers_affected: [2, 3, 4, 5, 6],
  },
  {
    trigger: "extended_inaccessibility",
    description: "Source has been inaccessible for 30+ consecutive days",
    condition: "last_accessible < NOW() - INTERVAL '30 days' AND status = 'inaccessible'",
    severity: "flagged",
    tiers_affected: [1, 2, 3, 4, 5, 6],
  },
  {
    trigger: "chronic_inaccessibility",
    description: "Source accessibility rate has dropped below 50%",
    condition: "accessibility_rate < 0.50 AND total_checks >= 10",
    severity: "immediate",
    tiers_affected: [3, 4, 5, 6],
  },
  {
    trigger: "paywall_introduced",
    description: "Previously open-access source is now behind a paywall",
    condition: "paywalled changed from FALSE to TRUE",
    severity: "flagged",
    tiers_affected: [3, 4, 5, 6],
  },
  {
    trigger: "no_substantive_update",
    description: "Source has not published substantive new content within 3x its stated update frequency",
    condition: "days_since_last_substantive_change > (expected_frequency_days * 3)",
    severity: "flagged",
    tiers_affected: [2, 3, 4, 5],
  },
  {
    trigger: "self_citation_only",
    description: "Source's only citations are from itself",
    condition: "independent_citers = 0 AND self_citation_count > 0 AND age_days > 90",
    severity: "flagged",
    tiers_affected: [5, 6, 7],
  },
];

// ── Source Status ──
// A source's operational status, independent of its trust tier

export type SourceStatus = "active" | "stale" | "inaccessible" | "provisional" | "suspended";

export const SOURCE_STATUS_DEFINITIONS: Record<SourceStatus, {
  label: string;
  description: string;
  monitoring: boolean;  // Whether the system still monitors this source
}> = {
  active: {
    label: "Active",
    description: "Source is accessible, publishing content, and being monitored on schedule.",
    monitoring: true,
  },
  stale: {
    label: "Stale",
    description: "Source is accessible but has not published substantive new content within its expected frequency. Still monitored but flagged for review.",
    monitoring: true,
  },
  inaccessible: {
    label: "Inaccessible",
    description: "Source URL is not responding or returns errors. Monitoring continues with exponential backoff.",
    monitoring: true,
  },
  provisional: {
    label: "Provisional",
    description: "Source was discovered via citation and has not yet been reviewed by a human. Information from this source is flagged as unconfirmed.",
    monitoring: false,
  },
  suspended: {
    label: "Suspended",
    description: "Source has been manually suspended due to trust concerns. No monitoring. Requires human review to reactivate.",
    monitoring: false,
  },
};

// ── Intelligence Types ──
// What kind of intelligence this source produces

export type IntelligenceType =
  | "REG"  // Regulatory text (laws, directives, regulations)
  | "STD"  // Standards (ISO, GLEC, GHG Protocol)
  | "RES"  // Research (academic papers, reports)
  | "MKT"  // Market data (prices, indices, forecasts)
  | "IND"  // Industry guidance (association positions, best practices)
  | "SUP"  // Supranational frameworks (IMO strategies, ICAO standards)
  | "INN"  // Innovation (technology developments, pilot projects)
  | "PTN"; // Partner data (university research pipeline, NGO reports)

// ── Intelligence Domains ──
// The seven domains of intelligence Caro's Ledge monitors

export type IntelligenceDomain = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const DOMAIN_DEFINITIONS: Record<IntelligenceDomain, {
  label: string;
  shortLabel: string;
  description: string;
}> = {
  1: { label: "Regulatory and Legislative", shortLabel: "Regulations", description: "Binding law, directives, standards, and guidance across all jurisdictions and transport modes." },
  2: { label: "Energy and Technology Innovation", shortLabel: "Technology", description: "Battery, hydrogen, SAF, marine fuels, EVs, solar, autonomous freight — category tracking, not company tracking." },
  3: { label: "Regional Operations Intelligence", shortLabel: "Regional", description: "Energy tariffs, labor costs, solar permitting, EV charging, shore power by jurisdiction." },
  4: { label: "Geopolitical and Market Signals", shortLabel: "Geopolitical", description: "Commodity prices, carbon markets, trade restrictions, critical minerals, shipping chokepoints." },
  5: { label: "Source Intelligence", shortLabel: "Sources", description: "Source registry health, discovery pipeline, conflict detection, tier management." },
  6: { label: "Warehouse and Facility Optimization", shortLabel: "Facilities", description: "Electricity tariffs, solar ROI, BESS pricing, labor benchmarks, green building certifications by location." },
  7: { label: "University and Research Pipeline", shortLabel: "Research", description: "Academic research relevant to freight and logistics sustainability across all transport modes and sectors." },
};

// ── Complete Source Entity ──
// This is what a source looks like in the database and in
// the frontend. Every field has a specific purpose.

export interface Source {
  id: string;                      // UUID

  // Identity
  name: string;                    // Human-readable name: "EUR-Lex", "Federal Register"
  url: string;                     // Base URL of the source portal
  description: string;             // What this source publishes and why it matters

  // Classification
  tier: SourceTier;                // Current trust tier (1-7)
  tier_at_creation: SourceTier;    // What tier this source was assigned when first added
  intelligence_types: IntelligenceType[];
  domains: IntelligenceDomain[];
  jurisdictions: string[];         // Which jurisdictions this source covers
  /**
   * ISO 3166-1 alpha-2 / ISO 3166-2 / supranational codes for the
   * source's coverage area. Coexists with `jurisdictions` during
   * the 60-day dual-write window introduced in migration 033.
   * Optional because legacy read paths and pre-033 rows may not
   * populate it.
   */
  jurisdiction_iso?: string[];
  transport_modes: string[];       // Which transport modes this source is relevant to

  // Monitoring
  update_frequency: string;        // Expected: "daily", "weekly", "monthly", "quarterly", "ad-hoc"
  last_checked: string | null;     // ISO timestamp — when we last scanned this source
  last_substantive_change: string | null; // ISO timestamp — when this source last published new content
  next_scheduled_check: string | null;    // ISO timestamp — when the next scan is due
  status: SourceStatus;

  // Access
  paywalled: boolean;
  access_method: "api" | "rss" | "scrape" | "gazette" | "manual"; // How we ingest from this source
  api_endpoint?: string;           // If API, the endpoint URL
  rss_feed_url?: string;           // If RSS, the feed URL

  // Trust (computed from TrustMetrics)
  trust_metrics: TrustMetrics;
  trust_score: TrustScore;

  // Tier history
  tier_history: TierHistoryEntry[];

  // Provenance
  cited_by: string | null;         // Source ID that first cited this source (for discovered sources)
  notes: string;

  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface TierHistoryEntry {
  date: string;                    // ISO timestamp
  from_tier: SourceTier;
  to_tier: SourceTier;
  reason: string;
  trust_score_at_change: number;
  changed_by: "system" | "human";
}

// ── Provisional Source ──
// A source discovered through citation that hasn't been reviewed yet

export interface ProvisionalSource {
  id: string;                      // UUID
  name: string;
  url: string;
  domain: IntelligenceDomain | null;
  description: string;

  // Discovery chain
  discovered_via: "skill_recommendation" | "citation_detection" | "worker_search";
  cited_by_source_id: string;      // The source that first cited this
  cited_by_source_tier: SourceTier; // Tier of the citing source (T1 citation > T5 citation)

  // Citation accumulation
  citation_count: number;          // Total times any source cited this
  independent_citers: number;      // Count of UNIQUE T1-T3 sources that cited this
  citing_source_ids: string[];     // All source IDs that have cited this
  highest_citing_tier: SourceTier; // Best tier among citers

  // Assessment
  provisional_tier: SourceTier;    // Estimated tier based on entity type (always starts at 7)
  recommended_tier: SourceTier | null; // System recommendation after enough data
  accessibility_verified: boolean; // Has the URL been confirmed accessible
  publishes_structured_content: boolean; // Does it have parseable content
  entity_identified: boolean;      // Can we identify who runs this source

  // Review
  status: "pending_review" | "confirmed" | "rejected" | "needs_more_data";
  reviewer_notes: string;

  // Timestamps
  created_at: string;
  reviewed_at: string | null;
}
