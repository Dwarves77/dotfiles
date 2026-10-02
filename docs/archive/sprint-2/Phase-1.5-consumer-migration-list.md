# Phase 1.5 Consumer Migration List (Q2 base_tier + effective_tier)

**Date:** 2026-05-19
**Branch:** `feat/q2-tier-schema-split`
**Migration:** `090_tier_schema_split.sql` (applied to live DB; ledger backfilled)
**Pre-state on live DB:** 796 sources, all with `tier` (now `base_tier`) populated 1-7.
**Post-state on live DB:** 796 sources, all with `base_tier` + `effective_tier`; Day 1 invariant `effective_tier = base_tier` for every row.

## Why this doc exists

Per Q2 (source-credibility-model decisions doc, Section Q2) the operator chose Flag 1: rename `sources.tier` to `sources.base_tier` and add `sources.effective_tier`, rather than the additive shadow path. This forces every consumer of the prior `tier` column to be explicitly classified as wanting the static (provenance) read or the dynamic (customer-facing credibility) read, and migrated accordingly.

The Q2 migration (090) leaves the application code broken at runtime by intent. TypeScript typecheck passes (the Supabase clients in `src/lib/supabase*.ts` are stringly-typed; no generated `Database` types), so the breakage will surface at the Postgres / PostgREST boundary when a request runs against the new schema and references the deleted `tier` column. PostgREST returns 400 / column-does-not-exist on `.select("tier")` and inserts that pass `tier:` to a `sources` insert fail with the same shape.

The skill anti-pattern this doc protects against is `Reading "sources.tier" directly when the consumer wants the dynamic value` (source-credibility-model SKILL Section 9). Per-consumer review is REQUIRED. The defaults named per row below are the dispatcher's read of skill Section 8 (signal sets per surface) + Section 3 (base_tier is the static type taxonomy classifier prompts and the definitional `SourceTier` type want); they are not authoritative. Each row needs operator confirmation during Phase 1.5 execution before the rename to `base_tier` or `effective_tier` lands per consumer.

## Important caveat on the brief's "typecheck will fail" prediction

The dispatch brief stated typecheck would fail after the migration. It did not (and cannot, on this codebase): the Supabase clients are untyped, so `.select("tier")` calls are not seen by the compiler. The breakage is at the Postgres column-resolution layer, surfaced at request time. The Phase 1.5 review must therefore be Grep-driven (file:line enumeration below), not typecheck-driven. The methodology mirrors the D16 closure precondition: enumerate first, then per-consumer decide.

## Consumer inventory: file:line + brief context

The list below covers all reads, writes, type definitions, and tier-derived select-strings of `sources.tier` (and the `tier:` field on `sources` row writes). It excludes consumers of OTHER tier columns (`tier_at_creation`, `highest_citing_tier`, `cited_by_source_tier`, `provisional_tier`, `recommended_tier`, `urgency_tier`, `ai_trust_tier`, `verification_tier`, `from_tier`, `to_tier`, `confirming_source_tier`, `citing_source_tier`, `previous_tier`, `new_tier`, `initial_tier`, `source_a_tier`, `source_b_tier`, `target_tier`) — those columns are unrelated to the Q2 rename and remain unchanged.

For each row: `(default classification)` is dispatcher recommendation. `(NEEDS DECISION)` means the dispatcher did not have enough context to recommend; operator decides during Phase 1.5.

### Type and store layer (definitional, lean toward base_tier per skill Section 3)

| File | Line | Context | Default classification |
|---|---|---|---|
| `src/types/source.ts` | 534 | `Source.tier: SourceTier;` field on the canonical `Source` interface used everywhere. Consumers reading `source.tier` use this typing. | `base_tier` for the field name (provenance) AND add a new `effective_tier: SourceTier` field; per skill Section 9 anti-pattern, the type SHOULD reflect both. Most consumers should switch to reading `effective_tier`. |
| `src/types/source.ts` | 12 | `SourceTier` type definition (probably `type SourceTier = 1 \| 2 \| 3 \| 4 \| 5 \| 6 \| 7;` — confirm at edit time). | KEEP unchanged. `SourceTier` is the value-space type per skill Section 3; it has no base vs effective semantic. |
| `src/stores/sourceStore.ts` | 107 | `filterSources` filters `s.tier` against `filters.tiers`. This is a UI-facing filter on the sources registry page. | `effective_tier` per skill Section 8 (the customer-facing credibility signal is the dynamic one). |
| `src/stores/sourceStore.ts` | 33 | `toggleTierFilter: (tier: SourceTier) => void;` — toggles a tier value in the filter set. | KEEP unchanged (filter value space is `SourceTier`, base/effective neutral). |

