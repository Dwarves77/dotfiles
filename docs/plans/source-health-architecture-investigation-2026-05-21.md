# Source Health Architecture Investigation, Phase 5

**Date:** 2026-05-21
**Scope:** Read-only architecture investigation. No code changes. No recommendation.
**Context:** `docs/plans/dead-code-disposition-2026-05-21.md` (lines 141-152) flags `source_health_summary` view as architecturally ambiguous. The view exists, has no consumer, and `SourceHealthDashboard` reimplements the same rollup client-side. The source-credibility-model skill puts reliability at 20% of the trust score, which is one reason the operator asked to treat this as an architectural question rather than a delete-or-keep triage.

**Citations used throughout:**

- source-credibility-model skill: `fsi-app/.claude/skills/source-credibility-model/SKILL.md`
- View definitions: migrations `004_source_trust_framework.sql`, `043_security_advisor_fixes.sql`, `090_tier_schema_split.sql`
- Dashboard component: `fsi-app/src/components/sources/SourceHealthDashboard.tsx`
- Credibility primitives: `fsi-app/src/components/credibility/*.tsx` + `index.ts`
- Trust scoring: `fsi-app/src/lib/trust.ts` (reliability component at lines 176-198)
- Data loader: `fsi-app/src/lib/supabase-server.ts` (`fetchSourceData` at line 392, `fetchSources` at line 307)
- Phase 1.5 view note: `docs/sprint-2/Phase-1.5-consumer-migration-list.md` line 139

---

## Q1, Should `source_health_summary` become the canonical source-health data layer?

### Current state

The view, as recreated in migration 090, returns one row per (`base_tier`, `status`) pair with these columns:

```
base_tier, status, source_count, avg_trust_score,
active_count, stale_count, inaccessible_count, overdue_count
```

Definition: `GROUP BY s.base_tier, s.status FROM sources s`. The view is `SECURITY INVOKER` (migration 043) so the caller's RLS gates the read. The view selects from `sources` only; it does not join citations, trust events, or the citations edge tables.

Consumers in the repo: zero. A Grep across `fsi-app/src/` for `source_health_summary` returns exactly one match, a comment inside `SourceHealthDashboard.tsx` line 25 that documents the GROUP BY column choice. No API route, RPC, or component reads from the view.

What the dashboard does instead: `fetchSourceData(true)` at `src/app/admin/page.tsx:55` calls `fetchSources(includeAdminOnly=true)` which selects all source rows with the full `SOURCE_COLUMNS` projection (rows 277-305 in supabase-server.ts) and returns them. `AdminDashboard` hydrates `useSourceStore` from this list. `SourceHealthDashboard.TierSummaryCard` then filters by `s.base_tier === tier`, sums `s.trust_score.overall` per group, counts statuses (`active`, `stale`, `inaccessible`), and renders the rollup in the browser. The rollup is recomputed on every render via inline `.filter()` calls (no `useMemo` around the seven tier cards).

### Tradeoffs

**Option A, View becomes the canonical health data layer.** Add an RPC or direct view read to load aggregates server-side; consumers (admin dashboard, future customer-facing surfaces, future trust scoring batch) read the view. The dashboard would receive aggregates only, not the full source list.

- Consequence A1: Bandwidth and JSON-serialization cost drops from 796 source rows (`fetchSources` ships ~40 columns each) to ~30 aggregate rows (7 tiers x ~5 statuses). On the admin dashboard the source list IS still needed (registry tab), so the gain only applies if the view is consumed by additional surfaces.
- Consequence A2: The rollup becomes consistent across consumers. Today every consumer that needs aggregates must reimplement (none do, but per dead-code doc Phase 1.5 line 139, the view is flagged for base/effective decision).
- Consequence A3: The view does NOT carry citation-network signals, trust-event counts, recompute timing, override information, or `effective_tier`. It is a base_tier x status grouping over the static `sources` columns. If trust scoring or customer health surfaces want network or override signal, the view must be extended or a separate aggregator built.
- Consequence A4: View definition is single-axis (`base_tier`). Per Phase 1.5 line 139 it is flagged as NEEDS DECISION for base vs effective. The decision blocks adopting the view as canonical for customer-facing reads (which per skill Section 8 anti-patterns must consume `effective_tier`).

