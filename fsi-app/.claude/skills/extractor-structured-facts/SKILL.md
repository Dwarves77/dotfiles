---
name: extractor-structured-facts
description: STUB. Pulls structured facts from `full_brief` markdown into typed columns with confidence and span provenance. Closes audit S3 (phantom columns) by ensuring the columns exist AND populating them. Implements Section 6.5.
---

# Extractor: Structured Facts

## Purpose

After `full_brief` is generated, this extractor pulls the structured facts (effective dates, penalties, enforcement bodies, etc.) into typed columns the renderer reads. Per Section 6.5, every fact carries confidence and span provenance back to the source text.

## When to use

After every full_brief regeneration. The extractor runs as a pipeline step after the writer.

## Inputs

- Item's `full_brief` markdown
- Source documents the brief was composed against
- The 13-field YAML metadata block from [[writer-yaml-emission]]

## Outputs (TO SCHEMA per Section 6.5)

For each fact, three columns:
- The fact value (e.g., `compliance_deadline = '2025-06-30'`)
- The confidence (e.g., `compliance_deadline_confidence = 0.85`)
- The span provenance (e.g., `compliance_deadline_span = {source_id: '...', paragraph: 3, char_start: 142, char_end: 178}`)

Facts to extract:
- `entry_into_force`, `compliance_deadline`, `next_review_date`
- `penalty_range`, `cost_mechanism`, `enforcement_body`, `legal_instrument`
- `source_publication_date`, `first_observed_at` (per [[compute-lead-time]])

## Process (TO REFINE)

1. Parse the brief markdown for date phrases ("effective Jan 1, 2025", "in force from 2024", etc.)
2. For each candidate, identify the source span (paragraph + character range)
3. Resolve to canonical date (handle "Q1 2026", "by 2030", etc.)
4. Emit fact + confidence + span
5. For high-stakes facts (T1-source penalties, T1-source dates on tier-1 regulations), route to [[operational-human-review-queue]] for confirmation before going live

## Confidence model

- Direct quote from source with explicit date format: 0.95
- Paraphrase with clear date attribution: 0.85
- Inference from context (e.g., "no later than 2026" → 2026-12-31): 0.60
- LLM-extracted without explicit source span: 0.40

Display layer surfaces low-confidence facts with a visible indicator (faded value, tentative badge).

## Inherits

- [[rule-no-speculation-as-fact]] — every emitted fact has provenance
- [[rule-cross-reference-integrity]] — these typed columns are canonical; writer prose reads from them
- [[rule-source-traceability-per-claim]]

## Composition

Runs after every per-format writer. Output consumed by:
- [[writer-yaml-emission]] (extends YAML emission contract per Section 6.5)
- [[writer-summary-card-surface]] (reads structured facts as source of truth for card text)
- [[writer-frame-regulations]] / [[writer-frame-market]] / etc.
- Renderer (penalty calculator, owner card, effective date tile all read these columns)

## Audit cross-reference

- v2 audit Section 3 / S3 (phantom columns; this skill closes the gap by populating them once they exist)
- v2 audit Section 6.5 (structured fact extraction with confidence and provenance)
- Schema audit (forthcoming): catalogs the columns this skill must populate
