---
name: writer-yaml-emission
description: The 13-field YAML frontmatter contract appended to every regenerated full_brief. Downstream parser (parse-output.ts) writes the fields to typed columns via Zod schemas in vocabularies.ts (post-Dispatch 2). Absent or malformed YAML = failed regeneration. Extends per v2 audit Section 6.5 to add structured facts (entry_into_force, compliance_deadline, penalty_range, etc.) with confidence + span provenance once schema migrations land.
---

# Writer: YAML Emission Contract

## Purpose

The YAML frontmatter block emitted at the end of every `full_brief` regeneration. Downstream code (`fsi-app/src/lib/agent/parse-output.ts`) parses the YAML, validates against `AgentMetadataSchema` in `fsi-app/src/lib/agent/vocabularies.ts` (single source of truth post-Dispatch 2), and writes fields to `intelligence_items` columns.

The contract is the schema-level interface between the writer and the typed columns. DB CHECK constraints (migration 078, pending PR #117 merge) enforce the closed vocabularies at the storage boundary; this writer's emission must conform to those constraints.

## When to use

Always, on every regeneration. The block is mandatory. An absent or malformed block is a failed regeneration per `parse-output.ts` and per DB constraint enforcement.

## Current 13-field contract

```yaml
---
severity: ACTION REQUIRED
priority: CRITICAL
urgency_tier: watch
format_type: regulatory_fact_document
topic_tags: [environmental, regulatory]
operational_scenario_tags: [CBAM-declaration, customs-declaration-import, emissions-reporting-Scope3]
compliance_object_tags: [importer, customs-broker, manufacturer-producer]
related_items: [b3c4d5e6-f7a8-4901-2345-678901234567]
intersection_summary: "Overlaps with EU ETS for shipping on emissions-reporting-Scope3; CBAM declarants importing covered goods that arrived via EU-ETS-priced ocean freight face dual reporting obligations on the same emission units."
sources_used: [a1b2c3d4-e5f6-4789-9abc-def012345678, fedcba98-7654-4321-0fed-cba987654321]
last_regenerated_at: 2026-05-16T18:42:00Z
regeneration_skill_version: "2026-05-16"
---
```

The `full_brief` markdown body comes BEFORE this block. The block is at the end, fenced with `---` delimiters. NOT wrapped in triple-backtick code fences.

## Locked mappings (enforced at multiple layers)

**Severity to priority** (locked; DB CHECK constraint migration 078):

- ACTION REQUIRED → CRITICAL
- COST ALERT → HIGH
- WINDOW CLOSING → HIGH
- COMPETITIVE EDGE → MODERATE
- MONITORING → LOW

**format_type from item_type** (locked):

- regulation, directive, standard, guidance, framework → regulatory_fact_document
- technology, innovation, tool → technology_profile
- regional_data → operations_profile
- market_signal, initiative → market_signal_brief
- research_finding → research_summary

## Vocabularies (closed, enforced at DB + TS layers)

Tags outside these vocabularies FAIL the regeneration (constraint violation):

- `topic_tags` — vocabulary updated to the 14-value canonical list per migration 063 + [[vocabulary-topic-tags]]; DB enforcement DESCOPED to Dispatch 3 per dispatch 2 prework. Application-layer Zod schema in `vocabularies.ts` enforces the 14-value list at the agent path; bypass paths currently free until Dispatch 3 lands the DB constraint
- `compliance_object_tags` — 19-value closed list per [[vocabulary-compliance-objects]]; DB constraint enforced via migration 078 (pending merge)
- `operational_scenario_tags` — open vocabulary with shape constraint (case-insensitive kebab-case) per [[reference-operational-scenarios]]; DB constraint enforced via migration 078
- `severity` — 5-value closed list per [[vocabulary-severity-labels]]; DB constraint exists since migration 018
- `priority` — 4-value closed list; DB constraint since migration 001; severity-to-priority mapping lock added in migration 078

## v2-required extensions (TO ADD after schema migration)

The contract extends to include structured facts the renderer reads from typed columns:

```yaml
# Effective + compliance dates with confidence + span provenance
entry_into_force: 2025-01-01
entry_into_force_confidence: 0.95
entry_into_force_span: {source_id: "...", paragraph: 3, char_start: 142, char_end: 178}

compliance_deadline: 2025-06-30
compliance_deadline_confidence: 0.80
compliance_deadline_span: {...}

# Penalty structure
penalty_range: "EUR 0-15M depending on category"
penalty_range_confidence: 0.85

cost_mechanism: "ETS surcharge per tCO2e, escalating annually"
cost_mechanism_confidence: 0.90

enforcement_body: "EU Commission DG CLIMA"
enforcement_body_confidence: 1.0
enforcement_body_id: "..."

legal_instrument: "Regulation (EU) 2023/1804"
legal_instrument_confidence: 1.0

# Lead-time tracking (Section 6.7)
source_publication_date: 2024-09-13
first_observed_at: 2024-09-15T14:23:00Z
```

These extensions are spec'd in v2 audit Section 6.5 (structured fact extraction) and 6.7 (lead time as first-class column). Schema columns must exist before this writer can emit them. See [[operational-migration-authoring]].

## Process

1. Compose the brief body (per the per-format writer)
2. Compute severity per [[classifier-severity-priority]]; map to priority via locked mapping above
3. Compute urgency_tier per the rubric
4. Set format_type per item_type locked mapping
5. Extract topic_tags from brief content per [[vocabulary-topic-tags]] (14-value canonical)
6. Extract operational_scenario_tags per [[reference-operational-scenarios]] (open vocabulary, shape constraint)
7. Extract compliance_object_tags per [[vocabulary-compliance-objects]] (19-value closed)
8. Identify related_items from AVAILABLE SOURCES pool that were drawn on; integrity rule applies — no invented UUIDs
9. Compose intersection_summary if related_items non-empty; cite linked items inline by title; cap at 2000 chars (truncate per parse-output.ts handling)
10. Populate sources_used from AVAILABLE SOURCES that were actually cited; full 36-char UUIDs only
11. Set last_regenerated_at = current UTC ISO 8601
12. Set regeneration_skill_version per current contract version string (currently 2026-05-16 post-Dispatch 2.5)
13. Run [[extractor-structured-facts]] for the structured fact emissions when v2 schema lands
14. Append the YAML block to the markdown body, fenced with `---`

## Internal vs external

Per [[rule-internal-vs-external-surface]]: the YAML metadata fields are INTERNAL to platform operation. They're consumed by classifiers, ranking, and per-surface frame writers — not displayed verbatim to operators. The card surface displays plain-language labels translated from these internal values per [[writer-summary-card-surface]].

This means: `severity: COST ALERT` is in YAML; the card surface shows "ACTION NOW: assess fleet impact" + the COST ALERT pill, not the raw label as a debug field. `topic_tags: [environmental, regulatory]` is in YAML; the card surface shows the topic chips humanly rendered, never the raw array.

## Inherits

- [[rule-cross-reference-integrity]] — all emitted facts agree with the brief body
- [[rule-no-speculation-as-fact]] — every emitted fact has a span provenance pointer when the v2 extensions are live
- [[rule-character-normalization]] — apply at emission (especially intersection_summary which is free-text)
- [[vocabulary-severity-labels]] — severity values + locked priority mapping
- [[vocabulary-topic-tags]]
- [[vocabulary-compliance-objects]]
- [[reference-operational-scenarios]]

## Output format

YAML frontmatter block fenced with `---` at the end of `full_brief` markdown. NOT wrapped in triple-backtick code fence. The opening line must be exactly three dashes. The closing line must be exactly three dashes.

## Failure modes to avoid

- Absent or malformed YAML block (rejects the regeneration via `parse-output.ts`)
- Tag values outside the closed vocabularies (fails Zod validation + DB constraint)
- Invented UUIDs in `related_items` or `sources_used` (must come from source pool input)
- `last_regenerated_at` as `NOW()` placeholder (must be actual ISO 8601 timestamp)
- Severity-priority mapping violation (parse-time rejection + DB constraint rejection per migration 078)
- Wrapping the YAML block in triple-backtick code fences (parse-output.ts is tolerant via fallback finder but the contract forbids it)

## Composition

Invoked by all per-format writers as the final step. Reads from [[extractor-structured-facts]] for the structured-fact extensions when the schema lands.

## Audit cross-reference

- Original source skill lines 736-789 (current contract)
- v2 audit Section 6.5 (extensions for structured-fact emission)
- v2 audit Section 6.7 (lead-time field extensions)
- v2 audit Section 3 / S6 (severity-priority mapping previously bypassed by other writer paths; closed by migration 078 + vocabularies.ts in Dispatch 2 PR #117)
- Migration 078 (DB CHECK constraints for the closed vocabularies; the storage-boundary enforcement)
- `fsi-app/src/lib/agent/vocabularies.ts` (the application-layer single source of truth, Dispatch 2)