### Supabase row mapper and column list (the single most upstream read)

| File | Line | Context | Default classification |
|---|---|---|---|
| `src/lib/supabase-server.ts` | 257 | `SOURCE_COLUMNS` array includes `"tier"`. Used by `fetchSources` and others. | REPLACE `"tier"` with BOTH `"base_tier", "effective_tier"`. Most downstream reads want effective_tier; provenance reads (audit panes, classifier-prompt context) want base_tier. |
| `src/lib/supabase-server.ts` | 225 | `mapSourceRow` writes `tier: row.tier` on the Source domain object. | Once `Source.tier` is replaced per types/source.ts above, this maps `base_tier: row.base_tier` and `effective_tier: row.effective_tier`. |
| `src/lib/supabase-server.ts` | 306 | `.order("tier", { ascending: true })` on fetchSources query. | `base_tier` (deterministic ordering by structural tier; preserves stable UI ordering through dynamic recompute). |

### Sources-registry and trust-recompute consumers

| File | Line | Context | Default classification |
|---|---|---|---|
| `src/lib/trust.ts` | 251 | `if (source.tier === 1) return null;` — short-circuits demotion candidate scoring for T1 sources. | `effective_tier` (demotion is a dynamic credibility judgment per skill Section 4). |
| `src/lib/trust.ts` | 255 | `(c) => c.from_tier === source.tier` — matches demotion trigger criteria against current source tier. | `effective_tier` (matches Section 4 dynamic semantics). |
| `src/lib/trust.ts` | 310 | `if (!trigger.tiers_affected.includes(source.tier)) continue;` — gate on whether the current tier is in the trigger's affected set. | `effective_tier`. |
| `src/lib/trust.ts` | 384 | `Math.min(7, source.tier + 1)` — proposes recommended_tier as one step below current. | `effective_tier` (the recommendation should respond to the dynamic credibility number, not just the static base). |
| `src/lib/trust.ts` | 389 | `recommended_tier: triggers_fired.length > 0 ? recommendedTier : source.tier,` — fall-through to source's current tier when no trigger fired. | `effective_tier`. |
| `src/app/api/admin/recompute-trust/route.ts` | 49 | `.select(..., tier, ...)` for the trust-recompute batch job. | `effective_tier` (trust recompute is itself producing the dynamic credibility number; reading it for the computation is the canonical use). NOTE: this route is the natural integration point for Q7's daily-batch `effective_tier` write; coordinate with Q7 dispatch. |
| `src/app/api/admin/recompute-trust/route.ts` | 93 | `computeOverallScore(metrics, s.tier as SourceTier);` — applies tier-weighted scoring. | `effective_tier`. |
| `src/app/api/admin/recompute-trust/route.ts` | 120-121 | `byTier[s.tier]` rollup distribution. | `effective_tier`. |

### Ingest / scheduler / scan consumers

| File | Line | Context | Default classification |
|---|---|---|---|
| `src/app/api/worker/check-sources/route.ts` | 47 | `.select("id, name, url, tier, update_frequency, last_checked, access_method, auto_run_enabled")` — scheduler reads tier to order pulls. | `base_tier` (scheduling priority is a stable property tied to structural type; using dynamic here would re-shuffle the queue on every recompute). NEEDS DECISION: arguable for `effective_tier` if operator wants citation-network-promoted sources to fetch sooner. |
| `src/app/api/worker/check-sources/route.ts` | ~52 | `.order("tier", { ascending: true })` — order by tier ASC. | Same as above; `base_tier` recommended. |
| `src/app/api/worker/drain-first-fetch/route.ts` | 79 | Type `tier: number \| null;` on the drain row. | Match whatever the SELECT shape becomes; if SELECT returns `effective_tier`, type uses that. |
| `src/app/api/worker/drain-first-fetch/route.ts` | 198 | `source_tier: source.tier,` — writes the source's tier into the first-fetch classify input. | `effective_tier` (the classifier input wants the credibility signal it would have used at classification time). |
| `src/app/api/data/scan-all/route.ts` | 48 | `.from("sources")` query — re-verify selection. | Likely uses `base_tier` if it sorts or paginates. NEEDS DECISION on inspection. |
| `src/app/api/data/fetch-source/route.ts` | 62 | `.from("sources").select(...)` then writes. NEEDS line-by-line read. | NEEDS DECISION. |

### Agent / brief generation consumers

