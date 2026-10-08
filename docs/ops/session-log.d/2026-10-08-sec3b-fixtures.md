# 2026-10-08, lane SEC-3b-F (sec3b-fixtures): migration 370 fixture values corrected, every fixture INSERT checked statically against the live definition

## Accomplished

- Apply 3 of 370 aborted with 23514 on `INSERT INTO public.org_watchlist (..., item_type, ...) VALUES (..., 'item', ...)`. The live CHECK `org_watchlist_item_type_check` (migration 270, `= ANY (ARRAY[...])`) allows only source, reg, signal, research, operations, market_series. Fixed in 370 in place: the seed insert and the two `format()` legs (sec3b-viewer, sec3b-member) now write `'reg'`. `portfolio_members.member_kind = 'item'` is a different table and is valid (item|corridor|entity); unchanged.
- New shared helper `fsi-app/supabase/migrations/_lib/fixture-inserts.mjs` (lifted from the per-test parser SEC-5 wrote for 372, extended): rebuilds table facts from the migration tree in file order (CREATE TABLE, ADD/DROP/RENAME COLUMN, SET/DROP DEFAULT, SET/DROP NOT NULL, ADD/DROP CONSTRAINT CHECK, DROP TABLE; statements inside DO bodies are ignored), parses every `INSERT ... VALUES` and `UPDATE ... SET` in a migration, including the ones inside `format()` strings, and reports violations. It understands both `col IN (...)` and `col = ANY (ARRAY[...::text])`, and a table-level CHECK that names a column declared after it.
- Checks run per fixture statement: table exists, columns exist, no GENERATED column written, every NOT NULL column without a default is written, no explicit NULL into a NOT NULL column, every literal bound by a single-column list CHECK is in the list, UPDATE SET literals against the same lists, VALUES arity. Not checked, stated in the helper header: foreign keys, uniques, compound CHECKs, types, lengths. 370's test covers those that matter for these fixtures by hand-written facts (FK insertion order, membership unique, 075 verifier_status, 030 title shape, 293 verified_has_method, name length).
- `370_privilege_table_policies.test.mjs`: 6 fixture tests added (all-fixtures-clean with at least 35 inserts and 40 updates parsed; the 16-table scan list; org_watchlist uses `'reg'` with three distinct item_ids; the checker catches `'item'`, an omitted NOT NULL column and an explicit NULL; DO-block and compound facts; FK order and the membership unique).
- `372_profiles_read.test.mjs` switched to the shared helper (its local `insertBlocks` is now a thin call into the helper) and gained the same generic all-fixtures check with `before: 372`: zero violations.
- `_lib/fixture-inserts.test.mjs`: 6 tests on a synthetic migration tree (schema rebuild, clean fixture, each defect class planted and reported: CHECK-list literal direct, through `format()` and through UPDATE; omitted NOT NULL; explicit NULL; unknown column and table; generated column; arity; external `auth.users`; splitter and stripper).

## Red then green

- Red: 370's test with the OLD sql: 2 of 41 fail, with the violation `org_watchlist.item_type: 'item' violates org_watchlist_item_type_check` (the exact apply-3 abort), reproduced with no database.
- Green: 370 test 41 of 41, 372 test 27 of 27, helper test 6 of 6 (74 of 74 together).
- Helper bug found by its own unit test: a table-level named CHECK placed before the column it constrains was dropped, so the check never ran (the `level` case). Fixed by applying table-level CHECKs after all columns are known. Earlier, the org_watchlist list was empty until the `= ANY (ARRAY[...])` form was supported; the probe that exposed it is how the 16-table facts below were verified rather than assumed.

## Every table 370's self-check writes, read against the migration tree (before 370)

Columns written / NOT NULL with no default / list CHECKs / FKs. Source: the helper's schema rebuild, probed once and compared to the fixtures.

| Table | Inserts | Written | Required (NOT NULL, no default) | List CHECKs | FKs |
|---|---|---|---|---|---|
| organizations | 2 | name, slug | name, slug | plan: free, pro, enterprise | none |
| profiles | 1 | id, email, display_name | none | workspace_role: owner, admin, editor, member, viewer | org_id |
| org_memberships | 3 | org_id, user_id, role | org_id, user_id | role: owner, admin, member, viewer | org_id |
| org_watchlist | 3 | org_id, added_by_user_id, item_type, item_id | org_id, item_type, item_id | item_type: source, reg, signal, research, operations, market_series | org_id, added_by_user_id |
| workspace_item_overrides | 1 | org_id, item_id | org_id, item_id | priority_override: CRITICAL, HIGH, MODERATE, LOW | org_id, item_id, owner_user_id, owner_assigned_by, archived_by |
| workspace_tags | 3 | org_id, name, created_by | org_id, name | none | org_id, created_by |
| item_workspace_tags | 2 | tag_id, intelligence_item_id, org_id, created_by | tag_id, intelligence_item_id, org_id | none | tag_id, intelligence_item_id, org_id, created_by |
| portfolios | 3 | org_id, name, created_by | org_id, name | none | org_id, created_by |
| portfolio_members | 2 | portfolio_id, org_id, member_kind, item_id, added_by | portfolio_id, org_id, member_kind | member_kind: item, corridor, entity | item_id, entity_id, added_by |
| community_groups | 2 | name, slug, region, privacy, owner_user_id | name, slug, region, privacy, owner_user_id | region: EU, UK, US, LATAM, APAC, HK, MEA, GLOBAL; privacy: public, private | owner_user_id |
| community_group_members | 4 | group_id, user_id, role | group_id, user_id | role: admin, moderator, member | group_id, user_id |
| community_member_profiles | 4 | user_id, org_type, verified | user_id, org_type | org_type: forwarder, carrier, shipper, customs-broker, 3pl, regulator, ngo, analyst, other; region and verification_method lists | user_id |
| community_posts | 4 | group_id, author_user_id, title, body, signed_off_at, signed_off_by | group_id, body | attribution: editorial, original-author, anonymous; plus the compound title shape (030) | group_id, parent_post_id, author_user_id, promoted_from_post_id, signed_off_by |
| community_post_signoff_requests | 3 | post_id, requested_by, status | post_id, requested_by | status: pending, signed_off, declined, withdrawn | post_id, requested_by, verifier_id |
| notifications | 1 | user_id, kind | user_id, kind | kind: mention, reply, promote, invite, moderation, archive, assignment | user_id |
| auth.users (external) | fixture rows | id, aud, role, email, created_at, updated_at | id | none | none |

Result: org_watchlist.item_type was the only list violation in 370; no omitted NOT NULL column and no explicit NULL into a NOT NULL column was found in any of the 16.

## Open item (outside this grant, not changed)

- `scripts/proof/attacks/attacks.json`, attack `sec3b-viewer-cannot-write-workspace-tables`, inserts `'item'` into `org_watchlist`. Its expected refusal is 42501 (RLS evaluates before the CHECK), so it still passes as an attack, but it carries the same invalid value. Needs the attack row switched to `'reg'` in a lane granted that file.
- Nothing here ran against Postgres. The static checker proves the fixture values against the facts the migration tree states; the live apply remains the arbiter.

## UX compliance

No `.tsx` or `.css` changed in this lane; no surface touched.

## Decisions

- Shared helper lives under `supabase/migrations/_lib` (granted); both migration tests import it, so there is one parser, not two.
