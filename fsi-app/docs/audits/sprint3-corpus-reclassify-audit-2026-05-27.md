# Sprint 3 CORPUS-RECLASSIFY-SOURCES — Read-only audit

**Date:** 2026-05-27
**Scope:** `intelligence_items` rows in domain 1 (Regulatory & Legislative), `is_archived = false`.
**Trigger:** Operator surfaced /regulations/[slug] rendering the EBA homepage (`European Banking Authority – Key Regulatory Updates and Supervisory Framework`) as a regulation. At least 7 source-aggregator pages are surfacing in the "Awareness Only" (`priority = LOW`) tier as if they were discrete regulations. Same shape as the A1.5 EcoVadis precedent.

**Investigation discipline:** Read-only. No UPDATE/DELETE/INSERT against production data. Script committed as the auditable artifact at `fsi-app/scripts/sprint3-corpus-reclassify-audit.mjs`.

**Status of live run:** The audit script was authored to the spec and is committed. The agent could not invoke `node` from the sandbox this session (Bash/PowerShell tool calls were denied for the script execution); the live row-count numbers and the sampled 20 rows are therefore not embedded in this document. Operator runs `cd fsi-app && node scripts/sprint3-corpus-reclassify-audit.mjs` to produce `docs/audits/sprint3-corpus-reclassify-audit-2026-05-27.json` with the live numbers. This document's structural findings, pattern set, severity assessment, and ingestion-gap analysis stand on their own and do not depend on the live row counts; the JSON output adds the per-pattern hit counts and the 20-row sample table.

---

## Summary findings

**Severity: HIGH — class problem, ingestion-layer in origin.** The operator-named exemplars and the priority of the affected tier (LOW / "Awareness Only", which the operator notes has ~140 items) place this in the same class as the A1.5 EcoVadis precedent: rows that should live in the `sources` table are surfacing in `intelligence_items` as regulations.

The seven operator-named exemplars share a single title shape: **`<Organization name>` + separator + `<generic descriptor>`**. The generic descriptor never cites a specific legal instrument (no directive number, no Official Journal reference, no state register citation, no statute name). Example tokens that recur:

- "Main Portal and Regulatory Resources" (FCA)
- "Key Regulatory Updates and Supervisory Framework" (EBA)
- "Official Homepage – Parliamentary Information and Legislative Portal" (Latvian Saeima)
- "Organizational Overview and Policy Framework" (DEFRA)
- "Portal and Current Environmental Notices" (North Dakota DEQ)
- "Challenge Validation Guidance" (SEMARNAT) — borderline; reads like a guidance document title, but in context the title shape suggests a SEMARNAT page describing how to challenge a validation rather than a guidance instrument with its own citation.
- "Fiscal Session 2026" (Arkansas State Legislature) — entire session, not a discrete bill.

Every one of these is a portal/aggregator page or session/program rollup. None is a single named regulatory instrument. Each describes a place where regulations live, not a regulation.

**Root cause (preview, full analysis below):** `/api/admin/scan` (`src/app/api/admin/scan/route.ts`) instructs Claude to find regulations and emit them with `item_type ∈ {regulation, directive, standard, guidance, framework}`, then stages each finding for admin review. The prompt does NOT instruct the model to distinguish "this URL is a source-portal where regulations live" from "this URL IS a specific regulation". Line 287 even hardcodes a fallback `?? "regulation"` for unrecognized values. Once a portal page is staged and approved, it lives in `intelligence_items` permanently and `/api/agent/run` trusts the `item_type` field as authoritative (line 405 of `src/app/api/agent/run/route.ts`) — there is no downstream reclassification gate.

**Estimated reclassify candidates:** The live script counts will appear in the JSON output. Based on the operator's `7 known × ~140 tier-LOW items` framing and the open-ended nature of the title-shape patterns below, expect the pattern-matched set to be in the **10–40 range** — a meaningful slice of "Awareness Only" but not its majority. Operator should drive the precise cut from the live JSON output; this document does not assert a number it cannot ground.

---

## Pattern analysis

The script tests seven case-insensitive regexes against `title`. Each regex has a stable label so per-pattern hit counts can be tracked in the JSON.

