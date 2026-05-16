---
name: rule-character-normalization
description: Every writer normalizes Unicode glyphs to plain ASCII equivalents BEFORE emission. Em dashes, en dashes, smart quotes, ellipsis, bullets, non-breaking spaces, and double-encoded characters get normalized. Section symbols, currency, accents, CJK, and operationally meaningful glyphs are PRESERVED. Normalization happens at write time, not render time. Without this rule, regulator-citation glyphs like §§2015–2015.6 (U+2013 en dash) survive end-to-end into operator-facing output, as the v2 audit found (49 en/em dashes in why_matters, 168 in full_brief).
---

# Rule: Character normalization

## What this rule requires

Every writer normalizes Unicode glyphs to plain ASCII equivalents before the content is written to the database. Normalization is a data-shape rule applied at the storage layer, not the rendering layer.

The audit found 49 en/em dashes in `intelligence_items.why_matters` and 168 in `full_brief` across the corpus. These survive because the original 815-line skill said nothing about character normalization. The result: regulator-citation glyphs like `§§2015-2015.6` arrived from sources containing `§§2015–2015.6` (U+2013, en dash) and survived end-to-end into operator-facing output. Smart quotes (curly quotes) survive similarly. Double-encoded characters (e.g., `â€"` for a corrupted em dash) appear occasionally.

The operator reads em/en dashes as LLM-generated output (per saved memory `feedback_punctuation`); their presence in human-written content is also a quality signal of pasted-without-cleaning source text. Either way, they get normalized.

## The normalization table

