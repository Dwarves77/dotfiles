# Lane R4-5 (MIGRATION-TRUTH-CATALOG-DROPS), 2026-10-01

Size estimate: 4 migration header edits (round 1) + 10 more (round 2, 146-150/240/258 family/260/340/341)
+ 1 more (round 3, 149's retirement), 2 new migrations, 1 new fitness function plus test (3 rounds of
fixes), 1 regenerated governance catalog, 1 regenerated inventory doc, 1 tech-debt-log.md entry, this
log. No src/ code touched.

## ROUND 1: CF-DATA-1 header truth (part a)

Corrected the four [CONFIRMED] migrations named in remediation-plan-2026-09-30.md Lane 4 / audit
finding CF-DATA-1, each verified against the coordinator's live-schema export
(`fsi-app/scripts/tmp/live-schema-2026-09-30.json`, 2026-09-30 exact-count snapshot):

- `331_harness_runs.sql`: "DRAFT / NOT APPLIED" -> "APPLIED (confirmed live, 38 rows, 2026-09-30)".
- `335_drop_placeholder_community_layer.sql`: "AUTHOR-ONLY, NOT APPLIED" -> "APPLIED (confirmed, tables
  absent from live schema, 2026-09-30)".
- `277_corpus_turn_requests.sql`: "NOT YET APPLIED, coordinator applies..." -> "APPLIED (confirmed live,
  1,757 rows, 2026-09-30)".
- `261_drop_dead_notification_v1.sql`: "COMMITTED, NOT YET APPLIED." -> "APPLIED (confirmed, tables
  absent from live schema, 2026-09-30)."

The 261 and 277 lines carry pre-existing em dashes elsewhere in the same single-line header; both now
carry the `[glyph:verbatim]` disclosure marker rule 022 names for exactly this case, rather than
rewriting historical prose this lane did not author.

## ROUND 1: F63, the standing check (part b)

New fitness function `fsi-app/.discipline/fitness/functions/F63-migration-applied-status.mjs` (+
`.test.mjs`). Reads each migration's self-declared header status against the coordinator's live-schema
row-count export for the tables it CREATEs or DROPs. Self-skips (PASS, not a violation, not a crash)
when no export is present.

## ROUND 1: db-catalog.json refresh (part c)

Regenerated `fsi-app/.discipline/governance/db-catalog.json`'s `tables`/`views`/`rpcFunctions`/
`triggerFunctions` lists by replaying the full committed migration corpus with the existing
`replaySchema()` core (`fsi-app/.discipline/governance/db-object-reference.mjs`, the same module F47
uses). Cross-checked the replayed 116-table result against the coordinator's live-schema export's
117-table `exact_rows` key set: the one difference is `inference_records` (migration 338,
`lane/w2g-learning-loop`, not yet merged), added to the catalog by name per the Lane 5 decision. Catalog
now lists 118 tables, 6 views, 68 rpc functions, 26 trigger functions. `triggers`/`policies`/`indexes`
counts marked STALE rather than fabricated (no live `pg_catalog` introspection access this lane).

**Known consequence, accepted, not fixed by this lane**: adding `inference_records` makes
`F24-db-object-migration-home` fail with 1 violation on this branch (migration 338 lives elsewhere).
This is exactly what the Lane 5 decision text anticipates ("resolves on its own once that lane merges");
F24 is out of this lane's write set, so no allowlist entry was added. `[CONFIRMED]` via
`node .discipline/fitness/runner.mjs --function=F24`.

## ROUND 1: the two drop migrations (part d)

`340_drop_sources_reliability_score.sql` and `341_drop_promotion_policy.sql`, pre/post-check `DO $$`
blocks matching the project's tombstone-migration shape (219/254/261).

## ROUND 2: coordinator directive "fixed, not flagged" -- the 19 live mismatches

