# Build 8 — Research surface (Q9 signal-set integration)

**Status**: DRAFT — awaiting operator review before sub-dispatch execution.
**Dispatch UUID** (parent coordination): `2026-05-21-c205e368-build-8-research-surface`
**Authored**: 2026-05-21, after the Layer 5a verification floor landed.
**Sequencing position**: First customer-facing build after the four-layer + 5a discipline infrastructure completed.

## Goal

Surface the four Q9 research signals (tier, bias tag, citation count, recency) on the `/research` page so the operator (and future customers) can rank research items by source quality + freshness, not just by pipeline stage. The signals already exist in the schema (migrations 089/090/092); the gap is at the data fetch + render layer.

This is an **enhancement**, not greenfield. The route, page component, view, and data fetcher all exist. The plan extends each in place.

## Current state (verified 2026-05-21 via Explore subagent)

| Layer | File | Status vs Build 8 |
|---|---|---|
| Route entry | `fsi-app/src/app/research/page.tsx` (90 lines) | Loads `getResearchPipeline`, `getResearchItems`, scoped aggregates. No Q9 signals plumbed. |
| Main view | `fsi-app/src/components/research/ResearchView.tsx` (1133 lines) | 4-up StatStrip, Pipeline tab with `PipelineRow` (lines 858–1133). No tier/bias/citation render. |
| Pipeline fetcher | `fsi-app/src/lib/data.ts` `getResearchPipeline()` (513–521) | Returns `{rows, total, cap}`; cache 60s. No Q9 fields. |
| RPC-side fetch | `fsi-app/src/lib/supabase-server.ts` `fetchResearchPipelineRows` (724–781) | Pulls `intelligence_items` + joined `source(name, url)`. Tier/bias/citation absent from projection. |
| Row type | `fsi-app/src/lib/supabase-server.ts` `ResearchPipelineRow` (712–722) | 9 fields, none of them Q9. |
| Schema readiness | migrations 089 (citations), 090 (base_tier + effective_tier), 092 (source_bias_tags) | Backing tables/columns exist; migration 089 header notes consumer RPC body is "scheduled with Build 8 (Research)". |

Operator-relevant callouts left in current code:
- `page.tsx:66` — `owner` and `partnerFlagged` are placeholders pending owner-attribution work (out of Build 8 scope; preserved).
- `ResearchView.tsx:21-24, 400-404, 847` — coverage matrix tab hidden; needs per-(mode, region) source-registry rollup endpoint. Larger than Build 8 should absorb; called out as Dispatch 5 candidate but recommended deferral.

## Architecture decisions this plan inherits

- **ADR-001** platform model (multi-tenant, 5 surfaces, 3 layers) — `/research` is one of the 5 surfaces.
- **ADR-002** tier model (`base_tier` provenance, `effective_tier` dynamic) — Dispatches 2 will read both per the split; F8 fitness function will gate client-server boundary on any new tier reads.
- **ADR-005** discipline enforcement layered architecture (4 layers + 5a verification) — every Build 8 sub-dispatch lands under the full discipline stack.
- **ADR-007** bias-tag auto-cutoff threshold per dimension (D1 Option B) — Dispatch 3 surfaces what ADR-007 protects against silently.
- **ADR-008** urgency_score strict mapping (Option C-bias) — incidentally relevant: any new research item creator hooks must respect strict urgency mapping per `fsi-app/src/lib/urgency.ts`.
- **ADR-010** post-push verification — each sub-dispatch carries `CI-Status:` + `Deploy-Status:` trailers attesting to parent verified state.

## Sub-dispatch breakdown

Five candidate dispatches enumerated. Recommendation: execute 1–4 as Build 8; defer 5 to a dedicated infrastructure build.

### Dispatch 8.1 — Citation count visibility (PREREQUISITE)

**Why first** (CORRECTED 2026-05-21 plan amendment): migration **088** (not 089 as originally listed) created `get_source_citation_stats(source_ids UUID[]) → (source_id UUID, citation_count INT, recency TIMESTAMPTZ)` reading the legacy `sources_used` UUID[] union. Migration 089 introduced the `intelligence_item_citations` first-class edge table; per migration 089 header, the 088 RPC body migration to read from this edge table is "a separate consumer migration scheduled with the Build 8 (Research) and Tier 4 Build dispatches" — i.e., this dispatch. The data-integrity swap is the PRIMARY deliverable of 8.1; the citation-count display is a downstream consumer of the corrected data.

