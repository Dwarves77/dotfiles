---
name: operational-human-review-queue
description: STUB. Routing for low-confidence classifications, extractions, and entity resolutions. Items in the queue do NOT surface to operators until confirmed. Closes the audit gap where speculative classifications reach operators on first ingest.
---

# Operational: Human Review Queue

## Purpose

When a classifier, extractor, or entity-resolver produces output below confidence threshold, the item enters this queue. An analyst (operator or designated reviewer) confirms or corrects. Confirmation upgrades confidence and feeds back into the deterministic layer (rule learning).

Per Section 6.3: "A quarantine state. Items below confidence threshold do not surface on /regulations, /research, /market, /operations until reviewed. Operators do not see speculative classifications."

## When to use

- Classifier produces output with confidence < 0.85
- Extractor produces a fact with confidence < 0.80
- Entity resolver fails to find a confident match
- Source onboarding produces MEDIUM or LOW confidence

## Inputs

- The proposed classification / extraction / resolution
- Confidence score
- Rationale
- Source content (for the analyst's review)

## Outputs

- Queue entry (TO ADD: schema table for review queue)
- Reviewer assignment (when reviewer pool exists)
- After review: confirmed / corrected classification, with reviewer attribution and timestamp

## Process (TO REFINE)

1. Classifier emits low-confidence output → write to review queue, do NOT write to live `intelligence_items`
2. Item is in quarantine state (visible only to admins)
3. Reviewer opens the queue, sees proposed classification + rationale + source content
4. Reviewer confirms (upgrades confidence to 1.0) or corrects
5. On confirm: write to `intelligence_items`, item enters operator-visible surfaces
6. On correction: write the corrected classification, log the correction (rule-learning input)

## Schema (TO ADD)

```sql
CREATE TABLE review_queue (
  id UUID PRIMARY KEY,
  proposed_at TIMESTAMPTZ,
  classifier_skill TEXT,  -- which skill emitted this
  proposed_value JSONB,    -- the proposed classification
  confidence NUMERIC,
  rationale TEXT,
  source_content TEXT,
  reviewer_id UUID,
  reviewed_at TIMESTAMPTZ,
  decision TEXT,  -- confirmed | corrected | rejected
  corrected_value JSONB,
  ...
);
```

## Inherits

- [[rule-no-speculation-as-fact]]
- [[rule-cross-reference-integrity]]

## Composition

Receives from all classifiers + extractors + entity resolver. Output written to `intelligence_items` after review.

## Audit cross-reference

- v2 audit Section 6.3 (quarantine state for low-confidence)
- v2 audit Section 6.10 (analyst attribution for legal defensibility)
