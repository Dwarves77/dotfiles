// ══════════════════════════════════════════════════════════════
// Intelligence Item Types
// ══════════════════════════════════════════════════════════════
//
// An intelligence item is a specific regulation, standard,
// technology finding, market signal, or research output that
// lives INSIDE a source.
//
// This type extends the existing Resource type to maintain
// backward compatibility during migration while adding the
// source linkage and expanded domain model.
// ══════════════════════════════════════════════════════════════

import type { Resource, TimelineEntry, ImpactScores, ImpactReasoning } from "./resource";
import type { Source, IntelligenceDomain, SourceTier } from "./source";

// ── Item Type ──
// What kind of intelligence this item represents

export type ItemType =
  | "regulation"
  | "directive"
  | "standard"
  | "guidance"
  | "technology"
  | "market_signal"
  | "regional_data"
  | "research_finding"
  | "innovation"
  | "framework"
  | "tool"
  | "initiative";

// ── Item Status ──

export type ItemStatus =
  | "proposed"
  | "adopted"
  | "in_force"
  | "monitoring"
  | "superseded"
  | "repealed"
  | "expired";

// ── Confidence Level ──

export type ConfidenceLevel = "confirmed" | "unconfirmed";

// ── Intelligence Item ──
// The core data entity for everything Caro's Ledge tracks.

export interface IntelligenceItem {
  id: string;                      // UUID
  legacy_id: string | null;        // Maps to old resource IDs ("o1", "a3") during migration

  // Content
  title: string;
  summary: string;                 // Was "note" in Resource
  what_is_it: string;
  why_matters: string;
  key_data: string[];
  operational_impact: string;
  open_questions: string[];
  tags: string[];

  // Classification
  domain: IntelligenceDomain;      // 1-7: which intelligence domain
  category: string | null;         // Topic within domain (emissions, fuels, etc.)
  item_type: ItemType;

  // Source linkage — THE critical relationship
  source_id: string | null;        // UUID FK to sources table
  source_url: string;              // Direct URL to this item within the source portal
  source_name?: string;            // Denormalized for display
  source_tier?: SourceTier;        // Denormalized for display

  // Dimensions
  jurisdictions: string[];
  transport_modes: string[];
  verticals: string[];

  // Status and severity
  status: ItemStatus;
  severity: "critical" | "high" | "medium" | "low";
  confidence: ConfidenceLevel;
  priority: "CRITICAL" | "HIGH" | "MODERATE" | "LOW";
  reasoning: string;

  // Dates
  entry_into_force: string | null; // ISO date
  compliance_deadline: string | null;
  next_review_date: string | null;
  added_date: string;              // ISO date
  last_verified: string | null;    // ISO timestamp

  // Timeline milestones
  timeline: TimelineEntry[];

  // Archive
  is_archived: boolean;
  archive_reason: string | null;
  archive_note: string | null;
  archived_date: string | null;
  replaced_by: string | null;      // UUID of replacing item

  // Scoring (computed client-side, same as current)
  urgency_score: number;
  impact_scores: ImpactScores;
  impact_reasoning?: ImpactReasoning;

  // Verification (computed from cross-refs and disputes)
  verification_label: string;
  verification_color: string;
  xref_count: number;
  dispute_count: number;

  // Version history
  version_history: VersionEntry[];

  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface VersionEntry {
  date: string;
  field: string;
  previous_value: string;
  new_value: string;
  detected_by: string;
}

// ── Conversion: Resource → IntelligenceItem ──
// Used during migration to convert existing seed data

export function resourceToIntelligenceItem(
  resource: Resource,
  sourceId: string | null,
  sourceUrl: string,
  sourceName?: string,
  sourceTier?: SourceTier,
): IntelligenceItem {
  return {
    id: crypto.randomUUID(),
    legacy_id: resource.id,

    title: resource.title,
    summary: resource.note,
    what_is_it: resource.whatIsIt,
    why_matters: resource.whyMatters,
    key_data: resource.keyData,
    operational_impact: "",
    open_questions: [],
    tags: resource.tags,

    domain: 1, // All existing resources are Domain 1 (Regulatory)
    category: resource.topic || resource.sub || null,
    item_type: mapResourceType(resource.type),

    source_id: sourceId,
    source_url: sourceUrl || resource.url,
    source_name: sourceName,
    source_tier: sourceTier,

    jurisdictions: resource.jurisdiction ? [resource.jurisdiction] : [],
    transport_modes: resource.modes || [resource.cat],
    verticals: [],

    status: "monitoring",
    severity: mapPriorityToSeverity(resource.priority),
    confidence: "confirmed",
    priority: resource.priority,
    reasoning: resource.reasoning,

    entry_into_force: null,
    compliance_deadline: null,
    next_review_date: null,
    added_date: resource.added,
    last_verified: null,

    timeline: resource.timeline || [],

    is_archived: resource.isArchived || false,
    archive_reason: resource.archiveReason || null,
    archive_note: resource.archiveNote || null,
    archived_date: resource.archivedDate || null,
    replaced_by: resource.replacedBy || null,

    urgency_score: resource.urgencyScore || 0,
    impact_scores: resource.impactScores || { cost: 0, compliance: 0, client: 0, operational: 0 },

    verification_label: "Unverified",
    verification_color: "#475569",
    xref_count: 0,
    dispute_count: 0,

    version_history: [],

    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ── Helper: Map old resource.type to ItemType ──

function mapResourceType(type: string): ItemType {
  const mapping: Record<string, ItemType> = {
    regulation: "regulation",
    standard: "standard",
    framework: "framework",
    tool: "tool",
    data: "tool",
    initiative: "initiative",
    certification: "standard",
    industry: "initiative",
    news: "market_signal",
    academic: "research_finding",
    legal: "regulation",
    rule: "regulation",
    tracker: "tool",
    blog: "market_signal",
    journal: "research_finding",
    innovation: "innovation",
  };
  return mapping[type.toLowerCase()] || "regulation";
}

// ── Helper: Map priority to severity ──

function mapPriorityToSeverity(priority: string): "critical" | "high" | "medium" | "low" {
  switch (priority) {
    case "CRITICAL": return "critical";
    case "HIGH": return "high";
    case "MODERATE": return "medium";
    case "LOW": return "low";
    default: return "medium";
  }
}

// ── Source-to-Legacy-Resource Mapping ──
// Maps each legacy resource ID prefix to the source portal it belongs to.
// This is used during migration to link existing resources to sources.
//
// The mapping logic:
//   - "o" prefix (ocean) items: check content for IMO, EU, etc.
//   - "a" prefix (air) items: check for ICAO, EU, UK
//   - "l" prefix (land) items: check for EPA, EU, CARB
//   - "c" prefix (compliance) items: check for specific standards bodies
//   - "t" prefix (trade) items: check for EU (CBAM), WTO
//   - "g" prefix (global) items: check content for specific source
//   - "r" prefix (research) items: check for specific institutions
//
// This is deliberately a manual mapping because the 119 existing
// entries were manually curated, and each one needs to be correctly
// anchored to its source. Automation would introduce errors.

export interface LegacySourceMapping {
  legacy_id: string;
  source_name: string;             // Matches sources.name
  source_url_within_portal: string; // Direct URL to this item within the source
  rationale: string;               // Why this mapping
}

// The actual mapping will be generated as a seed script once
// the source registry is in place and all 119 resources have
// been reviewed against their actual source portals.
