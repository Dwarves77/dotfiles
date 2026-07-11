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

## e4 — q7-daily-recompute cron script + L3 fixture — DONE

| Item | Action | Proof / evidence | Register row |
|---|---|---|---|
| fsi-app/scripts/cron/q7-daily-recompute.mjs (412 lines) | DELETED | Superseded by src/lib/trust.ts + /api/admin/q7-daily-recompute route (route header: nightly cron retired 2026-06-28, recompute moved into growSourcesFromBrief). No scheduler anywhere (vercel.json cronless, no GHA workflow). Script wrote legacy `tier` column under --execute. Fresh grep: only refs were the L3 fixture (fixed below) + generated coverage-report.json + a dated _diag record. | CODE-5a F-5a-10; master P3 |
| fsi-app/scripts/lib/surface-registry-reconstruction.mjs | FIXED (kept) | (1) `schedulesQ7` assertion inverted to the truthful cronless assertion; (2) gitignored `scripts/wave1-api-discovery.mjs` removed from known-answers (absent on fresh checkout → unreadable-FAIL); (3) OBLIGATION 1's 10 known-answer drift files are all CURED in the tree (0/10 hits — the drift class was remediated), so asserting "caught" failed every re-run: converted to a reported dated record + live positive control (fetch-now flags 2) + existing negative control (trust.ts clean). Fixture re-run: PASS, exit 0. | CODE-5a F-5a-5 |

Kept: /api/admin/q7-daily-recompute route (the LIVE manual full-corpus recompute, imports trust.ts —
not the superseded script). scripts/_diag/_phase1-cycle-proof.mjs untouched (dated diag record, unwired).

## e5 — Dead src modules, dead endpoints, settings.local grants (code half) — DELETED

Fresh proofs run this session (batch reverse-import prover + targeted git grep).

| Path / item | Lines | Proof | Register row |
|---|---|---|---|
| fsi-app/src/lib/agent/source-pool.ts | 178 | prover: importers were only 2 governance registries (skill-map.mjs, rule 017), both corrected in this commit — zero code importers | CODE-1 F-04 |
| fsi-app/src/lib/agent/section-validator.ts | 209 | prover ZERO-EXTERNAL | CODE-1 F-11 |
| fsi-app/src/lib/briefing/systemPrompt.ts | 40 | prover ZERO-EXTERNAL ("ready for Phase 3", never wired) | CODE-1 F-11 |
| src/app/api/admin/sources/verify/route.ts | (route) | CODE-3 F-19 dead endpoint; discovery lib imports verifyCandidate directly; grep: no `/verify` fetch caller | CODE-3 F-19 |
| src/app/api/admin/sources/recently-auto-approved/route.ts | (route) | CODE-3 F-19; W2.E queue UI never wired; grep: no caller. Also removes CODE-3 F-06 (the only remaining read of legacy `sources.tier`) | CODE-3 F-19/F-06 |
| src/app/api/notifications/trigger/route.ts | (route) | CODE-3 F-13/F-19 + DB-4 F4a/F5; zero callers, subscriber table has zero writers (unreachable). Drops the notification-v1 subsystem's only writer | CODE-3 F-13; DB-4 F5 |

Function-level dead exports removed in place (module stays, dead export excised, restore-note left):
- `congruentType` (src/lib/entities/source-role.mjs) — superseded by `congruence()`; only its own test called it. Test migrated to `congruence`. CODE-1 F-11.
- `openSourceConflict` (src/lib/sources/reconcile.ts) — zero callers; source_conflicts stays writer-less. Module header corrected. CODE-1 F-11.
- `checkFetchQuality` + FetchQualityInput + BLOCK/NOT_FOUND/MAINTENANCE pattern sets (src/lib/sources/fetch-quality.ts) — zero src callers (scripts carry their own `scripts/lib/fetch-quality.mjs`; capture-time junk detection now lives in entity-gate/transport-escalation). `checkBriefContent` (the live export) retained. CODE-1 F-11.

settings.local.json dead grants removed (CODE-5b F13): `node supabase/seed/run-migration.mjs` and
`node supabase/seed/rewrite-critical-resources.mjs` — both target files confirmed absent from disk.

### e5 HELD (not deleted)
- `VERIFICATION_HAIKU_SYSTEM_PROMPT` duplicate (verification.ts:212) — audit calls it a dead export,
  BUT the LIVE spot-check route imports a symbol of that exact name from verification.ts
  (src/app/api/admin/spot-check/recurring/route.ts:46,147). The audit's "reaches it via
  haikuVerifyCandidate" note is contradicted by a direct import in the tree. Removing it would break
  the spot-check route. HELD pending the CODE-1 F-11 two-home reconciliation (needs a code edit, not
  an erase). Fresh grep evidence recorded.
- `extract-research-sections.ts` — importer is scripts/restore-jolt.mjs (a live one-shot record). Not
  zero-importer; retirement is a script-refactor, not an erase. HELD (CODE-1 F-11).
- Legacy `sources.tier` compat column — NOT dropped here. Deleting the recently-auto-approved route
  removed its last SRC reader, but the mig-094 shim + sync trigger + seed-sources.sql still reference
  it; dropping the column is a Track-B/seed-coordinated change, out of dead-weight scope.

## e5 (DB half) — 2 orphan RPCs + 5 zero-consumer views — DROP MIGRATION AUTHORED (NOT APPLIED)

Migration **180** `fsi-app/supabase/migrations/180_drop_orphan_rpcs_and_dead_views.sql` (author-only).
Rollback: `fsi-app/supabase/rollbacks/180_drop_orphan_rpcs_and_dead_views.down.sql`.

Fresh zero-consumer confirmation (this session):
- Code: git grep over src/scripts/.discipline — every one of the 7 objects has zero CODE consumer
  (the lone `open_conflicts` hit reads the base table `source_conflicts`; the two
  `*related_items_derived` hits are prose comments in canonical-pipeline.ts:677-678).
- Live catalog (SELECT-only, project kwrsbpiseruzbfwjpvsp): a single pg_catalog dependency probe
  (policy quals + function bodies + view definitions + trigger bodies) referencing any of the 7 names
  = **0 across all four channels**. `active_intelligence_items` in particular is referenced by no
  policy/fn/view/trigger — it gates nothing (X.2(c) confirmed fresh).

Objects dropped by migration 180: views open_conflicts, provisional_sources_review,
source_health_summary, active_intelligence_items, item_related_items_derived; functions
get_workspace_members(uuid), related_items_derived(uuid). Discharges X.2(a) orphan RPCs + X.2(c)
5-view decision row; master P3.

<!-- Sections below appended per wave -->