**Option B, View stays unused as documentation-only.** Today's state. `SourceHealthDashboard` and any future surface compute aggregates client-side from the full source list.

- Consequence B1: No bandwidth or single-source-of-truth gain. Every new consumer must reimplement the rollup or fetch the full source list.
- Consequence B2: Per skill Section 9 anti-patterns: "Reading `sources.tier` directly when the consumer wants the dynamic value" produces stale signal. Today the dashboard reads `s.base_tier` (intentionally, per the inline Phase 1.5 comment, because the admin registry view is the structural-classification surface). But the rollup ALSO sums `s.trust_score.overall` which is the cached composite that the daily Q7 batch updates, not the dynamic citation-network signal. Two different freshness models coexist in one component.
- Consequence B3: Migration 090 spent migration-budget recreating the view explicitly so it would survive the column rename. Migration 043 spent migration-budget making it SECURITY INVOKER. Both investments are sunk if the view is never read.

**Option C, Drop the view.** Remove from the schema in a new migration. Future health-aggregation needs build a fresh RPC.

- Consequence C1: Fewer dangling schema objects; aligns with the Category E cleanup pattern.
- Consequence C2: Re-introduction cost if customer-facing health surfaces ship in Build 11 (Dashboard aggregates per skill Section 8 row). Per skill Section 8 the Dashboard surface is explicitly listed as "aggregates across surfaces"; that build is the most likely consumer of an aggregator.
- Consequence C3: Lose the SECURITY INVOKER and Phase 1.5 base-vs-effective work already done. New work would have to reproduce both.

### Coupling

| Option | What touches |
|---|---|
| A (canonical) | New RPC or direct view read; `fetchSourceData` augmented or replaced; admin page server fetch; potentially a customer-facing dashboard endpoint; Q7 daily batch (if batch consumes aggregate); `Phase-1.5-consumer-migration-list.md` line 139 base/effective decision must resolve first |
| B (status quo) | Nothing changes; documentation gap remains in Phase 1.5 list |
| C (drop) | New migration `099_drop_source_health_summary.sql`; update `Phase-1.5-consumer-migration-list.md`; the comment in `SourceHealthDashboard.tsx:25` becomes stale |

### Reversibility

- A -> B/C: Trivial. Stop consuming the view; aggregator code stays as dead code or gets deleted.
- B -> A: Low cost. Wire one read site; view already exists.
- B -> C: Low cost. One new migration.
- C -> A: Highest cost. Recreate view AND SECURITY INVOKER AND Phase 1.5 base/effective resolution AND wire consumer.

---

## Q2, Should source health become a customer-facing signal?

### Current state

Health is internal-only today.

- `SourceHealthDashboard` is mounted only at `/admin` under the "Source registry Tab" (AdminDashboard.tsx:531). The page is gated by `requirePlatformAdmin` (admin page line 14).
- `trust_score_overall` (cached on the sources row) feeds the daily Q7 batch via `src/lib/trust.ts` `computeReliabilityComponent` (lines 176-198). Reliability is computed from `accessibility_rate` (which is `successful_checks / total_checks`) and contributes 0-20 points to the 0-100 composite trust score. The composite is then cached in `trust_score_overall`.
- The customer-facing tier rendering (CredibilityBadge) reads `tier` only; it does not render trust score, accessibility rate, or status. The Q9 signal sets in skill Section 8 do not list "health" as a per-surface signal. The listed signals are tier, jurisdiction, binding status, bias tag, citation count, recency, signal-strength, applicability, author-identity, workspace-verification.
- The data shape carried into Source.trust_metrics (status, accessibility_rate, last_accessible, consecutive_accessible, total_checks, successful_checks) is shipped to every consumer that calls `fetchSources` regardless of whether they render it. ProvenancePanel does NOT render any of these fields today; it composes tier + bias + citation count + recency only.

### Tradeoffs

**Option A, Health becomes a customer-facing signal on all five intelligence surfaces.** Add a health indicator to every brief's source provenance.

