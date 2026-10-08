# Research lane — corrected spec-from-repo (WO-15, WO-25) (2026-08-30)

**Status: DRAFT, spec-from-repo pass.** Written per the vault gap named in
`docs/plans/connection-redesign-and-build-scope-2026-08-29.md` §4 ("Vault gap, named": the WO-10/11/
13/14/15/21/22/24/25 texts exist only in a never-committed v1 plan that lived in chat and is now
lost) and executed under that scope's §5 executor contract and §6a wave-4 Research-lane assignment
(WO-15 → WO-25, parallel to Market WO-13→14→23→24 and Operations WO-10→11→21→22). **The lost v1 text
is not reconstructed here — CLAUDE.md rule 2 ("never fabricate") and this program's rule 14 forbid
guessing what a lost document said.** This document is derived fresh from the repository at worktree
commit `c6c228ff` (master) and the live database (project `kwrsbpiseruzbfwjpvsp`), the same discipline
`docs/plans/wo20-assumption-register-spec.md` used for WO-20.

Labels per CLAUDE.md rule 14: **[FACT]** = file+line or live query result, this session. **[INFERENCE]**
= a reasoned conclusion from FACTs, not itself directly observed. **[UNCONFIRMED]** = stated but not
independently verified this session.

Vault landing path when ratified: this file, at its current path.