| File | Line | Context | Default classification |
|---|---|---|---|
| `src/lib/agent/source-pool.ts` | 33 | Type `tier: number;` on `PoolSource`. | `effective_tier` for the field (agents select pool members by current credibility signal). |
| `src/lib/agent/source-pool.ts` | 62 | `.select("id, url, name, description, tier, trust_score_overall, domains, jurisdictions, topic_tags")` — pool query. | `effective_tier` (agent pool scoring should weight dynamic credibility per skill Section 8 Assistant signal set). |
| `src/lib/agent/source-pool.ts` | 102, 121, 143, 164 | `tier: r.tier`, `tier: primary.tier`, `tier: s.tier` — populates PoolSource.tier. | `effective_tier`. |
| `src/app/api/agent/run/route.ts` | 33 | Type `tier: number \| null;` on the source struct. | `effective_tier`. |
| `src/app/api/agent/run/route.ts` | 45 | Type `tier: number \| null;` on the candidate struct. | This is a candidate (classifier-emitted) tier; KEEP as the agent's tier estimate. Unrelated to sources.tier. |
| `src/app/api/agent/run/route.ts` | 245 | `.select("id, last_scanned, status, tier, access_method, api_endpoint_url, api_auth_method, api_response_format, rss_feed_url")` — source lookup at brief generation. | `effective_tier` (credibility signal for the brief). |
| `src/app/api/agent/run/route.ts` | 481 | `const citations: Array<{ name: string; url: string; tier: number; why: string }> = [];` — agent-emitted citation tier estimate. | KEEP as agent tier estimate; per Q3, this should be preserved as a tier-opinion alongside the citing edge. Unrelated to sources.tier rename. |
| `src/app/api/agent/run/route.ts` | 500 | `const tier = parseInt(tierRaw.replace(/[^\d]/g, ""), 10);` — parses agent-emitted tier from markdown. | KEEP as agent tier estimate (Q3 opinion). |
| `src/app/api/agent/run/route.ts` | 516 | `const citingTier = sourceRecord.tier;` — reads citing source's tier for citation propagation. | `effective_tier` (Q7 citation-network scoring weights cite-from tier; this is the propagation input). |
| `src/app/api/agent/run/route.ts` | 590 | `cited_by_source_tier: citingTier,` — writes onto provisional_sources. | Whatever citingTier is set to (cascading). |
| `src/app/api/agent/run/route.ts` | 594 | `highest_citing_tier: citingTier,` — same. | Cascading. |
| `src/app/api/agent/run/route.ts` | 595 | `provisional_tier: c.tier,` — c.tier is the agent's tier estimate. | KEEP (agent estimate). |

### Intelligence Assistant consumers (per skill Section 8 Assistant row)

| File | Line | Context | Default classification |
|---|---|---|---|
| `src/app/api/ask/route.ts` | 45 | Type `tier: number \| null;` on the item.source nested struct. | `effective_tier` per skill Section 8 Assistant signal set (inline citations with full provenance). |
| `src/app/api/ask/route.ts` | 55 | Type `source_tier: number \| null;` on a Citation. | `effective_tier`. |
| `src/app/api/ask/route.ts` | 163 | `.select("name, tier, status, update_frequency")` — pulls top-20 sources for general credibility context in the system prompt. | `effective_tier`. |
| `src/app/api/ask/route.ts` | 178 | `\`${i.source.name} (Tier ${i.source.tier ?? "?"})\`` — renders tier in the per-item context block. | `effective_tier`. |
| `src/app/api/ask/route.ts` | 206 | `\`- ${s.name} (Tier ${s.tier}, ${s.status}, updates ${s.update_frequency})\`` — renders tier in the sources context block. | `effective_tier`. |
| `src/components/AskAssistant.tsx` | 24 | Type `source_tier: number \| null;` on the Citation render. | `effective_tier`. |
| `src/components/AskAssistant.tsx` | 43 | `tierLabel(tier: number \| null)` — label function for tier display. | KEEP (label fn is value-space). |

### Customer-facing UI consumers (per skill Section 8 surface signal sets)