- Consequence A1: Per skill Section 2, the credibility signal customers and agents see by default is `effective_tier`. Adding a separate health signal alongside tier introduces a SECOND credibility axis customers must interpret. The skill does not currently sanction this. Section 8's signal-set asymmetry is deliberate; adding health uniformly would flatten it.
- Consequence A2: Health information includes operational status (stale, inaccessible, suspended). Surfacing "stale" on a customer-facing brief implies the brief itself may be stale. The brief is a snapshot at generation time; source-stale-ness is a separate axis from brief-stale-ness. The two can be conflated unless the chip wording is precise.
- Consequence A3: Reliability is ALREADY incorporated into the trust score, and trust_score will be implicitly incorporated into `effective_tier` via the Q7 batch (skill Section 4: weighted citation sum decays + tier weights). Showing health AND tier means showing the same signal twice, decomposed differently. Per skill Section 9 anti-patterns this risks "treating tier as fully static" inversely; customers see a fresh-tier number while ALSO seeing a stale-status flag and have to reconcile.
- Consequence A4: Customer trust surface invariants in skill Section 8: tier vocabulary is consistent across surfaces; customers learn it once. A new health axis means another vocabulary to learn.

**Option B, Health becomes a signal on a subset of surfaces only (e.g., Operations + Research where source freshness is operationally load-bearing).** Per-surface asymmetry already exists in Q9; this would extend the per-surface signal sets.

- Consequence B1: Justifiable on Operations (a "source inaccessible" signal is a real operational risk for a compliance interpretation) and on Research (a "source last checked 6 months ago" is a real research-recency signal distinct from the publish date). Less clear on Market Intel, Map, Regulations, Community.
- Consequence B2: Per-surface implementation is build-dispatch scope per skill Section 8 ("Per-surface implementation is build-dispatch scope"). This option defers to Build 7 (Market Intel), Build 8 (Research), Build 9 (Operations) decisions.
- Consequence B3: Section 8 currently lists fixed signal sets per surface. Extending requires the skill to list health on the chosen surfaces or to be amended. Silent addition would violate the "vocabulary consistency" invariant.

**Option C, Health stays internal-only.** Today's state. Health surfaces only on the admin SourceHealthDashboard. Customer-facing credibility is mediated through tier and provenance fields only.

- Consequence C1: Tier already incorporates reliability indirectly via trust_score -> effective_tier composition. Customers receive the integrated signal without the decomposition.
- Consequence C2: Operator retains discretion to intervene before health degradation reaches customers (the candidate review queue + override mechanism + admin paused toggle all live on the operator side).
- Consequence C3: A genuinely stale or inaccessible source today causes no customer-facing warning. If a brief was generated 8 months ago from a source that has been inaccessible for 6 months, the customer reading the brief today gets no indication. The operator must catch the source-health degradation and either re-run, archive the brief, or pause the source.

**Option D, Health surfaces on a separate operator-only product (status page, source-health digest email).** Not customer-facing on intelligence surfaces; surfaced as a separate workspace-internal report.

- Consequence D1: Preserves Section 8 invariants entirely. Health becomes operator-tooling, not customer-credibility.
- Consequence D2: Builds on Dashboard surface (skill Section 8 "Build 11 Dashboard: aggregates across surfaces") which is the natural home for cross-surface aggregates.

### Coupling

| Option | What touches |
|---|---|
| A | Every customer-facing surface (Regulations, Research, Market Intel, Operations, Map, Assistant); CredibilityBadge or ProvenancePanel extended; source-credibility-model skill Section 8 amended; new chip OR badge variant |
| B | Operations + Research surfaces (Build 8, Build 9); ProvenancePanel extended on those surfaces; skill Section 8 amended for those rows |
| C | Nothing |
| D | Build 11 Dashboard; existing admin SourceHealthDashboard; no skill amendment; new operator surface only |

### Reversibility

- A -> C: Removing customer-facing chip means a customer-visible regression. Once a credibility vocabulary is learned, removing a signal is more disruptive than not introducing it.
- B -> C: Same as A but smaller blast radius (one or two surfaces).
- C -> A or B: Net-add, customer-side. No regression.
- C -> D: Net-add, operator-side. No customer impact.
- D -> A or B: Net-add forward. No regression.

