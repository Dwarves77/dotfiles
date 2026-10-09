# 2026-10-07, lane DEAD-2 (dead2-schema): dead tables and columns verified, the DEAD class dropped by a reviewed migration (368, not applied)

## Accomplished

- Classified all 45 census items (22 in category 5, 23 in category 6) from repo evidence, no database access. Full table with per-line evidence: `fsi-app/scripts/tmp/dead2-schema-classification-2026-10-08.md` (gitignored; the coordinator lands it under `docs/audits` with rule-14 tokens). Counts after the operator ruling of 2026-10-08: DEAD 6, OWED 16, HISTORY 14, UNSURE 4, LIVE 5 (LIVE = the census was refuted; outside the brief's four classes, reported so the four stay honest). The first draft had DEAD 11, OWED 13, HISTORY 12; the ruling moved region_tags and last_intelligence_item_at to HISTORY and the three api_* columns to OWED.
- `fsi-app/supabase/migrations/368_drop_dead_schema.sql` (header NOT APPLIED, DATA-DELETING: operator review required). Scope per the operator ruling of 2026-10-08 (relayed by the coordinator): DROP view `acquisition_backlog_v`; `intelligence_items.linked_forum_thread_ids`, `linked_vendor_ids`, `linked_regulation_ids`; `sources.last_scanned`, `last_content_fetched_at`. KEEP `intelligence_items.region_tags` (15 rows, HISTORY), `sources.last_intelligence_item_at` (659 rows, HISTORY) and the three `sources.api_*` columns (OWED; operator verbatim: "This is something we want to use in the future after we've built the site"), whose column comments now carry the coordinator-supplied reserved wording verbatim. One transaction, plain DROP (no CASCADE), a pre-check that aborts unless the three dropped arrays are empty and the live helper still returns them, and a post-check. The "rows at review time" block is filled from the operator-supplied reads (forum 0, vendor 0, regulation 0; last_scanned 190, newest 2026-05-19; last_content_fetched_at 8).
- To drop the three intelligence_items columns the migration first recreates `_workspace_active_items(uuid)` (DROP + CREATE + GRANT EXECUTE to anon, authenticated, service_role), the migration 335 method. The new body is 335's text with exactly the three names removed (region_tags stays); the static test derives the expected text from 335 and compares byte for byte.
- `368_drop_dead_schema.test.mjs` (17 tests, node builtins only). Red first: with the SQL absent the file fails with ENOENT. Green: 17 pass, 0 fail. Mutation checks: adding `DROP COLUMN IF EXISTS api_auth_method` to the sources ALTER makes 2 tests fail (15 pass, 2 fail); restored, 17 pass. The ruling update also added tests for the verbatim api_* comment wording and for the recorded read counts.
- `docs/inventories/migrations.md` regenerated with `scripts/inventories/generate-migrations-inventory.mjs --write` (327 rows, one added).

## Read and reused

- Census categories 5 and 6 with their lists; migrations 335 (the function-redefinition method, grants and post-check pattern), 349 and its test (header, one-transaction, static-test conventions), 324 and 185 (drop precedents), 192 and 181 (the layers whose columns survive), 310 and 316 (older helper definitions), 007, 051, 054, 056, 063, 067, 074, 085, 092, 112, 115, 159, 211 to 213, 221, 222, 223, 258, 284 to 287, 290, 314; F47, F24, F63, `db-object-reference.mjs`, the migrations inventory generator, `docs/census/gap-census-2026-07.md`, `authorship-worker.md`, ADR-042, ADR-043, spec 08, the source-classification framework plan.
- Reused: 335's `_workspace_active_items` text and ACL restore, the 349 test shape, the existing F47/F24 DROP handling (no allowlist edit needed).

## Decisions

1. The census scope excluded `supabase/seed` and `docs/runbooks`; including them changed five classifications (intelligence_summaries has a seed writer, sector_contexts and spotchecked have live readers, resolved_into_id is read by a scheduled worker charter, verified_by has seed-only references).
2. A column referenced only by unwired one-shot seed scripts is UNSURE, not DEAD (a reader or writer exists in code). Default-stamped columns (`DEFAULT now()`, `txid_current()`) are HISTORY, not DEAD.
3. A pass-through column in a RETURNS TABLE list that no caller names counts as no reader (migration 335's own standard), so the community-layer array columns are DEAD-class; the operator kept region_tags (15 rows) and ruled the other three dropped; the pre-check aborts the migration unless every row of those three is empty.
4. The two dropped `sources` columns carry no data guard: the operator ruled the drop with the counts in hand (190 and 8 non-null rows lost).
5. No F25, F47 or F14 allowlist names a dropped object, so no allowlist file was edited (write set honoured).

## NOT done

- Not applied, no live check. The read counts in the header are operator-supplied, not read by this lane. Not run: the SQL has been read and statically tested, never executed, so [HYPOTHESIS] the recreated function body parses as the live one did (it is 335's text minus three tokens, which 335 applied live). [CLOSED: PR 1013]
- The skill-gate demanded the sprint-followups-discipline, remediation-discipline and environmental-policy-and-innovation skills before the writes; loaded as approved. No `.tsx`, no code deletion (DEAD-1's). [NOT-WORK: fact, no action]
- Not changed, outside the write set (none blocks CI): `src/app/api/search/route.npmtest.mjs` (fixture column set still lists the three dropped intelligence_items columns), `fsi-app/.discipline/governance/db-catalog.json` (still lists `acquisition_backlog_v`), `fsi-app/docs/inventories/db-check-constraints.json` (regenerated from live after apply).

## Open items

- Operator ruling on the drop list: given 2026-10-08 (6 items); the coordinator's executor applies 368 after CI is green. [CLOSED: PR 1013]
- UNSURE needing a ruling or DEAD-1 first: `estimated_values` (is the estimates mechanism retired after ADR-043; it is structural in derivation_edges, the outbox triggers, drain.ts and F32), `community_topics` and `community_topic_groups` (remove the `shell-context.ts` reader first), `section_claim_provenance.verified_by` (retire the unwired seed scripts first).
- Migration number 368 confirmed free on origin/master and on every remote branch scanned (367 exists on a branch). [NOT-WORK: fact, no action]

## OBS coverage and DP compliance (sprint-followups-discipline)

- Followups doc: not applicable, this is a schema cleanup lane with no sprint phase and no operator surface; no OBS entry was opened or closed.
- DP-1 (single-pane operator review): not applicable, no operator surface or screen is built or changed.