| Source character | Unicode | Normalized to |
|---|---|---|
| Em dash | — (U+2014) | comma (with surrounding spaces if mid-sentence) or hyphen (when joining a range like 100—200 → 100-200) |
| En dash | – (U+2013) | hyphen (-) for ranges, comma for parenthetical |
| Left double quotation mark | " (U+201C) | plain double quote (") |
| Right double quotation mark | " (U+201D) | plain double quote (") |
| Left single quotation mark | ' (U+2018) | plain single quote (') |
| Right single quotation mark or apostrophe | ' (U+2019) | plain single quote (') |
| Low double quotation mark | „ (U+201E) | plain double quote (") |
| Low single quotation mark | ‚ (U+201A) | plain single quote (') |
| Horizontal ellipsis | … (U+2026) | three plain periods (...) |
| Non-breaking space | (U+00A0) | regular space |
| Bullet | • (U+2022) | hyphen (-) in lists, or appropriate list marker per format |
| Middle dot | · (U+00B7) | hyphen (-) or comma per context |
| Hair space, thin space, en space, em space | various U+200x | regular space |
| Zero-width space, zero-width joiner | U+200B, U+200D | removed |
| Soft hyphen | (U+00AD) | removed |
| Double-encoded em dash | â€" | em dash, then normalize per above (defense in depth; ingest should catch this first) |
| Double-encoded right double quote | â€ | smart quote, then normalize per above |
| Double-encoded right single quote / apostrophe | â€™ | smart quote, then normalize per above |
| Double-encoded left double quote | â€œ | smart quote, then normalize per above |
| Double-encoded zero-width space | â€‹ | zero-width space, then removed per above |

## Special-case preservation (DO NOT NORMALIZE)

These characters are operationally or legally meaningful and MUST be preserved:

| Character | Unicode | Why preserved |
|---|---|---|
| Section sign | § (U+00A7) | Regulatory citations (§2015, §§2015.1-2015.6); canonical |
| Paragraph sign | ¶ (U+00B6) | Regulatory citations; canonical |
| Currency symbols | €, £, ¥, ₹, ₩, ₽, ¢, etc. | Operationally meaningful (cost mechanism, penalty range) |
| Degree sign | ° (U+00B0) | Temperature, geo coordinates |
| Plus-minus sign | ± (U+00B1) | Tolerance, range |
| Trademark, registered | ™ (U+2122), ® (U+00AE) | Legal attribution may require |
| Copyright | © (U+00A9) | Legal attribution may require |
| Accented Latin (all) | ÀÁÂÃÄÅÆÇÈÉÊË ... ñöüß ... etc. | Proper names, regulator names (Müller, Naerøyfjord, Genève) |
| Cyrillic, Greek, Hebrew, Arabic | full ranges | Source-language fidelity; transliteration is a separate concern |
| CJK (Chinese, Japanese, Korean) | full ranges | Source-language fidelity |
| Mathematical symbols | × (U+00D7), ÷ (U+00F7), ≤ ≥ ≠ ≈ | Operationally meaningful in tables and formulas |

The preserved-list above is not a closed enumeration; the rule is "preserve characters with operational, legal, or proper-name fidelity meaning; normalize only stylistic glyphs."

## Application points

Normalization runs at:

- After every `full_brief` regeneration, before the write to `intelligence_items.full_brief`
- After every summary card emission, before the write to `intelligence_items.summary` and related card fields
- After every YAML metadata field is populated, before the structured fields are written
- Inside the writer prose stream as text is generated; the writer prompt instructs the model to use ASCII; the post-write normalization is the safety net
- After every community contribution is composed (forum post, vendor endorsement, case study); community contributors paste from emails and Word docs where smart quotes are common

NOT at:

- Render time (would mask the underlying data quality problem)
- Display layer (the stored data should already be clean; rendering should not be in the data-shape business)

## Failure mode signature

- An em dash or en dash appearing in operator-facing prose is a writer bug
- A smart quote in a CSV export is a writer bug
- A double-encoded character (`â€™`, `â€"`) anywhere is a writer bug AND a source ingest bug
- A non-breaking space inside an autocomplete or filter field is a writer bug that may cause silent search misses

## What this rule is NOT

- Not a render-time fix. Normalization happens at write time so the stored data is clean and consistent across surfaces.
- Not a justification to strip non-ASCII broadly. The preserved characters above are explicitly load-bearing.
- Not a substitute for source-text fidelity. If a source uses a specific glyph (e.g., a regulator's official citation in the source document), preserve the original in the `sources_used` provenance and the raw source text; normalize only in the writer's narrative emission.
- Not a substitute for ingest-time cleanup. Double-encoded characters should be caught at ingest where possible; the writer-time normalization is the safety net for cases where ingest missed.

## Implementation note

A canonical normalize function can live alongside the writer code (in `fsi-app/src/lib/text-normalize.ts` or similar). The function is pure (text in, text out) and idempotent (normalized text passed back through is unchanged). The writer composes it as the final step before write.

Composing once at the lib layer ensures every writer applies the same normalization. Per-writer ad-hoc normalization (inline regex in each writer) is the failure mode this rule's centralization avoids.

## Composition

- Inherited by: every writer skill ([[writer-regulatory-fact-document]], [[writer-technology-profile]], [[writer-operations-profile]], [[writer-market-signal-brief]], [[writer-research-summary]], [[writer-summary-card-surface]], [[writer-frame-regulations]], [[writer-frame-market]], [[writer-frame-research]], [[writer-frame-operations]], [[writer-yaml-emission]], [[writer-operator-empty-states]], future community-context writers under [[rule-community-attributed-output]])
- Composes with: [[rule-cross-reference-integrity]] (the normalized value is canonical; if the source's original glyph matters for citation, it is preserved separately in provenance not in the writer prose)
- Composes with: [[feedback-punctuation]] saved memory (em/en dashes read as LLM output; normalization removes that signal whether the source is LLM or human)

## Backfill

The existing 49 en/em dashes in `why_matters` and 168 in `full_brief` get cleaned via a one-time backfill sweep, bundled into the source-registry-hygiene + audit-cleanup dispatch (see `docs/multi-tenant-foundation-followups-2026-05-15.md` item 2). Cost per [[rule-cost-weighted-recommendations]]: low one-time agent work, no ongoing runtime, no infra, no inheritance risk; the normalization function is idempotent so the sweep is safe to re-run.

## Audit cross-reference

- v2 audit found 49 en/em dashes in `intelligence_items.why_matters` and 168 in `full_brief`
- Saved memory `feedback_punctuation`: "No em/en dashes; use commas" (operator reads them as LLM output)
- The CARB-class regulatory citation `§§2015–2015.6` (with U+2013 en dash from the source) is the canonical failure example; the §§ are preserved per the rule, the – is normalized to a hyphen
- Operator instruction 2026-05-15: rule-character-normalization codified at the writer layer to address the corpus-wide glyph drift the audit named
