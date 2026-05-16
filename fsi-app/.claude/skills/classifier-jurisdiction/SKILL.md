---
name: classifier-jurisdiction
description: STUB. Assigns canonical jurisdiction entity refs to `intelligence_items.jurisdictions[]` and `jurisdiction_iso[]`. Forbids continents in country fields, agency names in jurisdiction fields, cities in region fields. Closes audit S3 (jurisdiction overloaded with agency names) + Chrome 5.1 (continents/cities corruption).
---

# Classifier: Jurisdiction

## Purpose

Assigns the structured jurisdiction tags. Today's failure mode: jurisdiction fields contain "MINISTRY OF CLIMATE AND ENVIRONMENT" (agency name), "AFRICA" (continent), "ALBUQUERQUE" (city), "ARBOLETES" (small Colombian municipality). The two filter axes operators most need (mode + jurisdiction) are the two most corrupted.

This classifier emits canonical entity refs validated against [[reference-jurisdictions]] and (when the master-data layer per Section 6.1 exists) the canonical `jurisdictions` entity table.

## When to use

- New item ingestion
- Backfill (the existing 460 items with only legacy free-text jurisdictions; the 195 with both populated but 75% agreement need reconciliation)
- Reclassification when jurisdiction taxonomy evolves

## Inputs

- Item content (URL, full_brief, title)
- Source row (source's jurisdictions are a starting hint)
- [[reference-jurisdictions]] for the canonical taxonomy

## Outputs

- `intelligence_items.jurisdictions[]` (legacy free-text, kept for backward compatibility)
- `intelligence_items.jurisdiction_iso[]` (canonical ISO codes, source of truth going forward)
- `jurisdiction_confidence`
- (Eventually) FK to `jurisdictions` entity per Section 6.1

## Forbidden values

- Continents in country fields ("AFRICA")
- Agency names in jurisdiction fields ("MINISTRY OF X")
- Cities in regional fields ("ALBUQUERQUE", "ARBOLETES")
- The string "GLOBAL" used as a fallback (use `[]` + writer-prose acknowledgment instead)

## Process (TO REFINE)

1. Identify jurisdictional scope from content (e.g., "California" → US-CA; "EU" → all 27 EU member ISO codes)
2. Validate each candidate against [[reference-jurisdictions]] hierarchy
3. Emit ISO codes (canonical)
4. Emit free-text legacy values for backward compatibility (deprecated; will be removed once all readers migrate to ISO)
5. Reject any value not in the canonical taxonomy

## Inherits

- [[reference-jurisdictions]]
- [[rule-no-speculation-as-fact]]

## Audit cross-reference

- v2 audit Section 3 / S3 (jurisdiction overloaded with agency names)
- v2 audit Section 6.1 (master data: canonical jurisdictions entity table)
- Chrome audit 5.1 (continents and cities)
- Migration 072 (jurisdiction normalizer trigger — partial fix; this classifier completes it)
