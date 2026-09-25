# Supabase integrity-and-wiring audit - 2026-09-25 (discovery phase)

Executor lane for `docs/plans/build-plan-2026-09-25.md` section 3 (workstream 1, sequence lane 2).
SELECT-only discovery. No writes of any kind were issued against the live database. Every finding below
carries a rule-14 status token (`[CONFIRMED]` / `[HYPOTHESIS]` / `[REFUTED]`) and a severity
(P0/P1/P2, orthogonal to status). Project: `kwrsbpiseruzbfwjpvsp`.

Remediation does NOT open from this document. Per section 3's method, remediation lanes open only after
the coordinator reviews this register.

## Environment note (read before the findings)

This worktree (`.claude/worktrees/supabase-audit-0925`) has no `node_modules` - unlike the container the
lane common contract assumes, this local Windows checkout does not symlink a shared install, and `npm
install` is out of scope for a SELECT-only discovery lane. Consequence: the four reuse-first scripts that
need `@supabase/supabase-js` (`canonical-key-dedup.mjs`, `quarantine-disposition-audit.mjs`,
`orphan-source-audit.mjs`, `source-link-audit.mjs`) could not be run as CLIs. Reused instead: their
header-documented invariant/SQL, executed as the equivalent read-only query via the Supabase MCP
`execute_sql` tool (SELECT only) against the live project - same invariant, same data, different
transport. Each finding below that reuses one of these says so and names the substitution. The four
scripts that don't touch the DB (`F14`, `F45`, `closure-gate.mjs`, `invariant-coverage.mjs`) ran directly,
unmodified, with no substitution.

`id-redirect-target-audit.mjs`, named in the lane spec's reuse-first list item 4, does not exist under
that name or any name found by `git grep -il redirect` across `fsi-app/scripts` and `fsi-app/.discipline`
 -  see Reused Mechanisms below.

## Reused mechanisms and their output

| Mechanism | How it ran | Result |
|---|---|---|
| `F14-producer-consumer-orphan.mjs` | `node .discipline/fitness/functions/F14-producer-consumer-orphan.mjs` (direct, no DB) | PASS. 118 tables, 95 RPCs. Write-orphans: 2, both allowlisted (`bulk_imports`, `disposition_ledger`, both Phase-7-pending). Read-orphans (informational): 4 (`sector_contexts`, `community_topics`, `community_topic_groups`, `state_cost_facts`). 0 gating violations. |
| `F45-duplicate-code.mjs` | `fitnessFunction.check()` invoked directly (no DB) | PASS. 5,911 duplicated lines, base (merge-base with origin/master) also 5,911 - no ratchet regression. |
| `.discipline/governance/closure-gate.mjs` | `node .discipline/governance/closure-gate.mjs` (direct, no DB) | PASS. NEVER-RUN / STALE-NEXT / WRITER-READER / LANE-CONTRACT all PASS. WRITER-READER here is scoped to tables created by migrations >= 266 only (33 tables) - a narrower, complementary scope to F14's full-schema pass, confirmed by reading the script (`MIGRATIONS_SINCE = 266`), not a conflicting result. |
| `.discipline/governance/execution-wiring.mjs` | Not directly runnable (pure module, no CLI entry - exports `isExecutionWired()` for callers). Ran its consumer instead. | See next row. |
| `.discipline/governance/invariant-coverage.mjs` (the meta-gate execution-wiring.mjs feeds) | `node .discipline/governance/invariant-coverage.mjs` (direct, no DB) | PASS. 139 invariants (126 enforced, 13 exempt) + 63 doctrines (44 enforced, 19 exempt). No unenforced doctrine, no orphan mechanism, no stale marker. |
| `scripts/maintenance/canonical-key-dedup.mjs` | Could not run as CLI (no node_modules). Its header's own `SELECTION SQL` block run verbatim via Supabase MCP `execute_sql`. | 0 live canonical-key collision groups today - see finding DUP-1. |
| `scripts/verify/quarantine-disposition-audit.mjs` | Could not run as CLI. Its stated invariant (ENQUEUE + DWELL, `DWELL_BOUND_DAYS = 14` read from the file) reproduced as SQL via `execute_sql`. | ENQUEUE holds; DWELL violated - see finding RW-3. |
| `scripts/verify/orphan-source-audit.mjs` | Could not run as CLI. Its invariant (source-y archived item without an active source for its host) approximated via `source_id` FK join, not the script's exact per-row host-extraction logic. | 6 candidate rows - see finding RW-4 (`[HYPOTHESIS]`, approximation named). |
| `scripts/verify/source-link-audit.mjs` | Could not run as CLI. Its invariant (`source_id IS NULL` on a live row) reproduced as SQL. | 0 source-less live rows - see finding RW-5. Clean. |
| `scripts/verify/run-data-audit-lane.mjs` | Not run (it spawns the three audits above as child processes; same node_modules/DB-transport gap). Read instead to confirm audit registration. | Confirmed by direct read: each of the three scripts above carries its own `// data-audit: label=... hard=true` marker as required first line, so `deriveAudits()` would register all three (and `canonical-key-dedup.mjs` is a maintenance step, not a data-audit-lane member, correctly outside this list). |

