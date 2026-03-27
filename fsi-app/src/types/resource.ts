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

export type TabId = "home" | "explore" | "map" | "settings";

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
