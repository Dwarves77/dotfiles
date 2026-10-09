# 2026-10-08, lane ALIAS-1 (alias1-entity-hierarchy): the composite/atomic hierarchy and the alias table of spec 00 section 1.3

## Accomplished

- `fsi-app/supabase/migrations/377_entity_hierarchy_and_aliases.sql` (header NOT APPLIED; the coordinator applies it): `entities.entity_level` (group, legal_entity, operating_identity; CHECK organisation-only; NULL everywhere, no row seeded); `entity_relations` (parent, child, relation group_of / legal_entity_of / operating_identity_of, asserted_by, asserted_at, source_id, provenance; PK (parent, child, relation); self edge refused by CHECK, a child that is already an ancestor of the parent refused by trigger under an advisory lock); `entity_aliases` (entity_id, alias, alias_kind, asserted_by, asserted_at, source_id, provenance; PK (entity_id, alias, alias_kind); UPDATE, DELETE and TRUNCATE refused by trigger and the update, delete and truncate privileges revoked from authenticated and service_role). RLS read for authenticated, no write policy, anon revoked. `propagation_outbox_trg` in migration 352's form on both tables (aliases by their own entity_id; relations pass `'child_entity_id'` as the entity column). Rolled-back self-check attacks: entity_level on a jurisdiction and an unknown level, the two declared relations, a self edge, a reversal, a three-node loop, a loop made by UPDATE, two aliases with different assertors both persisting, the display name untouched, alias UPDATE / DELETE / TRUNCATE, uncollapsed text, unknown kind, blank assertor, outbox rows under the right entity, authenticated insert refused and read allowed, service_role update refused, and nothing surviving.
- `fsi-app/src/lib/entities/resolve.mjs`: `resolveEntityByAlias(text, deps)` returning `{entity_id, level, matched_alias, asserted_by, ...}` or null (no match, ambiguous, or unresolvable), `aliasCandidates` (all candidates, merge-followed), `resolveSurvivors`, `entityLevelLabel(entity)`, `ancestorChain`, `wouldCreateCycle`, and Supabase-backed readers. Test `resolve.test.mjs` (13 tests) carries the spec's three Maersk-shaped objects resolving to three ids at three levels with their two relations.
- `fsi-app/scripts/verify/surface-acceptance.mjs` (spec 00 section 8, the file the spec has named since Phase 1): all 17 assertions listed in `SPEC_CHECKS`; 6 run (1, 2 in part, 5, 6, 9, 10), 11 skip with a kind and reason (3, 4, 7, 8, 11, 12, 13, 14, 15, 16, 17), plus two checks for the section 1.3 rules this lane built (H1 hierarchy, H2 alias provenance). `--fixture` runs on the built-in world (exit 0/1); default mode reads the live tables read-only and self-skips with exit 2 when there are no credentials or migration 377 is not applied. Soft data-audit marker on line 1 (label `surface-acceptance`). Test (16 tests) breaks the fixture world once per check and requires FAIL.
- Registered per rule 15: `.discipline/governance/invariants.d/RD-96-spine-coherence-acceptance.mjs` (`audit:` the script, `selftest:` its test, the resolver test and the migration test). Meta-gate run locally after staging: `ALL 153 invariants + 63 doctrines are wired`, PASS.
- `docs/inventories/migrations.md` regenerated with `scripts/inventories/generate-migrations-inventory.mjs --write` (one added row).

## Read and reused

- Migrations 282 (entity_identifiers provenance shape: asserted_by NOT NULL, asserted_at default now()), 283, 284, 352 (the outbox function, its optional entity column, the self-check form and its static test), 357 and 363 (privilege idiom), 370 and 371 plus F70 (definer posture), `entity-id.mjs`, `entity-id-shape.mjs`, `crosswalk.mjs` (SCHEMES, VALIDATORS reused by assertion 5), `entity-resolve.mjs` (resolves mentions to items, not text to entities, so not extended), `portfolio-core.mjs` (merge-following idiom; its `MAX_MERGE_HOPS` is private so the same value is restated in resolve.mjs), `src/lib/contracts/vocabularies.mjs` (`weakestOriginClass`, `RELATION`, `inverseRelation` reused by assertions 9 and 10), `src/lib/db/paginate.mjs` (`fetchAllRows`), `scripts/lib/db.mjs` (`readAll`, `readClient`), `env-file.mjs`, `is-main.mjs`, `candidate-dwell-audit.mjs` (marker and exit-code pattern), `execution-wiring.mjs`, `invariant-coverage.mjs`, `questions-on-change.mjs` and its test, the VERIFY-1 register rows 00S1.3, spec 00 sections 1.2 to 1.4 and 8.

