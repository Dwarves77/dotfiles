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
  date: string;
  severity: "major" | "minor" | "replacement";
  note: string;
}

export interface CrossRef {
  from: string;
  to: string;
  relationship: string;
}

export interface Cluster {
  name: string;
  ids: string[];
  why: string;
}

export interface Resource {
  id: string;
  cat: string;           // primary mode: ocean, air, road
  sub: string;           // subcategory label
  title: string;
  url: string;
  note: string;
  type: string;          // framework, regulation, law, standard, innovation, etc.
  priority: "CRITICAL" | "HIGH" | "MODERATE" | "LOW";
  added: string;         // ISO date
  reasoning: string;     // why this priority
  tags: string[];
  whatIsIt: string;
  whyMatters: string;
  keyData: string[];
  timeline?: TimelineEntry[];

  // Applied from REMAP
  modes?: string[];
  topic?: string;
  jurisdiction?: string;

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
  sourceUrl?: string;          // Direct URL to primary source document
  sourceName?: string;         // Name of the publishing body
  sourceTier?: number;         // Tier 1-5 from skill source hierarchy
  legalInstrument?: string;    // e.g. "Regulation (EU) 2023/1805", "40 CFR Part 86"
  enforcementBody?: string;    // e.g. "European Commission DG CLIMA", "US EPA"
  penaltyRange?: string;       // e.g. "€2,400/tonne shortfall", "Up to 4% EU turnover"
  complianceDeadline?: string; // Next critical deadline
  costMechanism?: string;      // How the cost flows to freight (surcharge, penalty, allowance)
  actionOwner?: string;        // Suggested internal owner: Legal, Sustainability, Ocean Product, etc.
  lastVerifiedDate?: string;   // ISO date when data was last verified against source

  // Market data snapshot (for regulations with pricing impact)
  marketData?: {
    currentPrice?: string;     // e.g. "€68/tCO2" for ETS
    previousPrice?: string;    // e.g. "€85/tCO2 (2023)"
    priceSource?: string;      // e.g. "ICAP Allowance Price Explorer"
    priceDate?: string;        // When the price was captured
    freightCostImpact?: string; // e.g. "+$15-25/TEU on EU port calls"
  };

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
}

// ── Verification ──

export interface VerificationResult {
  xrefCount: number;
  disputeCount: number;
  label: string;
  color: string;
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
