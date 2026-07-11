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

## e3 — Vendor family — DROP MIGRATION AUTHORED (NOT APPLIED) + code residue

Migration **181** `fsi-app/supabase/migrations/181_drop_vendor_family.sql` (author-only).
Rollback: `fsi-app/supabase/rollbacks/181_drop_vendor_family.down.sql` (recreates 4 tables + 7 indexes
+ endorsement-count fn + 2 triggers + RLS + 9 policies from mig-007 DDL + live policy defs).

Objects dropped: tables vendors, vendor_endorsements, vendor_regulations, vendor_technologies (all 0
rows); function update_vendor_endorsement_count(); their triggers (vendors_updated_at,
vendor_endorsement_count_trigger) fall via CASCADE. Shared update_updated_at() KEPT.

Fresh confirmation (this session): all 4 tables 0 rows; NO inbound FK from outside the family
(pg_constraint probe = null; case_studies/forum_threads linked_vendor_ids are uuid[] arrays, not FKs);
ZERO code writers/readers (`.from('vendor*')` grep over src+scripts .ts/.tsx/.mjs = 0 outside
_snapshots/_diag data). The type-union residue (src/types/community.ts) was already deleted in e2.
Discharges DB-4 F11 / §2(c); master P3.

NOT touched (deliberately out of e3 scope, ride other decisions): notification_events CHECK
'vendor_endorsed' + notification_subscriptions CHECK 'vendor' (notification-v1 trio, DB-4 F5);
forum_sections 'vendor-reviews' seed row (forum-layer, DB-4 F6); the word "vendor" in
vertical-fit.ts / classify-source-role.ts (about SOURCE roles, not the directory — keep);
privacy/page.tsx copy mention (text only).

## e6 — user_profiles mirror retirement (mig-075 Phase 3) — 2 MIGRATIONS AUTHORED (NOT APPLIED)

