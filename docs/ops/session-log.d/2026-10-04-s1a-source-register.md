# 2026-10-04 lane s1a-source-register

## Accomplished
- The free brief path (apply-record-briefs grow step) now registers and rates every source an entry cites, with no "New Sources Identified" table needed. New `registerEntryCitations` in `fsi-app/src/lib/sources/source-growth.ts` reuses `registerCitedSources` and `recordCitations`: existing source gets a `host_class_table` tier opinion when the class table disagrees, unknown classifiable host registers provisional at class tier, null class goes to `provisional_sources`, and an edge item source -> cited source is written, then credibility and reputation recompute for each cited source.
- `growSourcesFromBrief` and `growSources` (canonical-pipeline.ts) take one optional extra parameter; omitted means unchanged behaviour.
- Dry mode (`previewEntryCitations`, wired into `runApplyLoop` via `previewEntry`) reports decisions, edges and opinions with read-only lookups; confirmed 0 writes on a fixture.
- Audit fix: reputation trust events wrote `created_by: "reputation-cycle"`, which the migration 004 CHECK (system, worker, human) rejects, and the rejection was swallowed. Now `created_by: "worker"` with `details.actor: "reputation-cycle"`; failures are `console.warn`ed, never thrown. Logic extracted to `applyReputationRecompute` and `buildReputationEventRow`.
- Admin override: `applyReputationRecompute` skips every write when `tier_override` is set; class-table opinions are skipped for overridden rows.

## Read and reused
source-credibility-model SKILL, source-growth.ts (+ selftest, tier-opinion-dedup npmtest), tier-opinion-writer.ts (`recordTierOpinion`, `opinionSource`), host-authority.ts (`classTierForHost`), canonical-pipeline.ts (`registerBriefSources`, `growSources`), apply-record-briefs.mjs, record-briefs schema and README, trust.ts (`recomputeEffectiveTier`, read only), migrations 004 and 093, scripts/maintenance/tier-opinions.mjs (repeat opinions are not deduped by design; followed).

## Decisions
- `metadata.sources_used` holds source UUIDs (metadata contract), not urls. UUIDs (also `claims[].source_id`) get an edge to the existing source without registration; http values are registered as urls.
- Edge direction follows the brief: citing = item source, cited = each cited source.
- Cited-source name falls back to the host when no name is known.
- Opinion is recorded only when the matched row's host equals the cited host (the existing ilike lookup is a substring match; unchanged for registration, guarded for opinions).

## NOT done
- No live run, no data population (operator ruling 2026-10-04). Pending marker `brief-apply/pending/2026-10-04-s1a-source-register.md` owes the next brief-apply run.
- The substring `ilike` host lookup in `registerCitedSources` is unchanged for registration (pre-existing, noted in its own code comment).

## Open items
- Repeat applies of the same batch record repeat class-table opinions (same as the maintenance tier-opinions step; the table is append-only by design).