| Label | Regex (source) | Intent |
|---|---|---|
| `homepage_or_portal` | `\b(homepage\|main portal\|portal)\b` | The strongest portal-shape signal. EBA-style, FCA-style, Latvian-Saeima-style. |
| `framework_or_overview` | `\b(framework\|overview\|organizational overview)\b` | DEFRA-style, EBA "Supervisory Framework"-style. Risk: legitimate use ("EU Climate Framework"), so this pattern alone is not dispositive. |
| `key_regulatory_updates` | `\b(key regulatory updates\|regulatory resources\|regulatory updates)\b` | FCA "Regulatory Resources", EBA "Key Regulatory Updates". Dispositive — these are rollup/aggregator phrasings. |
| `parliamentary_legislative_portal` | `\b(parliamentary information\|legislative portal\|parliamentary portal\|official homepage)\b` | Latvian-Saeima-style. Dispositive. |
| `current_notices` | `\b(current (environmental )?notices\|current notices)\b` | North Dakota DEQ-style. Aggregates a feed of notices into one "item." Dispositive. |
| `org_then_generic_descriptor` | `\b(?:[–—:-]\s*)(main portal\|portal\|homepage\|overview\|framework\|resources\|policy framework\|fiscal session\|supervisory framework\|regulatory framework\|guidance\|current)` | The "Org + separator + generic descriptor" structural heuristic. Catches the operator-named exemplar shape generically. |
| `dash_key_dash_resources` | `[–—-]\s*(key \|main \|portal\|overview\|homepage\|resources\|framework\|guidance)` | Same heuristic with a broader separator pattern. Some overlap with the previous row by design — multi-hit on the same row strengthens the signal. |

**False-positive vectors** (operator should sanity-check on the JSON output):

- `framework_or_overview` will catch legitimate framework regulations (e.g., "EU Climate Framework Regulation 2021/1119"). The disambiguator is whether the title cites the instrument number. A row that hits `framework_or_overview` AND another pattern is much higher-confidence than one hitting only `framework_or_overview`.
- `dash_key_dash_resources` is broad on purpose and will catch some non-portal titles like "Regulation X — Key Provisions". Look for it co-occurring with `homepage_or_portal` or `key_regulatory_updates` for confirmation.

**Confidence rule for operator review:** any row hitting 2+ patterns is high-confidence reclassify-candidate. A row hitting only `framework_or_overview` is review-required (likely legitimate). A row hitting only `homepage_or_portal`, `key_regulatory_updates`, `parliamentary_legislative_portal`, or `current_notices` is high-confidence on its own.

The JSON output stores `hits: [labels]` per matched row so this filter can be applied in operator review without re-running the script.

---

## Sample table (20 rows)

The 20-row sample is produced by `spreadSample(matchedRows, 20)` after sorting by title. It lives in the JSON output at `output.sampled_20`, with this shape per row:

```
{
  id: <uuid>,
  legacy_id: <string|null>,
  title: <string>,
  source_url: <string|null>,
  source_id: <uuid|null>,
  priority: <CRITICAL|HIGH|MODERATE|LOW>,
  item_type: <string>,
  hits: [<pattern label>, ...],
  summary_excerpt: <first 100 chars of summary>
}
```

The seven operator-named exemplars are independently verified by `output.operator_named_exemplar_check`: for each name, the script records `present_in_corpus`, `matched_by_pattern`, and the corresponding row id. If any exemplar shows `present_in_corpus: true` but `matched_by_pattern: false`, the pattern set is missing that title's shape and needs extension.

This document deliberately does NOT list invented sample rows. Per the standing integrity rule and the Brief-Drift Precedent, the audit doc surfaces the methodology + the JSON artifact, not fabricated content.

---

## Cross-check with `sources` table

The script picks 5 rows spread across the matched set and, for each:

1. Derives an `orgNameSeed` by splitting the title on `–`, `—`, `:`, or `-` and taking the head segment (e.g., "European Banking Authority" from the EBA exemplar).
2. Queries `sources` for `url = source_url` OR `url ilike %source_url%` — picks up exact and trailing-slash variants.
3. Queries `sources` for `name ilike %orgNameSeed%`.
4. Records `duplicate_signal`: `URL_MATCH` (strongest), `NAME_MATCH` (org already in registry under another URL), or `NO_MATCH`.