---

## Q3, If health becomes customer-facing, new `HealthIndicator` chip OR extend `CredibilityBadge` / `ProvenancePanel`?

### Current state

`HealthIndicator` does NOT exist. A Grep across the repo confirms: zero files match the symbol. The dead-code disposition doc is the only reference, and it is a hypothetical.

The existing chip suite (all in `fsi-app/src/components/credibility/`):

| Component | Renders | API contract | Mount points (per file docs) | Suppress-on-null behavior |
|---|---|---|---|---|
| `CredibilityBadge` | T1-T7 pill + optional canonical label | `{ tier: number\|null, size?, showLabel? }` | All seven surfaces per Q9 | Renders "n/a" placeholder pill on null/invalid tier (does NOT suppress) |
| `BiasBadge` | Bias tag chips grouped by 3 dimensions | `{ tags: BiasTag[], layout? }` | Research, Operations, Assistant provenance | Empty array renders nothing |
| `CitationCountChip` | Count + optional inline recency | `{ count, recency?, sourceId?, expandable?, onExpand? }` | Research primary, Operations + Assistant secondary | Count 0 or negative renders nothing |
| `RecencyChip` | Relative time ("3 days ago") | `{ timestamp: string\|Date\|null, size? }` | Research, Market Intel primary, Provenance secondary | Null renders nothing |
| `JurisdictionChip` | Jurisdiction code + label | `{ jurisdiction, label?, showLabel?, size? }` | Regulations, Operations, Map | Null renders nothing |
| `SignalStrength` | 5-step severity indicator | `{ strength: critical\|high\|moderate\|low\|monitoring, size? }` | Market Intel primary | Required prop, no suppress |
| `ProvenancePanel` | Composes all above on click-to-expand | `{ source: ProvenanceSource }` | Click-out from CitationCountChip, source-badge expansion | Renders header only when ancillary signals absent |

Chip contract pattern: every chip except CredibilityBadge and SignalStrength suppresses when its signal is null/zero. CredibilityBadge renders "n/a" because tier-unknown is itself a signal worth showing in a credibility surface. ProvenancePanel composes whichever signals are present and silences sections that are absent (the file documents: "silence is more informative than a placeholder for a credibility surface").

Trust-score data already on the Source object (per `fsi-app/src/types/source.ts` line 540 onwards): `base_tier`, `effective_tier`, `trust_score.overall`, `trust_metrics.accessibility_rate`, `trust_metrics.last_accessible`, `status`. None are wired into customer-facing chip components today.

### Tradeoffs

**Option A, New `HealthIndicator` chip.**

- Consequence A1: Symmetric with the existing chip suite (each chip handles one signal). Composes into ProvenancePanel via the existing pattern.
- Consequence A2: Adds a new visual vocabulary element to the customer-facing credibility system. Per skill Section 8 "vocabulary consistency" invariant, this needs explicit skill amendment to land cleanly.
- Consequence A3: Symbol naming clash with operator-facing health concept on admin (where "health" already means accessibility status). The customer-facing health chip would need clearer naming or scoping.
- Consequence A4: Surface mount points must be decided (Q2 Option choice). Skill Section 8 signal-set table currently does not list health on any row.

**Option B, Extend `CredibilityBadge` to surface health alongside tier.**

- Consequence B1: Per CredibilityBadge file docstring: "Stable contract: do NOT add coupling to stores, routing, or click handlers." Adding health visualization to the badge violates the data-shape-pure principle (badge today takes `tier` only; would now need source health input).
- Consequence B2: The badge IS rendered on every credibility surface (Q9 listed all 7 surfaces). Health-on-badge means health appears everywhere, equivalent to Q2 Option A's blast radius.
- Consequence B3: Customers today read tier as "how authoritative is this kind of source." Adding a health overlay (e.g., color shift, secondary dot, status edge) changes the badge's meaning to "tier AND freshness." Mental-model shift for existing users.

**Option C, Extend `ProvenancePanel` to render health when expanded (no chip change).**

