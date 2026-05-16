// Canonical TypeScript-side vocabularies for the freight sustainability
// intelligence platform. Single source of truth at the application
// boundary.
//
// MIRRORS the DB CHECK constraints in migration 078:
//   - severity / priority enums + locked mapping
//   - sources.scope_topics ⊆ 14 canonical values
//   - intelligence_items.compliance_object_tags ⊆ 19 canonical values
//   - intelligence_items.operational_scenario_tags shape (case-insensitive
//     kebab-case)
//
// Drift between this file and the DB constraints is itself a bug. If a
// future migration changes the DB constraint, this file must change
// with it; conversely, changes here without a migration are partial.
//
// Module structure: Option A per dispatch 2 prework decision 3 —
// consts and schemas exported separately so callers can pick whichever
// surface they need (the raw list for UI dropdowns, the schema for
// validation, the mapping for derived computations).
//
// Imported by:
//   - fsi-app/src/lib/agent/parse-output.ts (agent output validation)
//   - any future write path (admin form submission, backfill scripts,
//     staged_updates materializer, manual SQL helpers)

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────
// SEVERITY + PRIORITY (closed enums) and the locked mapping between them
// ─────────────────────────────────────────────────────────────────────
//
// Per vocabulary-severity-labels skill. Mirrors DB CHECK constraints:
//   intelligence_items_severity_check (migration 018)
//   intelligence_items_priority_check (migration 001)
//   intelligence_items_severity_priority_mapping_check (migration 078)

export const SEVERITY_VOCAB = [
  "ACTION REQUIRED",
  "COST ALERT",
  "WINDOW CLOSING",
  "COMPETITIVE EDGE",
  "MONITORING",
] as const;

export const PRIORITY_VOCAB = [
  "CRITICAL",
  "HIGH",
  "MODERATE",
  "LOW",
] as const;

// The locked severity-to-priority mapping. `satisfies` ensures the
// mapping covers every SEVERITY_VOCAB value and produces only
// PRIORITY_VOCAB values; a typo on either side is a compile error.
export const SEVERITY_TO_PRIORITY = {
  "ACTION REQUIRED":  "CRITICAL",
  "COST ALERT":       "HIGH",
  "WINDOW CLOSING":   "HIGH",
  "COMPETITIVE EDGE": "MODERATE",
  "MONITORING":       "LOW",
} as const satisfies Record<
  typeof SEVERITY_VOCAB[number],
  typeof PRIORITY_VOCAB[number]
>;

export const SeveritySchema = z.enum(SEVERITY_VOCAB);
export const PrioritySchema = z.enum(PRIORITY_VOCAB);

// ─────────────────────────────────────────────────────────────────────
// URGENCY_TIER + FORMAT_TYPE (closed enums)
// ─────────────────────────────────────────────────────────────────────
//
// Mirrors DB CHECK constraints intelligence_items_urgency_tier_check
// and intelligence_items_format_type_check (both migration 018).

export const URGENCY_TIER_VOCAB = [
  "watch",
  "elevated",
  "stable",
  "informational",
] as const;

export const FORMAT_TYPE_VOCAB = [
  "regulatory_fact_document",
  "technology_profile",
  "operations_profile",
  "market_signal_brief",
  "research_summary",
] as const;

export const UrgencyTierSchema = z.enum(URGENCY_TIER_VOCAB);
export const FormatTypeSchema = z.enum(FORMAT_TYPE_VOCAB);

// ─────────────────────────────────────────────────────────────────────
// SCOPE_TOPIC (closed enum, 14 canonical values)
// ─────────────────────────────────────────────────────────────────────
//
// The 14-value canonical content-topic vocabulary per migration 063
// (sources.scope_topics) and vocabulary-topic-tags skill. Mirrors
// DB CHECK constraint sources_scope_topics_vocab_check (migration 078).
//
// USE FOR: sources.scope_topics. This is the column where the canonical
// 14 values are clean and constrained.