F63's first live run (export copied into scratch, then removed before commit each time) found 19
header/live-schema mismatches beyond the four confirmed in round 1. Per the coordinator's follow-up
("Operator standard: fixed, not flagged... teach F63 the dropped-later case"), investigated every one
by reading the migration file plus the live export plus the rest of the corpus, rather than listing them
as a residual.

### The real root cause: F63 was reading the wrong line

10 of 19 were FALSE POSITIVES from a bug in F63 itself, not real header drift: F63's `parseHeaderStatus`
scanned the WHOLE leading `--` comment block for a status word. Migrations 181, 183, 184, 195, 271, and
311 each carry a CORRECTED, authoritative `-- subject:` first line (e.g. "APPLIED 2026-07-11
(wave-alpha)") immediately followed by an OLDER, never-rewritten restated paragraph a few lines down
still saying "STATUS: AUTHOR-ONLY - NOT APPLIED" or similar -- exactly the "frozen-but-stale restated
paragraph" pattern `docs/inventories/migrations.md`'s own "Records-truth corrections" section already
names for migrations 101/149/152/153/157 (status is read from the ledger + inventory, never from a
restated body paragraph, because applied migrations are immutable and body prose goes stale). F63 fix:
added `extractSubjectLine()`, matching the SAME convention the project's own
`generate-migrations-inventory.mjs`'s `parseSubjectLine` already uses (line 1 only, optionally after a
leading block comment) -- status is now read from that one line, never the whole block.

