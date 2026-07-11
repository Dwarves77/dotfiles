# Wave-α Track E — Dead-Weight Erase: Deletions Log (2026-07-11)

Agent A5. Branch `wave-alpha/track-e-dead-weight`, base master `71bcbd4`.
Rule enforced per dispatch: every deletion carries (1) a FRESH zero-importer proof (repo-wide grep
for module name/basename incl. dynamic-import string paths, run in THIS session against THIS tree),
(2) the register row it discharges. Anything with a live importer or ambiguity is HELD, not deleted.
Migrations here are AUTHORED, NOT APPLIED (numbers 180+ per dispatch; 164–179 reserved for Track B).

Proof-method note: "grep 0" below means a repo-wide grep over `fsi-app/` (src, scripts, .discipline,
supabase, configs) for the basename and its import-path forms returned zero hits outside the deleted
file(s) themselves. Docs-only mentions are noted where present (docs do not import code).

## e1 — domains/* trio (fabrication risk) — DELETED

| Path | Lines | Proof | Register row |
|---|---|---|---|
| fsi-app/src/components/domains/RegionalIntelligence.tsx | 831 | grep `RegionalIntelligence\|components/domains` → 0 outside trio | CODE-4a F-03/F-05; master P3 |
| fsi-app/src/components/domains/TechnologyTracker.tsx | 430 | same sweep → 0 | CODE-4a F-03/F-05 |
| fsi-app/src/components/domains/FacilityOptimization.tsx | 253 | same sweep → 0 | CODE-4a F-03/F-05 |

Subtotal: 3 files / 1,514 lines.

## e2 — Unmounted components + dead type/data/hook chains — DELETED (39 files / 9,573 deleted lines)