**Primary scope (data integrity)**:
- **Migration 095 (or next available)**: rewrite `get_source_citation_stats` body to read from `intelligence_item_citations` edge table instead of the legacy `intelligence_items.source_id OR sources_used @>` union. Citation_count becomes a COUNT over the edge table per source_id; recency becomes MAX(detected_at) per source_id.
- Verify backfill at `intelligence_item_citations` covers all historical citations (mig 089 backfill ran 2026-05-19 with origin='sources_used_backfill').
- Update `/api/agent/run/route.ts` to insert new agent-extraction rows into `intelligence_item_citations` (origin='agent_extraction') alongside the existing `source_citations` + `provisional_sources` writes — this closes the write path so the edge table receives new citations going forward.

**Secondary scope (display consumer; the credibility components already exist)**:
- The credibility component family (`CitationCountChip`, `RecencyChip`, `ProvenancePanel`, `BiasBadge`, `CredibilityBadge`, `JurisdictionChip`, `SignalStrength`) was built 2026-05-19 in commit `e0efe8a` as "Phase 1 shared component contract for Tier 4 surfaces" but is currently unmounted on any customer surface. Build 8 mounts `CitationCountChip` + `RecencyChip` on `PipelineRow`; full `ProvenancePanel` mount in 8.2/8.3.
- Extend `fetchResearchPipelineRows` to project per-source citation count via the corrected RPC.
- Extend `ResearchPipelineRow` type with `citationCount: number | null` + `lastCitedAt: string | null`.
- Render in `PipelineRow` card (treatment TBD per DECISION 8.1.D2: badge vs icon vs inline metric).

**Decisions for operator before execution**:
- **8.1.D1**: RPC-per-row (N+1 hazard) vs join-on-aggregate (single query, more SQL complexity). Recommendation: aggregate-side via SQL view or RPC that takes an array of source_ids; matches the slim payload pattern called out in `/map` cache headers.
- **8.1.D2**: UI treatment. Options: (a) numeric badge ("cited 7×"), (b) icon + count, (c) cumulative bar at row level, (d) only show when count >= threshold (e.g., 3). Recommendation: (b) for parity with stage chips; threshold-suppress at < 1 only.

**Fitness coverage**: F1 (sources tier columns) unaffected; F5 (briefs cite registered sources) gains a real customer-facing surface to validate against.

### Dispatch 8.2 — Tier rendering (base_tier + effective_tier)

**Why**: the operator's strongest discrimination signal is provenance; without tier badging, every source looks equal in the card grid.

**Scope**:
- Extend pipeline RPC projection to include `sources.base_tier, sources.effective_tier`.
- Extend `ResearchPipelineRow` type with `baseTier`, `effectiveTier` (typed against existing tier enum).
- Render tier on `PipelineRow` — DECISION 8.2.D1: badge color, position, hover detail.
- Sort/filter additions — DECISION 8.2.D2: should pipeline-tab gain a tier filter or remain stage-first?

**Decisions for operator**:
- **8.2.D1**: show effective_tier always, base_tier on hover? Or both inline? Recommendation: effective inline + base-tier diff indicator only when divergent (the case that ADR-002 was created to surface).
- **8.2.D2**: tier filter in the filter bar. Recommendation: yes, as a second-row pill set; preserves stage-first reading order.

**Fitness coverage**: F8 (client-server tier boundary) MUST gate any tier read introduced; the Q2 atomic refactor's docstring at `fsi-app/src/lib/trust.ts` is the read pattern to mirror.

### Dispatch 8.3 — Bias tag surfacing

**Why**: the operator's Build 8 framing names bias tag as a Q9 signal; without it the source-credibility surface is half-complete.

**Scope**:
- Extend pipeline RPC projection to include aggregated `source_bias_tags` (per dimension: funding, methodology, stakeholder).
- Extend `ResearchPipelineRow` with `biasTags: { dimension: string; severity: string }[]`.
- Render in `PipelineRow` — DECISION 8.3.D1: per-dimension chip stack vs single severity-max badge.
- Empty-state: hide bias section when array is empty (don't render a "no bias data" placeholder, per ADR-007's threshold design).

**Decisions for operator**:
- **8.3.D1**: per-dimension display vs aggregated severity. Recommendation: aggregated severity-max badge in the card, per-dimension breakdown in row-expanded detail (matches the chevron-toggle pattern already in PipelineRow).
- **8.3.D2**: linkage from bias chip to source detail (does Build 8 own a source-detail drawer, or defer to a follow-up?). Recommendation: no drawer in Build 8; chip is non-interactive read-only. Source-detail surface is its own future build.