That fix alone surfaced a SECOND bug on migrations 271 and 311: their own single authoritative subject
LINE narrates its own correction history, and the narration itself contains the OLD status word --
271's line says `...this corrects the "NOT YET APPLIED" status this row previously carried...` (the old
label, quoted, inside straight double quotes) and 311's says `...Was: written, not applied, this lane's
Supabase MCP access was read-only...` (lowercase, ordinary retrospective prose). Second fix: every
genuine status declaration in this convention is written ALL-CAPS; made `STATUS_PATTERNS` case-sensitive
(drops the `/i` flag) and added a lookbehind/lookahead excluding a straight-double-quoted mention for
the two NOT-APPLIED patterns. Both migrations now correctly read `applied`.

4 of 19 (211 `drain_worklist`, 216 `item_source_evidence`, 295 `community_promotion_transitions`, 296
`carrier_compliance_pools`) are the genuine "dropped-later" case the coordinator named: each migration's
header truthfully says APPLIED, created the table, and a LATER migration in the committed corpus (324,
218, 329, 311 respectively, each confirmed by reading its own `DROP TABLE` statement) correctly dropped
it. Taught F63 mechanically: `loadDroppedElsewhereSet()` scans every migration file once for every
`DROP TABLE` target in the corpus (not just the file currently being checked), and
`auditStatusAgainstLiveSchema` now takes that set as a 5th argument, suppressing the APPLIED-but-absent
mismatch when the created table is in it. Proven by attack in the test file (per-table, not blanket --
an unrelated created table still mismatches; the exemption never touches the APPLIED-drop-still-present
check, a different problem shape).

The remaining 4 (actually 5 violation lines: 151, 152, 153, 258 x2) were GENUINE CF-DATA-1 instances --
their subject line truly says "NOT YET APPLIED." with nothing else on the line, while the table they
create is live with rows. Corrected exactly as round 1's four:

- `151_published_price_statistics.sql`: -> "APPLIED (confirmed live, 10 row(s), 2026-09-30)."
- `152_state_cost_facts.sql`: -> "APPLIED (confirmed live, 13 row(s), 2026-09-30)."
- `153_community_post_signoff_requests.sql`: -> "APPLIED (confirmed live, 0 row(s), 2026-09-30)."
- `258_emission_factors_and_licence_gate.sql`: -> "APPLIED (confirmed live, data_sources 28 row(s) +
  emission_factors 13 row(s), 2026-09-30)."

Live result after both fixes plus the four header corrections: **0 violations** against the real
2026-09-30 export (confirmed, export copied into scratch then removed before commit). Test suite grew
from 21 to 28 (`extractSubjectLine` restated-paragraph attack test, the dropped-later exemption attack +
3 control tests, a quote/case false-positive attack test).

One residual, explained not fixed: re-running F63 against the SAME 2026-09-30 export after 341's header
was set to APPLIED (see below) reports 1 violation (`promotion_policy` DROP, header APPLIED, table still
in that export with 0 rows) -- the export predates the 2026-10-01 drop by one day; a fresh coordinator
export would show it correctly. Not a logic defect.

## ROUND 2: 146-150/240/260 -- the DB-executor verification results

Per `C:/Users/jason/dotfiles/fsi-app/scripts/tmp/db-executor-2026-10-01-r45.md` (Part A), all seven
migrations' created objects exist live except two pieces of 146:

- **147, 148, 240, 260**: every named column/function/trigger/index EXISTS live. Headers corrected to
  APPLIED with the DB-executor's own evidence cited.
- **146**: `item_cross_references.origin` column EXISTS. `related_items_derived()` function and
  `item_related_items_derived` view do NOT exist. Investigated per the coordinator's decision tree
  (code-reference check): `grep` found both names in `src/lib/agent/canonical-pipeline.ts`, but reading
  the hit (`canonical-pipeline.ts:1081-1083`, a comment reading "related_items is READ-DERIVED... via
  related_items_derived() + item_related_items_derived view") shows it is a PROSE COMMENT, not a call --
  the exact thing migration 180's OWN header already states it checked before dropping both objects as
  zero-consumer dead code ("the two related_items_derived hits are prose comments
  (canonical-pipeline.ts:677-678)" -- line numbers moved since 2026-07-11 but the comment is the same
  one). `grep -l related_items_derived fsi-app/supabase/migrations/*.sql` confirms migration 180
  (`DROP VIEW IF EXISTS public.item_related_items_derived; DROP FUNCTION IF EXISTS
  public.related_items_derived(uuid);`) is the only migration that drops either object. Disposition: a
  THIRD bucket beyond the coordinator's two offered options (re-apply vs. never-applied) -- these were
  APPLIED, then correctly DROPPED by migration 180, the same dropped-later shape F63 now recognizes
  mechanically. Nothing to re-create; 146's header corrected to name 180 by number.
- **150**: `canonicalize_citation_url()` EXISTS (the one function this migration's own DDL creates). The
  DB-executor's A8 check ("`validate_item_provenance()` contains `c_own_body_types`") checked a
  DIFFERENT marker than what 150 actually needs confirmed (three `canonicalize_citation_url(...)` calls
  inside `validate_item_provenance`'s criterion-2 body) -- `c_own_body_types` is a marker from an
  unrelated finding (CF-DATA-10, migration 302's own extensions). Header corrected to APPLIED on the
  function's existence (the function is created by no other migration, strong direct evidence 150 ran),
  with an explicit `[HYPOTHESIS]` label on the one thing not independently re-confirmed: whether
  criterion 2's body actually calls it three times, per CLAUDE.md rule 14.
- **149**: 1,336 verified reg-family items carry NULL severity (DB-executor A6) -- the backfill
  GENUINELY never ran; this is not a false positive, the header's "NOT YET APPLIED" is simply still
  true. Left the header untouched (not a header-truth fix; this is a missing data migration). Exact
  statement set below, idempotent, pre/post-checked, reusing 149's own original WHERE clause verbatim
  (severity derived from priority per the locked severity<->priority mapping, the shape
  `mapPriorityToSeverity` already implements in `src/types/intelligence.ts`, scoped to ops/reg surfaces
  via `surface_of()` exactly as 149's own header specifies -- never invents a market/research severity).

```sql
-- PRE-CHECK: how many rows this backfill will touch (ops/reg surfaces, severity null, priority present,
-- not archived). Compare against the post-check count below.
SELECT count(*) AS pre_backfill_candidates
FROM intelligence_items
WHERE severity IS NULL
  AND priority IS NOT NULL
  AND is_archived = false
  AND surface_of(item_type, domain) IN ('regulations', 'operations');

-- THE BACKFILL (verbatim from migration 149's own body -- idempotent via WHERE severity IS NULL,
-- forward-only, no re-classification, no model call).
UPDATE intelligence_items
SET severity = lower(priority)
WHERE severity IS NULL
  AND priority IS NOT NULL
  AND is_archived = false
  AND surface_of(item_type, domain) IN ('regulations', 'operations');

-- POST-CHECK: must be 0 among rows that had a priority to derive from (rows with NULL priority on
-- ops/reg surfaces are an honest residual, same as migration 149's own original diagnosis -- the
-- backfill only fills from data already on the row, never invents a priority to derive from).
SELECT count(*) AS residual_null_severity_with_priority
FROM intelligence_items
WHERE severity IS NULL
  AND priority IS NOT NULL
  AND is_archived = false
  AND surface_of(item_type, domain) IN ('regulations', 'operations');
-- expect 0. A positive count means the UPDATE's WHERE clause didn't match what the pre-check counted --
-- halt and re-diagnose rather than re-running.
```

149's header stays "NOT YET APPLIED" in this commit -- it will be corrected to APPLIED with the
post-check's row-delta evidence once the coordinator's DB-executor runs the statement above and reports
back, the same two-step discipline round 1 and the 146-150/240/260 round both followed (verify, then
write the header from the verification, never the reverse).

## 340/341: coordinator-confirmed applied

Per the DB-executor report's Part B/C, both migrations ran successfully 2026-10-01 (`sources.
reliability_score` dropped, confirmed 0 residual columns; `promotion_policy` dropped, confirmed absent).
Headers corrected from APPLIED-PENDING to APPLIED 2026-10-01, citing the DB-executor report by name.

## Rule 022 (no em/en dash or section-sign glyph in added prose)

Every added line across every file touched in both rounds was swept for U+2014/U+2013/U+00A7 and found
clean before each commit (0 of 170 added lines in round 2's sweep; round 1's sweep covered separately,
also 0 of 624).

## Tests run (touched-only, per the coordinator's standing rule -- no full suite, no pre-push)

- `node --test .discipline/fitness/functions/F63-migration-applied-status.test.mjs` -- 28/28 pass
  (grew from 21 across round 2's two correction passes).
- `node --test .discipline/fitness/manifest.test.mjs` -- 5/5 pass.
- `node .discipline/fitness/runner.mjs --function=F63` -- 0 violations against the real 2026-09-30
  export (copied into scratch, then removed before each commit); self-skip PASS with no export present.
- `node .discipline/fitness/runner.mjs --function=F24` -- 1 known/expected violation (`inference_records`,
  see round 1 part c).
- `node .discipline/fitness/runner.mjs --function=F47` -- PASS.
- `node .discipline/fitness/runner.mjs --function=F6` -- PASS (304 migration files).
- `node --test .discipline/consistency/checks/C3-migrations-reality.test.mjs` -- 4/4 pass; live `run()`
  reports 0 drift against the regenerated inventory.

## Write set (round 1 + round 2, matches the two dispatches)

`fsi-app/supabase/migrations/{331_harness_runs,335_drop_placeholder_community_layer,
277_corpus_turn_requests,261_drop_dead_notification_v1,151_published_price_statistics,
152_state_cost_facts,153_community_post_signoff_requests,258_emission_factors_and_licence_gate,
146_item_xref_origin_and_related_derive,147_sources_fetch_status,148_surface_counts,
150_criterion2_url_canonicalize,240_layer_c_insert_gate,260_fk_indexes_and_scanner_hygiene}.sql`
(header only), `fsi-app/supabase/migrations/{340_drop_sources_reliability_score,
341_drop_promotion_policy}.sql` (new, then header APPLIED 2026-10-01),
`fsi-app/.discipline/fitness/functions/F63-migration-applied-status.{mjs,test.mjs}` (new, then fixed
twice), `fsi-app/.discipline/governance/db-catalog.json`, `docs/inventories/migrations.md`, this file.
No `F24-db-object-migration-home.mjs` edit (considered, reverted -- out of this lane's write set). 149's
header (round 1/2) stayed UNCHANGED pending verification; round 3 retires it permanently -- see below.

## ROUND 3: 149 retired, not applied -- the severity-vocabulary ruling

`lower(priority)` (149's own statement) does not land in the live severity vocabulary. A second
DB-executor read (`fsi-app/scripts/tmp/db-executor-2026-10-01-severity.md`) of the live
`intelligence_items.severity` CHECK constraint found it admits 13 values across two incompatible
shapes: the brief-contract label set (`action_required`/`cost_alert`/`window_closing`/
`competitive_edge`/`monitoring`) and a priority-shaped lowercase set (`critical`/`high`/`moderate`/
`low`, plus `immediate`/`watch`/`reference`/`background` of unclear current origin). Live non-null
rows (929 total) overwhelmingly use the LABEL set (`monitoring` 505, `reference` 332,
`action_required` 58, `cost_alert` 49, `background` 44, `competitive_edge` 8, `window_closing` 7); the
1,757 null rows split by priority MODERATE 1,615 / LOW 138 / HIGH 3 / CRITICAL 1. The two shapes are
NOT a bijection -- HIGH priority maps to either `window_closing` or `cost_alert` depending on content
the priority value alone cannot tell apart, which is exactly why 149's `lower(priority)` statement
would have written the wrong shape AND fabricated a specific label from a value that cannot determine
it.

**Operator ruling (via the coordinator, 2026-10-01): migration 149 is retired, NOT run, now or
later.** Severity is an editorial judgement the brief contract derives from content
(`environmental-policy-and-innovation`'s field-emission contract: severity reflects "the urgency of
action implied by the brief's content as it actually exists"); priority is derived FROM severity via
the locked mapping (ACTION REQUIRED to CRITICAL, COST ALERT/WINDOW CLOSING to HIGH, COMPETITIVE EDGE
to MODERATE, MONITORING to LOW), never the reverse. Inverting that relationship to backfill severity
FROM priority would have stamped 1,615 items `competitive_edge` purely from a MODERATE priority
value with no content behind the label -- fabrication under CLAUDE.md rule 2. Null severity renders
as absence on the customer surfaces, the honest state until a real regeneration writes a real label.

**149's header** (both the `-- subject:` line and the restated body paragraph, which this lane DID
edit since 149 was never applied and so carries no immutability concern) now reads "NEVER APPLIED,
retired 2026-10-01: severity is written only by regeneration (brief contract); null severity renders
as absence on the surfaces," plus the body paragraph's fuller reasoning (the fabrication argument
above, in full).

**F63 taught the retired status**: `STATUS_PATTERNS` gained a `NEVER APPLIED` -> `retired` entry
(checked first, no overlap risk with the NOT-APPLIED patterns), and `auditStatusAgainstLiveSchema`'s
no-live-check branch now documents `retired` alongside `draft`/`applied_pending` as the same class of
explicit non-claim. 149 itself has no table ops (a pure data backfill) so this never actually reaches
a live comparison either way -- the status exists so a FUTURE retired-with-table-ops migration is
handled deliberately, not by the accident of having nothing to compare against. Test suite grew from
28 to 30 (one `parseHeaderStatus` test, one `auditStatusAgainstLiveSchema` control test).

**`docs/tech-debt-log.md`** gained a dated entry ("severity vocabulary mixes two incompatible
shapes") naming the owed follow-on: a vocabulary consolidation migration, when regeneration next
touches severity, that either collapses the live CHECK to the 5-label set or documents why a second
shape still needs to coexist.

Re-ran, same touched-only set: F63 test (30/30), migrations-inventory generator (regenerated 149's row
from its own corrected file header, 304 rows), F6 (PASS), C3 (4/4, 0 drift).
