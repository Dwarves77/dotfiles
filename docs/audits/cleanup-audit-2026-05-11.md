# Wave cleanup audit, 2026-05-11

Read-only classification of artifacts shipped during the May 9-11 wave (PRs #80-93+, migrations 051-066, plus docs and one-shot scripts). No deletions, no archives, no reverts. The doc is the deliverable.

## TL;DR

Across the five categories audited, the inventory is roughly:

- LOAD-BEARING: 26 items (12 home widgets + 5 lib helpers + 1 worker route + 8 in-doc citations from production code or other surviving docs)
- SCAFFOLDING: 24 items (12 of 12 migration 063 columns, 1 of 1 migration 062 column, 5 of 6 underscore scripts, 6 of 17 docs only referenced from walk-away or each other)
- DEAD: 1 export (`haikuClassify` in `src/lib/llm/haiku-classify.ts`, no production caller; the script duplicates the logic locally)

Highest-value safe cleanup: archive the six one-shot underscore scripts in `fsi-app/scripts/` (they ran exactly once for a specific dispatch, are fully described in their own doc trail, and have zero callers). Moving them to `fsi-app/scripts/archive/` removes ~600 lines of evidence noise from the active scripts directory without losing anything reproducible.

## 1. Migration 063 columns

The migration adds 12 columns to `sources`. Production code reads or writes none of them. Two ops scripts (`_task6-source-inserts-preview.mjs` and `_phase2-step1-task6-inserts.mjs`) populated the 11 Task 6 sources via raw SQL emitted into `scripts/tmp/task6-inserts*.sql`. The other 772 of 783 sources still hold NULL.

The 5-axis source classification framework's read paths (Wave 1c source-aware routing classifier, drift detection, tier conflict resolution) are pending. The columns were added in advance of the consumer landing.

| Column | Verdict | Evidence | Required to activate |
|---|---|---|---|
| `source_role` | SCAFFOLDING | grep across `src/`: zero hits. Only the two Task 6 scripts and the migration itself. | Wave 1c routing classifier needs to branch on role for tier-aware fetch dispatch. Also a `/admin/sources` UI surface to display the role. |
| `secondary_roles` | SCAFFOLDING | Same. Zero production reads or writes. | Same as `source_role`. The framework treats this as a fallback to the URL-path split mechanism, so it may stay sparsely populated. |
| `tier` | SCAFFOLDING (no-op for new schema) | Per operator note, `tier` collides with an existing column on `sources`. Migration uses `ADD COLUMN IF NOT EXISTS`, so 063 was a no-op for this column. The pre-existing `sources.tier` is read in production by `src/lib/sources/discovery.ts`, `src/lib/jurisdictions/tiers.ts`, and tier-T1 grep hits. | The 063-introduced semantics (T1-T6 vs the existing string set) require either renaming or a values-mapping migration. |
| `jurisdictions` | SCAFFOLDING | Two doc-comment references in `src/lib/coverage-gaps.ts:21` and `src/lib/tier1-priority-jurisdictions.ts:142` describe what the column WILL hold; no SELECT or UPDATE issued from production. The 63-file grep for "jurisdictions" matched a different concept (jurisdiction string fields elsewhere). | A SELECT in coverage-gaps or the routing classifier would activate it. |
| `scope_topics` | SCAFFOLDING | Zero hits in `src/`. | Topic-aware routing or topic-based filtering UI would activate it. |
| `scope_modes` | SCAFFOLDING | Zero hits. | Mode-aware filters in `/research` or `/regulations`. |
| `scope_verticals` | SCAFFOLDING | Zero hits. | Vertical-aware filtering, e.g. fine_art-only ingestion subset for the artworks tracker. |
| `expected_output` | SCAFFOLDING | Zero hits. | Drift detection consumer that compares it against `classification_observed_distribution`. |
| `classification_assigned_at` | SCAFFOLDING | Zero hits. | Re-classification staleness reporting in `/admin`. |
| `classification_observed_distribution` | SCAFFOLDING | Zero hits. | A daily aggregator job that rolls up classified items by source over a window, plus the drift consumer above. |
| `observed_correctness_count` | SCAFFOLDING | Zero hits. The `NOT NULL DEFAULT 0` makes it safe to leave. | An incrementer in the moderation flow when an item is confirmed-correct in `/admin` review. |
| `last_observed_at` | SCAFFOLDING | Zero hits. Distinct from the existing `last_intelligence_item_at` per migration comment. | Set by the same incrementer, surface in source-health views. |

Net: all 12 are scaffolding for the Wave 1c source-aware routing classifier that has not landed. Schema is correct; cost is nil (NULL columns plus one INTEGER DEFAULT 0). Recommend keeping in place. The framework doc at `docs/source-classification-framework-2026-05-10.md` (referenced by the migration header) is the contract Wave 1c will fulfill.

## 2. Migration 062 hidden_reason

| Column | Verdict | Reads | Writes |
|---|---|---|---|
| `intelligence_items.hidden_reason` | SCAFFOLDING | Zero in `src/`. No SELECT, no UPDATE, no admin queue surface displays it. | Two historical UPDATEs (NYC ICE and Latvian Saeima rows) drafted by `scripts/_write-deletion-preview-v2.mjs:95-152`. The script emits SQL into `docs/deletion-preview-2026-05-10.md`; it does not execute the UPDATE itself (the operator ran the SQL by hand). |

Required to activate as load-bearing: a `/admin` queue that lists `intelligence_items WHERE pipeline_stage='archived' AND hidden_reason IS NOT NULL`, ordered by `updated_at DESC`, with the reason text rendered alongside title and source. That queue does not exist today. Until it does, the column is a write-only audit field with two row-values.

The migration is cheap (nullable TEXT) and the column carries a meaningful reason for the two flagged-and-hidden rows that would otherwise look like silent archives. Recommend keeping the column and the historical writes, and adding the queue surface when the moderation tooling next gets attention.

## 3. Underscore-prefixed scripts

Six files at `fsi-app/scripts/_*.mjs`. None are referenced from `package.json`, `.github/workflows/`, or any other script. All are self-contained one-shots with header comments describing the dispatch task they served.

| Script | Verdict | Rationale |
|---|---|---|
| `_smoke-run-task3.mjs` | ARCHIVE | Single-shot smoke for Task 3 cold-start scoreboard fix. Header explicitly says "no cleanup needed". Hard-coded source URL (FreightWaves sustainability index). Not regeneratable trivially because of the admin-token mint pattern, but not needed again either. Move to `scripts/archive/` so the auth pattern is preserved as a worked example. |
| `_task4-backfill-preview.mjs` | ARCHIVE | Read-only preview of the agent_runs.intelligence_item_id and sources.last_intelligence_item_at backfills. Output written to `scripts/tmp/task4-backfill-preview.json` and summarized in `docs/task4-backfill-preview-2026-05-10.md`. The execute script that followed (separate file, ran the actual UPDATE) is not in the underscore set. Preview value lives entirely in the doc. |
| `_task6-source-inserts-preview.mjs` | ARCHIVE | Existence check plus SQL preview for the 11 Task 6 source registrations. Output consumed by `_phase2-step1-task6-inserts.mjs`. Both are now historical. Worth keeping for reference because the 5-axis classification SQL pattern is non-trivial. |
| `_phase2-step1-task6-inserts.mjs` | ARCHIVE | Executor of `scripts/tmp/task6-inserts-v2.sql`. Already ran. Will not re-run (sources are now in the registry). Worth archiving alongside the preview as a paired example. |
| `_deletion-preview-title-only.mjs` | ARCHIVE | Read-only Task 1 re-run with title-only pattern matching after the broader title+summary+full_brief preview produced 6 false positives. Output written to `scripts/tmp/deletion-preview-title-only.json`, consumed by `_write-deletion-preview-v2.mjs`. Pattern (title-only OOS pre-classifier) is referenced in `docs/classification-rules-audit-2026-05-09.md:375` as a proposed permanent fix; if that fix lands, this script is the seed for it. |
| `_write-deletion-preview-v2.mjs` | ARCHIVE | Doc generator. Consumed `deletion-preview-title-only.json`, wrote `docs/deletion-preview-2026-05-10.md`, also drafted the migration 062 hidden_reason UPDATEs. Already ran. The output doc is the artifact. |

All six are KEEP-AS-ARCHIVE rather than DELETE because three of them (the two Task 6 scripts and the title-only preview) embed patterns that are likely to be re-used: the 5-axis SQL emit, the admin-token mint, the title-pattern OOS gate. None should DELETE outright. None should KEEP in the active `scripts/` directory either, because they will never run again as-is.

## 4. Reference docs

Inventory of the 17 audited docs in `dotfiles/docs/` from the May 9-11 wave (excluding `walk-away-handoff-2026-05-09.md` per operator scope).

| Doc | Verdict | References found |
|---|---|---|
| `four-page-architecture-survey-2026-05-09.md` | KEEP-BUT-MARK | Cited by `primitives-audit-2026-05-09.md:12,264`, `source-coverage-diagnostic-2026-05-09.md:10`, `source-map-existence-check-2026-05-10.md:11`, `classification-rules-audit-2026-05-09.md:14`. Strong cross-reference web within the May 9 audit set. Decision-snapshot but heavily linked, so deletion would break four other audits. Add a header annotation marking it historical. |
| `topic-relevance-investigation-2026-05-09.md` | KEEP-BUT-MARK | Cited by `primitives-audit-2026-05-09.md:12,264`, `source-coverage-diagnostic-2026-05-09.md:10`, `classification-rules-audit-2026-05-09.md:15,183,375`. Same pattern. |
| `primitives-audit-2026-05-09.md` | KEEP-BUT-MARK | Cited by `source-coverage-diagnostic-2026-05-09.md:10`. Forward-references the same set. Annotate. |
| `classification-rules-audit-2026-05-09.md` | ACTIVE | Cited by `source-map-existence-check-2026-05-10.md:11,81,242,384`. The title-only OOS gate proposal at line 375 is the seed for a permanent fix that has not yet landed; until it does, this doc is the spec. |
| `source-coverage-diagnostic-2026-05-09.md` | KEEP-BUT-MARK | Self-references its own location at line 274 but no external doc cites it back. Decision-snapshot. |
| `source-map-from-esgtoday-2026-05-09.md` | KEEP-BUT-MARK | Cited by `source-map-existence-check-2026-05-10.md:11` as the audit subject. After the existence check ran, the map is consumed. Annotate. |
| `source-map-existence-check-2026-05-10.md` | KEEP-BUT-MARK | Not cited by any other doc or code. Decision-snapshot for which esgtoday-mapped sources already existed in the registry. |
| `auth-architecture-audit-2026-05-10.md` | KEEP-BUT-MARK | Not cited externally. Useful one-shot context if the operator returns to the bearer-token-from-Node pattern. The pattern is now embedded in `_smoke-run-task3.mjs` and `src/app/api/worker/drain-first-fetch/route.ts:94-120`, so the doc is a worked-example reference. |
| `dashboard-payload-audit-2026-05-11.md` | ACTIVE | Cited by `src/lib/supabase-server.ts:615` and by `supabase/migrations/064_workspace_intelligence_dashboard_rpc.sql:11`. The migration is load-bearing per operator, and the audit is the column-list contract behind the RPC. Keep as active spec. |
| `font-usage-audit-2026-05-11.md` | ACTIVE | Cited by `src/app/layout.tsx:19` as the source-of-truth for the font weights bundled into the build. Cheap to keep, expensive to lose (re-derivation requires re-grepping all components). |
| `registry-to-ingestion-handoff-design-2026-05-10.md` | ACTIVE | Cited by `supabase/migrations/065_pending_first_fetch_queue.sql:5` and `src/app/api/worker/drain-first-fetch/route.ts:28`. Design contract for the queue + drain pattern. |
| `wave1-track5-widget-implementation-plan.md` | KEEP-BUT-MARK | Cited only by `walk-away-handoff-2026-05-09.md:87`. Implementation has shipped (the home widgets exist). The doc is now historical. |
| `wave1-foundation-integration-plan.md` | ARCHIVE | Not cited by any other doc, code, or migration. The plan was executed. Three pre-flight corrections at the top (verification.ts path, .github/ greenfield, access_method enum already existing) are now baked into shipped code, so re-reading the plan adds zero value. |
| `wave1-track1-summary.md` | ACTIVE | Cited by `scripts/wave1-api-discovery-summarize.mjs:8,22` (the script writes to it), and by `walk-away-handoff-2026-05-09.md:85,147,157`. Output of an active script; live document, not a snapshot. |
| `wave1-step1-verification.md` | ACTIVE | Cited by `walk-away-handoff-2026-05-09.md:28,49,139`. Step-1 post-merge verification checklist that travels with the agent/run error-capture fix. Operator may re-run it. Keep. |
| `task4-backfill-preview-2026-05-10.md` | KEEP-BUT-MARK | Generated by `_task4-backfill-preview.mjs` (now archived candidate). Preview was approved and the executor ran. Snapshot of approved diff, not actively referenced. |
| `deletion-preview-2026-05-10.md` | KEEP-BUT-MARK | Generated by `_write-deletion-preview-v2.mjs`. Captured the SQL UPDATEs that the operator then ran by hand. Snapshot, not referenced elsewhere. |

Net: 5 ACTIVE, 11 KEEP-BUT-MARK as historical, 1 ARCHIVE candidate (`wave1-foundation-integration-plan.md`).

## 5. Code helpers added during the wave

Targeted at the files in operator scope.

| Symbol or file | Verdict | Importers and call sites |
|---|---|---|
| `src/lib/sources/fetch-quality.ts` (`checkFetchQuality`, `FetchQualityCheck`, `FetchQualityInput`) | LOAD-BEARING | Imported by `src/app/api/agent/run/route.ts:11` and called at `src/app/api/agent/run/route.ts:327`. |
| `scripts/lib/fetch-quality.mjs` (`checkFetchQuality` mirror) | LOAD-BEARING (ops) | Imported by `scripts/wave1-cold-start.mjs:28`. The mirror exists because scripts cannot import the TypeScript module. Keep both in sync. |
| `src/lib/llm/haiku-classify.ts` `haikuVerifyCandidate` | LOAD-BEARING | Imported by `src/lib/sources/verification.ts:27` and called at `src/lib/sources/verification.ts:569`. |
| `src/lib/llm/haiku-classify.ts` `haikuClassify` | DEAD (today) | Exported but no caller. Header comment says it is "used by Wave 1a content classification on successful raw_fetches". The actual cold-start script `scripts/wave1-cold-start.mjs:231` defines its OWN local `haikuClassify` function that does not import from this module. The export is therefore unused. Wave 1a content classification has not yet wired the production agent path to call this export. |
| `src/lib/llm/haiku-classify.ts` constants (`HAIKU_MODEL`, `VERIFICATION_HAIKU_SYSTEM_PROMPT`, etc.) | LOAD-BEARING | Same import as `haikuVerifyCandidate`. |
| `src/lib/sources/api-fetch.ts` (`apiFetch`, `ApiFetchError`) | LOAD-BEARING | Imported by `src/app/api/agent/run/route.ts:9`. |
| `src/lib/sources/rss-fetch.ts` (`rssFetch`, `RssFetchError`) | LOAD-BEARING | Imported by `src/app/api/agent/run/route.ts:10`. |
| `src/components/admin/MtdSpendTile.tsx` | LOAD-BEARING | Imported by `src/components/admin/AdminDashboard.tsx:23`, rendered at line 334. |
| Home widget set: `DashboardHero`, `DashboardAwaitingReview`, `DashboardByOwner`, `DashboardCoverageGaps`, `DashboardWatchlist`, `DueThisQuarter`, `HomeSurface`, `HousekeepingSection`, `SummaryStrip`, `Supersessions`, `TopUrgency`, `TypesetSection`, `WeeklyBriefing`, `WhatChanged` | LOAD-BEARING | All composed in `src/components/home/HomeSurface.tsx` and reached via `src/app/page.tsx`. Cross-imported across the home subtree. 22 importer files in total. |
| `src/app/api/worker/drain-first-fetch/route.ts` | LOAD-BEARING | Invoked by `.github/workflows/source-monitoring.yml:85,89,110,117`. The workflow target is `$base/api/worker/drain-first-fetch`. |

`haikuClassify` (the export) is the only outright dead symbol. Two safe options: leave it (zero cost, ready when Wave 1a wiring lands), or delete it (the script has a self-contained equivalent). The audit recommends LEAVING it for now because the Wave 1a content classification consumer is on the next wave's roadmap and the function carries the prompt + cost-estimation logic the consumer will need.

## Recommended cleanup actions, ordered by safety

### Safe (zero risk)

1. Move the six underscore scripts to `fsi-app/scripts/archive/`. None are invoked by anything; all are documented in their own headers and in companion docs. Removes ~600 lines of evidence noise.
2. Move `wave1-foundation-integration-plan.md` to `dotfiles/docs/archive/`. Zero references; the plan was executed.

### Low risk, requires 30 seconds of review

3. Add a one-line "Historical: <date>, kept for cross-reference" header to the 11 KEEP-BUT-MARK docs in section 4. Keeps grep paths working but signals to future readers that the audit decisions were already acted on.
4. The `haikuClassify` export in `src/lib/llm/haiku-classify.ts` can stay; if it bothers the operator as dead code, delete the function (lines 277 onward) and its constants used only by it. Lossless because `scripts/wave1-cold-start.mjs:231` carries an equivalent local copy.

### Operator decision before removal

5. Migration 063's 12 columns are scaffolding today but cheap. The decision is whether Wave 1c is on the roadmap. If yes, leave them. If the framework is shelved, a follow-up migration could DROP them; the doc trail is sufficient to re-add later.
6. Migration 062's `hidden_reason` column has two row-values. Removal requires a follow-up DROP and a decision on whether the two flagged-and-hidden items lose their reason text or get migrated to a separate audit table. Recommend leaving until the moderation queue surface lands.

## What this audit does NOT recommend

- Deleting any of the six underscore scripts outright. Three of them (Task 6 preview, Task 6 inserts, title-only deletion preview) embed patterns that are likely to be re-used. Archive, do not delete.
- Removing migration 063 columns. The framework consumer (Wave 1c) is on the roadmap per the migration header. The columns are nullable and cheap.
- Removing `hidden_reason`. Two existing row-values would be lost.
- Removing `haikuClassify`. The Wave 1a content classification wiring is the consumer the export is waiting on.
- Removing the `KEEP-BUT-MARK` docs. They form a cross-reference web inside the May 9 audit set; cutting one breaks the others' citations.
- Touching anything in fsi-app's home widget set. Every widget is imported into `HomeSurface.tsx` and reachable from `app/page.tsx`.
- Touching the dashboard RPC migration 064, the queue migration 065, or the listings RPC migration 066. Out of scope per operator.
- Touching in-flight PR branches #93, #94, #95.

## Notes on coverage gaps in this audit

- The audit grepped for column names and import paths but did not exhaustively trace every SELECT inside RPCs. If migration 064 or 066's RPC body internally selects from migration 063's columns, the audit would not have surfaced it. The migration files were spot-checked; no such selects appeared.
- The audit did not verify that the GitHub Actions workflow `source-monitoring.yml` is actually scheduled and running. It verifies the workflow exists and references `drain-first-fetch`.
- The audit did not run the build to confirm dead-code elimination would or would not pick up `haikuClassify`. The export is not annotated `@__PURE__`, so a tree-shaker should drop it from the production bundle anyway, making the dead-code cost effectively zero.
