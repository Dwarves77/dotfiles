# Dispatch 2 Prework: Vocabulary CHECK Constraints + Validation Layer

**Date:** 2026-05-15
**Status:** prework only; PAUSE for operator review before any code authoring
**Dispatch:** Vocabulary CHECK constraints (migration 078) + application validation layer (`vocabularies.ts` + parse-output refactor)

This document surfaces verified ground-truth findings BEFORE any migration SQL or TypeScript is authored. The dispatch was scoped on assumptions; the prework checks whether those assumptions match the live DB state. They mostly do not. The scope needs operator decisions on three points before code can be written.

## Skill citations applied (activation-gap experiment)

Per the dispatch's activation-gap experiment, citing which skills were read and how each shaped this prework:

| Skill | Path | How applied here |
|---|---|---|
| `rule-cost-weighted-recommendations` | `dotfiles/.claude/skills/rule-cost-weighted-recommendations/SKILL.md` | Cost frame stated explicitly at bottom of this doc and surfaced per-decision-point above. Inheritance cost (#4) is the load-bearing surface because vocabulary changes touch every writer and classifier. |
| `rule-cross-reference-integrity` | `dotfiles/.claude/skills/rule-cross-reference-integrity/SKILL.md` | The whole reason this dispatch exists. Three storage shapes (DB free-text, TS validator, SKILL.md) disagreeing on what `topic_tags` is allowed is the canonical failure mode this rule names. The fix per the rule: one canonical writer per fact, schema-level enforcement where possible. |
| `rule-source-traceability-per-claim` | `dotfiles/.claude/skills/rule-source-traceability-per-claim/SKILL.md` | Indirectly: vocabulary integrity supports the source-traceability contract because items with hallucinated tags cannot anchor citations cleanly. Tightening vocabularies tightens the per-claim attribution by reducing the surface area of "what does this tag mean." |
| `vocabulary-topic-tags` | `dotfiles/.claude/skills/vocabulary-topic-tags/SKILL.md` | The canonical 14-value list this dispatch enforces. The reconciliation plan in v2 audit Section 6.2 informs the backfill approach. The skill explicitly notes the source-vs-item distinction; this prework respects that (sources.scope_topics already clean; intelligence_items.topic_tags is the dirty column). |
| `vocabulary-compliance-objects` | `dotfiles/.claude/skills/vocabulary-compliance-objects/SKILL.md` | The 19-value canonical list. (Skill description says "18" but the list enumerates 19; parse-output.ts comment at line 53-55 acknowledges the off-by-one.) Used to confirm that all 15 distinct values currently in use are IN the canonical list. |
| `vocabulary-severity-labels` | `dotfiles/.claude/skills/vocabulary-severity-labels/SKILL.md` | The 5-value list AND the locked severity-to-priority mapping. The skill explicitly states "[[rule-cross-reference-integrity]] requires the mapping be enforced by a DB constraint or trigger so future violations are impossible by construction." This prework verifies the violation count (209) and proposes the constraint. |
| `operational-migration-authoring` | `fsi-app/.claude/skills/operational-migration-authoring/SKILL.md` | Patterns applied to the proposed migration sketch below: BEGIN/COMMIT wrap, COMMENT ON CONSTRAINT, idempotent ADD CONSTRAINT, two-phase (backfill then constrain). Migration registry gap warning (026-050) noted; apply-pending.mjs MIN_VERSION=052 sidesteps it for 078. |
| `operational-backfill-pattern` | `fsi-app/.claude/skills/operational-backfill-pattern/SKILL.md` | Patterns applied: idempotent UPDATE with WHERE-safe-to-rerun, batched if scale demands, progress tracking, rollback plan. The topic_tags backfill is the load-bearing piece of this dispatch; the pattern shapes how it gets sequenced (sample first, then 100, then full). |

If skill content materially shaped a decision below, it is called out inline (e.g., "Per `rule-cross-reference-integrity`...").

## Ground-truth check 1: existing DB CHECK constraints

Query executed (read-only): `pg_constraint` joined to `pg_class` for `intelligence_items` and `sources` with `contype = 'c'`. Script at `fsi-app/scripts/tmp/dispatch2-prework-introspect.mjs`. Output at `fsi-app/scripts/tmp/dispatch2-prework-introspect.json`.

**Existing CHECK constraints (16 total):**

On `intelligence_items` (9):
- `confidence_check` — confirmed/unconfirmed
- `domain_check` — 1..7
- `format_type_check` — 5 SKILL.md format values
- `item_type_check` — 12 item type values
- `pipeline_stage_check` — draft/active_review/published/archived
- `priority_check` — CRITICAL/HIGH/MODERATE/LOW
- `severity_check` — 5 SKILL.md severity values (per migration 018)
- `status_check` — 7 status values
- `urgency_tier_check` — watch/elevated/stable/informational

On `sources` (7):
- `access_method_check` — 6 access methods
- `api_auth_method_check` — 6 auth methods
- `api_response_format_check` — 6 response formats
- `highest_citing_tier_check` — 1..7
- `status_check` — 5 status values
- `tier_at_creation_check` — 1..7
- `tier_check` — 1..7

**Critical NEGATIVE findings — what is NOT constrained:**

The dispatch was scoped on the assumption that migration 063 might already enforce 14 values on topic_tags. **It does not.** Migration 063 added a COMMENT documenting the 14 values; no CHECK constraint exists.

| Column | Current enforcement | Risk |
|---|---|---|
| `intelligence_items.topic_tags` | NONE; free TEXT[] | Any string accepted; drift unbounded |
| `sources.scope_topics` | NONE; free TEXT[] | Any string accepted; drift unbounded (currently clean by luck — see Check 3) |
| `intelligence_items.compliance_object_tags` | NONE; free TEXT[] | Any string accepted; drift unbounded |
| `intelligence_items.operational_scenario_tags` | NONE; free TEXT[] | Any string accepted; drift unbounded |
| severity → priority mapping | NONE; only parse-output.ts at the agent path validates | Three bypass writer paths (staged_updates materializer, pre-B.2 legacy, admin SQL) all violate freely |

The dispatch's binary scope ("verify whether 063 enforces 14; if so the backfill for that column is unnecessary") confirmed direction: 063 does NOT enforce; the backfill is needed. But the backfill SHAPE is dramatically different from what the dispatch assumed (see Check 3 below).

## Ground-truth check 2: severity-priority lock violation count

Query: count rows where `priority` does not match the canonical mapping from `severity`. Mapping per `vocabulary-severity-labels`:

- ACTION REQUIRED → CRITICAL
- COST ALERT → HIGH
- WINDOW CLOSING → HIGH
- COMPETITIVE EDGE → MODERATE
- MONITORING → LOW

**Result: 209 rows violate.** Identical to the v2 audit count. Multi-tenant foundation work (migrations 075-077) did not touch severity-priority and did not shift the count.

**Distribution of violators by (severity, priority) pair (highest first):**

| Severity | Current priority | Should be | Row count |
|---|---|---|---|
| MONITORING | MODERATE | LOW | 124 |
| MONITORING | HIGH | LOW | 66 |
| ACTION REQUIRED | HIGH | CRITICAL | 16 |
| COMPETITIVE EDGE | HIGH | MODERATE | 3 |
| **Total violators** | | | **209** |

**Full severity-priority distribution (for context, all 655 rows):**

| Severity | Priority | Count | Spec match? |
|---|---|---|---|
| ACTION REQUIRED | CRITICAL | 49 | ✅ |
| ACTION REQUIRED | HIGH | 16 | ❌ |
| COMPETITIVE EDGE | HIGH | 3 | ❌ |
| COMPETITIVE EDGE | MODERATE | 9 | ✅ |
| COST ALERT | HIGH | 35 | ✅ |
| MONITORING | LOW | 306 | ✅ |
| MONITORING | MODERATE | 124 | ❌ |
| MONITORING | HIGH | 66 | ❌ |
| WINDOW CLOSING | HIGH | 6 | ✅ |
| (null) | CRITICAL | 4 | n/a (severity is null; allowed) |
| (null) | HIGH | 19 | n/a |
| (null) | LOW | 4 | n/a |
| (null) | MODERATE | 14 | n/a |
| **Total** | | **655** | |

Severity-null rows (41 total) are not violators; the constraint allows null severity.

**Backfill required:** yes, 209 rows. Mechanical UPDATE per the canonical mapping. Safe to re-run. No content judgment required.

## Ground-truth check 3: distinct vocabulary values in current data

This is the check that significantly changes the dispatch scope.

### intelligence_items.topic_tags — DRAMATIC drift

**1,781 distinct values currently in use.** Not 7. Not 14. The audit's framing ("607/655 populated using the 7-value list") was incomplete. The reality:

- **7 distinct values in the OLD list (parse-output.ts):** 319 rows. These are the values the Sonnet agent path emits (emissions, fuels, transport, reporting, packaging, corridors, research).
- **6 distinct values in the NEW 14 list (migration 063):** 92 rows. These come from `transport`, `packaging`, `research`, `infrastructure`, `regulatory`, `governance` — values that happen to appear in both lists OR were used in unknown other paths.
- **1,770 distinct values in NEITHER list (drift):** 2,636 rows. These are seed scripts, admin SQL, and pre-B.2 paths writing free text.

**Top 20 drift values by row count:**

| Tag | Rows | Notes |
|---|---|---|
| air_quality | 36 | Environmental sub-topic; no clean 14-value mapping |
| legislative_process | 32 | Procedural meta-tag; no canonical mapping |
| sustainability | 26 | Generic; no canonical mapping |
| waste_management | 25 | Could map to `environmental` or `materials_science` |
| decarbonization | 24 | Could map to `environmental` |
| renewable_energy | 23 | Could map to `fuel` or `infrastructure` |
| climate_change | 22 | Could map to `environmental` |
| environmental_compliance | 18 | Compound; combines `environmental` + `regulatory` |
| energy_efficiency | 15 | Could map to `infrastructure` |
| biodiversity | 13 | Could map to `conservation` |
| climate_action | 12 | Could map to `environmental` |
| water_quality | 12 | Could map to `environmental` |
| water_management | 11 | Could map to `environmental` or `infrastructure` |
| circular_economy | 11 | Could map to `materials_science` or `packaging` |
| state_government | 11 | Jurisdiction meta-tag; does not fit content topic axis |
| electric_vehicles | 11 | Could map to `technology` or `transport` |
| environmental_policy | 11 | Compound; `environmental` + `regulatory` |
| supply_chain | 10 | Could map to `governance` |
| energy_transition | 10 | Could map to `fuel` or `infrastructure` |
| regulatory_framework | 10 | Could map to `regulatory` |

The remaining 1,750 drift values are long-tail (most appear ≤5 times).

**Implication:** the dispatch's binary backfill plan ("WHEN 'emissions' THEN 'environmental' ELSE tag") does NOT work as drafted. The drift is two orders of magnitude wider than scoped, and most drift values do not have a clean single-value mapping to the canonical 14. Per `operational-backfill-pattern`, this scale of remap requires either:

- **Per-row content judgment** (1,770 distinct values × content classification each, then row-level remap)
- **Bulk null-and-reclassify** (set all drift values to empty, then let the regeneration pipeline re-tag through the constrained writer)
- **Vocabulary scope rethink** (is the 14-value list even the right vocabulary for `intelligence_items.topic_tags`, or does intelligence_items.topic_tags need a separate broader vocabulary that subsumes the source-scope vocabulary?)

This requires operator decision before any code is authored. See "Decision points" below.

### sources.scope_topics — CLEAN

**14 distinct values in use, all 14 in the canonical migration 063 list. 0 drift.** This column was populated cleanly by migration 063 and no writer has added drift values since. The CHECK constraint can land on `sources.scope_topics` without any backfill.

### intelligence_items.compliance_object_tags — CLEAN

**15 distinct values in use, all 15 in the canonical 19-value list. 0 drift.** Top values: freight-forwarder (152), shipper (53), carrier-ocean (38), carrier-road (32), carrier-air (28). Four values from the canonical list are unused in the corpus (carrier-rail, nvocc, airport-operator, terminal-operator). The CHECK constraint can land without backfill.

### intelligence_items.operational_scenario_tags — MOSTLY CLEAN, one shape question

**~32 distinct top values inspected (LIMIT 100 in the query; 100% of the high-volume tags surveyed).** All are within the core glossary in the operator brief OR are reasonable extensions following the same shape (kebab-case).

**One shape question:** the operator brief uses `emissions-reporting-Scope1` and `emissions-reporting-Scope3` (capital S in `Scope`). The skill says "lower-case kebab-case" but the brief's canonical examples mix case. parse-output.ts regex is `/^[a-z0-9][a-z0-9-]*[a-z0-9]$/i` (case-insensitive flag). So mixed case currently passes.

`emissions-reporting-Scope3` has 106 rows. If the CHECK constraint enforces strict lower-case, 106+ rows become violators. If it mirrors the existing case-insensitive regex, no backfill needed.

**Recommended:** case-insensitive shape constraint (matches existing parse-output.ts behavior; no backfill). Decision point if operator wants strict lowercase.

## Ground-truth check 4: next migration number

Listed `fsi-app/supabase/migrations/` for files matching `07[5-9]` and `08[0-9]`. Result: 075, 076, 077 (the multi-tenant foundation series). No 078+ exists. **Next available number: 078.**

Migration 078 lands cleanly per the registry; `apply-pending.mjs` MIN_VERSION=052 sidesteps the 026-050 registry gap per `operational-migration-authoring`.

## Ground-truth check 5 (bonus, not in dispatch scope): parse-output.ts shape

The diagnostic claimed "250-line custom validator." Actual: `parse-output.ts` is **421 lines**.

Breakdown:
- Lines 1-69: imports, type constants (SEVERITY_VALUES, PRIORITY_VALUES, URGENCY_TIER_VALUES, FORMAT_TYPE_VALUES, TOPIC_TAG_VALUES (7 values, OLD), COMPLIANCE_OBJECT_VALUES (19 values), OPERATIONAL_SCENARIO_TAG_RE)
- Lines 71-97: type exports (AgentMetadata, ParsedAgentOutput, AgentOutputParseError)
- Lines 99-180: `findYamlBlock(text)` — locates the YAML frontmatter block at end of agent output; tolerates code-fence wrappers; has two fallback parsers for missing-delimiter cases
- Lines 182-404: `parseYamlFrontmatter(yaml)` — the validator itself. Splits YAML lines, parses inline arrays (sources_used, topic_tags, etc.), validates each enum against its const array, enforces the severity→priority mapping at line 258-263, validates UUID shape, handles intersection_summary nullability, validates timestamp parseability
- Lines 406-422: `parseAgentOutput(rawText)` — the public entry point. Returns `{ body: string, metadata: AgentMetadata }`. Throws `AgentOutputParseError` on missing/malformed YAML.

The validator portion (parseYamlFrontmatter) is **~220 lines**. The YAML finder is **~80 lines**. The Zod refactor would collapse parseYamlFrontmatter to ~30 lines (the schema validation) plus keep the YAML splitter as a thin pre-step. findYamlBlock stays (the multi-fallback finder is necessary because agents sometimes wrap the YAML in code fences despite the prompt forbidding it).

**Public API:**
```typescript
export function parseAgentOutput(rawText: string): ParsedAgentOutput;
export interface ParsedAgentOutput { body: string; metadata: AgentMetadata; }
export interface AgentMetadata { severity, priority, urgency_tier, format_type, topic_tags, operational_scenario_tags, compliance_object_tags, related_items, intersection_summary, sources_used, last_regenerated_at, regeneration_skill_version; }
export class AgentOutputParseError extends Error;
```

The refactor target preserves this public API. Only the internals change.

## Decision points for operator review

Three decisions block code authoring:

### Decision 1: topic_tags backfill approach

Given 1,770 distinct drift values and 2,636 drift rows, pick one:

**Option A: Per-row content classification.** Run a Haiku-batch classifier over the 2,636 drift rows; each row gets re-classified to 0-4 values from the canonical 14. Cost: ~$50-100 in API spend (one Haiku call per row, ~5K tokens each). Quality: high; each row gets a content-grounded re-tag. Time: ~30 min wall clock.

**Option B: Bulk null-and-reclassify.** Set `topic_tags = '{}'` on all rows containing any non-canonical value (2,636 rows affected), then let the next regeneration cycle re-tag through the constrained writer. Cost: $0 immediately, deferred to regeneration pipeline (which runs through Sonnet at $0.15/call × ~655 items = ~$100). Quality: depends on regeneration coverage; rows not regenerated stay untagged. Time: backfill runs in seconds; full re-tag depends on regeneration cadence (Lean tier = ~3 months for full corpus).

**Option C: Vocabulary scope rethink.** The 14-value list was designed for source-classification (per migration 063 Axis 4a). `intelligence_items.topic_tags` may need a richer vocabulary that better fits the operational drift (air_quality, decarbonization, climate_change are real content categories that don't reduce cleanly to a single regulator-scope axis). This rethink is its own prework dispatch; it would update vocabulary-topic-tags SKILL.md and run a separate dispatch for the constraint.

**Option D: Defer the topic_tags constraint to a later dispatch.** Land migration 078 with ONLY the severity-priority constraint + compliance_object_tags constraint + operational_scenario_tags shape constraint + sources.scope_topics constraint (all clean). Add topic_tags constraint when Option A/B/C is resolved.

**Recommendation:** Option A if the operator wants this dispatch to fully close the gap. Option D if the operator wants to ship the constraints that are clean and revisit topic_tags in a separate prework that includes content-judgment decisions. Both are defensible.

### Decision 2: operational_scenario_tags case sensitivity

`emissions-reporting-Scope1` and `emissions-reporting-Scope3` use mixed case (capital S). 100+ rows use this form. Pick one:

**Option A: Case-insensitive constraint** (matches existing parse-output.ts regex). No backfill. The shape stays `^[a-z0-9][a-z0-9-]*[a-z0-9]$` with `i` flag in the CHECK regex equivalent.

**Option B: Strict lower-case constraint.** ~106 rows backfill: rename `emissions-reporting-Scope3` to `emissions-reporting-scope3`. Update parse-output.ts to strict lowercase. Update the operator brief examples and the system prompt.

**Recommendation:** Option A. The mixed-case usage is canonical in the brief itself; changing it requires updating the brief AND the system prompt AND backfilling rows, with no operational benefit. Case-insensitive is consistent with existing runtime.

### Decision 3: scope of vocabularies.ts + parse-output.ts refactor

The dispatch scope says "Refactor parse-output.ts: Replace whatever the prework found with lightweight YAML parser + Zod schema validation."

The refactor target is clear (~30 lines of Zod parsing replacing ~220 lines of hand-rolled validation). But two implementation questions:

**3a: Where do consts live?** The canonical vocab consts (TOPIC_TAGS, COMPLIANCE_OBJECTS, SEVERITY_TO_PRIORITY) move from `parse-output.ts` to `vocabularies.ts` (the dispatch says so). Confirming: any other importer of these consts? Grep would tell us. If yes, those importers update to import from `vocabularies.ts`. If no, the move is mechanical.

**3b: What does the post-refactor module structure look like?**

Option A: `vocabularies.ts` exports raw consts + Zod schemas; `parse-output.ts` imports schemas and uses them. Two files, clean separation.

Option B: `vocabularies.ts` exports schemas + a `validateAgentMetadata(unknown)` function; `parse-output.ts` calls that function. Tighter API surface.

**Recommendation:** Option A for both. Mechanical move with no behavior change.

## Migration 078 sketch (proposed, NOT to be executed)

This is what the migration looks like with current verified state. Operator approves the prework, then I write this file. Until then, this sketch is illustrative.

```sql
-- ════════════════════════════════════════════════════════════════════
-- Migration 078 — Vocabulary CHECK constraints at the DB boundary
--
-- Date: 2026-05-15
-- Why: closes the vocabulary drift gap. The v2 audit identified three
-- storage shapes (DB free-text, parse-output.ts TS validator, SKILL.md)
-- with disagreements that propagate through every bypass writer path.
-- The agent path validates via parse-output.ts but the staged_updates
-- materializer, pre-B.2 legacy seed, and direct admin SQL all bypass.
-- Per `rule-cross-reference-integrity`, vocabulary integrity must be
-- enforced at the storage layer, not just at the agent path.
--
-- Pre-work: docs/dispatch-2-prework-2026-05-15.md
-- Verified state: 16 existing CHECK constraints; ZERO on the 5 columns
-- this migration addresses; 209 severity-priority violators; 0 drift
-- on sources.scope_topics; 0 drift on compliance_object_tags; ~32
-- distinct operational_scenario_tags values, all clean shape.
-- topic_tags is handled per Decision 1 (operator-pending).
--
-- Scope per operator decision:
--   - Severity-priority lock: YES (backfill 209 + constrain)
--   - sources.scope_topics: YES (constrain only; 0 backfill)
--   - compliance_object_tags: YES (constrain only; 0 backfill)
--   - operational_scenario_tags shape: YES (case-insensitive; 0 backfill)
--   - intelligence_items.topic_tags: PENDING decision; either
--     included with Option A backfill, or deferred to dispatch 2b.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Phase A: backfills (idempotent UPDATEs) ────────────────────────

-- A.1: severity-priority lock (209 rows). Each row gets its priority
-- set to the canonical mapping from its severity. Safe to re-run; the
-- WHERE clause excludes already-conforming rows.
UPDATE intelligence_items
SET priority = CASE severity
  WHEN 'ACTION REQUIRED'   THEN 'CRITICAL'
  WHEN 'COST ALERT'        THEN 'HIGH'
  WHEN 'WINDOW CLOSING'    THEN 'HIGH'
  WHEN 'COMPETITIVE EDGE'  THEN 'MODERATE'
  WHEN 'MONITORING'        THEN 'LOW'
END
WHERE severity IS NOT NULL
  AND priority IS DISTINCT FROM CASE severity
    WHEN 'ACTION REQUIRED'   THEN 'CRITICAL'
    WHEN 'COST ALERT'        THEN 'HIGH'
    WHEN 'WINDOW CLOSING'    THEN 'HIGH'
    WHEN 'COMPETITIVE EDGE'  THEN 'MODERATE'
    WHEN 'MONITORING'        THEN 'LOW'
  END;

-- A.2: topic_tags backfill PER OPERATOR DECISION 1.
--   If Option A (per-row classification): backfill script is separate;
--     this migration runs after that script completes
--   If Option B (bulk null): UPDATE here
--   If Option D (defer): omit this migration's topic_tags section
-- (sketch deferred to post-operator-decision)

-- ── Phase B: ADD CONSTRAINTs (idempotent guards) ────────────────────

-- B.1: severity-priority lock
ALTER TABLE intelligence_items
  ADD CONSTRAINT IF NOT EXISTS intelligence_items_severity_priority_mapping_check
  CHECK (
    severity IS NULL
    OR (severity = 'ACTION REQUIRED'  AND priority = 'CRITICAL')
    OR (severity = 'COST ALERT'       AND priority = 'HIGH')
    OR (severity = 'WINDOW CLOSING'   AND priority = 'HIGH')
    OR (severity = 'COMPETITIVE EDGE' AND priority = 'MODERATE')
    OR (severity = 'MONITORING'       AND priority = 'LOW')
  );

COMMENT ON CONSTRAINT intelligence_items_severity_priority_mapping_check ON intelligence_items IS
  'Enforces the locked severity-to-priority mapping per vocabulary-severity-labels skill. Closes the audit S6 gap (209 violators at deploy time). All writer paths now enforced at the storage layer, not just the agent path.';

-- B.2: sources.scope_topics ⊆ 14 canonical values (0 backfill needed; clean)
ALTER TABLE sources
  ADD CONSTRAINT IF NOT EXISTS sources_scope_topics_vocab_check
  CHECK (
    scope_topics <@ ARRAY[
      'regulatory', 'finance', 'technology', 'fuel', 'labor',
      'infrastructure', 'environmental', 'social', 'governance',
      'transport', 'packaging', 'customs', 'conservation',
      'materials_science'
    ]::text[]
  );

COMMENT ON CONSTRAINT sources_scope_topics_vocab_check ON sources IS
  'Enforces the 14-value canonical content-topic vocabulary per vocabulary-topic-tags skill and migration 063. Current state already clean (14/14 in canonical, 0 drift); this constraint prevents future drift.';

-- B.3: compliance_object_tags ⊆ 19 canonical values (0 backfill needed; clean)
ALTER TABLE intelligence_items
  ADD CONSTRAINT IF NOT EXISTS intelligence_items_compliance_object_tags_vocab_check
  CHECK (
    compliance_object_tags <@ ARRAY[
      'carrier-ocean', 'carrier-air', 'carrier-road', 'carrier-rail',
      'vessel-operator', 'aircraft-operator', 'road-fleet-operator',
      'freight-forwarder', 'customs-broker', 'nvocc',
      'shipper', 'importer', 'exporter', 'manufacturer-producer',
      'distributor', 'port-operator', 'airport-operator',
      'terminal-operator', 'warehouse-operator'
    ]::text[]
  );

ALTER TABLE intelligence_items
  ADD CONSTRAINT IF NOT EXISTS intelligence_items_compliance_object_tags_max_check
  CHECK (array_length(compliance_object_tags, 1) IS NULL
         OR array_length(compliance_object_tags, 1) <= 4);

COMMENT ON CONSTRAINT intelligence_items_compliance_object_tags_vocab_check ON intelligence_items IS
  'Enforces the 19-value canonical supply-chain-role vocabulary per vocabulary-compliance-objects skill. Current state already clean (15 distinct used, all in canonical; 4 unused); this constraint prevents future drift.';

-- B.4: operational_scenario_tags shape (case-insensitive, per Decision 2)
ALTER TABLE intelligence_items
  ADD CONSTRAINT IF NOT EXISTS intelligence_items_op_scenario_tags_shape_check
  CHECK (
    NOT EXISTS (
      SELECT 1 FROM unnest(operational_scenario_tags) AS t
      WHERE t !~* '^[a-z0-9][a-z0-9-]*[a-z0-9]$'
    )
  );

ALTER TABLE intelligence_items
  ADD CONSTRAINT IF NOT EXISTS intelligence_items_op_scenario_tags_max_check
  CHECK (array_length(operational_scenario_tags, 1) IS NULL
         OR array_length(operational_scenario_tags, 1) <= 5);

COMMENT ON CONSTRAINT intelligence_items_op_scenario_tags_shape_check ON intelligence_items IS
  'Enforces shape (case-insensitive kebab-case) for the open-vocabulary operational_scenario_tags. Matches existing parse-output.ts regex at line 61. Open vocabulary; shape gate only.';

-- B.5: topic_tags constraint PER OPERATOR DECISION 1
-- (sketch deferred to post-operator-decision)

COMMIT;
```

## vocabularies.ts sketch (proposed, NOT to be executed)

```typescript
// fsi-app/src/lib/agent/vocabularies.ts
// Canonical TypeScript-side vocabularies. Mirrors the DB CHECK constraints
// in migration 078. Single source of truth at the application boundary.
// Imported by parse-output.ts, staged_updates materializer, and any future
// writer path. Drift between this file and the DB constraints is itself a
// bug caught by a parity test (proposed: tests/vocab-parity.test.ts).

import { z } from "zod";

export const TOPIC_TAGS_VOCAB = [
  "regulatory", "finance", "technology", "fuel", "labor",
  "infrastructure", "environmental", "social", "governance",
  "transport", "packaging", "customs", "conservation",
  "materials_science",
] as const;

export const COMPLIANCE_OBJECT_VOCAB = [
  "carrier-ocean", "carrier-air", "carrier-road", "carrier-rail",
  "vessel-operator", "aircraft-operator", "road-fleet-operator",
  "freight-forwarder", "customs-broker", "nvocc",
  "shipper", "importer", "exporter", "manufacturer-producer",
  "distributor", "port-operator", "airport-operator",
  "terminal-operator", "warehouse-operator",
] as const;

export const SEVERITY_VOCAB = [
  "ACTION REQUIRED", "COST ALERT", "WINDOW CLOSING",
  "COMPETITIVE EDGE", "MONITORING",
] as const;

export const PRIORITY_VOCAB = [
  "CRITICAL", "HIGH", "MODERATE", "LOW",
] as const;

export const URGENCY_TIER_VOCAB = [
  "watch", "elevated", "stable", "informational",
] as const;

export const FORMAT_TYPE_VOCAB = [
  "regulatory_fact_document", "technology_profile", "operations_profile",
  "market_signal_brief", "research_summary",
] as const;

// Canonical severity → priority mapping. Mirrors DB CHECK constraint
// intelligence_items_severity_priority_mapping_check in migration 078.
export const SEVERITY_TO_PRIORITY = {
  "ACTION REQUIRED":  "CRITICAL",
  "COST ALERT":       "HIGH",
  "WINDOW CLOSING":   "HIGH",
  "COMPETITIVE EDGE": "MODERATE",
  "MONITORING":       "LOW",
} as const satisfies Record<typeof SEVERITY_VOCAB[number], typeof PRIORITY_VOCAB[number]>;

// Source tier hierarchy per vocabulary-source-tiers skill
export const SOURCE_TIER_VOCAB = [1, 2, 3, 4, 5, 6, 7] as const;

// Open-vocabulary shape regex; case-insensitive per Decision 2
const OPERATIONAL_SCENARIO_SHAPE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/i;

export const TopicTagsSchema = z
  .array(z.enum(TOPIC_TAGS_VOCAB))
  .max(4, "topic_tags exceeds 4 values");

export const ComplianceObjectTagsSchema = z
  .array(z.enum(COMPLIANCE_OBJECT_VOCAB))
  .max(4, "compliance_object_tags exceeds 4 values");

export const OperationalScenarioTagsSchema = z
  .array(z.string().regex(OPERATIONAL_SCENARIO_SHAPE,
    "operational_scenario_tags must be kebab-case (case-insensitive)"))
  .max(5, "operational_scenario_tags exceeds 5 values");

export const SeveritySchema    = z.enum(SEVERITY_VOCAB);
export const PrioritySchema    = z.enum(PRIORITY_VOCAB);
export const UrgencyTierSchema = z.enum(URGENCY_TIER_VOCAB);
export const FormatTypeSchema  = z.enum(FORMAT_TYPE_VOCAB);
export const SourceTierSchema  = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7)]);

export const AgentMetadataSchema = z.object({
  severity:                  SeveritySchema,
  priority:                  PrioritySchema,
  urgency_tier:              UrgencyTierSchema,
  format_type:               FormatTypeSchema,
  topic_tags:                TopicTagsSchema,
  operational_scenario_tags: OperationalScenarioTagsSchema,
  compliance_object_tags:    ComplianceObjectTagsSchema,
  related_items:             z.array(z.string().uuid()),
  intersection_summary:      z.string().max(2000).nullable(),
  sources_used:              z.array(z.string().uuid()),
  last_regenerated_at:       z.string().datetime(),
  regeneration_skill_version: z.string(),
}).refine(
  (m) => SEVERITY_TO_PRIORITY[m.severity] === m.priority,
  (m) => ({
    message: `Priority "${m.priority}" does not match locked mapping for severity "${m.severity}" (expected "${SEVERITY_TO_PRIORITY[m.severity]}")`,
    path: ["priority"],
  })
);

export type AgentMetadata = z.infer<typeof AgentMetadataSchema>;
```

After this file lands, `parse-output.ts` collapses ~220 lines of validation into roughly:

```typescript
import { AgentMetadataSchema, AgentMetadata } from "./vocabularies";

function parseYamlFrontmatter(yaml: string): AgentMetadata {
  const rawObj = splitYamlLines(yaml);  // minimal helper, ~20 lines
  return AgentMetadataSchema.parse(rawObj);
}
```

The `findYamlBlock` finder stays (the multi-fallback logic for code-fenced agent output is necessary; not a validation concern).

## Cost frame (per rule-cost-weighted-recommendations)

| Surface | Cost |
|---|---|
| One-time agent work | Medium ($50-300; the migration + Zod refactor is mechanical, topic_tags backfill cost depends on Decision 1: Option A ~$50-100 in Haiku, Options B/D ~$0) |
| Ongoing runtime | Zero. CHECK constraints fire on write at microsecond cost. Zod validation is microseconds. No new AI calls. |
| Ongoing infrastructure | None. No tier transition. No new tables. |
| Inheritance | HIGH (positive). Every future writer path inherits the vocabulary contracts by construction. Drift becomes impossible. The 209-violator gap and the 2,636-drift-row gap close at the storage layer; future bypass paths fail loudly with a constraint violation instead of silently accumulating drift. |
| Value frame | Revenue-accelerating, leaning revenue-blocking-adjacent. An unconstrained vocabulary is a soft data-integrity leak; the $500/mo positioning depends on data the operator can trust. |
| Manual gate | Not applicable. CHECK constraints are deterministic. The backfill UPDATEs are reversible by snapshot (Supabase point-in-time recovery is enabled on Pro tier). |

## What done looks like (deferred until operator approves prework)

Per dispatch step 2:

- Migration 078 lands with idempotent two-phase backfill + constraint addition (scope per Decision 1)
- `vocabularies.ts` exists with Zod schemas mirroring DB constraints
- `parse-output.ts` uses Zod; the hand-rolled validator portion removed; `findYamlBlock` retained
- All write paths import from `vocabularies.ts` (the multi-tenant agent's prework pattern: list importers via grep, update each)
- Skill citations explicit in final report (this prework already cites; the final report will cite the same skills plus any added during implementation)

## What this dispatch is NOT (scope guard)

- Not the CEP build (deferred until activation gap evidence accumulates)
- Not the three-context execution split (deferred until community closer to launch)
- Not Phase 3 of multi-tenant (drop user_profiles) — separate follow-up after one stable deploy cycle of PR #114
- Not email delivery integration (later invitation-polish dispatch)
- Not source registry hygiene (separate later dispatch)
- Not the jurisdictions entity table (its own follow-up dispatch flagged in multi-tenant-foundation-followups doc)

## Three operator decisions block code authoring

1. **Decision 1: topic_tags backfill approach** (Options A/B/C/D above; recommendation Option A or D depending on appetite)
2. **Decision 2: operational_scenario_tags case sensitivity** (Options A/B; recommendation Option A)
3. **Decision 3: vocabularies.ts module structure** (Options A/B; recommendation Option A)

Standing by for operator review of this prework before any migration or TypeScript is authored.