## Coordinator rulings applied (second pass, 2026-10-08)

- `identity_revised` added to `TRIGGER_EVENT_TYPES` (`constants.mjs`); `entity_aliases` and `entity_relations` map to it in `EMITTING_TABLE_EVENT_MAP` for every change kind, with the change text "the identity of <entity> changed (alias or relation): re-resolve mentions and roll-ups that name it" (`describeChange` takes an optional per-table `describe`). Red first: 4 tests failed (the pin detector plus three new ones), then 38 pass across `questions-on-change.test.mjs` and `trigger-questions.test.mjs`.
- No CHECK on event type exists: `propagation_events` carries a CHECK on `change_kind` only (migration 284) and has no event_type column, so migration 377 extends no CHECK; it says so in its header.
- F39: `buildAliasResolverDeps.readEntities` now reads through `fetchAllByIdChunks` (`src/lib/db/paginate.mjs`, the chunking core `readAllByIds` is built on and the helper `questions-on-change.mjs` already uses); `readAllByIds` itself lives in `scripts/lib/db.mjs`, which a `src/lib` module cannot import. No marker. The chunk test failed against the old code (1 failing) and passes now.
- `entity_aliases` PK is `(entity_id, alias, alias_kind, asserted_by)`: two asserters of one alias both persist, one asserter repeating itself is refused. Self-check legs added (both persist, repeat refused with unique_violation, outbox rows 3, read count 3); migration test, resolver test (one candidate, latest assertion reported) and H2 duplicate key updated. Red first: 3 tests failed, then green.
- Accepted rulings: relation direction as stated, endpoints unconstrained, RD-96.
- Map entry: not hand-edited; pending PR 1016's `--add-never`.

## Decisions

- Direction of `entity_relations`, not settled by the brief: the relation names the child's role toward the parent (child legal_entity_of parent group; child operating_identity_of parent legal entity; child group_of parent group). Stated in the migration header.
- Relation endpoints are not forced to be organisations and relation vs child level is not cross-checked: the brief names neither.
- The alias lookup is exact and case-insensitive on text stored trimmed and whitespace-collapsed (a CHECK on `alias`), so no extra normalised column was added.
- An ambiguous alias (two entities) resolves to null, never a guess; `aliasCandidates` shows the candidates.
- Invariant id RD-96 (self-assigned as RD-95; renumbered by coordinator ruling because AUDWIRE-1 took RD-95, PR 1024).
- Admin override (COMMON rule 6): nothing here is an automatic writer that overwrites a row, so no override column was added.

## NOT done

- Migration 377 is not applied and its SQL, including the rolled-back self-check, has not been executed against any database (no Postgres on this machine; the static test proves the file's text only).
- (Resolved by the coordinator's grant; see the rulings section.) Attaching `propagation_outbox_trg` to `entity_aliases` and `entity_relations`, as the brief and rule 17 require, makes `questions-on-change.test.mjs` fail: "emitting table(s) with no event mapping: entity_relations, entity_aliases" (confirmed by running it). None of the six `TRIGGER_EVENT_TYPES` fits an alias or relation change, so the mapping needs a coordinator decision. Not touched.
- No seed values (levels, relations, aliases): population is another lane. No screen reads `entityLevelLabel` yet.
- Live assertions 1 (free text), 7, 11, 17 and the UI assertions are skipped by design and listed.

## Open items

- A writer repeating its own (entity, alias, alias_kind, asserted_by) conflicts on the PK and should use ON CONFLICT DO NOTHING. [CLOSED: PR 1059]
- `F47` (db-object-reference) and `F25` (module-liveness) were reasoned about, not run (the fitness runner is CI-only): both new tables are named by non-test code (`resolve.mjs`), and `resolve.mjs` is imported by `surface-acceptance.mjs`, a data-audit marker root.