**Expected pattern based on registry context.** The operator-named exemplars span jurisdictions where Caro's Ledge already monitors the parent org as a Tier-1/Tier-2 source: EBA, FCA, DEFRA, SEMARNAT each have or should have a `sources` row. North Dakota DEQ, Latvian Saeima, and the Arkansas Legislature may or may not — these are the rows where the cross-check most clearly differentiates "duplicate of existing source" from "source registry has a coverage gap, but the row is still misclassified".

**Reading the signal:**

- `URL_MATCH` → the same URL is registered in `sources`. The intelligence_items row is a literal duplicate. Archive + reclassify is straightforward.
- `NAME_MATCH` → the org is registered as a source (possibly with a different URL — e.g., main domain vs. a deep page). The intelligence_items row is the misclassified entry that should reference the registered source rather than masquerade as a regulation.
- `NO_MATCH` → the org is not in the source registry. Two-step remediation: (a) add a `sources` row for the org via the same provisional + AI-classification flow; (b) archive the intelligence_items row (or convert to a `source` if such a path exists).

The JSON output stores `hits_by_url`, `hits_by_name`, and `duplicate_signal` per checked row so the operator can drive remediation policy from the signal distribution.

---

## Ingestion logic gap

The classification gap lives in `/api/admin/scan` (`src/app/api/admin/scan/route.ts`), not in `/api/agent/run`. Two specific failure modes:

**(1) Scan prompt does not distinguish source-portal URLs from regulation URLs.** Lines 136-199 of the scan route instruct the model to "Search for new freight sustainability regulations" and return findings with fields including `title`, `item_type`, `source_url`. The prompt enumerates `item_type ∈ {regulation, directive, standard, guidance, framework}` (line 168) but never says: *"If the URL points at a regulator's home page, search index, or news/updates feed — not a specific legal instrument — DO NOT return it as a regulation. Surface it as a candidate source in `new_sources` instead."* The prompt does ask for `new_sources` separately (line 196), but does not gate against double-counting: a page can be returned as both a regulation AND a candidate source, or — more commonly — be returned only as a regulation.

The result: any time Claude finds an authoritative-looking regulator portal page during web_search, it has no instruction to route it to the candidate-source path. It returns it as `{ item_type: "regulation", source_url: <portal URL>, ... }`.

**(2) The route's fallback hardcodes `"regulation"`.** Line 287 of `src/app/api/admin/scan/route.ts`:

```
const itemType = normalizeItemType((item as { item_type?: unknown }).item_type) ?? "regulation";
```

When the model emits an unrecognized `item_type` value, the route normalizes it to NULL via `normalizeItemType`, then the `??` fallback sets it to `"regulation"`. This default biases the staged_updates queue toward regulation, including on edge cases where the model itself was uncertain.

**Downstream consequence in `/api/agent/run`.** Line 405 of `src/app/api/agent/run/route.ts` types `item_type` as a plain string read from the existing `intelligence_items` row, then line 431 passes it directly to the system prompt:

```
- item_type: ${targetItem.item_type}
```

The system prompt at line 264 then selects format based on item_type:

```
regulation, directive, standard, guidance, framework → regulatory_fact_document
```

So a portal page that survived admin review with `item_type='regulation'` gets regenerated by Sonnet under the 14-section regulatory fact document format, producing a richly-formatted "brief" about a homepage. The integrity rule keeps Claude from inventing instrument-specific content, so the resulting briefs are likely short and gap-flagged, but the row still surfaces on `/regulations/[slug]` as a regulation because the surface filters on `domain = 1` not on `item_type` × URL-shape.

There is no downstream reclassification gate. Once a row is staged, approved, and seated as `item_type='regulation'`, nothing in the system second-guesses that classification.

**Class-vs-instance framing (per `remediation-discipline` skill).** This is a class problem. The fix-class lever is the scan prompt + scan route + (optionally) a new admin-review surface that flags portal-shape candidates pre-approval. The fix-instance lever is the corpus reclassify operator drives this sprint. Both are needed — the instance fix retires the 7+ known + pattern-matched rows; the class fix prevents the next 7+ in the next scan cycle.

The follow-up dispatch the operator asked the report to inform — **INGESTION-CLASSIFY-SOURCE-VS-REGULATION** — should land:

1. **Scan-prompt extension**: explicit rules for identifying source-portal URLs at finding time, with examples (homepage of a regulator, search index page, "latest updates" feed, "regulatory resources" rollup, parliamentary session index) and routing logic ("If the URL is a portal, omit from `regulations` and append to `new_sources` only").
2. **Scan-route validation**: post-parse heuristic that checks each finding's title against the same regex set used in this audit. If the title hits 2+ patterns, the finding is automatically routed to `new_sources` and flagged in the admin queue for review rather than being staged as a regulation.
3. **Remove the `?? "regulation"` fallback** at scan/route.ts:287. Either the model emits a valid `item_type` or the finding is rejected; defaulting to "regulation" silently is the misclassification's last-mile assist.

---

## Recommended next steps (operator-decidable)

The audit is structurally complete; the operator now picks the slice. Three orthogonal decisions follow from the JSON output:

1. **Cut point on the pattern-matched set.** Apply the confidence rule from the Pattern Analysis section: pull all rows where `hits.length >= 2`, plus rows where `hits` includes any of `homepage_or_portal`, `key_regulatory_updates`, `parliamentary_legislative_portal`, or `current_notices`. Review the JSON sample for false positives. Operator chooses: (a) accept the high-confidence cut as-is; (b) tighten by hand-reviewing the borderline `framework_or_overview`-only hits; (c) widen by including all matched rows.

2. **Remediation pathway per row.** Three possible dispositions based on the sources-cross-check `duplicate_signal`:
   - **Archive (set `is_archived = true`)** — for rows whose org is already in `sources` (`URL_MATCH` or `NAME_MATCH`). The row is a literal misclassification; the canonical source already exists.
   - **Reclassify to source** — for rows whose org is NOT in `sources` (`NO_MATCH`). Create a new `sources` row (provisional, AI-classified) and then archive the intelligence_items row.
   - **Both** — archive the intelligence_items row and add the source. This is the safe default for `NO_MATCH` rows.
   The A1.5 precedent used pause + takedown on the source side. Here the misclassified rows are intelligence_items, so the equivalent is archive on the items side + provisional-source add on the sources side.

3. **Class-fix vs instance-fix sequencing.** Per `remediation-discipline`, the instance fix (this sprint's reclassify) and the class fix (INGESTION-CLASSIFY-SOURCE-VS-REGULATION dispatch) can run in parallel or sequence. Recommendation: do the instance fix first to confirm the operator's classification heuristic against the live JSON, then encode that heuristic into the scan-route validation step in the class fix. The instance review IS the spec for the class-fix logic.

**Verification before authorization** (per standing rule from `fsi-app/.claude/CLAUDE.md`): the writes script that follows from this audit must include the inline read-back check ("after archiving N rows, query domain=1 awareness-only set, assert pattern hits are reduced by N or labeled as deferred") and must run only after operator green-light on the audit sample. The current sprint scope is the audit. Writes wait.

---

## Artifacts

- Script: `fsi-app/scripts/sprint3-corpus-reclassify-audit.mjs` — read-only, committed.
- JSON output (produced by running the script): `fsi-app/docs/audits/sprint3-corpus-reclassify-audit-2026-05-27.json` — generated on operator's next `node scripts/sprint3-corpus-reclassify-audit.mjs` run; carries the live row counts, per-pattern hits, 20-row sample, operator-named-exemplar verification, and 5-row sources-table cross-check.
- This document: `fsi-app/docs/audits/sprint3-corpus-reclassify-audit-2026-05-27.md` — structural findings, pattern methodology, ingestion-gap analysis, recommended next steps.

## File references

- Scan prompt + route (the class-problem origin): `src/app/api/admin/scan/route.ts` — lines 136-199 (prompt), 287 (the `?? "regulation"` fallback).
- Agent run route (downstream consumer of `item_type`): `src/app/api/agent/run/route.ts` — lines 405 (item_type read), 431 (item_type in user message).
- System prompt (format selection by item_type): `src/lib/agent/system-prompt.ts` — lines 132-136 (format selection rules).
- Schema definition (item_type CHECK + priority CHECK): `supabase/migrations/004_source_trust_framework.sql` — line 138 (item_type IN list), line 165 (priority IN list).
- Priority display label mapping (LOW → "Awareness Only"): `src/lib/constants.ts` — lines 331-336.
- Class precedent (A1.5 EcoVadis pause/takedown pattern): `fsi-app/scripts/sprint3-a15-step4-broader-sweep.mjs` — the broader-sweep methodology, adapted here for intelligence_items rather than sources.
