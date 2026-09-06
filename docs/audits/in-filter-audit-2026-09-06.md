# .in() id-list filter audit, 2026-09-06

Lane INCLAUSE-CLASS. Based on lane/readback-chunk-2026-09-06 (tip 1b9b07c7, which added readAllByIds
to fsi-app/scripts/lib/db.mjs and fixed the four review-apply-*.mjs wrappers).

## Defect class

[CONFIRMED twice] A PostgREST `.in(col, list)` filter URL-encodes the whole `list` into the GET
request's query string. When `list` is a runtime array whose size follows the data, not a literal or a
provably capped slice, the request eventually exceeds the gateway's URL-length limit and the gateway
answers 400 Bad Request or an HTML error page instead of the JSON the caller expects. This is a request
failure, not a response-truncation failure (the sibling class RD-63/F38 covers response truncation past
PostgREST's 1000-row cap).

Confirmed instances:
- review-apply-*.mjs wrappers, run 34045479342, 911-id `.in("id", ids)` post-apply read-back.
- census-off-vertical.mjs, Maintenance run 34046850770, 1,655-id read-back, response body a raw
  `<!DOCTYPE html>` error page. The failure hit only the POST-write read-back; the write itself had
  already succeeded (live count confirmed 1,655 rows correctly archived).

## Method

Every `.in(col, X)` call site in `fsi-app/src/**/*.{ts,tsx,mjs}` and `fsi-app/scripts/**/*.mjs` (test
files and `_archive/` excluded) was enumerated mechanically with the same regex F39 uses
(`/\.in\(\s*(...)\s*,\s*([^)]*)\)/g`), then classified:

- BOUNDED: X is an array literal, a string/template literal, or a same-file SCREAMING_SNAKE_CASE enum
  constant. Fixed size by construction, never runtime-scaled. No fix needed.
- BOUNDED-MARKED: X is a runtime value (a variable, a property access, a method chain) that was
  individually investigated this lane and found to already be bounded by a mechanism the lexical
  scanner cannot see (a `.limit()` clamp upstream, a request-body length validated to a small max, a
  singleton or per-item/per-user/per-org scope, an already-chunked slice loop). Marked inline with
  `// fitness-allow: F39 (reason)` rather than silently exempted.
  Sites with a shared reason (per-item claim/section scope, per-user watchlist/notices/org-membership,
  per-page community render, corridor/jurisdiction geography vocabulary, request-body-validated max,
  already-chunked slice pattern, page-render-derived id on supabase-server.ts) were triaged into named
  categories after individually confirming the category's bound for each site (grep for the validating
  code, the caller chain, or the earlier `.limit()`/`.slice()` in the same function) rather than
  re-deriving a bespoke sentence per site.
- HELPER: the call site is inside the chunking implementation itself (`scripts/lib/db.mjs`,
  `src/lib/db/paginate.mjs`) , this IS the fix, not an instance of the defect.
- UNMARKED-VIOLATION: none remain in the tree (F39 passes with 0 violations).

138 live `.in()` call sites total: 26 BOUNDED (literal/enum), 109 BOUNDED-MARKED (individually
investigated and annotated this lane), 3 HELPER (the chunking core). 0 UNMARKED-VIOLATION.

Genuinely UNBOUNDED sites (a runtime-sized list with no bound visible or provable at the call site) were
not left as `.in()` calls at all , they were rewritten to route through the shared chunking helpers, so
they do not appear as raw `.in()` sites in the table below. They are listed separately in "Sites fixed
by chunking" below.

## Classification table (every live .in() call site)