| File | Line | Context | Default classification |
|---|---|---|---|
| `src/components/sources/SourceProvenanceBadge.tsx` | 31 | `const tier = source.tier;` — renders tier badge on a source provenance pill. | `effective_tier` per skill Section 8 (Tier badge across surfaces is the dynamic credibility signal). |
| `src/components/sources/SourceHealthDashboard.tsx` | 22 | `TierSummaryCard({ tier, sources })` — admin-facing source health summary card. | `base_tier` (admin source-registry view groups by structural type for inventory; matches the underlying view recreated in migration 090 referencing s.base_tier). NEEDS DECISION: arguable that admin wants effective_tier for health dashboards. |
| `src/components/sources/SourceHealthDashboard.tsx` | 24 | `sources.filter((s) => s.tier === tier)` — filters sources by tier. | Same as above; `base_tier`. |
| `src/components/sources/SourceHealthDashboard.tsx` | 128 | `T{source.tier}` rendering. | `effective_tier` if dashboard shows credibility; `base_tier` if it shows the structural registry. NEEDS DECISION. |
| `src/components/sources/SourceHealthDashboard.tsx` | 345 | `<TierSummaryCard key={tier} tier={tier} sources={sources} />` — iterates tier values. | Matches the filter/group choice above. |
| `src/components/sources/CanonicalSourceReview.tsx` | 65 | `tier: number;` on a candidate review row. | This is a candidate (not yet a source); KEEP. The candidate review surface writes the eventually-promoted source's `base_tier` (line 688 confirms). |
| `src/components/sources/CanonicalSourceReview.tsx` | 688 | `body.tier = tier;` — POSTs the operator's tier choice for the candidate. | This becomes the new source's `base_tier`; per skill Section 5 the candidate review writes BOTH base_tier and effective_tier (initialized equal at insert time). API handler change required. |
| `src/components/sources/ProvisionalReviewCard.tsx` | 9 | `tier: number;` on provisional. | KEEP (provisional tier ≠ sources.tier). |
| `src/components/sources/ProvisionalReviewCard.tsx` | 99 | `body.tier = tier;` — POSTs tier when promoting provisional. | Becomes new source's `base_tier` (with effective_tier initialized equal); same as CanonicalSourceReview. |

### Admin write paths (canonical-sources, promote, bulk-import, bulk-approve)