**Fitness coverage**: no existing fitness function covers bias rendering; consider adding F10 (research-bias-rendering-respects-ADR-007) AFTER this dispatch lands, only if a follow-up commit re-introduces silent bias suppression. Premature fitness function risks ossifying a treatment we may want to evolve.

### Dispatch 8.4 — Recency decay grouping

**Why**: pipeline_stage groups by lifecycle state but not freshness. Operator scanning the list cannot quickly distinguish "new this week" from "stale".

**Scope**:
- Read `intelligence_items.added_date` (already projected) for current-row recency; optionally `intelligence_item_citations.detected_at` for citation recency.
- Add a "freshness" derived field on `ResearchPipelineRow`: `fresh | warming | established | stale` (thresholds per DECISION 8.4.D1).
- Render as a subtle color stripe on the left edge of PipelineRow, or a tertiary chip — DECISION 8.4.D2.
- Optional default sort: within stage, freshness DESC.

**Decisions for operator**:
- **8.4.D1**: bucket thresholds. Recommendation: fresh ≤ 7d, warming ≤ 30d, established ≤ 90d, stale > 90d. Match `/regulations` half-life conventions if they exist; otherwise adopt these as Build 8 defaults.
- **8.4.D2**: visual treatment. Recommendation: 4px left edge color stripe (subtle); avoids cluttering the chip area.

**Fitness coverage**: none new required; recency is a render-only concern with no schema mutation.

### Dispatch 8.5 — Coverage matrix wiring (RECOMMEND DEFER)

**Why deferred**: the per-(mode, region) source-registry rollup endpoint does not exist (per `ResearchView.tsx:21-24, 847`). Building it is its own infrastructure work — at least one new RPC, possibly a denormalized rollup table for performance. Bundling with Build 8 turns a Q9-signal-surfacing build into a registry-endpoint build.

**Recommendation**: keep stub coverage in place; create a dedicated dispatch (Build 8.5 OR a separate "Source registry coverage rollups" dispatch) after Build 8.1–8.4 land. Operator gating decision required.

## Sequencing + dependencies

| Order | Dispatch | Depends on | Parallelizable with |
|---|---|---|---|
| 1 | 8.1 Citation count | none | none (foundation) |
| 2 | 8.2 Tier rendering | none (independent of 8.1) | 8.3, 8.4 |
| 2 | 8.3 Bias tag | none | 8.2, 8.4 |
| 2 | 8.4 Recency | none | 8.2, 8.3 |
| (deferred) | 8.5 Coverage matrix | own infra build | — |

8.1 is sequenced first because its RPC body changes the row payload contract; the others all add fields to the same `ResearchPipelineRow` type and benefit from landing on top of the new contract rather than racing it.

8.2 / 8.3 / 8.4 can dispatch in parallel via worktree-isolated agents (per `feedback_parallel_by_default.md`); each touches the same RPC projection so the integration commit must be sequential. Recommended: dispatch 8.2 + 8.3 + 8.4 in parallel; main session integrates in a single commit.

## Value Delivery Check (per caros-ledge-platform-intent skill)

Operator-facing customer value of each dispatch:

| Dispatch | Customer value | Infrastructure cost | Verdict |
|---|---|---|---|
| 8.1 Citation count | Customer can see which research items are most-cited (proxy for influence). Closes a defer from migration 089. | One new RPC body + render. ~3-4 file changes. | VALUE-POSITIVE |
| 8.2 Tier rendering | Customer can rank sources by provenance + dynamic credibility at a glance. The strongest Q9 signal. | ~3 file changes; F8 gating. | VALUE-POSITIVE |
| 8.3 Bias tag | Customer can see where a source is funded/methodology-biased before consuming. Closes ADR-007 silent surface. | ~3 file changes; no new fitness function. | VALUE-POSITIVE |
| 8.4 Recency | Customer can scan freshness without doing date math. | ~2 file changes; pure render. | VALUE-POSITIVE |
| 8.5 Coverage matrix (deferred) | Customer sees per-(mode, region) source coverage. | New endpoint + rollup design. ~10+ file changes. | INFRA-FIRST; defer. |

Build 8 (1–4) is customer-facing value across every dispatch with proportionate cost. The 4-layer + 5a discipline floor that just landed absorbs the verification overhead.