export const SCOPE_TOPIC_VOCAB = [
  "regulatory",
  "finance",
  "technology",
  "fuel",
  "labor",
  "infrastructure",
  "environmental",
  "social",
  "governance",
  "transport",
  "packaging",
  "customs",
  "conservation",
  "materials_science",
] as const;

export const ScopeTopicSchema = z.enum(SCOPE_TOPIC_VOCAB);

// ─────────────────────────────────────────────────────────────────────
// TOPIC_TAG (intelligence_items.topic_tags)
// ─────────────────────────────────────────────────────────────────────
//
// NOT YET DB-ENFORCED. Pending taxonomy rethink — see
// fsi-app/docs/dispatch-3-topic-tags-rethink.md.
// intelligence_items.topic_tags has 1,781 distinct values in production
// (verified 2026-05-15 via scripts/tmp/dispatch2-prework-introspect.mjs);
// the 14-value canonical list may be wrong shape for items vs sources.
// Items appear to need a richer or hierarchical vocabulary because the
// drift includes legitimate operational concepts (air_quality 36 rows,
// decarbonization 24, biodiversity 13, climate_change 22) that don't
// reduce cleanly to a single canonical value.
// DO NOT enforce at DB level until rethink completes.
//
// The schema below is provided for use by callers that want to validate
// AGAINST the 14-value list at the application layer (e.g., the agent's
// parse-output path, which already restricts agent emissions to a small
// vocabulary). Bypass writer paths (admin SQL, seed scripts) currently
// emit values outside this list; the rethink decides what the canonical
// vocabulary becomes.

export const TOPIC_TAG_VOCAB = SCOPE_TOPIC_VOCAB; // same 14 values for now

export const TopicTagSchema = z
  .array(z.enum(TOPIC_TAG_VOCAB))
  .max(4, "topic_tags exceeds 4 values");

// ─────────────────────────────────────────────────────────────────────
// COMPLIANCE_OBJECT (closed enum, 19 canonical values)
// ─────────────────────────────────────────────────────────────────────
//
// The 19-value canonical supply-chain-role vocabulary per
// vocabulary-compliance-objects skill. Mirrors DB CHECK constraint
// intelligence_items_compliance_object_tags_vocab_check (migration 078).
//
// Grouped semantically (per skill):
//   Carriers (4): carrier-{ocean,air,road,rail}
//   Vehicle/fleet operators (3): {vessel,aircraft,road-fleet}-operator
//   Forwarders + intermediaries (3): freight-forwarder, customs-broker, nvocc
//   Cargo principals (5): shipper, importer, exporter, manufacturer-producer, distributor
//   Infrastructure (4): {port,airport,terminal,warehouse}-operator

export const COMPLIANCE_OBJECT_VOCAB = [
  "carrier-ocean", "carrier-air", "carrier-road", "carrier-rail",
  "vessel-operator", "aircraft-operator", "road-fleet-operator",
  "freight-forwarder", "customs-broker", "nvocc",
  "shipper", "importer", "exporter", "manufacturer-producer", "distributor",
  "port-operator", "airport-operator", "terminal-operator", "warehouse-operator",
] as const;

export const ComplianceObjectSchema = z.enum(COMPLIANCE_OBJECT_VOCAB);

export const ComplianceObjectTagsSchema = z
  .array(ComplianceObjectSchema)
  .max(4, "compliance_object_tags exceeds 4 values");

// ─────────────────────────────────────────────────────────────────────
// OPERATIONAL_SCENARIO_TAG (open vocabulary, shape only)
// ─────────────────────────────────────────────────────────────────────
//
// Open vocabulary per reference-operational-scenarios. Shape constraint
// only: case-insensitive kebab-case. Mirrors DB CHECK constraint
// intelligence_items_operational_scenario_tags_shape_check (migration
// 078). Case-insensitive per operator Decision 2 in the prework:
// `emissions-reporting-Scope3` (106 rows with capital S) is the
// canonical brief example and mixed case is consistent with existing
// runtime behavior.
//
// Cardinality cap: max 5 tags per item per parse-output.ts agent
// contract. Drives intersection detection; over-tagging dilutes signal.

