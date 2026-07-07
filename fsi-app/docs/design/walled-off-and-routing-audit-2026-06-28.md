# Architecture audit — walled-off code + mis-routed writes (2026-06-28)

READ-ONLY diagnostic. Produces a MAP; no fixes applied. Two complementary audits:
- **Audit A — walled-off** (output → no reader): a computed/stored value or subsystem nothing consumes.
- **Audit B — mis-routed writes** (writer → wrong target → reader starves): writer writes column/table A,
  reader reads B. Silent (no error; reader gets stale/default). The dead-code sweep can't see these.

Seed defect (proven): the convergence engine's `effective_tier` + the q7 cron. Hypothesis: the pattern repeats.
It does — Audit B found a second live instance. Fixes are deferred to a later pass.

> **De-noising note.** Sub-agent sweeps used mechanical grep and produced false positives where calls are
> INDIRECT. Confirmed example: the `get_market_intel_items / get_research_items / get_operations_items /
> get_technology_items / get_workspace_intelligence_*` RPCs were flagged "0 callers" but are LIVE — invoked via
> `runCategoryRpc(orgId, "<name>")` in `src/lib/supabase-server.ts:1121+` and the `/market`,`/operations`,
> `/research` pages. Treat any "walled RPC" claim as needs-confirm. Items below are the de-noised set.

---

## THE LINCHPIN — convergence engine (q7) is inert + mis-routed (confirmed with data)

- `vercel.json` schedules `/api/admin/q7-daily-recompute` nightly (`0 2 * * *`) — real recurring compute: it
  pages all 1,185 sources and computes a tier-weighted decayed citation sum per source every night.