**Headline correction this pass makes to the master plan's own framing:** Master execution plan v2
(`docs/plans/master-execution-plan-2026-08-17.md:64`) lists "6. Research build-out | WO-15 · WO-25 |
after WO-3 merges" as if the Research surface is unbuilt. **[FACT]** It is not. `ResearchLedger.tsx`
(1,007 lines) and `ResearchFindingDetailSurface.tsx` (1,018 lines) are both fully built, carry Sprint
2/3/4 and flywheel-U9 dated work, and render live traffic today. This spec does **not** ask an
executor to build the Research index/detail surfaces from nothing — that would duplicate real,
working code. It corrects the WO texts to the residual, evidence-verified gaps: one customer-visible
count defect (WO-15) and one un-surfaced asset the graph already produces (WO-25's theme-brief gap),
plus two smaller hygiene items each.

---

## 0. Rule 0.15 — schema and live-count re-verification

Tables the Research surface reads, checked live this session, independently of any plan claim:

| Table / RPC | Live count / shape | Claim it corrects or confirms |
|---|---|---|
| `intelligence_items` | 1,062 rows total; 826 `provenance_status='verified'`; **274 verified + non-archived** | Matches Appendix A of the master plan (826/806 language) closely enough at the verified level; the 274 non-archived figure matches the connection-redesign scope doc's "274-item corpus" exactly `[FACT]` |
| `intelligence_items`, Research-surface population by `surfaceOf(item_type, domain)` (the codegen'd SoT, `src/lib/surface-of.mjs:38-47`) | **38** verified+non-archived rows classify to `research` | New measurement — no prior doc stated this number |
| `intelligence_items`, `item_type='research_finding'` alone (the literal filter `fetchResearchPipelineRows` uses) | **31** rows | **7 fewer than the true surface population** — see WO-15 §1 |
| `intelligence_items.theme` (the column the detail page's "related findings" step reads) | **0 of 38** Research-surface rows populate it | See WO-25 §1 |
| `intelligence_items.intersection_summary` | 7 of 38 Research-surface rows populated | Confirms the U3-era summary field reaches some Research items; not consumed by either component read this session |
| `item_cross_references` | **1,929** rows total (1,857 `related`/provenance_discovery + 51 manual + 10 entity_extraction + **11 typed lineage**: implements ×5, amends ×5, depends_on ×1) | Scope doc's `1,863`/`1,826` figures are prior snapshots; the graph has grown since. **WO-27 (same_instrument removal) and WO-28 phase 1 (lineage typing) are BOTH already landed in this worktree** — confirmed by `discover.mjs`'s in-place "same_instrument REMOVED (WO-27, 2026-08-29)" comment and `entity-resolve.mjs`'s live `classifyRelationship()` — this is new information the connection-redesign scope doc (written the same day) does not yet reflect having executed |
| `item_cross_references` touching a Research-surface item (either side) | **591** edges; **0** carry a typed (non-`related`) relationship | The 11 live typed-lineage edges are all Regulations-domain pairs — lineage typing has not yet reached a Research item. Not a defect (child→parent instrument citation is inherently a regulatory-text pattern); named so no WO invents Research-specific lineage-typing UI for a signal that has zero live rows to show |
| `connection_themes` | 9 rows (unchanged from master plan's `connection_theme_runs` = 4 note) | 4 of the 9 clusters include Research-domain (`domain=7`) members: 68/57/33/22-member clusters, covering **35 of the 38** Research items (92%) |
| `theme_briefs` (migration 266, flywheel U6) | 9 rows, **1:1 with `connection_themes`**, all 9 hash-fresh (`member_hash` matches live `member_ids` recomputed via `brief-staleness.mjs`'s exact recipe — sort, empty-join, md5) | No stale briefs. Generation is session-executed, **$0** by the migration's own header comment ("SPEND: generation is session-executed ($0, operator standing directive... the build never spends)"). **Zero consumers on the customer-facing Research surface** — see WO-25 §1 |
| `get_research_source_coverage()` RPC (migration 100) | 15 rows (transport_mode × jurisdiction_iso cells, e.g. `ocean/GLOBAL: 57`) | Live, real, fetched by `getResearchSourceCoverage()` — and then discarded by `ResearchLedger.tsx:347` (`void sourceCoverage`). See WO-15 §1 |
| `get_surface_counts(org,'research')` (migration 148) | `total_items: 38` — matches the `surfaceOf`-derived count above exactly, because the RPC's own SQL calls `surface_of()` (migration 148's codegen'd twin of `surfaceOf`) | This is the number the masthead renders (`aggregates.totalItems`, `ResearchLedger.tsx:433`). It does **not** match the 31 rows the ledger actually lists — see WO-15 §1 |

**Verdict: no STOP condition.** Every mismatch found is a real, evidence-grounded defect the WOs
below name precisely — not a plan-vs-schema divergence that blocks work starting. No live-data
change, no schema change, and no LLM/API spend is proposed anywhere in this document.

---

## 1. WO-15 — Research index (`/research`)

### 1.1 What the repo actually has today `[FACT]`

- **Route:** `src/app/research/page.tsx` (109 lines). `force-dynamic` (line 22) — deliberately not
  ISR after a documented 200K-write incident (`docs/ISR-WRITE-INVESTIGATION.md`, cited in-file
  lines 9-21). Fetches four things in parallel (lines 46-59): `getResearchPipeline()`,
  `getResearchItems()` (the category-routed RPC allow-list), `getSurfaceCounts("research")`, and
  `getResearchSourceCoverage()`.
- **Filter chain (lines 64-73):** `allow` = the id set from `getResearchItems()`'s category-routed
  rows; `filteredRows` = `pipeline.rows` intersected with `allow` (or, if `allow` is empty, the
  unfiltered pipeline — a fail-open so the page is never blank). **The allow-list can only
  NARROW `pipeline.rows` — it can never add a row `pipeline.rows` never contained.**
- **The pipeline itself:** `getResearchPipeline()` (`src/lib/data.ts:685-693`) →
  `cachedResearchPipeline` → `fetchResearchPipelineRows()` (`src/lib/supabase-server.ts:880-1014`).
  Its base query (`supabase-server.ts:905-914`) filters
  `.eq("item_type", "research_finding")` (line 912), commented: *"routing contract: regulations/
  guidance do NOT belong on /research (was wrong-surface-leaking ~102 non-research items)"*. The
  count query at line 895 carries the identical literal filter with the same comment citing
  "migration 125 get_research_items."
- **The render component:** `ResearchLedger.tsx` (`"use client"`, 1,007 lines) — severity tiles
  (4-way: action/cost/monitor/background, client-derived by regex over title+summary,
  `deriveSeverity` lines 235-244), theme bands (7-way client taxonomy: emissions/fuels/packaging/
  carbon/cold-chain/last-mile/disclosure, `THEMES`/`THEME_KEYWORDS` lines 132-233), an inline Ask
  bar dispatching a DOM `CustomEvent("open-ask-assistant")` (lines 458-464, 582-650), a verticals
  filter (live-events/fine-art + 3 "+broad" toggles, lines 329-335, 372-379), a 7d/30d/90d/all
  window filter, and a right-rail "Source coverage matrix" (lines 826-842) that buckets sources into
  4 analytical-depth classes (`COVERAGE_CLASSES`, lines 296-301) **derived from the loaded rows'
  `sourceName` field via regex, not from any RPC**.
- **The masthead total** (`ResearchLedger.tsx:433-434,480`) reads `aggregates.totalItems` — the
  `get_surface_counts('research')` RPC result, threaded through as the `aggregates` prop — falling
  back to the row-count only when that RPC is absent.
- **The ledger heading** (`ResearchLedger.tsx:441-443`) separately computes its own count as
  `displayed.length`/`totalDisplay` from the **already-filtered `pipeline.rows`** — a second,
  independent count derived from a different population than the masthead's.

### 1.2 The defect, precisely `[FACT]`, evidence assembled this session

`fetchResearchPipelineRows`'s hardcoded `item_type = 'research_finding'` filter is **narrower than
the platform's own single source of truth for what belongs on this surface.** `surfaceOf()`
(`src/lib/surface-of.mjs:38-47`, the codegen'd SoT that also drives `get_surface_counts`,
`canonicalSurfaceForItem` in `item-links.ts`, and the Dashboard's `surface-coverage.ts:102`) admits
a Research-surface item on **`domain=7`**, independent of `item_type` — and the platform's own
first-fetch intake classifier (`src/lib/llm/first-fetch-classify.ts:58-72`) explicitly assigns
`domain=7` to `item_type IN (framework, research_finding, tool, initiative)` depending on the
source's category. `initiative` + `research`-category source → `domain=7` **by design**, not by
accident.

Measured live: **7 of the 38** verified, non-archived Research-surface items are NOT
`item_type='research_finding'` — 4 `initiative` (e.g. "Project JOLT: Real-World eHGV Trials...",
"Mission Innovation Clean Shipping") + 3 `market_signal` (e.g. "World Bank Transport Strategy...").
One further `domain=7` row ("UN SDGs 9 & 13", `item_type='framework'`) is correctly excluded — its
`item_type` is in the regulation-type set, which `surfaceOf`'s precedence rule routes to
`regulations` outright, ahead of the domain rule; that row's exclusion is CORRECT and this WO must
not change it.

**Consequence, verified against the live masthead RPC:** `get_surface_counts('research')` returns
`total_items: 38` (this session's live query). The ledger heading and every theme band beneath it
render from `pipeline.rows`, which contains only 31. **The masthead says "38 active findings" while
the list below it never shows more than 31 — an 18% customer-visible undercount, on the exact same
page, from two paths that were supposed to agree** (the count-integrity discipline migration 148
itself exists to guarantee — see that migration's own header, quoted in §0). Independently, the
Dashboard's per-surface tile (`surface-coverage.ts`, a different surface's own file, read only for
corroboration, not touched by this WO) computes Research's count via the correct `surfaceOf()` call
and would report 38 — a third number that agrees with the masthead and disagrees with the list. This
is the identical defect *shape* the codebase has fought before (migration 148's own "the 259 leak"
history) recurring in a new location.

Two further sites restate the same narrower assumption in comments only (**not query logic** —
verified by reading each): `src/lib/dashboard/surface-coverage.ts:17` ("Research: item_type IN
(research_finding)") is stale documentation on a file whose actual code calls `surfaceOf()` correctly
(line 102) — no functional bug there, just a comment this WO may correct in passing if convenient,
though it is not this WO's file to own. `src/lib/llm/first-fetch-classify.ts` is the intake
classifier itself and is out of this WO's write set entirely (§1.4).

**One item [UNCONFIRMED / INFERENCE, explicitly flagged, not resolved here]:** the 3
`market_signal`/`domain=7` rows do not match ANY rule in `first-fetch-classify.ts`'s documented
routing table — that table always sends `market_signal` to `domain=4`. Either these 3 rows were
minted through a different path (a script, a manual override, a pre-rule-change backfill) or the
rule has drifted from what it once was. This is a data-provenance question for the intake lane, not
a UI-fetcher defect — **WO-15 does not investigate or correct it**, only names it so it is not lost.

### 1.3 What WO-15 must do

1. **Replace the fetch-population filter with the SoT's own predicate**, not a wider hand
   enumeration (which is exactly how the current under-inclusion was created — the comment at
   `supabase-server.ts:912` shows this filter was ITSELF a correction for a prior over-inclusion
   bug; a second hand-maintained list is how a third drift starts). Concretely: the query must admit
   a row iff `surfaceOf(item_type, domain) === 'research'` — i.e., NOT an
   item_type in the regulation set, AND (`domain = 7` OR `item_type = 'research_finding'`). Implement
   as a PostgREST filter combination on both the count query (line ~890-895) and the row query (line
   ~905-914); do not introduce a third hand-written item_type array — if the six-way regulation-type
   exclusion is awkward to express as a single `.or()`, prefer two chained queries or a
   `.not("item_type", "in", ...)` guard using the SAME array `SURFACE_RULES` already exports
   (`surface-of.mjs`'s `SURFACE_RULES[0].itemTypeIn`), imported, not retyped.
2. **Prove the fix against live data**, not just a fixture: before/after row counts for the query
   must move from 31 to 38 (or note precisely why not, if a subsequent live-data change shifted the
   number since this session) — the executor states the diff, per the WO-27 precedent in the
   connection-redesign scope doc ("a `--dry` backfill run before/after must produce identical edge
   sets, executor states the diff") applied here to a read-path fix instead of a write-path one.
3. **Decide and implement the `sourceCoverage` prop**, rather than leaving it silently discarded.
   Two honest options, either is acceptable, pick one and document the choice in the PR: (a) wire the
   real `sourceCoverage` (mode × jurisdiction breadth, 15 live cells) into a SECOND, clearly-labelled
   rail card alongside the existing analytical-depth matrix — they answer different questions
   ("how broad is our source registry across transport modes and jurisdictions" vs. "how deep is the
   evidence behind findings shown right now") and neither makes the other redundant; or (b) if the
   analytical-depth matrix is kept as the ONLY rail card, delete the unused `sourceCoverage` prop,
   the `getResearchSourceCoverage()` call in `page.tsx`, and (grep first — §1.4) confirm no other
   consumer needs it before deleting the fetcher chain itself, per CLAUDE.md's "no orphaned reads"
   posture this repo already enforces elsewhere (the WO-27 `fetchXrefPairs` precedent). **Recommend
   (a)** — the RPC is real, cheap ($0, already cached 300s), and gives the reader a genuinely
   different fact than the derived matrix; discarding real data a migration already earns is the
   more expensive long-run choice.
4. **Do not touch:** `ResearchFindingDetailSurface.tsx`, `research/[slug]/page.tsx`,
   `fetchIntelligenceItem`/`fetchIntelligenceItemSections` (shared across all four surfaces),
   `getResearchItems()`'s underlying `get_research_items` RPC or its migration-125 routing rule (a
   second, source-category-based classification system, already labelled "orphan" by the repo's own
   comment at `data.ts:827` — untangling it from `surfaceOf` is a real question but a bigger one than
   this WO; it can only NARROW the allow-list further, so fixing the pipeline filter in step 1 is
   sufic to close the 7-item gap even if the RPC itself stays as-is).

### 1.4 Named write set

- `fsi-app/src/lib/supabase-server.ts` — **only** `fetchResearchPipelineRows` (lines ~859-1014) and,
  if option (b) of §1.3.3 is chosen, `fetchResearchSourceCoverage` (lines 1036-1058). This file is
  imported by all four surfaces' server components — grep before editing
  (`grep -rn "from \"@/lib/supabase-server\"" src/app`) and touch nothing outside the named
  function bodies.
- `fsi-app/src/lib/data.ts` — **only** the `getResearchPipeline`/`getResearchSourceCoverage` exports
  (lines 685-718) and, if option (b), the `getResearchSourceCoverage` re-export. Same shared-file
  caution as above.
- `fsi-app/src/components/research/ResearchLedger.tsx` — the `sourceCoverage` handling (currently
  line 347's `void sourceCoverage` plus the `COVERAGE_CLASSES` rail card, lines 296-311, 826-842)
  only, if option (a) is chosen (adds a card) or option (b) (removes the prop plumbing).
- `fsi-app/src/app/research/page.tsx` — only if option (b) removes the `getResearchSourceCoverage()`
  call.

**Cross-lane collision risk, named explicitly (not resolved here — a coordinator-level note):** the
connection-redesign scope's §6a wave-4 table claims Market/Operations/Research lanes have "disjoint
`src/components/<surface>` + `src/app/<surface>` trees." That is true for the component trees. It is
**not** true for `src/lib/supabase-server.ts` and `src/lib/data.ts` — both are single files every
surface's fetchers live in side by side. If a Market or Operations lane WO also edits a function in
either file in the same wave, the two PRs will conflict on the same file even though their write
sets are otherwise disjoint. Recommend the coordinator serialize merges of any PR touching either
file, regardless of which lane authored it, rather than relying on the wave table's tree-disjointness
claim for these two specific files.

### 1.5 Consumers and blast radius `[FACT, grep-checked]`

- `ResearchLedger` — imported only by `research/page.tsx`. No other consumer.
- `fetchResearchPipelineRows` — imported only by `data.ts` (which re-exports as `getResearchPipeline`,
  consumed only by `research/page.tsx`). A grep match in
  `src/lib/dashboard/credibility.ts` is a **comment** ("Implementation pattern follows Build 8.1/8.3
  in fetchResearchPipelineRows") describing a parallel pattern, not an import — verified by reading
  the file; no actual coupling.
- `getResearchSourceCoverage` / `ResearchSourceCoverageCell` — imported only by `research/page.tsx`
  and `ResearchLedger.tsx`.
- `getResearchItems` (the category-routed fetcher, distinct from `get_research_items` the RPC name) —
  imported only by `research/page.tsx`.
- Net effect: **the fix is contained to the Research surface with no cross-surface UI blast radius**,
  once the two shared-file caveats in §1.4 are respected.

### 1.6 Gates and anti-scope

**This WO does NOT:**
- Touch the U7 boundary at all. Nothing here synthesizes new text, calls an LLM, or produces new
  candidate connections — it is a read-path predicate correction. **$0, no metered call anywhere in
  this WO.**
- Investigate or correct the 3 anomalous `market_signal`/`domain=7` rows' provenance (§1.2's flagged
  UNCONFIRMED item) — that is an intake-lane data-quality question, out of this WO's scope; name it
  in the PR description so it reaches the board, do not silently drop it (CLAUDE.md rule 13: "a flag
  is a commitment").
- Modify `get_research_items`/migration 125's routing rule, `first-fetch-classify.ts`, or any intake
  path. Those are the classification system feeding `domain`/`item_type` at mint time; this WO only
  changes which already-classified rows a listing query admits.
- Modify `fetchIntelligenceItem`, `canonicalSurfaceForItem`, or `surfaceOf`/`SURFACE_RULES`
  themselves — those are the correct, shared SoT this WO's fix ADOPTS, not changes.
- Require any migration, schema change, or ⛔ operator ratification. Every change here is additive
  read-path logic over existing columns already NOT NULL / already populated.

### 1.7 Open rulings

1. **Rail-card treatment of `sourceCoverage`** (§1.3.3): add a second card (recommended) vs. delete
   the unused fetch. *Tradeoff:* a second card adds visual density to an already-busy right rail
   (currently 2 cards) for a signal ("breadth of our source registry by mode/jurisdiction") that is
   arguably an admin/registry-health metric rather than a findings-reader's concern; deleting is
   simpler and matches the WO-27 "orphaned fetch = dead weight" precedent exactly. *Recommend adding*
   because, unlike WO-27's `fetchXrefPairs` (truly zero consumers, confirmed dead), this RPC is
   already wired end-to-end and cached — the cost of keeping it live is $0 and already paid; the only
   missing piece is one render block.
2. **How aggressively to correct `surface-coverage.ts:17`'s stale comment** (§1.2, last paragraph).
   *Recommend:* a one-line comment fix if the executor is already touching adjacent context for
   another reason; not worth its own PR, and it is NOT this WO's file to own on write-set grounds
   (§1.4 lists it as read-only corroboration) — flag it to whichever lane next legitimately edits
   that file rather than reaching into a Dashboard-owned file from the Research lane.

---

## 2. WO-25 — Research finding detail (`/research/[slug]`)

### 2.1 What the repo actually has today `[FACT]`

`ResearchFindingDetailSurface.tsx` (1,018 lines) + `research/[slug]/page.tsx` (262 lines) already
implement, and render live:

- UUID → `legacy_id` redirect (page.tsx:74-98) mirroring `/regulations/[slug]`.
- Surface admission guard (page.tsx:109-111): 404s unless `canonicalSurface === 'research'`, derived
  from `surfaceOf` via `fetchIntelligenceItem` — this is the SAME classifier §1's fix adopts, so an
  item WO-15 newly lists on the index is **already individually reachable at its detail URL today**
  (this guard, unlike the pipeline listing, was never item_type-narrowed) — confirmed by re-reading
  `fetchIntelligenceItem`'s admission path, which carries no `item_type` filter, only the
  `surfaceOf`-derived `canonicalSurface` check.
- **Section-aware rendering** (Sprint 4): 6 numbered `ResearchSectionCard`s
  (`RESEARCH_SECTION_HEADINGS`, lines 85-92) from `intelligence_item_sections` when present, falling
  back to a short/full `full_brief` toggle (legacy path, lines 774-859) when sections are empty —
  an honest empty state, not a silent gap.
- **Flywheel U9 connections card** (page.tsx:113-124, 250-259; `ItemConnectionsCard.tsx`;
  `connection-view-model.mjs`): fully wired, reading `item_cross_references` +
  `item_supersessions` via `buildResourceLookup`, rendering `RELATIONSHIP_LABEL`-mapped pills
  (`connection-view-model.mjs:14-20`: Supersedes/Implements/Conflicts/Amends/Depends on, falling
  through to direction-based References/Referenced by for the untyped default). **This is already
  the single shared component all four surfaces use** — no Research-specific connections work
  remains to build here.
- **A SEPARATE "Related findings" mechanism** (page.tsx:133-211, inline in the server component, not
  in a shared lib): step 1 queries `intelligence_items` for other rows sharing `self.theme` (the
  `theme` column); step 2, only if step 1 yields nothing, falls back to same-`source_id`. **Live
  data (§0): 0 of 38 Research-surface rows populate `theme`.** So step 1 can never match for ANY
  research item today — every "Related findings" panel that shows anything is running step 2 (the
  same-source fallback) exclusively, in practice, right now. The code comments (page.tsx:9-12,
  135-141) describe this as designed fallback behavior, which it is — but the primary signal is
  currently 100% inert, which the comments do not say.
- **Duplicated theme/severity taxonomy.** `ResearchFindingDetailSurface.tsx:226-293` carries its own
  copies of `ThemeKey`, `THEME_LABEL`, `THEME_COLUMN_TO_KEY`, `THEME_KEYWORDS`, and `deriveSeverity` —
  independently maintained from `ResearchLedger.tsx`'s versions (lines 132-244). The file's own
  header comment (lines 188-190) states why: *"kept local so the detail surface compiles without
  modifying ResearchView per the dispatch's 'no modifications outside new files' rule"* — i.e., this
  duplication was a **deliberate, documented tradeoff from a prior WO's write-set constraint**, not
  an oversight. The two copies are currently in sync (`THEME_KEYWORDS` in both files match token for
  token as of this session) but nothing enforces that going forward — no drift guard covers this pair
  the way `vocab-drift-guard.test.mjs` covers `surfaceOf`/migration 148.
- Sources panel, tier legend, watchlist button (`itemType="research"`, live via migration 233),
  citation-count/recency stats, bias-tag plumbing (all read-only display of already-fetched fields;
  no gaps found in this part).

### 2.2 The gap: theme_briefs are real, fresh, and cover 92% of Research items — and render nowhere on this surface `[FACT]`

Per §0: 4 of the 9 `connection_themes` clusters include Research-domain members, covering 35 of the
38 Research-surface items; all 9 corresponding `theme_briefs` rows are hash-fresh, session-executed,
$0. The **only** consumer of `theme_briefs`/`connection_themes` in the entire repo is `ThemesView.tsx`
(`src/components/sources/ThemesView.tsx`), rendered inside `SourceHealthDashboard.tsx`, mounted only
at `/admin` (`src/app/admin/page.tsx`) — an **operator-facing** surface, never customer-facing.

A Research finding that belongs to, say, the 68-member "Maritime decarbonisation" cluster has a
synthesized, editorial brief already written about the pattern it participates in — and a reader on
that item's own detail page has no way to know the cluster or the brief exist. This is architecturally
distinct from the connections card (which lists individual pairwise edges): a theme brief is a
higher-level synthesis across a cluster, the exact kind of cross-surface "each surface educated by the
others" the connection layer exists to deliver (per the connection-redesign scope doc §1, quoting
`discover.mjs:3`).

### 2.3 What WO-25 must do

1. **Surface the theme brief, read-only, $0.** When an item's id appears in a `connection_themes.
   member_ids` array, fetch that theme's `theme_briefs.brief_md`/`title` (a single join keyed off
   the theme's `id`, no new table, no migration) and render it as a new card on the detail page —
   recommend placing it in the right rail near `ItemConnectionsCard`, or as a collapsed panel above
   "Related findings," clearly labelled as synthesis across a cluster (not this item alone) so a
   reader does not mistake cluster-level prose for item-specific analysis. **This is a pure read of
   already-generated, already-fresh rows — no LLM call, no U7 contract-advance work, no spend.** If
   the item is in none of the 9 clusters (3 of 38 today), render nothing — honest omission, matching
   this surface's existing "no key figure yet" / "no connections on file" posture, never a fabricated
   placeholder.
2. **Document the "Related findings" step-1 dead-in-practice state**, minimally: either (a) update
   the in-file comment to state plainly that step 1 currently never fires (0/38 items carry `theme`),
   so a future reader does not assume it is exercised, or (b) if the executor judges it worth doing,
   swap the primary related-findings signal from the inert `theme` column to the already-live
   `item_cross_references` graph (the same data `ItemConnectionsCard` already reads) — which would
   make "Related findings" and "Connections" draw from the same substrate instead of two unrelated
   ones. **Recommend (a) only** for this WO (documentation, not behavior change) — collapsing two
   panels that currently answer different UI questions (a short curated list vs. a scored/labelled
   connections list) into one signal is a real design decision belonging in an open ruling (§2.5),
   not a silent behavior change inside a spec-corrected WO.
3. **Extract the duplicated theme/severity taxonomy into one shared module**, now that the "no
   modifications outside new files" constraint that caused the duplication (§2.1) no longer applies —
   this WO and WO-15 both touch files that would import it. Concretely: a new
   `src/lib/research/taxonomy.mjs` (or `.ts`, matching whichever of the two files' typing needs are
   stricter) exporting `THEMES`/`THEME_KEYWORDS`/`THEME_COLUMN_TO_KEY`/`SEVERITY`-equivalent constants
   and `assignTheme`/`deriveSeverity` functions, consumed by BOTH `ResearchLedger.tsx` and
   `ResearchFindingDetailSurface.tsx`. **This is the one place WO-15 and WO-25 must serialize** (§2.4).
4. **Do not touch:** `fetchIntelligenceItem`, `fetchIntelligenceItemSections`,
   `getViewerRelevanceForItem`, `buildResourceLookup`, `ItemConnectionsCard.tsx`,
   `connection-view-model.mjs` — all shared across all four surfaces and already correct/complete for
   Research per §2.1's U9 confirmation. Do not add lineage-relationship-specific UI for Research (§0:
   zero live typed edges touch Research items today — nothing to render).

### 2.4 Named write set and the WO-15/WO-25 serialization point

- `fsi-app/src/app/research/[slug]/page.tsx` — the theme-brief fetch (new, small, adjacent to the
  existing related-findings block) and the related-findings comment correction.
- `fsi-app/src/components/research/ResearchFindingDetailSurface.tsx` — the new theme-brief card, and
  (once extracted) the import of the shared taxonomy module in place of its local
  `ThemeKey`/`THEME_LABEL`/`THEME_KEYWORDS`/`deriveSeverity`/`assignTheme` copies (lines 226-293).
- **`fsi-app/src/lib/research/taxonomy.mjs` (NEW FILE) — the one file both WO-15 and WO-25 want to
  write.** Per the scope doc's file-ownership rule ("a lane may READ anything but WRITE only its
  named files, one writer per file"), this file needs **one** author. Recommend: whichever WO lands
  second creates it (extracting from whichever ledger/detail-surface copy is authoritative at that
  point) and the WO that lands first is NOT blocked waiting for it — it can ship its own fix against
  the existing duplicated copy unchanged, and the extraction becomes a small follow-up diff in
  the second WO's PR touching both consuming files. This keeps WO-15 and WO-25 non-blocking on each
  other for their primary fixes (§1.3/§2.3) while still naming exactly where they must not both write
  in parallel.
- `fsi-app/src/components/research/ResearchLedger.tsx` — only the import-swap (replacing its local
  `THEMES`/`THEME_KEYWORDS`/`SEV`-adjacent constants with the shared module), performed by whichever
  WO creates `taxonomy.mjs`, per the point above.

### 2.5 Consumers and blast radius `[FACT, grep-checked]`

- `ResearchFindingDetailSurface` — imported only by `research/[slug]/page.tsx`. A grep match in
  `OperationsDetailSurface.tsx` is a **comment** ("Cloned from ResearchFindingDetailSurface... Layout
  mirrors ResearchFindingDetailSurface for platform coherence") describing a sibling file that was
  copied from this one at some point in the past, not an import — verified by reading the file; no
  live coupling, so changes here do not ripple into Operations' detail surface.
- `connection_themes`/`theme_briefs` — currently read only by `ThemesView.tsx`/
  `src/app/api/admin/themes/route.ts` (admin) and `brief-staleness.mjs` (a pure helper, imported by
  the admin route). Adding a second, customer-facing read path is additive; it does not change or
  remove the admin path, and the admin route's own staleness-check logic is untouched.
- Net effect: **contained to the Research detail surface**, plus the one shared new module named
  above, which WO-15 also consumes.

### 2.6 Gates and anti-scope

**This WO does NOT:**
- Generate a new `theme_brief` row, re-cluster `connection_themes`, or invoke anything that produces
  new synthesized text. It reads 9 rows that already exist. **The U7 boundary, stated exactly:** U7
  ("contract advance — graph candidates into briefs," connection-redesign scope doc §4 order 8) is
  about ADVANCING graph-discovered candidate connections INTO brief content — i.e., the generation
  step. This WO is strictly downstream of that: it renders already-generated `brief_md` text that
  migration 266's own header says was written "session-executed, $0" by a prior operator-directed
  pass. If a future pass ever wants theme briefs to auto-regenerate against a metered LLM call, that
  is U7's territory (or a new WO), never this one's.
- Build any UI for typed lineage relationships (implements/amends/depends_on) — confirmed §0, zero
  live edges of that kind touch a Research item; `ItemConnectionsCard` already renders them generically
  if and when one ever does, requiring no Research-specific code.
- Collapse "Related findings" and "Connections" into one panel (§2.3 item 2) — named as a real,
  deliberate design option, explicitly NOT executed by this WO's default path.
- Require any migration, schema change, or ⛔ operator ratification. The theme-brief read is a
  straightforward join over two existing tables; no DDL.

### 2.7 Open rulings

1. **Where the theme-brief card sits, and how it's labelled** (§2.3 item 1). *Recommend:* a
   collapsed/summary card in the right rail (matching `ItemConnectionsCard`'s visual weight) rather
   than a full prose block in the main column, because `brief_md` is cluster-level synthesis and
   giving it main-column weight risks a reader conflating "what this cluster's brief says" with "what
   this specific finding says" — the same confusion the `ResearchSectionCard`s exist to avoid for
   item-level content. *Tradeoff:* a rail card is easy to skip past; a main-column placement is more
   discoverable but riskier for the conflation reason above.
2. **Related-findings signal: document-only vs. graph-swap** (§2.3 item 2). *Recommend:* document-only
   for this WO; graph-swap as a named follow-up ruling for whoever next touches this file, since it
   changes reader-visible behavior (which items appear under "Related findings") rather than only
   correcting a comment. *Tradeoff:* leaving the dead `theme`-column step in place means the code
   keeps carrying inert logic (a minor CLAUDE.md-rule-13-adjacent debt) versus the risk of changing
   what readers see without a dedicated ruling on which signal is actually better for this UI slot.
3. **Taxonomy-extraction ownership** (§2.4). *Recommend:* second-lander creates `taxonomy.mjs`, as
   stated. *Tradeoff:* whichever WO creates it takes on slightly more surface area (editing two
   consumer files, not one) in exchange for neither WO blocking on the other's landing order.

---

## 3. What the Research surface is for

Evidence-grounded, not marketing language: the Research surface's defining, checkable trait
(`surfaceOf`'s own rule set, `surface-of.mjs:38-47`) is `domain=7` content — horizon-scan findings
(`item_type='research_finding'` dominates the population, 31 of 38) carrying no compliance deadline,
no `entry_into_force`, no binding-obligation framing, and instead a distinctive apparatus none of the
other three surfaces carry as heavily: source tier badges, per-source bias tags (`source_bias_tags`,
funding/methodology/stakeholder dimensions), citation counts and recency, and an explicit
"what it changes" / "what it does not resolve" editorial pair (`what_it_changes`/`does_not_resolve`
columns, migration 110) — the surface is built to let a reader weigh how much to trust a claim, not
just what the claim says, which is a genuinely different job from Regulations' "what is legally
required, by when" or Market's price/trajectory framing.

But the evidence also surfaces a real overlap the surface's own client-side "theme" vocabulary
(emissions/fuels/packaging/carbon/cold-chain/last-mile/disclosure — a keyword-regex taxonomy that
touches no database column) does not acknowledge: 92% of Research items already belong to a
platform-wide, graph-derived `connection_themes` cluster that also contains Regulations, Market, and
Operations items around the SAME underlying pattern (e.g. "Maritime decarbonisation," 68 members
across all four surfaces) — and that cluster already has a durable, synthesized brief. Today those
two "theme" concepts are entirely disconnected: the Research surface organizes itself by a private
regex classifier while the platform's own cross-surface synthesis of the identical items sits
unread one click away, in an admin-only view. Until WO-25's §2.3 fix lands, the Research surface's
distinctive purpose — trust-weighted horizon-scan findings — is real and well-built, but its
organizing "theme" device is a parallel, disconnected invention rather than a lens on the connection
graph the rest of the flywheel already spent real work building for exactly this population.
