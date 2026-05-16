---
name: rule-no-speculation-as-fact
description: Integrity non-negotiable. Every specific number, date, or dollar figure on the card surface requires an inline source citation in the same sentence OR a non-empty `sources_used` array entry. Speculation is impossible by construction at the card layer. If the source is not in `AVAILABLE SOURCES` for this run, the claim is omitted, not invented.
---

# Rule: No speculation as fact

## Source

Operator brief 2026-05-15: "No speculation as fact. If something cannot be confirmed through a primary or reputable secondary source, label it as unconfirmed, gap, or speculation. Never fabricate specificity."

## What this means

The writer is allowed to:
- State a fact with inline source citation: "EU SAF mandate begins at 2% in 2025, escalating to 10% by 2030 *(Source: ReFuelEU Aviation Regulation Article 4)*"
- Acknowledge a research gap explicitly: "No public deployment data identified for this technology as of [date]."
- State a directional range when an exact figure is unavailable: "Cost impact estimated in the range of low single-digit percentage points, exact figure not publicly disclosed."

The writer is not allowed to:
- Emit a specific percentage, dollar figure, or date without an inline source or a corresponding entry in `sources_used`
- Pivot to "the workspace's general SAF mandate exposure under ReFuelEU" when ReFuelEU was not in the input source pool
- Substitute LLM training-data knowledge for source-grounded content
- Fabricate a date that the source did not establish (e.g., writing "by 2027" when the source contains no such date)

## The audit-measured failure rate

The audit found 15.5% of sampled rows carry specific numbers, dates, or dollar figures with no inline source AND empty `sources_used`. Examples (verbatim from production, sources_used = empty):

```
[82f09535] regulation:
"The Norwegian Maritime Authority has adopted zero-emission requirements
for World Heritage fjords effective January 1, 2026 for passenger vessels
under 10,000 gross tonnage, expanding to vessels 10,000 GT and above by
January 1, 2032."
```

```
[478ee79c] regulation:
"The UK government's SAF Mandate is a regulatory framework requiring
aviation fuel suppliers to increase sustainable aviation fuel supply in
the UK jet fuel mix, starting at 2% in 2025, escalating to 10% by 2030
and 22% by 2040."
```

```
[3f45b2aa] regulation:
"Announced in September 2024, this $3 billion program establishes new
emissions standards... requires ports receiving federal funding to
implement zero-emission technologies for cargo handling equipment..."
```

The "$3 billion" figure was checked: not present on the source URL. The figure is writer-introduced specificity. This is exactly what this rule prohibits.

## Required behavior at write time

For each specific claim a writer is about to emit:

1. Is there an inline source citation in the same sentence? → emit the claim.
2. Is there a corresponding entry in `sources_used` (a UUID from the input source pool)? → emit the claim with the source name in the sentence.
3. Neither? → omit the claim. Substitute "exact figure not publicly disclosed in available sources" or "research gap as of [date]."

The writer does not have the option to invent a plausible value. Plausibility is not provenance.

## Specificity heuristics that trigger this rule

Apply when the claim contains any of:
- A specific percentage (5%, 22%, 90%)
- A specific monetary figure ($400M, €1.7 trillion, ¥100 billion)
- A specific date or year ("by 2027", "September 2024", "Q1 2026")
- A specific named person, company, or fleet operator
- A specific count ("250+ countries", "150,000 rated companies", "3M+ companies")
- A specific threshold ("annual revenues over X", "vessels under N gross tonnage")

If any of these appear, the writer must trace each to a source or omit it.

## Composition

This rule is part of [the four integrity non-negotiables](../INDEX.md#rules-7--composable-contracts-every-writerclassifier-inherits). Pairs with [[rule-source-traceability-per-claim]] (which addresses where the citation appears).

Every writer inherits this rule. The classification pipeline ([[classifier-item-type]], [[classifier-jurisdiction]], etc.) does not invent classifications either; classification confidence below threshold routes to [[operational-human-review-queue]] rather than emitting a low-confidence label as if it were high-confidence.

## Audit cross-reference

- v2 audit Section 3 / S15
- v2 audit Section 6.5 (structured fact extraction with confidence and span provenance)
- Audit area 6 finding: 15.5% of sampled rows violate this