- It writes the result with `.update({ tier: ... })` ([route.ts:162](../../src/app/api/admin/q7-daily-recompute/route.ts#L162)) — the **legacy `tier` column**, which migration 094's trigger syncs to **`base_tier`**. It never writes `effective_tier` (the comment at :150-151 flags it as an unfinished migration).
- Data check (live): of 1,185 sources, `effective_tier` is NULL on 314, `== base_tier` on 845, **diverges on only 26** (from an older path). `tier != base_tier` on 0. **q7-cron tier-change events (created_by=worker): 0 — the cron has never changed a single tier.**
- **Verdict:** the convergence engine is **walled-off scheduled compute** — nightly cost, zero effect, and even on the day it fires it would mutate `base_tier` (the moat/claim-stamp path), not `effective_tier`. The `effective_tier` *field* is BOUNDED (read by Ask Assistant, classifier, sourceStore, dashboard; 26 live divergences from an older write), but the *engine that should maintain it* is both inert (threshold never trips) and aimed at the wrong column. No `base_tier` leak has fired yet only because nothing has crossed the promotion threshold.

---

## AUDIT A — WALLED-OFF (output nobody reads)

### A1. Whole dead library modules (high confidence — grep: zero importers app-wide)
| Module | What it is | Note |
|---|---|---|
| `src/lib/format.ts` (formatDate/formatTimelineDate/getQuarter) | date helpers | never imported |
| `src/lib/sources/instrument-identity.ts` (whole module) | EU ELI/CELEX instrument parser/classifier | never called |
| `src/lib/briefing/systemPrompt.ts` (buildBriefingSystemPrompt) | briefing prompt builder | never called |
| `src/lib/agent/source-pool.ts` (buildSourcePool) | per-item pool builder | **CONFIRMED retired** (CLAUDE.md lists it superseded by canonical-pipeline) |
| `src/lib/hooks/useCommunityPostsRealtime.ts`, `useCommunityNotificationsRealtime.ts` | realtime hooks | never mounted |
| `src/lib/agent/extract-research-sections.ts` (extractResearchSections) | research extractor | never wired into the pipeline |
| `src/lib/agent/section-validator.ts` (auditSections) | section auditor | never wired into generation |

NEEDS-CONFIRM (within `src/lib/trust.ts` — agent over-flagged; some have internal callers):
- Genuinely uncalled: `evaluatePromotion`, `evaluateDemotion`, `evaluateProvisionalSource`, `computeConflictResolutionImpact`. `computeCitationComponentFromRows` (selftest only).
- NOT walled (internal callers): `computeEarnedScore`, `tierPrior`, `evaluateCandidatePromotion` (called by `recomputeEffectiveTier`). Re-verify before any deletion.
- (`generateBriefRefreshPrimary` is THIS SESSION'S uncommitted WS1 Path B fn — pending wire, not dead.)

### A2. Unmounted UI — a whole swath of built-but-never-rendered components (high confidence)
Two sub-classes:
- **Superseded by the 5-surface model** (the original FSI 3-tab `.jsx` spec, replaced): `TabBar`, `ExportBuilder`,
  `explore/FilterBar`, `explore/SearchBar`, `explore/SortSelector`, `domains/FacilityOptimization`,
  `domains/RegionalIntelligence`, `domains/TechnologyTracker`, `home/DueThisQuarter` (note: a `showDueThisQuarter`
  settings toggle exists but renders no component — dead setting), `resource/ResourceCard`, `resource/ResourceDetail`.
- **Recently-built, orphaned** (never wired to their surface): `market/FreightRelevanceCallout`, `market/KeyMetricsRow`,
  `market/OwnersContent`, `market/PolicySignals`, `market/WatchlistSidebar`, `credibility/JurisdictionChip`,
  `credibility/ProvenancePanel`, `community/NotificationPreferencesPanel`, `shell/StatStrip`, `ui/UrgencyFilterBar`, `ui/PageContext`.

(Corrected by the agent itself: `SourceAdminControls`, `community/GroupModals` ARE used — false positives.)
Product call needed: superseded → delete; orphaned-recent → wire or delete. Map only; no action here.

### A3. Walled-off API routes (built, no caller / no schedule)
`/api/admin/sources/discover`, `/api/admin/sources/verify`, `/api/admin/sources/recently-auto-approved`,
`/api/notifications/trigger`, `/api/worker/reconcile` (comment says "reconcile-loop activation" but no cron wires it).
(Corrected: `/api/admin/recompute-trust` IS wired — `.github/workflows/trust-recompute.yml`, monthly.)

### A4. Walled-off data (tables / columns)
| Item | Status | Note |
|---|---|---|
| 8 legacy FSI tables: `resources`,`briefings`,`changelog`,`cross_references`,`disputes`,`source_registry`,`supersessions`,`timelines` | DEAD | the entire original 001_schema, superseded by `intelligence_items`/`sources`; zero `.from()` |
| `intelligence_summaries` (2,325 rows) | SHELVED | SectorSynopsisView reads `full_brief`, not these rows (CLAUDE.md: shelve-not-retire) |
| `theme_candidate` (intelligence_items) | WRITE-ONLY | written at synth; no reader (Emergence-Capture follow-on not built) |
| `trust_score_accuracy / timeliness / reliability / computed_at` (sources) | WRITE-ONLY | written monthly by recompute-trust; **zero readers** = wasted monthly compute |
| `trust_score_overall` (sources) | ~WRITE-ONLY | only reader is the RETIRED `source-pool.ts` → effectively unread |
| `intelligence_items_domain_backfill_audit`, `org_watchlist` | DEAD/write-only | audit-only / unused |
| `intelligence_item_citations` (edge table) | READER-STARVED | see Audit B #2 — RPC reads it, writer never populates it |

---

## AUDIT B — MIS-ROUTED WRITES (silent; reader starves)

### #1 — q7 → `tier` vs readers → `effective_tier`  (CRITICAL, confirmed; currently inert)
Writer: q7 cron `.update({ tier })`. Readers: `effective_tier` (institution resolver, trust.ts, source-growth, Ask, classifier, dashboard). Cause: migration 090 (tier→base_tier + new effective_tier) + 094 shim; the writer was never updated. Today harmless only because the cron never trips its threshold; if it ever did, it would write `base_tier` (moat path), never `effective_tier`. **`effective_tier` is reader-starved** — nothing writes it except source INSERT + 26 legacy rows.

### #2 — pipeline → `sources_used[]` vs citation-stats RPC → `intelligence_item_citations`  (HIGH, live harm)
Writer: `synthesiseAndWriteBrief` writes `intelligence_items.sources_used` (UUID[]). Reader: `get_source_citation_stats` RPC (migration **098**) was swapped to read the `intelligence_item_citations` **edge table**. But generation **never writes the edge table** (migration 089: "agent_extraction writes pending the route-handler update; no rows of this origin land today"). So the edge table holds only the one-time historical backfill; **every post-098 brief's citations are invisible to citation-stats** — stale/empty counts, silently. Same failure class as q7: reader moved to the new store, writer never followed.

### Write-only (overlaps A4)
`trust_score_accuracy/timeliness/reliability/computed_at` (+ effectively `overall`): monthly compute, no reader.

### CONSISTENT (verified NOT broken — the good news)
`base_tier`, `tier_override`, `provenance_status` (trigger→column→gating RPCs aligned), `jurisdictions`/`jurisdiction_iso`
(normalizer trigger), `severity`/`signal_band`/`theme` (value-format fracture already cured by `toDbSeverity`/`toDbTheme`
pre-write normalization, migration 102), `profiles`↔`user_profiles` (bidirectional mirror trigger — safe bridge),
`independent_citers`/`confirmation_count`/`highest_citing_tier`/`total_citations` (source-growth writes, trust.ts reads).

---

## Source-count composition (the 1,185 flag)
1,185 rows = **740 active + 431 provisional + 14 suspended**; base_tier clean (no T7, no NULL); ~752 institutions /
888 hosts; active span ~379 institutions; ~1.6× row:institution inflation. Not corruption — hygiene: (a) 431
provisional (36%) is an unreviewed discovery backlog (not monitored), (b) per-institution row inflation (europa.eu=59)
warrants a dedup pass. Discovery-loop tables ARE wired to admin review (bounded) — but a 431 backlog suggests the
review isn't being worked.

---

## Priority read (for the fix decision, later)
1. **B#2 (sources_used → edge table)** — live silent data loss (citation stats stale on every new brief). Cheapest real bug.
2. **The linchpin (q7/effective_tier + trust_score write-only)** — decide PER SUBSYSTEM: wire it (write `effective_tier`,
   surface trust components, lower the threshold) OR retire it (stop the nightly no-op compute). Don't half-fix.
3. **A2 unmounted UI** — product triage: superseded vs orphaned-recent.
4. **A4 dead tables / A1 dead modules** — safe deletions once confirmed (low risk, reduces drift surface).
5. **Source hygiene** — provisional triage + per-institution dedup.

Decide wire-vs-delete per item AFTER this map. Nothing changed in this pass.