- Consequence C1: Per ProvenancePanel docstring: "panel decides what to render based on which fields are populated. Missing fields render nothing." Health fits the existing extension pattern.
- Consequence C2: Health is only visible on click-to-expand, not at-a-glance. Customers who do not expand never see the signal. Per DP-1 (single-pane operator review, also cited in panel docstring) this is consistent with progressive disclosure.
- Consequence C3: Q2 Option D (operator-only) interacts: if health stays operator-only, ProvenancePanel extension is moot. If health is customer-facing-but-on-expand, panel extension is the path of least visual disruption.
- Consequence C4: Does not require a new component; reuses panel infrastructure.

**Option D, Hybrid: chip on Operations only (where freshness is load-bearing), panel section everywhere else.**

- Consequence D1: Matches Q2 Option B per-surface asymmetry. Operations gets the at-a-glance signal where it matters; other surfaces get the on-expand detail.
- Consequence D2: Most code surface to ship (new chip + panel extension + per-surface decision tracking).

### Coupling

| Option | What touches |
|---|---|
| A | New file `fsi-app/src/components/credibility/HealthIndicator.tsx`; `index.ts` export; ProvenancePanel composition; per-surface mount; skill Section 8 amendment |
| B | `CredibilityBadge.tsx` API breaking change (new optional prop); every consumer that imports CredibilityBadge; type changes ripple |
| C | `ProvenancePanel.tsx` extension; `ProvenanceSource` type extended with health fields; no new chip |
| D | All of A + C plus per-surface scoping documentation |

### Reversibility

- A -> remove: Single file delete + index update. Low cost if the chip never lands on production surfaces; high cost once mounted (customer-visible removal).
- B -> revert: Touches every CredibilityBadge consumer. Highest reversibility cost.
- C -> revert: Conditional rendering can be turned off via prop default; lowest reversibility cost.
- D -> revert: A + C reversibility costs combined.

### How each chip-suite invariant binds

- Chip suppress-on-null contract (per RecencyChip, CitationCountChip, JurisdictionChip, BiasBadge): Option A and Option D require the new HealthIndicator to define what "null health" means. A source with `total_checks < 3` already returns 50% reliability default (per `trust.ts` line 184). The chip would need to either suppress on insufficient data OR render a neutral state distinct from "actively healthy."
- Section 8 vocabulary consistency: any option that mounts on multiple surfaces (A, B, D) requires the chip render identically per surface. Option C (panel-only) leverages the panel's progressive disclosure pattern and does not introduce a new chip vocabulary.
- DP-1 single-pane review (called out in ProvenancePanel docstring): all options preserve this by routing detailed inspection through ProvenancePanel.

---

## Q4, Does `SourceHealthDashboard` need refactoring to consume the view (if kept) instead of computing client-side?

### Current state

The full client-side rollup (in `fsi-app/src/components/sources/SourceHealthDashboard.tsx`):

- `TierSummaryCard` (lines 22-88): for each tier 1-7, filters `sources.filter((s) => s.base_tier === tier)`, then derives:
  - `tierSources.length` (source_count)
  - `active`, `stale`, `inaccessible` counts via three separate `.filter().length` passes
  - `avgTrust` via `reduce((sum, s) => sum + s.trust_score.overall, 0) / length`
  - Inline tier progress bar driven by `avgTrust`
- `SourceHealthDashboard` (lines 283-521): reads the full `sources` list from `useSourceStore`, computes `overdueSources` via `useMemo` (line 295-298), and counts per `viewTabs` entry (line 300-307). Rollup is rebuilt on every render for tier cards (no useMemo wrapper). For 796 sources x 7 tiers x 4 status filters that is ~22k iterations per render but operationally cheap on this dataset size.
- Data hydration: `fetchSourceData(true)` in `src/app/admin/page.tsx:55` fetches 796 rows with ~40 columns each (the full `SOURCE_COLUMNS` projection). The hydration happens on every admin page load.

### What the view DOES return that matches the dashboard rollup

- `source_count` per (base_tier, status) -> map to TierSummaryCard's `tierSources.length` (when summed across statuses per tier)
- `avg_trust_score` per (base_tier, status) -> map to TierSummaryCard's `avgTrust` (weighted-avg required if summed across statuses)
- `active_count`, `stale_count`, `inaccessible_count` -> map to TierSummaryCard's per-status counts directly
- `overdue_count` per (base_tier, status) -> map to top-level `overdueSources.length` (when summed)