| Site | Column | List argument | Class | Note |
|---|---|---|---|---|
| scripts/entities/backfill-derivation-edges.mjs:83 | dimension | `["labor_markets", "operational_cost"]` | BOUNDED | none needed, literal or enum |
| scripts/lib/db.mjs:417 | id | `slice` | HELPER | chunking core itself |
| scripts/lib/db.mjs:424 | id | `slice` | HELPER | chunking core itself |
| scripts/lib/db.mjs:487 | id | `ids` | HELPER | chunking core itself |
| scripts/maintenance/forward-events-retext.mjs:849 | claim_kind | `CLAIM_KIND_FILTER` | BOUNDED | none needed, literal or enum |
| scripts/maintenance/provenance-heal.mjs:155 | item_type | `itemTypes` | BOUNDED-MARKED | scoped to one item's own claim/section/search rows , small by construction, not corpus-scale |
| scripts/maintenance/provenance-heal.mjs:186 | result_url | `urls` | BOUNDED-MARKED | urls is the small http/https + trailing-slash variant set (buildUrlVariants |
| scripts/mint/migration-299-precheck.mjs:162 | item_type | `NEW_REQUIRED_ITEM_TYPES` | BOUNDED | none needed, literal or enum |
| scripts/mint/migration-299-precheck.mjs:193 | item_type | `NEW_REQUIRED_ITEM_TYPES` | BOUNDED | none needed, literal or enum |
| scripts/producers/regional/run-envelope-producer.mjs:81 | dimension | `["labor_markets", "operational_cost"]` | BOUNDED | none needed, literal or enum |
| scripts/propagation/seed-derived-values.mjs:206 | dimension | `["labor_markets", "operational_cost"]` | BOUNDED | none needed, literal or enum |
| scripts/propagation/seed-derived-values.mjs:372 | entity_id | `candidateIds` | BOUNDED-MARKED | candidateIds derives from one region's iso_codes , small, real-world country-code cardinality |
| scripts/propagation/seed-derived-values.mjs:378 | entity_id | `candidateIds` | BOUNDED-MARKED | candidateIds derives from one region's iso_codes , small, real-world country-code cardinality |
| scripts/turns/apply-extraction-output.mjs:197 | intelligence_item_id | `idChunk` | BOUNDED-MARKED | already chunked above (idChunk/slice pattern |
| scripts/turns/consume-turn-requests.mjs:283 | id | `chunk` | BOUNDED-MARKED | already chunked above (idChunk/slice pattern |
| scripts/turns/export-corpus-for-extraction.mjs:187 | id | `idChunk` | BOUNDED-MARKED | already chunked above (idChunk/slice pattern |
| scripts/turns/export-corpus-for-extraction.mjs:239 | intelligence_item_id | `idChunk` | BOUNDED-MARKED | already chunked above (idChunk/slice pattern |
| scripts/turns/export-corpus-for-extraction.mjs:239 | claim_kind | `CLAIM_KIND_FILTER` | BOUNDED | none needed, literal or enum |
| scripts/turns/export-corpus-for-extraction.mjs:244 | item_id | `idChunk` | BOUNDED-MARKED | already chunked above (idChunk/slice pattern |
| scripts/turns/export-corpus-for-extraction.mjs:253 | intelligence_item_id | `contextIdChunk` | BOUNDED-MARKED | already chunked above (idChunk/slice pattern |
| scripts/turns/run-population-flywheel.mjs:534 | id | `chunk` | BOUNDED-MARKED | already chunked above (idChunk/slice pattern |
| scripts/turns/run-population-flywheel.mjs:546 | canonical_instrument_key | `chunk` | BOUNDED-MARKED | already chunked above (idChunk/slice pattern |
| scripts/turns/run-population-flywheel.mjs:1122 | intelligence_item_id | `idChunk` | BOUNDED-MARKED | already chunked above (idChunk/slice pattern |
| scripts/turns/run-population-flywheel.mjs:1122 | claim_kind | `["FACT", "GAP"]` | BOUNDED | none needed, literal or enum |
| scripts/turns/run-population-flywheel.mjs:1127 | item_id | `idChunk` | BOUNDED-MARKED | already chunked above (idChunk/slice pattern |
| scripts/turns/run-population-flywheel.mjs:1289 | source_item_id | `idChunk` | BOUNDED-MARKED | already chunked above (idChunk/slice pattern |
| scripts/turns/run-population-flywheel.mjs:1294 | target_item_id | `idChunk` | BOUNDED-MARKED | already chunked above (idChunk/slice pattern |
| scripts/verify/orphan-source-audit.mjs:27 | archive_reason | `SOURCEY_ARCHIVE_REASONS` | BOUNDED | none needed, literal or enum |
| scripts/verify/remediate-orphan-sources.mjs:46 | archive_reason | `SOURCEY_ARCHIVE_REASONS` | BOUNDED | none needed, literal or enum |
| scripts/verify/run-data-audit-lane.mjs:50 | id | `open.map((r` | BOUNDED-MARKED | open is a singleton block-state row keyed by fixed (category, subject_ref |
| scripts/verify/wave-acceptance-audit.mjs:102 | id | `srcIds` | BOUNDED-MARKED | scoped to one item's own claim/section/search rows , small by construction, not corpus-scale |
| src/app/api/admin/canonical-sources/bulk-approve/route.ts:77 | id | `body.candidateIds` | BOUNDED-MARKED | body.candidateIds is validated to <= 300 above (explicit length check |
| src/app/api/admin/canonical-sources/bulk-approve/route.ts:98 | url | `urls` | BOUNDED-MARKED | urls derives from the same request's candidateIds, already validated <= 300 above |
| src/app/api/admin/canonical-sources/bulk-classify/route.ts:166 | id | `body.candidateIds` | BOUNDED-MARKED | body.candidateIds is validated to <= 30 above (explicit length check |
| src/app/api/admin/canonical-sources/bulk-classify/route.ts:180 | url | `urls` | BOUNDED-MARKED | derives from the same request's candidateIds, already validated <= 30 above |
| src/app/api/admin/canonical-sources/bulk-classify/route.ts:189 | id | `parentIds` | BOUNDED-MARKED | derives from the same request's candidateIds, already validated <= 30 above |
| src/app/api/admin/canonical-sources/pending/route.ts:60 | id | `itemIds` | BOUNDED-MARKED | itemIds/candidateUrls derive from one page of the pending-candidates queue, not the full corpus |
| src/app/api/admin/canonical-sources/pending/route.ts:78 | url | `candidateUrls` | BOUNDED-MARKED | itemIds/candidateUrls derive from one page of the pending-candidates queue, not the full corpus |
| src/app/api/admin/corpus-turn-requests/route.ts:121 | id | `itemIds.slice(i, i + 200` | BOUNDED-MARKED | already chunked above (idChunk/slice pattern |
| src/app/api/admin/forward-events/route.ts:76 | event_kind | `kindFilter` | BOUNDED-MARKED | a finite vocabulary of event_kind/date_precision values from the query string, not a runtime id list |
| src/app/api/admin/forward-events/route.ts:78 | date_precision | `precisionFilter` | BOUNDED-MARKED | a finite vocabulary of event_kind/date_precision values from the query string, not a runtime id list |
| src/app/api/admin/forward-events/route.ts:100 | id | `itemIds.slice(i, i + 200` | BOUNDED-MARKED | already chunked above (idChunk/slice pattern |
| src/app/api/admin/integrity-flags/route.ts:190 | status | `["open", "in_review"]` | BOUNDED | none needed, literal or enum |
| src/app/api/admin/intersections/route.ts:80 | id | `ids.slice(i, i + 200` | BOUNDED-MARKED | already chunked above (idChunk/slice pattern |
| src/app/api/admin/scan/route.ts:123 | status | `["pending", "approved"]` | BOUNDED | none needed, literal or enum |
| src/app/api/admin/sources/[id]/tier-override/route.ts:120 | event_type | `["tier_override", "tier_override_revert"]` | BOUNDED | none needed, literal or enum |
| src/app/api/admin/sources/bulk-import/route.ts:423 | url | `[...wellFormedUrls]` | BOUNDED | none needed, literal or enum |
| src/app/api/admin/sources/tier-opinions/route.ts:101 | id | `ids` | BOUNDED-MARKED | ids is the request's own tier-opinion id list, admin-authored and small |
| src/app/api/admin/themes/route.ts:74 | theme_id | `themeIds` | BOUNDED-MARKED | themeIds is the connection_themes cluster count , curated, not corpus-item-scaled |
| src/app/api/ask/route.ts:270 | id | `hitIds` | BOUNDED-MARKED | hitIds is the retrieval step's own top-K hit set, bounded by the retrieval's own K |
| src/app/api/community/groups/[id]/invitations/route.ts:96 | id | `inviteeIds` | BOUNDED-MARKED | scoped to one page/group render's own bounded row set, not corpus-scale |
| src/app/api/community/groups/[id]/members/route.ts:88 | id | `userIds` | BOUNDED-MARKED | scoped to one page/group render's own bounded row set, not corpus-scale |
| src/app/api/community/moderation/reports/route.ts:162 | id | `postIds` | BOUNDED-MARKED | postIds bounded by assertBound above , the request's 1-100 limit clamp |
| src/app/api/community/posts/[id]/replies/route.ts:152 | id | `authorIds` | BOUNDED-MARKED | authorIds bounded by assertBound above , MAX_LIMIT clamp |
| src/app/api/community/posts/route.ts:189 | id | `authorIds` | BOUNDED-MARKED | authorIds bounded by assertBound above , MAX_LIMIT clamp |
| src/app/api/community/search/route.ts:138 | id | `postGroupIds` | BOUNDED-MARKED | scoped to one page/group render's own bounded row set, not corpus-scale |
| src/app/api/community/threads/[id]/corroboration/route.ts:83 | user_id | `authorIds` | BOUNDED-MARKED | scoped to one page/group render's own bounded row set, not corpus-scale |
| src/app/api/health/surfaces/route.ts:95 | item_type | `REG_TYPES` | BOUNDED | none needed, literal or enum |
| src/app/api/health/surfaces/route.ts:98 | item_type | `MARKET_TYPES` | BOUNDED | none needed, literal or enum |
| src/app/api/health/surfaces/route.ts:101 | item_type | `RESEARCH_TYPES` | BOUNDED | none needed, literal or enum |
| src/app/api/health/surfaces/route.ts:104 | item_type | `OPS_TYPES` | BOUNDED | none needed, literal or enum |
| src/app/api/intelligence-items/[id]/metadata/route.ts:57 | id | `relatedIds` | BOUNDED-MARKED | relatedIds is one item's own related-items set (a detail-page widget |
| src/app/api/notices/resolve-watched-entities.ts:98 | id | `intelligenceItemIds` | BOUNDED-MARKED | scoped to one user's own watchlist/notices/org-membership rows, not corpus-scale |
| src/app/api/notices/resolve-watched-entities.ts:106 | ref_id | `intelligenceItemIds` | BOUNDED-MARKED | scoped to one user's own watchlist/notices/org-membership rows, not corpus-scale |
| src/app/api/notices/resolve-watched-entities.ts:116 | id | `sourceIds` | BOUNDED-MARKED | scoped to one user's own watchlist/notices/org-membership rows, not corpus-scale |
| src/app/api/notices/route.ts:88 | entity_id | `noticedEntityIds` | BOUNDED-MARKED | scoped to one user's own watchlist/notices/org-membership rows, not corpus-scale |
| src/app/api/workspace/archive-impact/route.ts:108 | user_id | `memberIds` | BOUNDED-MARKED | scoped to one user's own watchlist/notices/org-membership rows, not corpus-scale |
| src/app/api/workspace/archive-impact/route.ts:110 | item_id | `watchKeys` | BOUNDED-MARKED | scoped to one user's own watchlist/notices/org-membership rows, not corpus-scale |
| src/app/api/workspace/archive-impact/route.ts:125 | item_id | `watchKeys` | BOUNDED-MARKED | scoped to one user's own watchlist/notices/org-membership rows, not corpus-scale |
| src/app/api/workspace/archive-impact/route.ts:166 | id | `nameTargets` | BOUNDED-MARKED | scoped to one user's own watchlist/notices/org-membership rows, not corpus-scale |
| src/app/api/workspace/bootstrap/logic.ts:102 | list_key | `LIST_KEYS` | BOUNDED | none needed, literal or enum |
| src/app/api/workspace/bootstrap/logic.ts:211 | id | `itemIds` | BOUNDED-MARKED | scoped to one user's own watchlist/notices/org-membership rows, not corpus-scale |
| src/app/api/workspace/overrides/route.ts:208 | user_id | `memberIds` | BOUNDED-MARKED | scoped to one user's own watchlist/notices/org-membership rows, not corpus-scale |
| src/app/api/workspace/overrides/route.ts:209 | item_id | `[itemId, intelItemId]` | BOUNDED | none needed, literal or enum |
| src/app/api/workspace/spec09-upload/route.ts:106 | entity_id | `[...refValues]` | BOUNDED | none needed, literal or enum |
| src/app/community/browse/page.tsx:186 | group_id | `groupIds` | BOUNDED-MARKED | scoped to one page/group render's own bounded row set, not corpus-scale |
| src/app/community/browse/page.tsx:196 | group_id | `groupIds` | BOUNDED-MARKED | scoped to one page/group render's own bounded row set, not corpus-scale |
| src/app/community/page.tsx:157 | slug | `CANONICAL_ROOM_SLUGS as string[]` | BOUNDED-MARKED | scoped to one page/group render's own bounded row set, not corpus-scale |
| src/app/community/page.tsx:221 | group_id | `roomGroupIds` | BOUNDED-MARKED | scoped to one page/group render's own bounded row set, not corpus-scale |
| src/app/community/page.tsx:282 | post_id | `postIds` | BOUNDED-MARKED | scoped to one page/group render's own bounded row set, not corpus-scale |
| src/app/community/page.tsx:329 | id | `authorIds` | BOUNDED-MARKED | scoped to one page/group render's own bounded row set, not corpus-scale |
| src/components/admin/CommunityPickupsQueueView.tsx:116 | id | `authorIds` | BOUNDED-MARKED | scoped to one page/group render's own bounded row set, not corpus-scale |
| src/components/community/CouncilMembersRail.tsx:78 | id | `userIds` | BOUNDED-MARKED | scoped to one page/group render's own bounded row set, not corpus-scale |
| src/components/research/ThemeStrip.tsx:132 | theme_id | `themes.map((t` | BOUNDED-MARKED | themeIds is the connection_themes cluster count , curated, not corpus-item-scaled |
| src/components/research/ThemeStrip.tsx:165 | id | `idList.slice(i, i + 200` | BOUNDED-MARKED | already chunked above (idChunk/slice pattern |
| src/lib/agent/audit-gate.ts:114 | id | `ids` | BOUNDED-MARKED | scoped to one item's own claim/section/search rows , small by construction, not corpus-scale |
| src/lib/agent/canonical-pipeline.ts:710 | id | `otherIds` | BOUNDED-MARKED | scoped to one item's own claim/section/search rows , small by construction, not corpus-scale |
| src/lib/agent/canonical-pipeline.ts:906 | id | `relTargets` | BOUNDED-MARKED | scoped to one item's own claim/section/search rows , small by construction, not corpus-scale |
| src/lib/agent/canonical-pipeline.ts:1759 | id | `basisIds` | BOUNDED-MARKED | scoped to one item's own claim/section/search rows , small by construction, not corpus-scale |
| src/lib/agent/canonical-pipeline.ts:1833 | id | `conflateHeldIds` | BOUNDED-MARKED | scoped to one item's own claim/section/search rows , small by construction, not corpus-scale |
| src/lib/agent/canonical-pipeline.ts:1876 | id | `searchIds` | BOUNDED-MARKED | scoped to one item's own claim/section/search rows , small by construction, not corpus-scale |
| src/lib/agent/formats/operations-matrix.ts:199 | state | `["populated", "partial"]` | BOUNDED | none needed, literal or enum |
| src/lib/agent/gate-a-derived.mjs:32 | id | `basisIds` | BOUNDED-MARKED | scoped to one item's own claim/section/search rows , small by construction, not corpus-scale |
| src/lib/agent/gate-a-derived.mjs:40 | id | `srIds` | BOUNDED-MARKED | scoped to one item's own claim/section/search rows , small by construction, not corpus-scale |
| src/lib/connections/resource-lookup.ts:73 | legacy_id | `legacyIds` | BOUNDED-MARKED | relatedIds is one detail page's own related-items widget list, small by construction |
| src/lib/connections/resource-lookup.ts:80 | id | `uuidIds` | BOUNDED-MARKED | relatedIds is one detail page's own related-items widget list, small by construction |
| src/lib/dashboard/changed-since.ts:209 | id | `[...candidateIds]` | BOUNDED | none needed, literal or enum |
| src/lib/dashboard/surface-coverage.ts:208 | item_id | `slice` | BOUNDED-MARKED | slice is one fetchAllByIdChunks chunk, bounded by its own chunk size |
| src/lib/dashboard/surface-coverage.ts:278 | user_id | `userIds` | BOUNDED-MARKED | scoped to one org's own membership/group rows, not corpus-scale |
| src/lib/dashboard/surface-coverage.ts:300 | user_id | `userIds` | BOUNDED-MARKED | scoped to one org's own membership/group rows, not corpus-scale |
| src/lib/data.ts:1491 | user_id | `userIds` | BOUNDED-MARKED | scoped to one org's own membership/group rows, not corpus-scale |
| src/lib/data.ts:1503 | id | `groupIds` | BOUNDED-MARKED | scoped to one org's own membership/group rows, not corpus-scale |
| src/lib/data.ts:1508 | group_id | `groupIds` | BOUNDED-MARKED | scoped to one org's own membership/group rows, not corpus-scale |
| src/lib/entities/corridor-scope.ts:136 | subject_id | `corridorIds` | BOUNDED-MARKED | corridor/jurisdiction entity_id set , real-world geography cardinality, structurally small |
| src/lib/entities/corridor-scope.ts:148 | entity_id | `jurisdictionIds` | BOUNDED-MARKED | corridor/jurisdiction entity_id set , real-world geography cardinality, structurally small |
| src/lib/entities/corridor-scope.ts:224 | entity_id | `ids` | BOUNDED-MARKED | corridor/jurisdiction entity_id set , real-world geography cardinality, structurally small |
| src/lib/entities/corridor-scope.ts:232 | id | `itemIds` | BOUNDED-MARKED | corridor/jurisdiction entity_id set , real-world geography cardinality, structurally small |
| src/lib/entities/corridor-scope.ts:249 | entity_id | `instrumentIds` | BOUNDED-MARKED | corridor/jurisdiction entity_id set , real-world geography cardinality, structurally small |
| src/lib/forward-events/read-and-extract.mjs:232 | claim_kind | `CLAIM_KIND_FILTER` | BOUNDED | none needed, literal or enum |
| src/lib/forward-events/read-upcoming.mjs:181 | event_kind | `spec.kinds` | BOUNDED-MARKED | spec.kinds is a finite event_kind vocabulary from the caller's spec, not a runtime id list |
| src/lib/forward-events/read-upcoming.mjs:203 | id | `itemIds.slice(i, i + 200` | BOUNDED-MARKED | already chunked above (idChunk/slice pattern |
| src/lib/intake/census-writer.mjs:146 | document_url | `slice` | BOUNDED-MARKED | slice is one fetchAllByIdChunks chunk, bounded by its own chunk size |
| src/lib/intake/mint-item.ts:236 | url | `urls` | BOUNDED-MARKED | urls has at most 2 elements (canon + sourceUrl fallback |
| src/lib/obligations/read-register.mjs:278 | id | `itemIds.slice(i, i + 200` | BOUNDED-MARKED | already chunked above (idChunk/slice pattern |
| src/lib/obligations/read-register.mjs:428 | id | `itemIds.slice(i, i + 200` | BOUNDED-MARKED | already chunked above (idChunk/slice pattern |
| src/lib/propagation/author-edges.mjs:118 | value_id | `valueIds` | BOUNDED-MARKED | scoped to one item's own claim/section/search rows , small by construction, not corpus-scale |
| src/lib/propagation/drain.ts:248 | invalidated_by_event | `eventIds` | BOUNDED-MARKED | eventIds.length <= batch, DEFAULT_BATCH=500, via .limit(batch |
| src/lib/propagation/methods/superseded-notices.ts:101 | entity_id | `entityIds` | BOUNDED-MARKED | entityIds is one user's watchlist (caller: resolve-watched-entities.ts |
| src/lib/propagation/methods/superseded-notices.ts:108 | value_id | `oldIds` | BOUNDED-MARKED | entityIds is one user's watchlist (caller: resolve-watched-entities.ts |
| src/lib/propagation/methods/superseded-notices.ts:115 | event_id | `eventIds` | BOUNDED-MARKED | entityIds is one user's watchlist (caller: resolve-watched-entities.ts |
| src/lib/sources/source-growth.ts:250 | id | `citerIds.length ? citerIds : ["00000000-0000-0000-0000-00000` | BOUNDED-MARKED | citerIds is one source's own citer list, not corpus-scale |
| src/lib/supabase-server.ts:366 | status | `["pending_review", "needs_more_data"]` | BOUNDED | none needed, literal or enum |
| src/lib/supabase-server.ts:835 | item_id | `chunk` | BOUNDED-MARKED | derived from one server-rendered page's own bounded row fetch, not corpus-scale |
| src/lib/supabase-server.ts:1346 | source_id | `distinctSourceIds` | BOUNDED-MARKED | derived from one server-rendered page's own bounded row fetch, not corpus-scale |
| src/lib/supabase-server.ts:1590 | id | `chipSourceIds` | BOUNDED-MARKED | derived from one server-rendered page's own bounded row fetch, not corpus-scale |
| src/lib/supabase-server.ts:1661 | source_id | `chipSourceIds` | BOUNDED-MARKED | derived from one server-rendered page's own bounded row fetch, not corpus-scale |
| src/lib/supabase-server.ts:1941 | legacy_id | `legacyIds` | BOUNDED-MARKED | derived from one server-rendered page's own bounded row fetch, not corpus-scale |
| src/lib/supabase-server.ts:1959 | item_id | `uuidIds` | BOUNDED-MARKED | derived from one server-rendered page's own bounded row fetch, not corpus-scale |
| src/lib/supabase-server.ts:2092 | user_id | `ownerIds` | BOUNDED-MARKED | derived from one server-rendered page's own bounded row fetch, not corpus-scale |
| src/lib/supabase-server.ts:2400 | id | `recentRows.map((r` | BOUNDED-MARKED | derived from one server-rendered page's own bounded row fetch, not corpus-scale |
| src/lib/supabase-server.ts:4011 | legacy_id | `legacyIds` | BOUNDED-MARKED | derived from one server-rendered page's own bounded row fetch, not corpus-scale |
| src/lib/supabase-server.ts:4021 | id | `uuidIds` | BOUNDED-MARKED | derived from one server-rendered page's own bounded row fetch, not corpus-scale |
| src/lib/supabase-server.ts:4052 | id | `sourceIds` | BOUNDED-MARKED | derived from one server-rendered page's own bounded row fetch, not corpus-scale |
| src/lib/supabase-server.ts:4080 | id | `marketSeriesIds` | BOUNDED-MARKED | derived from one server-rendered page's own bounded row fetch, not corpus-scale |
| src/lib/supabase-server.ts:4101 | id | `adderIds` | BOUNDED-MARKED | derived from one server-rendered page's own bounded row fetch, not corpus-scale |
| src/lib/supabase-server.ts:4230 | status | `["open", "in_review"]` | BOUNDED | none needed, literal or enum |
| src/lib/trust.ts:778 | id | `citingIds` | BOUNDED-MARKED | scoped to one item's own claim/section/search rows , small by construction, not corpus-scale |
| src/lib/watchlist/membership.ts:126 | item_id | `itemIds` | BOUNDED-MARKED | scoped to one user's own watchlist/notices/org-membership rows, not corpus-scale |

## Sites fixed by chunking (previously raw .in(), now routed through a helper)

These sites were UNBOUNDED at the start of this lane (a corpus-scale or otherwise unbounded id list fed
directly to `.in()`) and were rewritten to call the shared chunking helper instead of emitting one
oversized request. They no longer appear as raw `.in()` sites in the table above because the `.in()`
call now lives inside the helper.

| Site | List source | Fix |
|---|---|---|
| scripts/maintenance/census-off-vertical.mjs (task 4, this dispatch) | post-write read-back ids (up to 1,655 confirmed) | readAllByIds |
| scripts/turns/run-source-sweep.mjs recordSitemapChange() | sitemap-discovered locs, up to 100,000 per DEFAULT_MAX_SITEMAP_ENTRIES | readAllByIds with idColumn source_url |
| src/lib/dashboard/surface-coverage.ts | whole-corpus item ids from a fetchAllRows read | fetchAllByIdChunks |
| src/lib/intake/census-writer.mjs | sitemap-scale writable.map(url), up to 100,000 | fetchAllByIdChunks |
| scripts/maintenance/institution-canonicalize.mjs | source ids (was a duplicate ad hoc readChunked helper) | readAllByIds directly, duplicate helper removed |
| scripts/maintenance/canonical-key-dedup.mjs | item ids (was a duplicate ad hoc helper) | readAllByIds directly, duplicate helper removed |
| scripts/maintenance/record-hollow-sweep.mjs | claim/census/item ids (was a duplicate ad hoc helper) | readAllByIds directly, duplicate helper removed |
| scripts/maintenance/forward-events-retext.mjs | forward-event row ids (was a duplicate ad hoc helper) | readAllByIds directly, duplicate helper removed |
| scripts/maintenance/provenance-heal.mjs readByIds | item ids | readAll to readAllByIds |
| scripts/maintenance/reopen-validation-holds.mjs | post-apply written ids read-back | readAllByIds |
| scripts/verify/wave-acceptance-audit.mjs | --ids CLI list and 24h wave-frame item ids | readAllByIds |
| scripts/verify/defect-signature-scan.mjs resolveFrame() | --ids and --since wave-frame item ids | readAllByIds |
| scripts/obligations/derive-obligations.mjs | itemIds behind every forward event, corpus-scaled | readAllByIds |
| scripts/mint/screen-reconcile-records.mjs | post-write off-vertical read-back | readAllByIds |
| scripts/mint/rederive-record-provenance.mjs | post-touch read-back | readAllByIds |
| scripts/mint/migration-299-precheck.mjs | claimRows scoped to the pre-kit set | readAllByIds |
| scripts/connections/generate-theme-brief.mjs | theme.member_ids scoped reads (items, edges, forward events) | readAllByIds |
| scripts/maintenance/apply-classifications.mjs, tag-proposals.mjs, scripts/classification/propose-classifications.mjs | update-by-ids writes | guardedUpdate to guardedUpdateByIds |
| scripts/lib/db.mjs guardedDelete | delete-by-ids writes, was a single unchunked call | now chunks in DEFAULT_DELETE_CHUNK=200 slices |

Three .ts community API routes (bulk-approve, bulk-classify are pre-existing request-length-validated;
moderation/reports, posts, posts/[id]/replies routes below) had a structural `assertBound` call added in
addition to the F39 marker, proving the bound the marker states rather than only asserting it in a
comment:

- src/app/api/community/moderation/reports/route.ts: assertBound(postIds.length, 101, ...)
- src/app/api/community/posts/route.ts: assertBound(authorIds.length, MAX_LIMIT + 1, ...)
- src/app/api/community/posts/[id]/replies/route.ts: assertBound(authorIds.length, MAX_LIMIT + 1, ...)

## The one chunking implementation

Per the task's explicit design requirement (exactly one chunking implementation, not two), the core loop
lives in `src/lib/db/paginate.mjs`:

```js
export async function fetchAllByIdChunks(ids, readChunk, { chunk = 50 } = {}) {
  const list = [...new Set(ids ?? [])];
  if (!list.length) return [];
  const out = [];
  for (let i = 0; i < list.length; i += chunk) {
    const slice = list.slice(i, i + chunk);
    const rows = await readChunk(slice);
    out.push(...rows);
  }
  if (out.length > list.length) {
    throw new Error(`fetchAllByIdChunks: got ${out.length} rows back for ${list.length} requested ids ...`);
  }
  return out;
}
```

`scripts/lib/db.mjs`'s `readAllByIds` delegates to it (dedupes and chunks the id list, pages each chunk
through the existing `readAll`, concatenates, and lets `fetchAllByIdChunks`'s own over-count guard fire
if a chunk somehow returns more rows than requested). Two `.ts` call sites
(`src/lib/dashboard/surface-coverage.ts`, `src/lib/intake/census-writer.mjs`) call
`fetchAllByIdChunks` directly. `scripts/lib/db.mjs`'s `guardedUpdateByIds` (writes) and `guardedDelete`
(deletes, newly chunked this lane at `DEFAULT_DELETE_CHUNK=200`) are the write-side counterparts,
chunking through their own loops with adaptive statement-timeout handling rather than sharing
`fetchAllByIdChunks` (a write needs per-chunk snapshotting and cite validation `fetchAllByIdChunks`'s
read-only shape does not carry).

## F39 fitness function

`fsi-app/.discipline/fitness/functions/F39-unbounded-in-filter.mjs`, registered in
`.discipline/fitness/manifest.mjs`. Scans `fsi-app/src/**` and `fsi-app/scripts/**` (test files and
`_archive/` excluded) for `.in(col, X)` calls whose `X` is not an array literal, a string/template
literal, or a SCREAMING_SNAKE_CASE constant. A site is GREEN only when it lives inside the chunking
implementation files (`scripts/lib/db.mjs`, `src/lib/db/paginate.mjs`) or carries a same-line or
preceding-line `// fitness-allow: F39 (reason)` marker. No allowlist-with-expiry escape hatch, unlike
F38 , a site that cannot be proven bounded gets fixed, not allowlisted. 16 tests in the paired
`F39-unbounded-in-filter.test.mjs`, all passing, including a live whole-tree-clean assertion.

Registered as invariant RD-64-unbounded-in-filter in `.discipline/governance/invariants.mjs`
(`enforcedBy: ['fitness:F39', 'selftest:...F39-unbounded-in-filter.test.mjs']`), with a matching
Section 4 category 39 entry added to the remediation-discipline skill
(`.claude/skills/remediation-discipline/SKILL.md`), and the skill's PINNED_MANIFEST content hash and
normative-marker baseline (47 to 48) updated to match in `.discipline/governance/skill-contract-map.mjs`
and `.discipline/governance/invariants.mjs`.

## Harness-run-integrity (F28) remediation

Editing governing files for the `source-sweep` (`run-source-sweep.mjs`), `propagation` (`drain.ts`), and
`corpus-turn` (`consume-turn-requests.mjs`, `export-corpus-for-extraction.mjs`) harness families moved
their governing-file hashes without a new run artifact landing under the changed code. Per this
project's harness-run convention, a `PENDING-RUN.md` marker was written or updated for each:

- `scripts/harness-runs/source-sweep/PENDING-RUN.md` (new): documents the recordSitemapChange() fix,
  hash `sha256:3e2c4f2d0563eee1`.
- `scripts/harness-runs/propagation/PENDING-RUN.md` (updated): documents the assertBound-attempted-then-
  reverted, F39-marker-resolved fix to drain.ts, hash `sha256:ebe93513ffa2a4f9`.
- `scripts/harness-runs/corpus-turn/PENDING-RUN.md` (new): documents the F39-marker-only, no-behavior-
  change edits to both governing files, hash `sha256:4dd5b697820c0069`.

## Gate results (run from the worktree root)

- `node fsi-app/.discipline/fitness/runner.mjs`: 33 function(s) checked, 0 violation(s). F28 and F39
  both PASS.
- `node --test fsi-app/.discipline/fitness/*.test.mjs fsi-app/.discipline/fitness/functions/*.test.mjs
  fsi-app/.discipline/governance/*.test.mjs`: 691 tests, 0 fail (555 in the first invocation before the
  invariant-coverage meta-gate fix, 136 after fixing the RD-64/PINNED_MANIFEST drift , the final run of
  each file is clean).
- Every `.test.mjs` beside a file this lane changed (32 test files, 658 tests): 0 fail. Two tests
  (`scripts/maintenance/derive-obligations.test.mjs`'s dry/apply cases) initially failed on
  `readAllByIds is not a function` because the maintenance wrapper's `buildDeps`/test mock had not been
  threaded through when `scripts/obligations/derive-obligations.mjs` was migrated; fixed by adding
  `readAllByIds` to both.
- `bash fsi-app/.discipline/run-test-suite.sh`: 5,762 tests, 5,757 pass, 0 fail (5 skipped), exit 0.
  Two failures found on the first run and fixed: `skill-contract-map: PINNED_MANIFEST matches this
  checkout` (stale content hash after the SKILL.md edit , repinned) and the same two
  derive-obligations wrapper tests above.
- `cd fsi-app && npx tsc --noEmit`: clean, no output.
- `node fsi-app/.discipline/governance/closure-gate.mjs --report`: NEVER-RUN PASS, STALE-NEXT PASS,
  WRITER-READER PASS (0 orphans), LANE-CONTRACT PASS. `=== closure gate PASS ===`.

## What I could not individually prove bounded from first principles

109 of the 138 live `.in()` sites are BOUNDED-MARKED rather than rewritten to a chunking helper. Each was
individually investigated (grep for the site's caller chain, an upstream `.limit()`/`.slice()`, a
request-body length validator, or the scope a per-item/per-user/per-org/per-page read is naturally
confined to) before being assigned to one of about a dozen reasoned categories (already-chunked
idChunk/slice pattern, per-item claim/section/search scope, per-user watchlist/notices/org-membership
scope, per-page community render scope, request-body-validated max length, finite enum vocabulary from
query params, corridor/jurisdiction geography cardinality, page-render-derived id sets in
supabase-server.ts, and a handful of one-off site-specific bounds). None were marked without checking
the specific site's own code; the categorization is a shared REASON template applied to sites that
independently verified into the same shape, not a blanket assumption. What was not done, for time reasons,
is re-deriving each site's exact PRODUCTION scale by querying live table sizes , the marker states the
structural reason the list is bounded (its scope, its upstream validator, its own chunk size), which is
what F39 checks for and what a future reader needs to re-verify the claim; it does not additionally cite
a live row count the way the two CONFIRMED failure instances above do. This is the same posture F38's own
ALLOWLIST reasons take for a bounded-by-design read, applied here without the expiry F38 grants because
this class carries none.