| File | Line | Context | Default classification |
|---|---|---|---|
| `src/app/api/admin/canonical-sources/decide/route.ts` | 211 | `tier: body.tier,` on new `sources` insert. | RENAME to `base_tier: body.tier, effective_tier: body.tier,` (Day 1 invariant: effective_tier initialized to base_tier per migration 090's backfill semantic). |
| `src/app/api/admin/canonical-sources/decide/route.ts` | 250 | `tier: body.tier,` in audit-log payload. | KEEP (payload schema, not a column name). |
| `src/app/api/admin/canonical-sources/bulk-approve/route.ts` | 143 | `tier: rec.tier,` on new `sources` insert. | RENAME to `base_tier: rec.tier, effective_tier: rec.tier,`. |
| `src/app/api/admin/sources/promote/route.ts` | 110 | `tier: body.tier,` on new `sources` insert (provisional → source promotion). | RENAME to `base_tier: body.tier, effective_tier: body.tier,`. |
| `src/app/api/admin/sources/promote/route.ts` | 164 | `tier: body.tier,` in audit-log payload. | KEEP (payload schema). |
| `src/app/api/admin/sources/all/route.ts` | 46 | `.order("tier", { ascending: true })` — admin source list ordering. | `base_tier` (admin source registry ordering by structural type). |
| `src/app/api/sources/route.ts` | 31 | `.order("tier", { ascending: true })` — public-facing sources listing endpoint. | `effective_tier` (customer-facing per skill Section 8). |
| `src/app/api/admin/canonical-sources/bulk-classify/route.ts` | 181 | `.from("sources")` — re-verify selection. | NEEDS DECISION (likely write of new tier; treat like canonical-sources/decide). |
| `src/app/api/admin/canonical-sources/recommend-classification/route.ts` | 176 | `typeof recommendation.tier === "number"` — validates AI-recommended tier shape. | KEEP (recommendation tier value space). |
| `src/app/api/admin/sources/recommend-classification/route.ts` | 154 | `typeof recommendation.tier === "number"` — same. | KEEP. |
| `src/app/api/admin/sources/bulk-import/route.ts` | 587 | `provisional_tier: 7,` — provisional-side tier. Unrelated to sources.tier rename. | KEEP. |
| `src/app/api/admin/sources/[id]/fetch-now/route.ts` | 76 | `.from("sources").select(...)` — re-verify select content. | NEEDS DECISION. |
| `src/app/api/admin/sources/[id]/regenerate-brief/route.ts` | 48 | Same. | NEEDS DECISION. |
| `src/app/api/admin/sources/[id]/visibility/route.ts` | 56 | Same. | NEEDS DECISION. |
| `src/app/api/admin/sources/[id]/pause/route.ts` | 57 | Same. | NEEDS DECISION. |
| `src/app/api/admin/scan/route.ts` | 224 | `.from("sources")` — investigate. | NEEDS DECISION. |
| `src/app/api/admin/spot-check/recurring/route.ts` | 79 | Type `tier: number;` on spot-check source. | NEEDS DECISION (likely `effective_tier` for credibility verification semantic). |
| `src/app/api/admin/spot-check/recurring/route.ts` | 253 | `sources: { id: string; name: string; url: string; tier: number; status: string } \| null;` | Same. |

### Database view consumers (downstream of migration 090's view recreation)

| Object | Reference | Default classification |
|---|---|---|
| `public.provisional_sources_review` view | `s.base_tier AS cited_by_tier_current` (recreated in migration 090) | `base_tier` chosen as the minimal-change default to preserve Day 1 behavior. NEEDS DECISION: should the review surface render the dynamic credibility number instead? If yes, Phase 1.5 swaps `s.base_tier` to `s.effective_tier` in a new migration. |
| `public.source_health_summary` view | `GROUP BY s.base_tier` (recreated in migration 090) | `base_tier` chosen as the minimal-change default. NEEDS DECISION same as above. |

### Files mentioned in `tier:` writes that are NOT sources writes (no action required)

These were caught in the initial Grep but operate on tables other than `sources`; the Q2 rename does not affect them. Listed for sweep-discipline completeness:

- `src/app/api/admin/spot-check/recurring/route.ts` 206, 274, 405, 410, 433, 500 (writes `ai_trust_tier`, `original_trust_tier`, `trust_tier`, `new_trust_tier` to other tables)
- `src/app/api/intelligence-items/[id]/metadata/route.ts` 41, 69 (`urgency_tier` on intelligence_items)
- `src/app/api/admin/sources/recently-auto-approved/route.ts` 125, 126 (`ai_trust_tier`, `verification_tier` on the verification model)
- `src/app/api/admin/sources/verify/route.ts` 134 (`ai_trust_tier`)
- `src/app/api/worker/drain-first-fetch/route.ts` 212, 280 (`urgency_tier` on intelligence_items)
- `src/types/community.ts` (verification_tier, membership_tier, listing_tier on community model)
- `src/types/intelligence.ts` 170 (`source_tier` consumes from a different shape)

## Phase 1.5 dispatch shape recommendation

Given the consumer count (~50 distinct call sites across ~25 files, with ~12 NEEDS-DECISION rows above), Phase 1.5 should NOT be a single dispatch. Recommend three smaller dispatches:

1. **Phase 1.5a (read-path migration).** All read-side consumers and the type/store layer. Net result: all reads source from `base_tier` OR `effective_tier` per the per-row classification above. No write changes. Branch: `feat/q2-phase-1-5a-reads`.
2. **Phase 1.5b (write-path migration).** All `tier:` insert and update sites on `sources`. Each write becomes `base_tier: X, effective_tier: X` (Day 1 invariant). Branch: `feat/q2-phase-1-5b-writes`.
3. **Phase 1.5c (view + ordering decisions).** The view recreations and the order-by sites where dispatcher classified as NEEDS DECISION. Operator confirms each. Branch: `feat/q2-phase-1-5c-views`.

If Q7 (daily batch effective_tier recompute) is dispatched in parallel, the write-path migration in 1.5b should land FIRST so that Q7's UPDATE-effective_tier statements have a stable target shape.

## Recommended Phase 1.5 entry sequence relative to other Sprint 2 work

Per the dispatch brief: "Phase 1.5 dispatch fires immediately after this merge." Concretely:

1. Merge `feat/q2-tier-schema-split` (this PR).
2. Open `feat/q2-phase-1-5a-reads` (~25 file edits, single dispatch).
3. Open `feat/q2-phase-1-5b-writes` (~8 file edits, single dispatch).
4. Open `feat/q2-phase-1-5c-views` (operator-decision pass on NEEDS DECISION rows; may include a migration 091 for view body changes).
5. Only after 1.5a-c land, dispatch Q5 (override columns), Q7 (recompute batch), Q6 (decay tuning). Those depend on a clean base_tier + effective_tier consumer story.

## Cross-references

- `docs/sprint-2/source-credibility-model-decisions-2026-05-19.md` Q2 (Decision body, Open Sub-Decisions)
- `fsi-app/.claude/skills/source-credibility-model/SKILL.md` Section 3 (base_tier vs effective_tier semantics), Section 8 (per-surface signal sets), Section 9 (anti-patterns: reading sources.tier directly)
- `fsi-app/.claude/skills/sprint-followups-discipline/SKILL.md` Sources-schema-touch precondition (this list IS the precondition audit for the upcoming Phase 1.5 dispatches)
- `fsi-app/supabase/migrations/090_tier_schema_split.sql` (the schema-only migration this list inventories the consumer side of)