### What the view does NOT return

- `provisionalSources` (count and content) -> dashboard reads from `useSourceStore.provisionalSources` (separate fetch via `fetchProvisionalSources` at line 325)
- `openConflicts` (count and content) -> dashboard reads from `useSourceStore.openConflicts` (separate fetch via `fetchOpenConflicts`)
- Full source rows (id, name, url, description, domains, jurisdictions, paywalled, access_method, last_checked, etc.) needed by `SourceRow` and `MetricBox`
- `processing_paused`, `admin_only` flags used by `SourceRowControls` (lines 248-255)
- Status filter `suspended` (not aggregated in view; only active/stale/inaccessible counts)
- `effective_tier` view is grouped by `base_tier`, not `effective_tier`; per Phase 1.5 line 139 this is NEEDS DECISION

### Tradeoffs

**Option A, Refactor dashboard to consume view for aggregates, keep full row fetch for registry tab.**

- Consequence A1: Two queries instead of one. The view query is cheap (server-aggregated, ~30 rows max). The full row query is needed regardless for the Registry tab's SourceRow rendering. Net cost is one additional roundtrip.
- Consequence A2: TierSummaryCard becomes prop-driven from aggregates instead of derived from full sources list. Clearer separation between aggregator-data and detail-data.
- Consequence A3: Race condition: if the view and the full source query return values from different transactions, the totals may disagree visually (aggregate row count differs from filtered list length). Mitigation: server-side read with the same Supabase client returns consistent snapshot reads within a single function call.
- Consequence A4: View read happens server-side in admin page loader OR client-side in dashboard. If server-side: aggregate joins the existing `Promise.all` in admin/page.tsx. If client-side: aggregate fetches on mount or via SWR/React Query (which is not in the project; `fetchSourceData` is server-fetched today).
- Consequence A5: Refresh cadence implication: today's dashboard re-renders aggregates instantly when `setSources` is called (e.g., after an admin action). View aggregates would lag until the view is re-queried. Need explicit re-fetch on mutation OR keep client-side rollup as a fallback. Per Caro's Ledge admin UX today, post-action refresh is via full page reload not optimistic updates (per `SourceHealthDashboard.handleProvisionalAction` line 288-291 which mutates local store only). View-driven aggregates would need either an explicit invalidate or stay on the full-row-derived rollup for action freshness.

**Option B, Keep client-side rollup; leave view unused.**

- Consequence B1: No code changes. Current behavior preserved.
- Consequence B2: The view continues to exist as schema clutter. Phase 1.5 base/effective decision remains open.
- Consequence B3: Q1 Option B/C interactions: if Q1 chooses drop, this question is moot. If Q1 chooses canonical, this Q4 decides whether the admin dashboard is among the consumers.

**Option C, Refactor dashboard AND eliminate the full-source-row fetch in favor of paginated registry tab.**

- Consequence C1: Largest scope. Touches `fetchSourceData`, the admin page loader, the source store contract, the Registry tab pagination behavior, possibly the filtering logic in `filterSources` (sourceStore.ts line 102) which today filters in-memory.
- Consequence C2: Genuine bandwidth reduction. 796 source rows go away by default; admin pulls only the active tier card aggregates + the visible registry page.
- Consequence C3: Search behavior changes from client-side `.toLowerCase().includes()` to server-side ILIKE. Subtle UX shift.

### Calculations that move to view (Option A or C)

| Calculation | Today (client) | View provides | Migration delta |
|---|---|---|---|
| Per-tier source_count | `sources.filter(s => s.base_tier === tier).length` | `SUM(source_count) GROUP BY base_tier` (need to sum across statuses or filter) | View groups by (tier, status); needs `SUM(source_count) WHERE base_tier = X` |
| Per-tier active/stale/inaccessible | `.filter(s.status === 'X').length` | Direct via active_count etc. | Same column, simpler to read |
| Per-tier avg trust score | `reduce(s.trust_score.overall, 0) / n` | `avg_trust_score` per (tier, status) | Weighted-avg required to combine across statuses |
| Overdue count | `sources.filter(next_scheduled_check < now)` | `overdue_count` per (tier, status) | Sum across all (tier, status) |
| Provisional pending count | `provisionalSources.filter(status === 'pending_review').length` | NOT in view | Stays client-side OR a separate aggregator view |
| Conflicts count | `openConflicts.length` | NOT in view | Stays client-side OR a separate aggregator view |
| Per-row metrics (MetricBox at line 196-215) | All per-source from full row | NOT in view | Stays client-side (per-source rendering needs row data) |
| Admin row controls (pause/admin_only) | Full row | NOT in view | Stays client-side |