Proof method: batch reverse-import prover (spawnSync git grep, module-specifier regex incl. barrels
and next/dynamic string paths), run against THIS tree with a positive control (ui/Button.tsx →
16 importers found, proving the detector fires). Candidates judged as a SET (intra-set imports like
ResourceDetail→TimelineBar don't block). One initial prover run returned all-zero due to a Windows
cmd quoting failure (the exact CODE-4a deviation-2 trap); it was DISCARDED and re-run via
spawnSync(shell:false) with the control.

| Path | Lines | External importers | Register row |
|---|---|---|---|
| src/components/regulations/RegulationsSurface.tsx | 1963 | 0 code (only `.discipline/governance/coverage-report.json` — a GENERATED scan artifact, not an importer) | CODE-4a F-05 |
| src/components/pages/OperationsPage.tsx | 1012 | 0 code (same generated-artifact-only) | CODE-4a F-05 |
| src/components/community/NotificationPreferencesPanel.tsx | 551 | 0 (live one is profile/NotificationPreferences.tsx) | CODE-4a F-05 |
| src/components/resource/ResourceDetail.tsx | 418 | 0 | CODE-4a F-05 |
| src/components/admin/IssuesQueue.tsx | 416 | 0 | CODE-4a F-05 |
| src/components/market/PolicySignals.tsx | 371 | 0 | CODE-4a F-05 |
| src/components/profile/AtAGlanceBlock.tsx | 262 | 0 | CODE-4a F-05 |
| src/components/settings/DashboardSettings.tsx | 261 | 0 | CODE-4a F-05 |
| src/components/explore/FilterBar.tsx | 217 | 0 | CODE-4a F-05 |
| src/components/market/WatchlistSidebar.tsx | 209 | 0 | CODE-4a F-05 |
| src/components/settings/HelpSection.tsx | 204 | 0 | CODE-4a F-05 |
| src/components/market/KeyMetricsRow.tsx | 200 | 0 | CODE-4a F-05 |
| src/components/resource/ResourceCard.tsx | 179 | 0 | CODE-4a F-05 |
| src/components/market/OwnersContent.tsx | 168 | 0 | CODE-4a F-05 |
| src/components/profile/QuickLinksSection.tsx | 154 | 0 | CODE-4a F-05 |
| src/components/ui/Skeleton.tsx | 131 | 0 | CODE-4a F-05 |
| src/components/market/FreightRelevanceCallout.tsx | 114 | 0 | CODE-4a F-05 |
| src/components/TabBar.tsx | 112 | 0 | CODE-4a F-05; CODE-4b F8 (7-domain chain) |
| src/components/home/HousekeepingSection.tsx | 106 | 0 | CODE-4a F-05 |
| src/components/profile/SectorSelector.tsx | 98 | 0 (doctrine text in fsi-app/.claude/CLAUDE.md corrected in e10) | CODE-4a F-05/F-08 |
| src/components/resource/ShareMenu.tsx | 93 | 0 (only importer was ResourceDetail, deleted here) | CODE-4a F-05 |
| src/components/resource/TimelineBar.tsx | 87 | 0 (same) | CODE-4a F-05 |
| src/components/explore/SearchBar.tsx | 86 | 0 | CODE-4a F-05 |
| src/components/ui/StatCard.tsx | 86 | 0 | CODE-4a F-05 |
| src/components/ui/UrgencyFilterBar.tsx | 71 | 0 | CODE-4a F-05 |
| src/components/admin/MtdSpendTile.tsx | 69 | 0 (comment ref in generate-brief.ts is prose) | CODE-4a F-05 |
| src/components/ui/Section.tsx | 56 | 0 | CODE-4a F-05 |
| src/components/home/TypesetSection.tsx | 56 | 0 | CODE-4a F-05 |
| src/components/explore/SortSelector.tsx | 48 | 0 | CODE-4a F-05 |
| src/components/ui/Card.tsx | 37 | 0 | CODE-4a F-05 |
| src/components/credibility/index.ts | 33 | 0 (credibility components imported directly) | CODE-4a F-05 |
| src/components/ui/PageContext.tsx | 24 | 0 | CODE-4a F-05 |
| src/components/ui/index.ts | 17 | 0 (barrel) | CODE-4a F-05 |
| src/types/community.ts | 167 | 0 (single comment ref in linkedin callback — comment fixed) | CODE-4b F8; vendor-residue DB-4 §2(c) |
| src/data/seed-remap.json | 976 | 0 | CODE-4b F8 |
| src/data/seed-scoring-data.ts | 224 | 0 | CODE-4b F8 |
| src/data/seed-clusters.ts | 85 | importer was only src/data/index.ts CLUSTERS re-export (itself unconsumed) — re-export removed in same commit | CODE-4b F8 |
| src/data/source-mapping.ts | 189 | 0 code (fsi-app/.claude/CLAUDE.md Key Files line removed in e10) | CODE-4b F8 |
| src/hooks/useScrollToResource.ts | 23 | 0 (misleading comment in navigationStore.ts fixed) | CODE-4b F8 |

Riding edits (same commit): src/data/index.ts (CLUSTERS import+export removed),
src/stores/navigationStore.ts (dead-hook comment), linkedin callback comment.

### e2 HELD (live importer or operator-ruling flag — NOT deleted)

| Path | Reason |
|---|---|
| src/components/resource/SectorSynopsis.tsx (423) | fsi-app/.claude/CLAUDE.md Sector Activation SHELVE ruling says "DO NOT remove SectorSynopsisView. The UI surface stays." Operator ruling required (CODE-4a F-05 note + F-08). |
| src/components/resource/IntelligenceMetadataStrip.tsx (201) | Mounted by held SectorSynopsis.tsx:338 — deleting it breaks the shelved surface (tsc proved it). Rides the SectorSynopsis ruling. Its API route /api/intelligence-items/[id]/metadata also stays. |
| src/types/resource.ts TabId 7-domain union | Live consumer: stores/navigationStore.ts, which is itself live (imported by settings/ArchiveViewer.tsx + settings/SupersessionHistory.tsx). Narrowing TabId means refactoring a live store — beyond zero-consumer erase. |
| src/stores/navigationStore.ts | LIVE (2 settings component importers) — despite TabBar/ResourceCard/ResourceDetail deletion. |
| Dead store SLICES (resourceStore.synopses, intelligenceChanges, sectorDisplayNames; sourceStore.openConflicts; workspaceStore weights) | CODE-3 F-23: dormant, not zero-importer — wired into live fetchers/stores; removing touches live code paths. Not dispatched to e2/e5. |
| src/types/intelligence.ts:143-233 legacy mappers (resourceToIntelligenceItem etc.) | Register says unconsumed, but they live inside a LIVE module; removal is a code-shape edit, not a file erase — left for a typed cleanup pass (rides Track A/F4 type regeneration). |

Note: `.discipline/governance/coverage-report.json` (generated by coverage-scan.mjs, not CI-wired)
now lists two deleted files; regenerate on next governance scan run — stale rows noted, harmless.

<!-- Sections below appended per wave -->
