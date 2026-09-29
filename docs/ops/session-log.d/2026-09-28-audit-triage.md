# Lane AUDIT-TRIAGE, 2026-09-28 , dead columns, UI-orphan fields, duplicate tables: verify and disposition

Read-only investigation (rule 14 discipline). Worktree `.claude/worktrees/audit-triage`, branch
`lane/audit-triage`, off `origin/master` (`d8c63c8f`). SELECT-only on Supabase project
`kwrsbpiseruzbfwjpvsp` throughout , zero writes, zero migrations applied. No dispatch opened.

Inputs: PR #809/#810 checkers (`fsi-app/scripts/verify/{dead-column-audit,duplicate-table-audit,
ui-orphan-audit}.mjs`), `docs/audits/supabase-integrity-and-wiring-audit-2026-09-25.md` (DEAD-1/DUP-1/
UI-coverage-5), `docs/ops/session-log.d/2026-09-25-tool-gap-2.md` (the checkers' first live run, 26 dead
columns / 57→63 duplicate-table candidates).

**Environment note.** No `.env.local` shipped with a fresh worktree checkout; copied the main checkout's
`fsi-app/.env.local` (local dev Supabase pooler credentials, not committed, gitignored) into this worktree
so the three checkers could run as real CLIs via direct Postgres (`scripts/lib/pg-conn.mjs`), not the
MCP-`execute_sql` substitution the 2026-09-25 audit needed. All three ran unmodified.

## Method

For every finding: B1 (grep consumers in `src/`, `scripts/`, `supabase/`) before any disposition; B2
(`grep -ril <identifier> docs/decisions/`) before proposing a drop. Live row counts pulled via
`execute_sql` (SELECT only) to distinguish "never populated" from "populated once, never read again."
Rule 19 (examples are not scope) , the seven named UI-orphan fields are treated as the sample the brief
named, not the ceiling; the checker's actual 16-item output is reported alongside them. Rule 20 does not
apply (no artboard/layout question in this lane).

## A. Dead columns

Live run today: **24 in-scope columns flagged**, not 26. Reconciled against the 2026-09-25 baseline
(26): the 2 missing (`emission_factors.grid_region`, `emission_factors.co2_fossil`) did not drop out
because they were fixed , they dropped out because of a **checker regression**, see A.3.

### A.1 Checker false-negative , test fixture collision `[CONFIRMED]`

`emission_factors.grid_region` and `.co2_fossil` are used as generic example column names in
`scripts/verify/lib/duplicate-table-scan.test.mjs` (added after the 2026-09-25 baseline, for an unrelated
checker's calibration fixtures , lines 36/40/68-69/135-136/147-148). `dead-column-audit.mjs`'s token
scan treats any `.mjs` file under `scripts/` as corpus, so this incidental string match makes both
columns look "used." **They are not** , no real reader or writer references either identifier; see A.3
for what the real producer actually writes and why the checker still can't see it.

### A.2 Checker false-negative , DB-populated columns invisible to literal-key scan `[CONFIRMED]`

Two more columns the checker calls dead are demonstrably live-populated:

| Column | Live non-null / total | Real producer |
|---|---|---|
| `emission_factors.ch4` | 6/13 | `scripts/gen/emission-factors-{epa,desnz}.mjs` → `emission-factors-common.mjs`'s `seedFactors()`, which inserts validated **fixture-row objects** (`scripts/gen/fixtures/emission-factors/*.json`) via `insertFn("emission_factors", toWrite, …)`. The row shape comes from parsing JSON, never a literal `{ ch4: … }` object-key in source , invisible to the checker's regex-based literal-key extractor. |
| `emission_factors.n2o` | 6/13 | same |
| `emission_factors.co2_fossil` | 6/13 | same (also caught by the A.1 false-match, so it never even reached the "reported dead" list this run) |
| `emission_factors.grid_region` | 0/13 | same producer/row-shape; genuinely unset by every fixture batch run so far, not because no producer exists |
| `agent_runs.fetch_text_bytes` | 16/24,140 | some low-utilization producer sets it (rare); not found by grep, same class |
| `agent_runs.fetch_render_ms` | 678/24,140 | same |

**Disposition for all 6: KEEP.** Not dead. `dead-column-allowlist.json` gets 6 new entries citing this
investigation (`docs/ops/session-log.d/2026-09-28-audit-triage.md`), reason: "live producer via
dynamic/spread object insert from validated JSON fixtures, invisible to literal-object-key static scan."
Separate, standing finding for the coordinator: **`dead-column-audit.mjs` has a real blind spot** (dynamic
writes from parsed/validated data, plus incidental string collisions from unrelated `.mjs` fixtures under
`scripts/`) , worth a follow-up to the tool itself (e.g. narrow the corpus scan to exclude `*.test.mjs`
fixture literals, or extend write-detection past literal keys), not scoped to this triage pass.

### A.3 Genuinely dead, DROP `[CONFIRMED]`

| Column | Evidence | Disposition |
|---|---|---|
| `sources.reliability_score` | Migration 007 (`ADD COLUMN … DEFAULT 0.00`). Live: **2,572/2,572 rows are exactly 0.00** , never once updated. Superseded by `src/lib/trust.ts`'s `computeReliabilityComponent()`, which computes `reliability_component` live and does not persist it back to this column. No ADR references it (`grep -ril reliability_score docs/decisions/` → nothing). | **DROP.** Migration sketch: `ALTER TABLE public.sources DROP COLUMN reliability_score;` (DDL-only, schema-migration track per standing rule 3 , apply via Supabase CLI before any dependent code references removal, though no code references it today so this is a pure drop). |

### A.4 Whole-table orphans surfaced by column-grain checker , coordinator question, not a column disposition

Five of the remaining flagged columns belong to tables that have **zero code consumers at all** (not
just the flagged column) , a bigger finding than "one dead column," undetected by F14's table-grain pass
on 2026-09-25 (F14 listed `sector_contexts`/`community_topics`/`community_topic_groups`/`state_cost_facts`
as read-orphans; `case_studies`, `case_study_endorsements`, `taxonomy_nodes` were not on that list, and
are read-orphans in a stronger sense , zero readers AND zero writers in `src/`/`scripts/`/
`supabase/functions`, live data notwithstanding):

| Table | Columns flagged dead | Live rows | Real state |
|---|---|---|---|
| `case_studies` | `industry_segment`, `measurable_outcome`, `cost_reference`, `source_attribution`, `linked_technology_tags` | **6** | Migration 007 (Community layer, pre-ratified-5-surface era). `COMMENT ON TABLE`: "Peer-validated project documentation. Six structured fields required." Zero readers/writers anywhere in current `src/`. Not named in `docs/specs/05-community.md` (current Community spec). |
| `case_study_endorsements` | `endorsement_type` | 0 | Same migration, same zero-consumer state, zero rows. |
| `taxonomy_nodes` | `node_type` | **38** | Migration 007. Zero readers/writers anywhere in `src/`/`scripts/`. |

**`[HYPOTHESIS]`, not decided here**: these three tables carry seeded/submitted data from the pre-5-surface
Community build (migration 007) that nothing in the current app reads or writes. Two live options, named
per rule 13 (decision-ready, not a bare flag): (a) **WIRE** , build the Community "Peer Insights / case
studies" surface the tables were designed for (partially gestured at in `docs/specs/00-foundation-the-
spine.md` section 7's citation of Gartner's case-studies/Peer-Insights corpus-closure pattern, though that
section describes a different product's positioning, not a build commitment for this one); or (b) **DROP**
, migration sketch: `DROP TABLE public.case_study_endorsements; DROP TABLE public.case_studies;` and
`ALTER TABLE public.taxonomy_nodes DROP COLUMN node_type;` (or drop the whole table if nothing else on it
is consumed either , not verified here, out of this column-grain pass's scope). This is a scope decision
(rule 19: a case-studies feature, if built, is a class of Community content, not this pass's call to
make), listed as an open question below.

### A.5 Census-artifact tables , KEEP-allowlist `[CONFIRMED]`

| Table.columns | Migration | Live population |
|---|---|---|
| `corpus_census.{census_class,haiku_confidence,haiku_rationale}` | 212 (`corpus_census`) | 655/655 rows have `census_class`; 420/655 have `haiku_confidence` |
| `coverage_gap_census_findings.{fetch_result,dry_run_reason,historical_evidence,historical_intent,auth_gate,operator_confirm_question}` | 222 (retroactive capture of Session C's discovery-lane table) | 35/116 `historical_evidence`, 1/116 `auth_gate` populated |

Both tables are fully populated one-time discovery-census artifacts per `docs/census/` convention
(CLAUDE.md "What lives where": census tables are corpus-wide enumerations backed by a DB table, queried
ad hoc during the census, not necessarily app-code-read). Migration 222's own header and
`docs/census/gap-census-2026-07.md` are the citation. **Disposition: KEEP-allowlist**, all 9 columns,
citing migration 212 / 222 + the census-doc convention. Not dead in the sense of abandoned; dead in the
sense of "not meant to have an app-code reader," which is by design for a census snapshot.

### A.6 Shelved-feature columns , KEEP-allowlist `[CONFIRMED]`

`sector_contexts.{cargo_types,compliance_roles,urgency_weights}` , table has 15 live rows (matches
migration 009's own row-count comment). `fsi-app/.claude/CLAUDE.md`'s "Sector Activation (future feature,
placeholder live)" section is explicit and binding: "Status: SHELVED with placeholder UX... DO NOT delete
the existing rows... Decision was SHELVE not RETIRE." These three columns are the per-sector row-shape
for the shelved per-sector-synopsis activation feature. **Disposition: KEEP-allowlist**, citing that
CLAUDE.md section verbatim , dropping them would need to be re-added at activation time for no benefit
today.

## B. UI-orphan fields

Live run: **16 UI-selected fields with zero writers**, 9 of which are `state_cost_facts.*` (already
RW-2/UI-3 in the 2026-09-25 audit , no producer since migration 152, unchanged, not re-litigated here).
The 7 the brief named:

| Field | Read at | `[STATUS]` | Disposition |
|---|---|---|---|
| `org_invitations.token` | `src/app/api/invitations/mine/route.ts` | `[REFUTED]` , not an orphan. Migration 076: `token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32),'hex')`. Postgres writes it at INSERT via column DEFAULT; no app code ever needs to set it literally, which is exactly why the checker's object-literal-key scan sees zero writers. | **KEEP-allowlist**, citing migration 076. Separate note: `ui-orphan-audit.mjs` doesn't currently exclude DB-DEFAULT-populated columns the way `dead-column-scan.mjs` excludes PK/FK/generated/timestamp , same class of blind spot as A.2, worth folding into that same follow-up. |
| `community_group_members.muted` | `src/app/community/[slug]/page.tsx` | `[CONFIRMED]` real gap. Migration 029: `muted boolean not null default false`; RLS already permits self-service UPDATE ("UPDATE: self only, and only for starred/muted columns"). No route/component anywhere calls an UPDATE on it , the mute toggle was never built. | **WIRE.** Producer to build: a small PATCH endpoint (or extend an existing community-membership route) that lets a member toggle their own `muted`/`starred` row, gated the same way the RLS policy already expects. |
| `source_bias_tags.{dimension,tag,confidence}` | `src/lib/supabase-server.ts` | `[CONFIRMED]` real gap, and the reason is on record. `src/app/api/admin/sources/recommend-classification/route.ts` has Haiku propose `bias_tags` (three-dimension, confidence-scored, per `source-credibility-model` SKILL.md section Bias tags) and caches the raw recommendation JSON onto `provisional_sources.recommended_classification` , but nothing anywhere inserts a row into `source_bias_tags`. The route's own comment says "before it reaches... the bias-tag write path" and the prompt text says "The downstream pipeline auto-applies >=0.80 tags, surfaces 0.65-0.79 tags to operator review, and discards <0.65 tags" , **that downstream pipeline does not exist in code.** Designed, documented, never built. | **WIRE.** Producer to build: after `recommend-classification` returns (or at candidate-approval time), split `recommendation.bias_tags` by confidence per the skill's own thresholds (>=0.80 → insert with `assignment_source='haiku_auto_applied'`(or the vocabulary's actual token, confirm against migration 092's CHECK), 0.65-0.79 → surface on the candidate-review UI for operator confirm, <0.65 → discard) and insert into `source_bias_tags`. |
| `sector_contexts.display_name` | `src/lib/supabase-server.ts` | `[CONFIRMED]` not a gap , see A.6. All 15 rows' `display_name` was set once, in migration 009's seed INSERT, not through app code. Read by the dashboard's "What's changed" sector list. | **KEEP-allowlist**, same citation as A.6. |
| `region_dimension_coverage.notes` | `src/lib/supabase-server.ts` | `[HYPOTHESIS]`, not fully resolved. Migration 109: free-text `notes` column, no default, meant per the migration header for "Coverage gaps: D2/D4/D5 not yet populated" annotations on the Operations matrix. No admin UI edits it today (unlike the structurally similar `integrity_flags.resolution_note`, which does have an operator-facing edit surface). | **WIRE (P2, small)** , extend whatever admin surface manages Operations coverage gaps with a notes field, same pattern as the integrity-flags resolution note; or, if the coordinator judges this genuinely operator-typed-via-SQL-only by design, KEEP-allowlist instead. Listed as an open question below since evidence doesn't clearly force one answer. |

## C. Duplicate-table candidates

Live run: **65 candidate pairs** (up from 63 at the 2026-09-25 recalibration , 2 new pairs since, expected
drift as the schema grows; not investigated individually). Reviewed the highest-scoring pairs not already
in DUP-1's reviewed set:

| Pair | Score | `[STATUS]` | Disposition |
|---|---|---|---|
| `org_watchlist` <-> `user_watchlist` | 0.600 | `[CONFIRMED]` , already DUP-1's reviewed pair (personal vs team-shared, by design). | KEEP-allowlist, re-affirmed, no new evidence needed. |
| `provisional_sources` <-> `sources` | 0.376 | `[CONFIRMED]` , the entire candidate-vs-admitted source lifecycle this codebase's CLAUDE.md and `source-credibility-model` SKILL.md document at length. Not a new finding. | KEEP-allowlist. |
| `data_sources` <-> `provisional_sources` / `data_sources` <-> `sources` | 0.359 | `[CONFIRMED]` , `data_sources` (migration 258) is the **licence register** for emission-factor data providers ("Licence verdicts per data source. Generated from `src/lib/contracts/source-licence.mjs`. Unregistered sources fail closed"), a materialized mirror of a code module's licence gate, not a source-registry duplicate. Zero application readers (by design , it's an audit-trail mirror, not a live-queried gate; the gate itself is the `.mjs` module). Table-name-token overlap ("sources") is coincidental. | KEEP-allowlist, citing migration 258. |
| `item_gate_a_state` <-> `user_item_state` | 0.357 | `[CONFIRMED]` distinct: Gate-A prose-fact scan state (per-item, pipeline-refreshed hash+orphan-count) vs personal per-user archive scope (migration 239: "distinct from the org-scoped `workspace_item_overrides`. Written by `/api/workspace/personal-state`"). | KEEP-allowlist. |
| `community_thread_entities` <-> `entities` | 0.357 | `[CONFIRMED]` distinct: `entities` is the spec-08 entity spine (minted by `entityId()`, deletes forbidden); `community_thread_entities` is the spec-05 section 5/section 6 join binding a community thread to >=1 spine entity. Parent/child relationship, not duplication. | KEEP-allowlist. |
| `claim_versions` <-> `section_claim_provenance` | 0.328 | `[HYPOTHESIS]` , not read in full this pass; both are provenance/claim-grain tables and plausibly distinct (versioning vs per-section claim-to-source binding) by naming convention alone, consistent with every other reviewed pair, but not independently confirmed by reading both table comments. | Not disposed , flagged for the next duplicate-table review pass rather than guessed. |
| `entity_identifiers` <-> `entity_refs` | 0.273 | `[CONFIRMED]` distinct: `entity_identifiers` (migration 282) is the crosswalk to published external identifier standards ("ADOPT, never invent"); `entity_refs` (migration 283, ADR-024) is the progressive-re-keying join for multi-valued text-keyed references (today: jurisdiction ISO codes). Different roles, same spine. | KEEP-allowlist. |
| `auxiliary_energy_profiles`/`system_state`/`system_state_flag_audit`/`item_gate_a_state`/`state_cost_facts` <-> `profiles`/`user_item_state` (six pairs, scores 0.350-0.357, `tableName=1.000`, `columnName=0.000`, `mentionsOther=false`) | 0.350 | `[HYPOTHESIS]` , every one of these six pairs scores purely on a single shared table-name TOKEN ("state" or "profiles"), zero shared non-structural columns, zero comment evidence. Read as almost certainly coincidental naming, not reviewed table-by-table given the volume; the signal design itself (per `duplicate-table-scan.mjs`'s own header) treats bare table-name-token overlap as one of four blended signals, and these are exactly the shape DUP-1's original method ("reads as possibly overlapping by name") would also have surfaced and then dismissed on inspection. | Not individually disposed here , recommend the coordinator either bulk-allowlist this "single-token, no-column-evidence" shape as a class (citing this pattern), or accept these as noise the tool's own calibration test (7/8 recall, 7/8 precision on hand-labelled negatives) already predicts. |

## Bonus finding, incidental

Two systemic checker gaps surfaced by this triage, not scoped to fix here (rule 13: named, decision-ready,
handed to the coordinator, not silently worked around):
1. **`dead-column-audit.mjs`** cannot see columns written via dynamic/spread object construction from
   validated external data (A.2), and is vulnerable to incidental string collisions from `.test.mjs`
   fixture literals under `scripts/` (A.1). Both produced wrong "dead" verdicts on live-populated columns.
2. **`ui-orphan-audit.mjs`** does not exclude DB-`DEFAULT`-populated columns the way `dead-column-scan.mjs`
   excludes PK/FK/generated/timestamp columns, producing a false orphan on `org_invitations.token`.

## Findings summary (status tokens)

- A.1 `[CONFIRMED]` checker false-negative (test-fixture collision)
- A.2 `[CONFIRMED]` checker false-negative (dynamic-write blind spot), 6 columns , KEEP
- A.3 `[CONFIRMED]` `sources.reliability_score` genuinely dead , DROP
- A.4 `[HYPOTHESIS]` case_studies/case_study_endorsements/taxonomy_nodes whole-table orphans , coordinator question
- A.5 `[CONFIRMED]` census-artifact columns (9) , KEEP-allowlist
- A.6 `[CONFIRMED]` sector_contexts shelved-feature columns (3) , KEEP-allowlist
- B `org_invitations.token` `[REFUTED]` as orphan , KEEP-allowlist
- B `community_group_members.muted` `[CONFIRMED]` gap , WIRE
- B `source_bias_tags.*` `[CONFIRMED]` gap , WIRE
- B `sector_contexts.display_name` `[CONFIRMED]` not a gap , KEEP-allowlist
- B `region_dimension_coverage.notes` `[HYPOTHESIS]` , coordinator question
- C 5 pairs `[CONFIRMED]` distinct , KEEP-allowlist; 1 pair `[HYPOTHESIS]` unread; 6 pairs `[HYPOTHESIS]` likely-noise class

## Open questions for the coordinator

1. **`case_studies` / `case_study_endorsements` / `taxonomy_nodes.node_type`** (A.4): whole-table orphans
   from the pre-5-surface migration 007 Community layer, live data present (6/0/38 rows). WIRE (build the
   Community case-studies/Peer-Insights surface these tables were shaped for) or DROP (migrate them out ,
   the feature was apparently never carried forward into the current `docs/specs/05-community.md`)? Not
   this lane's call , a scope decision, not a column fix.
2. **`region_dimension_coverage.notes`** (B): small WIRE (admin notes field on the Operations coverage-gap
   view) or intentionally SQL-only KEEP? Evidence doesn't force either answer.
3. **`claim_versions` <-> `section_claim_provenance`** (C): unread this pass , genuine duplicate-role risk,
   or another DUP-1-shaped false positive? Needs a follow-up read.
4. **Six single-token-only duplicate-table pairs** (C): bulk-allowlist the "shares only a table-name
   fragment, zero column/comment evidence" shape as a class, or leave them as perpetual noise in every
   future run?
5. **Two checker blind spots** (Bonus finding): worth a follow-up lane to `dead-column-audit.mjs` /
   `ui-orphan-audit.mjs` themselves (exclude `*.test.mjs` fixtures from the corpus scan; extend
   write-detection past literal object keys; exclude DB-DEFAULT-populated columns), or accept the
   allowlist-per-false-positive workaround indefinitely?

## Gates

Read-only lane; no code changed, no migration applied, no allowlist file edited (the KEEP-allowlist
recommendations above are proposals for the coordinator to land, not applied here , writing them into
`dead-column-allowlist.json`/`ui-orphan-allowlist.json`/`duplicate-table-allowlist.json` without operator
sign-off on the DROP/WIRE calls would bake in this pass's judgment as fact). No test suite run (no source
file touched).