### Coupling

| Option | What touches |
|---|---|
| A | `SourceHealthDashboard.tsx` TierSummaryCard signature; `AdminDashboard.tsx` initial-data plumbing; `src/app/admin/page.tsx` loader; possibly new helper in `supabase-server.ts`; Phase 1.5 base/effective decision |
| B | Nothing |
| C | All of A plus `fetchSourceData`, sourceStore, Registry tab pagination, search behavior, filterSources |

### Reversibility

- A -> B: Revert one or two files. Low cost.
- A -> C: Net-add forward. Already partway there.
- B -> A or C: Same as the original migration.
- C -> A or B: Reverting paginated registry to full-row-fetch is bandwidth regression but functionally reversible.

### Race conditions, caching, refresh

- Today: server-fetched on page load; client re-renders driven by `useSourceStore` mutations from in-page admin actions; no refresh cadence beyond page reload.
- Option A: Adds a second server fetch. Both reads from the same Supabase client in `Promise.all` are consistent (snapshot reads within the same connection). Subsequent in-page mutations break view aggregate freshness unless explicit invalidate or stay-on-client-rollup for tile counts.
- Option C: Same as A plus paginated reads each have their own snapshot; counts and visible rows could disagree across separate fetches.

---

## OPERATOR DECISION MATRIX

| Question | Option A | Option B | Option C | Option D | Coupling (heaviest option) | Reversibility (most permanent option) |
|---|---|---|---|---|---|---|
| Q1, View as canonical health data layer | Adopt: new RPC or direct view read; aggregator consumed by dashboard + future customer surfaces + trust scoring | Status quo: view exists unused; client-side rollups everywhere | Drop: new migration removes view; future health aggregation builds fresh | (n/a) | A touches RPC/view, admin loader, customer surfaces, Phase 1.5 decision | A high once consumers ship; C requires recreate + SECURITY INVOKER + Phase 1.5 work to reverse |
| Q2, Health as customer-facing signal | All surfaces: every Q9 row gets a health signal | Subset: Operations + Research only (operationally load-bearing) | Internal-only: status quo, health stays on admin dashboard | Separate operator product: status page or digest, not on intelligence surfaces | A touches every customer surface + skill Section 8 amendment | A and B create customer-visible vocabulary; removal is regression |
| Q3, Chip vs panel extension | New `HealthIndicator` chip in credibility suite | Extend `CredibilityBadge` API (add health prop) | Extend `ProvenancePanel` only (on-expand) | Hybrid: chip on Operations, panel everywhere else | B touches every CredibilityBadge consumer (widest blast radius); D combines A and C scope | B revert touches widest consumer set; C revert is single file |
| Q4, Refactor SourceHealthDashboard to consume view | Refactor for aggregates; keep full row fetch for registry tab | Status quo: client-side rollup, view stays unused | Refactor AND paginate registry: largest scope, drops the 796-row default fetch | (n/a) | C touches fetchSourceData, sourceStore, filterSources, search behavior | A reverts in one or two files; C is paginated-registry rework |

---

## OPEN ITEMS (not in original four questions)

1. **Phase 1.5 base/effective decision blocks Q1 Option A.** `docs/sprint-2/Phase-1.5-consumer-migration-list.md` line 139 records `source_health_summary` as NEEDS DECISION for `s.base_tier` vs `s.effective_tier` GROUP BY. Per skill Section 9 anti-patterns, customer-facing consumers must read `effective_tier`. The view today groups by `base_tier`. Adopting the view as canonical for any customer-facing read requires resolving this first (either swap to `effective_tier` in a new migration or accept structural-classification semantics for customer reads, which would itself violate Section 9 anti-pattern "Treating tier as fully static when network signals exist").