Two ordered migrations (182 MUST apply before 183):
- **182** `182_repoint_policies_off_user_profiles.sql` — repoints the 3 RLS policy arms that read
  `user_profiles.is_platform_admin` onto `profiles.is_platform_admin`
  (moderation_reports_select, moderation_reports_update_admin, post_promotions_select). Non-admin arms
  reproduced verbatim from live defs; the admin EXISTS subquery changes `user_profiles up WHERE
  up.user_id = auth.uid()` → `profiles up WHERE up.id = auth.uid()`. No rollback file (a superseding
  policy definition; 183's rollback recreates the table, and reverting 182 is optional — see 183 down).
- **183** `183_drop_user_profiles_mirror.sql` — drops table user_profiles (CASCADE) + trigger
  `profiles_mirror_to_user_profiles` ON profiles + both mirror fns (`_mirror_profiles_to_user_profiles`,
  `_mirror_user_profiles_to_profiles`). Shared `update_updated_at()` KEPT.
  Rollback `183_drop_user_profiles_mirror.down.sql` recreates table + indexes + constraints + 4 RLS
  policies + both mirror fns + 3 triggers, then re-seeds user_profiles from profiles.

Fresh live confirmation (2026-07-11): the ONLY remaining references to user_profiles were exactly the
3 policy arms (DB-4 F3); zero code readers/writers; no inbound FK. profiles holds the authoritative
is_platform_admin (identical value via the live mirror). Discharges DB-4 F3 (+ F3a asymmetry, gone by
construction); master P3.

DEPENDENCY NOTE for the orchestrator: 182 → 183 order is HARD. Apply 182, verify the 3 policies point
at profiles, then apply 183. Applying 183 first breaks the moderation/promotions read+update gates.

## e7 — ingestion_state + ingestion_control_log — EXPORT SCRIPT + DROP MIGRATION AUTHORED (NOT APPLIED)

Frozen contradictory zero-consumer pair (1,483 rows: ingestion_state 774, ingestion_control_log 709).
- Export script: `fsi-app/scripts/_wave-alpha/export-ingestion-pair.mjs` — READ-ONLY, service-role
  SELECT + local JSONL write. Per the PUBLIC-repo scope correction it writes to a LOCAL out-dir
  (`--out`, or `$WAVE_ALPHA_OUT`, default gitignored `scripts/tmp/_wave-alpha-ingestion-pair-2026-07-11`),
  NOT docs/archive. Emits ingestion_state.jsonl + ingestion_control_log.jsonl + manifest.json
  (rows + columns + byte size per file). **Orchestrator runs it BEFORE applying 184, then relocates the
  output to the PRIVATE repo Dwarves77/caros-ledge-backups under archives/ingestion-pair-2026-07-11/.**
  Syntax-checked (node --check); no hardcoded home paths.
- Drop migration: **184** `184_drop_ingestion_pair.sql` (author-only) drops both tables.
  Rollback `184_drop_ingestion_pair.down.sql` recreates the schema (tables/indexes/RLS/policies from
  mig 058/059 live defs); DATA restore = re-import the archived JSONL from the private snapshot.

Fresh confirmation: zero src consumers (live pause reads system_state + sources.processing_paused;
auto-run on sources.auto_run_enabled); no inbound FK; no triggers. Discharges DB-3 F5 / DB-4 F4c;
master P3. ORCHESTRATOR PRECONDITION: export + relocate BEFORE apply.

## e9 — Dead columns — DROP MIGRATION AUTHORED (NOT APPLIED)

Migration **185** `185_drop_dead_columns.sql` (author-only) + rollback `185_drop_dead_columns.down.sql`.
Conservative per e9: dropped ONLY the 7 columns that cleared ALL THREE checks — X-register "dead"
verdict + fresh precise code grep (0 readers in src/+scripts/) + live catalog probe (0 fn/view/trigger
refs AND all-NULL data). Grouped by table.

DROPPED (7):
| Column | Evidence |
|---|---|
| intelligence_item_versions.created_by_run_id | NULL×all; src 0; no fn/view ref [X.1(a), DB-1 VER-1] |
| regions.operations_decisions | '{}'×5; src 0 (regions selects explicit, exclude it); no fn/view ref [DB-1 RGN-1] |
| region_dimension_coverage.last_reviewed_at | NULL×all; src 0; no fn/view ref [DB-1 RDC-1] |
| sources.classification_observed_distribution | NULL×all; src 0; no fn/view ref [DB-2 F6] |
| sources.last_observed_at | NULL×all; src 0; no fn/view ref [DB-2 F6] |
| sources.spotchecked_at | NULL×all; src 0 (only `spotchecked` bool read); no fn/view ref [DB-2 F6] |
| sources.spotchecked_by | NULL×all; src 0; no fn/view ref [DB-2 F6] |

### e9 HELD (ambiguous or live reader — NOT dropped)
| Column(s) | Reason held |
|---|---|
| region_dimension_coverage.notes | READ live: supabase-server.ts:1984 selects it |
| sources.cited_by | READ live: supabase-server.ts:259,320 |
| intelligence_items.{replaced_by, version_history, linked_forum_thread_ids, linked_vendor_ids, linked_case_study_ids, linked_regulation_ids, region_tags} | Coupled to the active_intelligence_items view (dropped by mig 180) AND referenced by legacy mappers in the still-present src/types/intelligence.ts. Droppable only AFTER 180 applies + those mappers are removed — a sequenced follow-up, not a clean dead-weight erase. |
| intelligence_items.{compliance_deadline, next_review_date, last_verified, operational_impact, open_questions, reasoning} | Returned by live RPC payloads (X.1(a) read-via-RPC) — dropping needs RPC signature edits |
| intelligence_items.{theme, trajectory_points} | theme = Emergence-Capture follow-on owns it; trajectory_points = read-no-writer by TrajectoryBars + market RPC (live readers) |
| intelligence_item_sections.source_ids | READ live: SourcesList.tsx (per its A5.3 comment) |
| section_claim_provenance.verified_by / verified_at | Ambiguous grep (name collisions with *_by_source_id); X says reserve-or-drop — not clean-proven |
| agent_runs.intelligence_item_version_id / duration_ms | Hot table; ambiguous grep; X "dead" but not clean-proven this pass |
| agent_run_searches.agent_run_id | Referenced by the insert site (X: src=1); dropping risks the writer |
| provisional_sources.{domain, promoted_to_source_id, accessibility_verified, publishes_structured_content, entity_identified} | domain READ (supabase-server:356); others tied to promote-flow half-completion |
| source_citations.context, monitoring_queue.item_id, taxonomy_nodes.* | Constant/telemetry/whole-table — separate rulings, out of clean-erase scope |

Discharges the clean-provable slice of X.1(a); the rest explicitly held for sequenced follow-ups.

## e10 — Cosmetics + doc drift — DONE (edits, no deletions)

Code:
- `src/app/theme.css` — removed the duplicate dark `--destructive-quiet` (#E0774A at :531) that
  overrode the deliberate AA-contrast value (#F0855A at :510); collapsed the 4 stacked light-theme
  comment blocks + duplicate declaration into one (kept the T11 definition). [CODE-4b F7]
- `src/components/sources/SourceHealthDashboard.tsx` — the inline T1–T7 tier legend now sources each
  authority name from `TIER_LABELS` (src/lib/tier-labels.ts, the drift-guarded SoT); dashboard-specific
  example glosses kept in a local map. [CODE-4a F-06]
- `src/components/ui/EditorialMasthead.tsx` — hoisted the "Vol IV" literal to a documented
  `EDITORIAL_VOLUME` constant (deliberate editorial design constant, not stale data). [CODE-4a F-07]

Doc drift (fsi-app/.claude/CLAUDE.md):
- browserless.ts corrected: it is LIVE (typed Browserless wrapper, ~7 importers), NOT retired — the
  master gap register's named fix. source-pool.ts + source-mapping.ts moved to a "removed 2026-07-11"
  line (both deleted this wave). [master P3; CODE-1 F-04]
- Key Files: removed the deleted `src/data/source-mapping.ts` line. [CODE-4b F8]
- Sector Activation: corrected the "Both surfaces use the shared SectorSelector" claim — the component
  was never mounted and was deleted (e2); surfaces build sector UI inline. [CODE-4a F-08]
- "2,325 intelligence_summaries" hardcoded count (×3 occurrences) → pointed at a live
  `count(*)` query per doctrine-not-state. [CODE-5b/DB-1 stale-count]
- Kept: SectorSynopsisView "DO NOT remove" doctrine (SectorSynopsis.tsx is HELD, still present);
  IntelligenceMetadataStrip Key-Files line (HELD file).

Discipline docs: added a concise STALE-CONTENT notice pointing at the live SoT
(rules/fitness/consistency dirs + invariants.mjs/skill-map.mjs) to the 4 READMEs
(.discipline/README.md, fitness/README.md, consistency/README.md, INSTALL.md) rather than a full
rewrite (avoids introducing new drift). [CODE-2 F-9]

tsc clean after all e10 code edits.

## e8 — _snapshots classification (F-5a-15 ruling, enacted per PUBLIC-repo scope correction)

Scope: the 1,144 files under `fsi-app/scripts/_snapshots/` tracked in THIS worktree at baseline
(the operator's live machine additionally holds newer untracked ones; those aren't in this checkout).
Full per-file manifest: `docs/ops/wave-alpha-closeout-2026-07-11/e8-snapshots-classification.tsv`
(class · bytes · path). Total 10,461,870 bytes; largest single file 2.84 MB (redo-prior-...jsonl) —
**under the 5 MB hold threshold, nothing held for size.**

Classification counts:
| Class | Files | Bytes |
|---|---|---|
| **reversal_record** (non-regenerable prod-write pre-state dumps) | 1,142 | 10,434,427 |
| **regenerable_diagnostic** (run logs) | 2 | 27,443 |

- reversal_record = 1,133 `*.jsonl` (db.mjs guarded-write prior-value snapshots, each carrying
  `{"_cite":{skill,reason},"table","prior":{…}}`) + 9 `*.json` prior/reversal dumps (ws1-prove-*-prior,
  backlog-dispose reversal_deferral_flag_ids, e2-defer, e44a5408-prior-archive). These are the ONLY undo
  record for past prod mutations — NON-REGENERABLE.
- regenerable_diagnostic = `lane-28jun.log`, `ws1-restore3.log`.

Enacted:
- The 2 regenerable diagnostics were **git-untracked** (`git rm --cached`) so they honor the existing
  `.gitignore:64` rule going forward; files remain on the operator's disk. ("Regenerable diagnostics
  stay ignored.")
- The 1,142 reversal records are **NOT moved into docs/archive** — dotfiles is a PUBLIC repo (scope
  correction 2026-07-11), so corpus-content reversal dumps must not be relocated within it. They stay
  where they are (already in public git history) pending the **orchestrator's relocation to the PRIVATE
  repo Dwarves77/caros-ledge-backups under archives/prod-write-reversals/**, after which they can be
  untracked from the public repo. NOT unilaterally deleted here (removing before the private copy exists
  would risk the only reversal records). This closes F-5a-15's "durable home vs untrack" as: durable
  home = the private backups repo; the split-brain ends once the orchestrator completes the copy.

<!-- Sections below appended per wave -->