## Out of scope (explicit)

- Source detail drawer (referenced from 8.3 but explicitly NOT in Build 8).
- Coverage matrix tab activation (deferred per 8.5).
- Sources tab population (current stub at `ResearchView.tsx:400-404`).
- Owner attribution field rendering (page.tsx:66 placeholder; preserved).
- Any change to `getResearchItems` (category-routed listings); Build 8 enhances the **pipeline** projection only.
- Migration 089's edge-table backfill (already complete; not revisited).
- ADR amendments; Build 8 inherits decisions, doesn't change them.

## Acceptance criteria (operator-verifiable)

A Build 8 sub-dispatch is complete when:

1. All discipline rules (1–15) pass on the merged commit.
2. The consistency runner (Layer 4) returns 0 drift on the resulting state.
3. F8 fitness function passes (for 8.2 specifically).
4. CI green; Vercel green on both `caros.ledge` and `carosledge` projects (per rule 015).
5. The operator can visit `/research` on the production deploy and observe the new signal rendered without manual reload.
6. Loop-closure entry appears in `docs/sprint-1/followups.md` (or active sprint's followups doc) covering the OBS that the dispatch addresses.

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| New RPC introduces N+1 queries on the index (8.1.D1) | Decision-point gating; aggregate-side query recommended |
| Bias tag rendering re-introduces silent suppression of important signals (the very thing ADR-007 protects against) | Test fixtures for the empty-state path; manual operator spot-check before merge |
| Tier read leaks server-only state to client (F8 violation) | F8 fitness function gates; review every new tier read against `trust.ts` docstring pattern |
| Layer 4 consistency check fails on inventory updates for new RPC | Each sub-dispatch updates `docs/inventories/routes.md` if new RPC exposed via Next route; rule 014 catches missing emission |
| Citation RPC body diverges from migration 089's declaration | Verification step in 8.1 includes RPC signature diff vs migration 089's header comment |
| Build 8.1's new payload field invalidates 60s pipeline cache without warning | Document in dispatch report; PERF-1 entry for `/research` may need TTL revisit if payload grows materially |

## Operator review checklist

Before any sub-dispatch executes, operator decides:

- [ ] Approve sub-dispatch order (8.1 first; 8.2/8.3/8.4 parallel).
- [ ] **DECISION 8.1.D1**: RPC-per-row vs aggregate-side. (recommendation: aggregate-side)
- [ ] **DECISION 8.1.D2**: citation-count UI treatment. (recommendation: icon + count, threshold-suppress at < 1)
- [ ] **DECISION 8.2.D1**: tier badge — effective inline + base diff on hover? (recommendation: yes)
- [ ] **DECISION 8.2.D2**: tier filter pill row. (recommendation: yes)
- [ ] **DECISION 8.3.D1**: per-dimension bias chips vs aggregated severity-max. (recommendation: aggregated badge in row, per-dimension in expanded detail)
- [ ] **DECISION 8.3.D2**: bias chip linkage to source detail. (recommendation: no drawer in Build 8)
- [ ] **DECISION 8.4.D1**: freshness thresholds 7d/30d/90d/stale. (recommendation: as-is)
- [ ] **DECISION 8.4.D2**: 4px left-edge color stripe vs tertiary chip. (recommendation: stripe)
- [ ] Confirm Build 8.5 deferral (or upgrade to in-scope).

After decisions land, the plan is updated in-place; the first sub-dispatch fires with `Plan-file: docs/plans/build-8-research-surface.md` trailer and `Coordination: 4 dispatches` (or 5 if 8.5 promoted).

## References

- Sprint Architecture (2026-05-20) + ADR System (Layer 3) + Layer 4 + Layer 5a (Post-push verification, ADR-010, this morning).
- Migration headers: `fsi-app/supabase/migrations/089_*.sql` (citation backfill + deferred RPC body), `090_*.sql` (tier split), `092_*.sql` (bias tags).
- `fsi-app/src/lib/trust.ts` — tier-read reference pattern (server-only).
- `fsi-app/src/lib/urgency.ts` — strict mapping library; relevant only if new item creators are introduced (out of scope).
- `caros-ledge-platform-intent` skill — Value Delivery Check pattern applied above.
- `sprint-followups-discipline` skill — every sub-dispatch loads + emits OBS coverage table.
- `remediation-discipline` skill — sub-dispatches that surface class-shaped issues during execution load this skill per rule 003.