2. **Trust score composition currently bypasses the view.** `trust.ts:computeReliabilityComponent` (lines 176-198) operates per-source on `metrics.accessibility_rate` and feeds the per-source `trust_score_overall`. The view aggregates `avg_trust_score` but does NOT participate in the per-source composition. Even if Q1 Option A lands, the view does not become canonical for trust scoring; it would still only be a read-side aggregator. Surface as: trust scoring runs at the per-source level via the trust.ts compute, view stays a presentation-aggregator.

3. **`SourceProvenanceBadge` predecessor migration is incomplete.** `CredibilityBadge` docstring (line 16-19) says it "Replaces (going forward) the consumer-side use of `SourceProvenanceBadge`." A repo Glob returns no matches for `SourceProvenanceBadge*` files. Either the migration is complete and the legacy reference can be deleted from the docstring, or the file was moved/renamed and the reference is stale. Surfacing as a doc cleanup follow-up; outside Phase 5 scope.

4. **Source row contains `status: 'suspended'` state but view does not aggregate it.** Sources table CHECK constraint allows `('active', 'stale', 'inaccessible', 'provisional', 'suspended')` per migration 004 line 50. The view aggregates active, stale, inaccessible only. Suspended sources are counted in `source_count` (the GROUP BY includes status as a row dimension) but a Suspended row will appear as its own (tier, status) group rather than contributing to any of the three named counts. If the view becomes canonical, the omission needs explicit handling per consumer.

5. **No view aggregator exists for provisional_sources OR open_conflicts.** Today's dashboard counts these as tab badges (line 303, 306) via `useSourceStore.provisionalSources.filter(...)` and `.openConflicts.length`. If Q1 Option A is chosen, these tab badges would still need client-side rollup OR new aggregator views per category. Q1 Option A is partial coverage of the dashboard's aggregation needs.

6. **Dashboard counts use `processing_paused` and `admin_only` from source rows (lines 240-245, 250-254).** Neither is in the view. The dashboard cannot consume the view for the row-level operational controls; the full source row fetch must remain for the Registry tab and SourceRowControls regardless of Q1/Q4 decision.

7. **Section 8 of skill says "Build 11 Dashboard: aggregates across surfaces."** This is the most likely future home for any customer-facing health surface (Q2 Option D maps onto this naturally). Surfacing as: if Build 11 is the natural home, the Q1 view-as-canonical question may be partially decided by Build 11 scope. Worth verifying whether Build 11 dispatch will need source-health aggregates.

8. **`accessibility_rate < 0.5` already triggers a `chronic_inaccessibility` operational rule per Source type line 425.** This rule is operator-facing only today. If customer-facing health is adopted (Q2 A/B/D), the same threshold could drive customer-visible health states. Surface as: aligning customer-visible health states with the existing operational thresholds avoids two health vocabularies.

9. **Trust score cache freshness is not surfaced.** `trust_score_computed_at` exists on the sources row but no UI renders it. If health becomes customer-facing (Q2 A/B), customers may legitimately ask "as of when?" The recompute cadence (daily Q7 batch per skill Section 4) needs documentation if surfaced.

10. **The dashboard's tier-summary `avgTrust` uses `s.trust_score.overall` (the composite) NOT `s.trust_metrics.accessibility_rate` (the reliability input).** If health is conceptually "reliability component of trust score" per the operator framing in the dead-code doc, the dashboard is currently rendering the COMPOSITE not the reliability component. Two different signals are being conflated. Surface as: define which signal is "health" before deciding Q1-Q4.

## Related

- [dead-code-disposition-2026-05-21](./dead-code-disposition-2026-05-21.md) — Phase 5 investigation this report's open-questions section (lines 141-152) spawned
- [category-e-investigation-2026-05-21](./category-e-investigation-2026-05-21.md) — Sibling Phase 5 investigation spawned by the same disposition report's open-questions section
- [ADR-002-tier-model](../decisions/ADR-002-tier-model.md) — The base_tier-vs-effective_tier decision blocking Q1 is governed by the tier model ADR