const OPERATIONAL_SCENARIO_SHAPE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/i;

export const OperationalScenarioTagSchema = z
  .string()
  .regex(
    OPERATIONAL_SCENARIO_SHAPE,
    "operational_scenario_tags must be case-insensitive kebab-case (e.g. ocean-bunkering, emissions-reporting-Scope3)"
  );

export const OperationalScenarioTagsSchema = z
  .array(OperationalScenarioTagSchema)
  .max(5, "operational_scenario_tags exceeds 5 values");

// ─────────────────────────────────────────────────────────────────────
// SOURCE_TIER (1..7 per vocabulary-source-tiers)
// ─────────────────────────────────────────────────────────────────────
//
// Mirrors DB CHECK constraints sources_tier_check,
// sources_tier_at_creation_check, sources_highest_citing_tier_check.

export const SOURCE_TIER_VOCAB = [1, 2, 3, 4, 5, 6, 7] as const;

export const SourceTierSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
]);

// ─────────────────────────────────────────────────────────────────────
// Composite metadata schema (agent YAML frontmatter output contract)
// ─────────────────────────────────────────────────────────────────────
//
// The 12-field metadata block emitted by the Sonnet writer per the
// system prompt contract. Replaces the ~220-line hand-rolled validator
// in parse-output.ts. The .refine() at the bottom enforces the locked
// severity-to-priority mapping (same enforcement migration 078 adds at
// the DB level; defense in depth).
//
// intersection_summary is nullable and capped at 2000 chars; longer
// values are truncated by the parse-output.ts caller (the cap is
// documented at parse-output.ts line 354-356 with truncation policy).

export const AgentMetadataSchema = z
  .object({
    severity:                  SeveritySchema,
    priority:                  PrioritySchema,
    urgency_tier:              UrgencyTierSchema,
    format_type:               FormatTypeSchema,
    topic_tags:                TopicTagSchema,
    operational_scenario_tags: OperationalScenarioTagsSchema,
    compliance_object_tags:    ComplianceObjectTagsSchema,
    related_items:             z.array(z.string().uuid()),
    intersection_summary:      z.string().max(2000).nullable(),
    sources_used:              z.array(z.string().uuid()),
    last_regenerated_at:       z.string().refine(
      (s) => !isNaN(Date.parse(s)),
      { message: "last_regenerated_at must be ISO 8601 parseable" }
    ),
    regeneration_skill_version: z.string(),
  })
  // Locked severity-to-priority mapping per vocabulary-severity-labels.
  // Same enforcement migration 078 adds at the DB layer (defense in depth).
  // Dynamic detail (expected value) is composed by the caller from
  // SEVERITY_TO_PRIORITY[m.severity] when a richer message is needed.
  .superRefine((m, ctx) => {
    const expected = SEVERITY_TO_PRIORITY[m.severity];
    if (expected !== m.priority) {
      ctx.addIssue({
        code: "custom",
        message: `Priority "${m.priority}" does not match locked mapping for severity "${m.severity}" (expected "${expected}")`,
        path: ["priority"],
      });
    }
  });

export type AgentMetadata = z.infer<typeof AgentMetadataSchema>;

// Backward-compatible type aliases for the parse-output.ts public API.
// These preserve the legacy ParsedAgentOutput shape so the route handler
// at fsi-app/src/app/api/agent/run/route.ts doesn't need to change.
export type Severity              = z.infer<typeof SeveritySchema>;
export type Priority              = z.infer<typeof PrioritySchema>;
export type UrgencyTier           = z.infer<typeof UrgencyTierSchema>;
export type FormatType            = z.infer<typeof FormatTypeSchema>;
export type ScopeTopic            = z.infer<typeof ScopeTopicSchema>;
export type TopicTag              = ScopeTopic; // same vocab (today); rethink may diverge
export type ComplianceObject      = z.infer<typeof ComplianceObjectSchema>;
export type OperationalScenarioTag = z.infer<typeof OperationalScenarioTagSchema>;
export type SourceTier            = z.infer<typeof SourceTierSchema>;
