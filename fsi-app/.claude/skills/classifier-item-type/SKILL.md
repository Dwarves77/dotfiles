---
name: classifier-item-type
description: STUB. Deterministic-first item_type assignment. source_role + URL pattern + content features → item_type. LLM classifier only for the residual. Closes audit S5 (Haiku-only classification with no integrity rule).
---

# Classifier: Item Type

## Purpose

Assigns `intelligence_items.item_type` per the 11 valid values (regulation, directive, standard, guidance, technology, market_signal, regional_data, research_finding, innovation, framework, tool, initiative). Deterministic rules first; LLM for the residual; human review for low-confidence.

## When to use

- New item ingestion (after source_role is known per [[classifier-source-onboarding]])
- Item reclassification (per audit findings or operator correction)

## Inputs

- Item URL + scraped content
- Source row (especially source_role from [[vocabulary-source-tiers]])
- [[vocabulary-topic-tags]] for topic-tag inference

## Outputs

- `intelligence_items.item_type` (one of 11 values)
- `item_type_confidence` (TO ADD as schema column)
- `item_type_classifier_path` (deterministic / LLM-high / LLM-low / human-confirmed)
- `item_type_rationale` (text)

## Deterministic rule examples (TO REFINE)

```
IF source_role = primary_legal_authority AND content contains CFR/Regulation citation
  → item_type = regulation, confidence = 1.0

IF source_role = primary_legal_authority AND content type = directive
  → item_type = directive, confidence = 1.0

IF source_role = standards_body AND content type = published standard
  → item_type = standard, confidence = 1.0

IF source_role = vendor_corporate AND URL pattern = vendor product page
  → item_type = tool, confidence = 1.0

IF source_role = academic_research AND content type = peer-reviewed paper
  → item_type = research_finding, confidence = 1.0

IF source_role IN (trade_press, industry_association) AND content reports competitor activity
  → item_type = market_signal, confidence = 0.85 (LLM-validated)

IF source_role = statistical_data_agency AND content type = regional cost data
  → item_type = regional_data, confidence = 0.95
```

EcoVadis case: source_role = vendor_corporate (post-migration 074) + URL pattern = vendor product page → item_type = tool. The audit found 2 EcoVadis items with item_type=technology that were corrected to tool. This rule prevents recurrence.

IIC case: source_role = industry_association (or academic_research, depending on classification) + URL pattern = professional society membership/training page → item_type = guidance. Definitively NOT regulation. This rule prevents recurrence.

## Process (TO REFINE)

1. Apply deterministic rules
2. If a rule matches with confidence ≥ 0.95, accept the classification
3. If rules ambiguous or no rule matches, invoke LLM classifier with structured output (item_type + confidence)
4. If LLM confidence ≥ 0.85, accept
5. If LLM confidence < 0.85, route to [[operational-human-review-queue]]
6. Record classifier path and rationale

## Inherits

- [[rule-no-speculation-as-fact]]
- [[vocabulary-source-tiers]]
- [[vocabulary-topic-tags]]

## Audit cross-reference

- v2 audit Section 3 / S5 (three writer collisions, including Haiku classifier with no integrity)
- v2 audit Section 6.3 (deterministic + LLM hybrid classification)
- Specific cases: EcoVadis (S2), IIC (S2)