## Coverage check 1 - every table has a reader and a writer, or an allowlisted reason

- **RW-1** `[CONFIRMED - F14 direct run]` P2. Schema-wide (118 tables): 2 write-orphans, both already
  allowlisted in `producer-consumer-orphan.mjs` with a reason and a Phase-7 disposition-pending note
  (`bulk_imports`, `disposition_ledger`). 0 gating (unallowlisted) write-orphans. Disposition:
  keep-allowlist.
- **RW-2** `[CONFIRMED - F14 direct run]` P1. `state_cost_facts` is a read-orphan: read by
  `src/app/api/ask/route.ts:245` and `src/lib/supabase-server.ts:3507`, written by nothing anywhere in
  the repo (0 rows live, and no producer script exists - this is not "not yet populated", it is "no
  producer was ever built" per the same F14 pass). The table's own migration comment (152) says a state
  with no row renders PENDING by design, so the surface fails safe today, but the read side has carried
  a dependency on a producer that does not exist since migration 152 (2026-07). Disposition: wire (build
  the sub-national cost-fact producer) or, if intentionally deferred, coordinator ratifies an F14
  allowlist entry with a reason - this lane does not choose, per the brief's stop-and-ask rule on
  allowlist-reason ambiguity.
- **RW-3** `[CONFIRMED - reproduced quarantine-disposition-audit.mjs's DWELL invariant via
  `execute_sql`, corrected for a join-fanout bug in an earlier pass of this same query (re-run with
  `COUNT(DISTINCT id)`)]` P1. 78 live-quarantined `intelligence_items` rows total. ENQUEUE holds fully: 0
  of the 78 lack an open `integrity_flags` row (`category='data_quality'`, `status='open'`). DWELL is
  violated: 66 of the 78 (85%) have `updated_at` older than `DWELL_BOUND_DAYS = 14` (the constant read
  directly from the script) with no recorded disposition. This is exactly the invariant
  `quarantine-disposition-audit.mjs` is registered `hard=true` in the data-audit lane to catch - if that
  lane ran today with live credentials it would be RED on this count. Disposition: wire (dispatch
  `scripts/regen-quarantined.mjs`, the script's own named resolver) - a remediation lane, coordinator-
  scoped, not this discovery pass.
- **RW-4** `[HYPOTHESIS - approximated orphan-source-audit.mjs's invariant via a `source_id` FK
  join (archived + source-y `archive_reason` + no active `sources` row for that `source_id`), NOT the
  script's own per-row URL-host-extraction method; the two methods can disagree on edge cases]` P2. 6
  candidate rows found, of which 1 (`79541d36-…`, `archive_reason='reclassified_to_source'`) has
  `source_id IS NULL` outright - the clearer case, closer to the invariant's spirit regardless of method.
  Disposition: extract - re-run the actual script once the node_modules gap is closed (a coordinator- or
  container-side fix, not this lane's to make), to get an exact, non-approximated count before opening a
  remediation lane.
- **RW-5** `[CONFIRMED - reproduced source-link-audit.mjs's invariant via `execute_sql`]` P2 (clean,
  informational). 0 live `intelligence_items` rows with `source_id IS NULL`. Invariant holds. Disposition:
  keep.
- **RW-6** `[CONFIRMED - direct read of scripts/verify/*.mjs headers + git grep]` P2. The lane spec's
  reuse-first list item 4 names `fsi-app/scripts/verify/id-redirect-target-audit.mjs`; no file by that
  name exists, and `git grep -il redirect` across `fsi-app/scripts` and `fsi-app/.discipline` finds no
  script performing an ID-redirect-target check. Disposition: coordinator call - either the lane spec
  cites a script that was never built (spec drift) or one that was renamed/merged elsewhere and this
  lane's search missed it; flagging rather than guessing per the brief's doc-conflict stop rule.

## Coverage check 2 - duplicate or parallel tables serving one role

- **DUP-1** `[HYPOTHESIS - read every `public.*` table comment (99 commented tables) for
  role overlap, not verified against each pair's actual application-code read/write paths]` P2. Reviewed
  candidate pairs that read as possibly overlapping by name: `source_citations` vs
  `intelligence_item_citations` (source-to-source vs item-to-source edges, both documented as
  intentionally parallel), `regional_data_facts` vs `state_cost_facts` (region-grain vs sub-national-grain,
  different tables by design per migration 152's own comment), `market_series` vs
  `published_price_statistics` (spine vs refreshed board, one feeds the other per the WO-16.2 ruling cited
  in the `market_series` comment), `emission_factors` vs `assumption_register` (world-published numbers vs
  this-product's-own modelling constants, explicitly disambiguated in `assumption_register`'s own
  comment), `user_watchlist` vs `org_watchlist` (personal vs team-shared, by design), `coverage_gap_candidates`
  vs `coverage_gap_census_findings` vs `census_worklist` (pricing input vs discovery-lane census artifact
  vs full-corpus enumeration ledger, each comment cross-references the others' distinct role). No
  accidental duplicate-role table found in this pass. Disposition: keep-allowlist for all pairs reviewed;
  separately, extract - build the "new check, no existing precedent" tool the lane spec calls for
  (F45-shaped structural comparison over `information_schema`, not manual comment reading), since a
  duplication introduced without an honest comment would not be caught by this method and comment-reading
  does not scale past ~100 tables.
- **DUP-2** `[CONFIRMED - information_schema.tables query + git grep + list_migrations]` P2
  (clean, informational). `notifications` and `notification_events` looked like a possible name-prefix
  duplication (both notification-shaped); confirmed there is no live duplication: migration
  `20260812205117_drop_dead_notification_v1` (applied, present in `list_migrations`) dropped the dead
  `notification_events` / `notification_deliveries` / `notification_subscriptions` trio from an abandoned
  v1 design (0 rows ever, 0 code readers/writers, per that migration's own header) and
  `information_schema.tables` confirms only `notifications` and `notification_preferences` remain.
  Disposition: keep - this is resolved hygiene, not a live finding.

## Coverage check 3 - duplicate items (same instrument minted twice, legacy_id/CELEX collisions)

- **DUP-3** `[CONFIRMED - ran canonical-key-dedup.mjs's own header-documented SELECTION SQL
  verbatim via execute_sql]` P2 (clean). 0 live `canonical_instrument_key` groups with `count(*) > 1`
  among `is_archived=false` rows. The 2026-09-04 defect this script was built to fix (32015R0757,
  32023R1804, both since resolved) does not recur. Disposition: keep.
- **DUP-4** `[CONFIRMED - direct SQL, same shape as DUP-3 but on `legacy_id`]` P2 (clean). 0 live
  `legacy_id` collision groups among `is_archived=false` rows. Disposition: keep.

## Coverage check 4 - dead columns (written by nothing, read by nothing)

- **DEAD-1** `[HYPOTHESIS - not executed as a full-schema sweep; scope and reasoning stated
  here rather than a guessed result]` P2. A full pass (118 tables x ~15 columns average, each column
  name grepped across `fsi-app/src` and `fsi-app/scripts` for both read and write sites, net of PK/FK/
  timestamp/generated columns) is outside this discovery lane's SELECT-only, single-session budget. The
  last dedicated dead-column cleanup was migration 185 (`drop_dead_columns`, 2026-07); nothing since. This
  coverage item is NOT complete - no columns are confirmed dead or confirmed clean at full-schema scope.
  Disposition: extract. Concrete next step (decision-ready per rule 13, not a bare flag): a
  `scripts/verify/dead-column-audit.mjs` built as a column-grain sibling of F14 - enumerate
  `information_schema.columns` for `public`, grep each `<table>.<column>` / bare `<column>` identifier
  across `src/` and `scripts/` (excluding the migration that created it), flag zero-hit columns, register
  it in `run-data-audit-lane.mjs` per the reuse-first principle already established for the three DB
  audits reused above.

## Coverage check 5 - unwired UI parts (component/route renders a field with no producer)

- **UI-1** `[REFUTED - direct code read, src/lib/supabase-server.ts:3376-3396]` P1. The
  build plan (`docs/plans/build-plan-2026-09-25.md` workstream 4, and the thread table at
  `docs/PROGRAM-BOARD.md:114`) states the `fetchOperationsCoverage` envelope-reader gap is still OPEN,
  citing `PROGRAM-BOARD:1587`. That citation is the PRE-fix finding. `PROGRAM-BOARD.md` itself records the
  fix at line 1632 ("WO-9 layer 2 built", Wave 5, Addendum 37, 2026-08-30), and the live code on this
  branch confirms it: the `regional_data_facts` select at `supabase-server.ts:3376` already lists all 11
  envelope columns (`value_numeric, unit, currency, derivation, origin_class, source_key, source_ref,
  n_observations, method_version, as_at_date, reference_period`), each nullable/additive per the code
  comment there. The reader gap is CLOSED, not open. Disposition: coordinator call, not this lane's to
  fix - this is a doc-conflict (build-plan workstream 4 and the PROGRAM-BOARD thread-table row both carry
  a stale claim that PROGRAM-BOARD's own later entry already contradicts); flagging per the brief's
  stop-and-ask rule on doc conflicts, not editing PROGRAM-BOARD (out of this lane's write set).
- **UI-2** `[HYPOTHESIS - not verified by this lane; reused from build-plan-2026-09-25
  workstream 16, not re-derived per rule 11]` P1. The Market detail raw-dump bug (a raw text/JSON-like
  dump rendering mid-page on the Market detail page) is already sequenced as its own repro lane (build
  plan section 4, lane 8). Not investigated here. Disposition: no change - leave to the sequenced lane.
- **UI-3** `[CONFIRMED - same F14 run as RW-2]` P1. `state_cost_facts` (RW-2) is this audit's
  own concrete instance of the unwired-UI-parts class: an API route (`/api/ask`) and a server-data
  function consume a table with zero producer anywhere in the repo. Cross-referenced here rather than
  duplicated as a second row. Disposition: see RW-2.
- A true UI-side checker (route/component AST scanned against schema-producer coverage, the "UI-side
  mirror of F14" the lane spec calls for) does not exist yet and was not built in this discovery pass.
  Disposition: extract, same reasoning as DEAD-1.

## Coverage check 6 - unrun producers (ADR-023-named runtime, declared schedule, zero dispatch history)

- **PROD-1** `[CONFIRMED - grep of all 21 `.github/workflows/*.yml` for `cron:`, `gh
  workflow list`, `gh run list` on the two matches]` P2 (clean, informational). Only 2 of 21 workflows
  contain the string `cron:` (`trust-recompute.yml`, `uptime-probes.yml`); both are commented out
  (`# schedule:` / `# - cron: ...`), each with an explicit `DISARMED 2026-09-04 (operator ruling, CLAUDE.md
  rule 16...)` comment, `workflow_dispatch` only live. This is exactly build-mode-holds-cadence-off (rule
  16) working as intended, not a defect - a first pass of this same grep (without reading the matched
  lines) would have mis-flagged both as "scheduled but not firing"; correcting that here before stating it,
  per rule 14. The other 19 workflows carry no schedule trigger at all, consistent with ADR-023
  ("every runtime by explicit dispatch"). No workflow was found with an ACTIVE declared schedule and zero
  dispatch history. Disposition: keep.
- **PROD-2** `[CONFIRMED - direct SQL against system_state]` P2 (clean, informational).
  `system_state.scrape_cadence = 'off'`, matching rule 16's build-mode state. Not a finding; recorded to
  show the check was actually run, per rule 15 (a check is proven by running it, not by citing the rule).
- This check covered only top-level `.github/workflows/*.yml` schedule declarations plus one sampled
  harness family (`connection_theme_runs`, last run 2026-09-18, 64 rows total, actively dispatched - not
  stale). It did NOT walk every family under `scripts/harness-runs/` for a declared-schedule-vs-dispatch-
  history comparison at that grain (the M9/F50 "every hop fires" pattern the lane spec says to extend).
  `[HYPOTHESIS]` - unrun producers at the harness-family grain are neither confirmed nor refuted by this
  pass. Disposition: extract - a follow-up pass should walk `scripts/harness-runs/*/family.json` against
  its `governing_files`/schedule declaration and last-run artifact timestamp, the same shape F50 already
  established, rather than this lane's manual per-workflow grep.

## Bonus finding (surfaced during schema inspection, not one of the six named checks)

- **SEC-1** `[CONFIRMED - Supabase advisor (`get_advisors` security, surfaced inline by
  `list_tables`) + direct `information_schema.role_table_grants` query]` **P0.** `public.derivation_edges`
  (spec 08 section 2.2 Part 2, the invalidation DAG for `derived_values`) has Row Level Security DISABLED, with
  full `SELECT/INSERT/UPDATE/DELETE/TRUNCATE` grants live for both `anon` and `authenticated` roles - 24
  live rows fully exposed to read and write via the public anon key today. Every sibling table in the same
  spec-08 propagation subsystem (`derived_values`, `propagation_events`, `statutory_computations`,
  `estimated_values`, `sensitive_field_policy`, `aggregate_query_log`) has RLS enabled; `derivation_edges`
  is the one exception. This is outside the six named coverage checks but is a live, unmitigated integrity
  exposure directly relevant to "wiring" and was found while inventorying the schema for DUP-1/DUP-2, so it
  is recorded here rather than dropped. Disposition: wire - this needs a migration (`ALTER TABLE
  derivation_edges ENABLE ROW LEVEL SECURITY` plus policies matching its siblings), which is a write this
  discovery lane cannot make; flagged for the coordinator to open as its own remediation lane, ahead of
  the register-review gate if the coordinator judges P0 security exposure should not wait for the full
  workstream-1 sequence.

## Findings summary (status tokens, for the mechanical check)

- RW-1 [CONFIRMED]
- RW-2 [CONFIRMED]
- RW-3 [CONFIRMED]
- RW-4 [HYPOTHESIS]
- RW-5 [CONFIRMED]
- RW-6 [CONFIRMED]
- DUP-1 [HYPOTHESIS]
- DUP-2 [CONFIRMED]
- DUP-3 [CONFIRMED]
- DUP-4 [CONFIRMED]
- DEAD-1 [HYPOTHESIS]
- UI-1 [REFUTED]
- UI-2 [HYPOTHESIS]
- UI-3 [CONFIRMED]
- PROD-1 [CONFIRMED]
- PROD-2 [CONFIRMED]
- SEC-1 [CONFIRMED]

## Open questions for the coordinator

1. RW-6: `id-redirect-target-audit.mjs` (lane spec reuse-first item 4) does not exist under that name
   anywhere in the repo. Was it never built, renamed, or merged into another script this lane's search
   missed?
2. RW-2 / UI-3: `state_cost_facts` has readers and no producer since migration 152. Wire a producer, or
   ratify an F14 allowlist entry - which, and who owns the sub-national cost-fact sourcing if "wire"?
3. UI-1: the build plan (workstream 4) and PROGRAM-BOARD's own thread table (line 114) both still claim
   the Operations-matrix envelope-reader gap is open; PROGRAM-BOARD's own later entry (line 1632) and live
   code say it closed 2026-08-30. Which document gets corrected, and by whom (out of this lane's write
   set)?
4. SEC-1: `derivation_edges` RLS-disabled, P0, live exposure. Does this get its own remediation lane ahead
   of the rest of workstream 1's sequence, given the six named checks all gate on this register being
   reviewed first?
5. This lane's own `docs/INDEX.md` line for this document was drafted then reverted: `lane-common-contract.md`
   marks `docs/INDEX.md` coordinator-only, and the pre-push discipline suite's "check 4 wired to the live
   tree" test enforces it hard against this branch. The proposed line is staged in this lane's
   `docs/ops/session-log.d/2026-09-25-supabase-audit-lane.md` entry for the coordinator to land at merge.
6. RW-4: the environment gap (no node_modules in this worktree) blocked running
   `orphan-source-audit.mjs`/`quarantine-disposition-audit.mjs`/`source-link-audit.mjs`/
   `canonical-key-dedup.mjs` as CLIs; SQL reproductions were used instead. Should a future lane in this
   sequence run with the container's shared node_modules install so these can execute directly (closer to
   their exact logic, not an approximation), or is the MCP-SQL substitution acceptable going forward?
