# Consolidated audit, 2026-09-30

Lane CONSOLIDATE. Read-only synthesis of the 2026-09-30 audit wave: 2 registers merged to master
(architecture-review, mechanical-checkers) plus 17 registers on open branches (A1 through A10, split
where the coordinator split a lane mid-session: A2/A2b, A3/A3b/A3c, A4/A4b/A4c, A5/A5b/A5c,
A8/A8b/A8c/A8d). Every register was read in full for its substantive sections (methodology, findings
tables, top-10, and decision-ready items); coverage appendices (per-file "clean, read in full" listings
with no finding) were sampled rather than transcribed here, since they carry no additional fact beyond
what section (e) below states about each lane's coverage. No code, schema, or doc outside this file and
the two sibling outputs was changed by this lane.

**Amended 2026-09-30 (same day, coordinator message):** `audit/a8d-docs` (PR #856) landed on the remote
after this document's first commit. Its register (`docs-vs-reality-board-and-remainder-2026-09-30.md`)
is read in full and folded in below: a new summary-table row, new findings in the docs-drift class
(PROGRAM-BOARD's 38-row PR reconstruction, 5 design-doc findings, 2 sprint fossil findings, 2 census
findings, 1 tech-debt-log finding), and section (e)'s coverage statement corrected to state the A8 split
is four lanes, not three. A6b has not landed on the remote as of this amendment; it will be folded in as
a second commit when it does, per the coordinator's instruction.

**Correction, 2026-09-30 (coordinator message, this document's third amendment).** The "Security note"
below and finding CF-PROC-2 in this document's first version were wrong. The two messages lane A5 received
mid-session were sent by the coordinator, relaying the operator's every-line-read directive; there was no
injected instruction. CF-PROC-2 is corrected to `[REFUTED]` in place per rule 13's corollary, not silently
dropped, and removed from the open P0 list in section (c). What stands: A5 declined to act on the
directive as relayed (it read as out-of-band and contradicted A5's own scoped brief plus CLAUDE.md rule
11), so A5's register is a replay-and-cross-reference pass only, not a line-by-line read, and is superseded
for line-level facts by A5b (migrations 001-170) and A5c (migrations 171-339), exactly as section (e)
already states for an unrelated reason (the scope split). That supersession relationship is real and
kept; the injection framing is not.

**Amended 2026-09-30 (fourth amendment, coordinator message).** Five completion registers landed on the
remote and are folded in below: `audit/a1c-routes` (PR #859, closes A1's 94-file sweep gap),
`audit/a2bc-components` (PR #860, closes A2b's 64-file grep-only gap), `audit/a4d-scripts` (PR #858,
closes A4's 3-file gap in `scripts/turns/**`), `audit/a4bc-scripts` (PR #862, closes A4b's 159-file gap
including all of `scripts/verify/**` and both mega-files), `audit/a4cc-scripts` (PR #861, closes A4c's
67-file `full (spot)` gap). New findings: a PostgREST `.or()` filter-injection pattern across 3 files
(CF-SEC-15); the invalid-CSS token-concatenation class (CF-BROKEN-2) now confirmed live on customer-facing
surfaces, not only the admin Sources panel; three producer scripts with `main()`/an orchestration call
running unconditionally at module scope, no guard at all (CF-BROKEN-9), one of them (`emission-factors-
desnz.mjs`) actively triggering a live Supabase read merely by being imported for its own test. CF-GATE-3
(EXIT0-1) is now REFUTED: all 87 `scripts/verify/**` files are read in full, zero swallowed-error exits
found. CF-GATE-4 (CLI-TEST-1) is resolved per file. Section (e)'s coverage statement and CF-PROC-1 (now
names only A6, pending A6b) are corrected accordingly. A6b is still in progress.

## (a) Summary table: lane, slice, files, findings by severity

| Lane | Slice | Files in slice | Files read in full | P0 | P1 | P2 | P3 | Status |
|---|---|---|---|---|---|---|---|---|
| A1 + A1c | routes-and-api | 217 | 217/217 (100%, A1c completion pass closes the 94-file sweep gap) | 0 | 1 | 9 | 0 | branches `audit/a1-routes`, `audit/a1c-routes` (PR #859), open |
| A2 | components a-l | 248 (owns 101) | 101/101 (100% of half) | 0 | 7 | 10 | 0 | branch `audit/a2-components`, open |
| A2b + A2bc | components m-z | 194 | 194/194 (100%, A2bc completion pass reads all 64 grep-only files) | 0 | 4 (CSS class) | 20 | 9 | branches `audit/a2b-components`, `audit/a2bc-components` (PR #860), open |
| A3 | src/lib a-m, final scope after two splits | 221 (of 404 originally assigned, then narrowed by the A3c split) | 221/221 (100%, completion pass same day: agent/'s remaining 86 files finished) | 0 | 0 | 8 | 0 | branch `audit/a3-lib` (PR #847), open |
| A3b | src/lib n-z, stores, types, workflows | 266 | 266/266 (100%, completion pass) | 0 | 1 (moat defect) | 5 | 2 | branch `audit/a3b-lib`, open |
| A3c | src/lib community-market | 156 | 156/156 (100%) | 0 | 0 | 8 | 2 | branch `audit/a3c-lib`, open |
| A4 + A4d | scripts + workflows (turns/maintenance) | 313 scripts + 22 workflows | all 22 workflows full; turns+maintenance 80/80 code files full (A4d closes the 3-file gap); rest of `scripts/**` per A4b/A4c below | 0 | 3 | 3 | 2 | branches `audit/a4-scripts`, `audit/a4d-scripts` (PR #858), open |
| A4b + A4bc | scripts/mint,lib,verify,producers,connections | 235 | 235/235 (100%, A4bc completion pass reads all 159 remaining files including both mega-files and all 87 `verify/`) | 0 | 6 | 9 | 0 | branches `audit/a4b-scripts`, `audit/a4bc-scripts` (PR #862), open |
| A4c + A4cc | scripts remainder | 157 | 157/157 (100%, A4cc completion pass reads all 67 `full (spot)` files) | 0 | 2 | 6 | 4 | branches `audit/a4c-scripts`, `audit/a4cc-scripts` (PR #861), open |
| A5 | database vs code (replay) | 118 tables, 302 migrations (replay) | n/a (replay + live-schema JSON, no line reads) | 0 | 1 | 8 | 0 | branch `audit/a5-db`, open |
| A5b | migrations 001-170 | 166 | 166/166 (100%) | 0 (2 historic, now closed) | 1 open + 3 historic-closed | 8 | 2 | branch `audit/a5b-migrations`, open |
| A5c | migrations 171-339 | 136 | 136/136 (100%) | 0 (2 historic, now closed) | 1 open + 2 historic-closed | 6 | 0 | branch `audit/a5c-migrations`, open |
| A6 | .discipline, tests, skills | ~1,328 (test-suffixed + discipline) | core mechanism files full, rest enumerated/swept | 0 | 3 | 4 | 3 | branch `audit/a6-discipline`, open |
| A7 | architecture and product | ~17,290 lines (app+workflow code) | full for every cited file | 0 | 0 | 0 | 0 (narrative review, not a findings register) | merged to master (#837) |
| A8 | docs/ vs reality | ~367 (docs/ minus ops/plans/dispatches) | partial, sampled | 1 | 2 | 4 | 0 | branch `audit/a8-docs`, open |
| A8b | docs/ops | 167 | 167/167 (100%, 1 structural exception) | 1 | 0 | 8 | 6 | branch `audit/a8b-ops`, open |
| A8c | docs/plans + docs/dispatches | 268 | 249/268 (93%; 19 images deliberately unread) | 0 | 1 | 5 | 1 | branch `audit/a8c-plans`, open |
| A8d | PROGRAM-BOARD, INDEX, design, sprint-1/2, census, tech-debt-log, docs remainder | ~61 text files (40 `.md`) | full for every text file, 2 disclosed exceptions (design-tool HTML/JS mock exports, 324 binary images) | 0 | 1 (DES-3) | 3 | 2 | branch `audit/a8d-docs`, open (PR #856) |
| A9 | mechanical checkers | n/a (tool outputs) | n/a | 0 | 0 | 1 | 0 | merged to master (#836) |
| A10 | remainder (tests, data, root config, .claude, docs root) | ~sampled set | full for every file cited | 0 | 0 | 4 | 5 | branch `audit/a10-remainder`, open |

A6b (discipline, second pass) has not landed on the remote as of this writing; not included, will be
folded in as a second commit when it lands, per the coordinator. See section (e) for what "files read in
full" means per lane, since several lanes disclose a partial-coverage gap in their own text rather than
claiming completeness.

## (b) Deduplicated findings register, by class

Consolidated id format `CF-<class>-<n>`. `source lane ids` cites every lane finding folded into the row.
`Closed by PR` names a merged PR only where a lane's own text states the fix landed; a row with no PR is
still open on `origin/master` as of this document's HEAD (`c55cfb2e`).

### Dead / unwired code

| id | source lane ids | file:line | finding | status | severity | closed by PR |
|---|---|---|---|---|---|---|
| CF-DEAD-1 | A1 F-1/F-6 | `src/app/api/admin/promotion-policy/route.ts` | Fully built admin route (GET+POST, RLS-locked, validated) with zero callers anywhere in the repo; the promotion engine it was meant to gate does not exist yet | [CONFIRMED] | P1 | none |
| CF-DEAD-2 | A2 D-1 | `src/components/home/DashboardTopPriority.tsx` (513 lines) | Finished drag-and-drop dashboard component, zero import sites; file's own header names its own dead status | [CONFIRMED] | P1 | none |
| CF-DEAD-3 | A3 F25-1..6 | `src/lib/credibility/chip-selection.mjs`, `src/lib/intake/census-writer.mjs`, `src/lib/llm/metered-gate.mjs`, `src/lib/llm/program-total.mjs`, `src/lib/sources/instrument-identity.ts`, `src/lib/contracts/corridor-id.mjs` | 6 modules on the repo's own F25 `LEGACY_ALLOWLIST`, independently re-verified still-dead; each has a named review trigger | [CONFIRMED] | P2 (tracked, no new work) | none needed (tracked) |
| CF-DEAD-4 | A4 D1 | `fsi-app/scripts/_snapshots/**` (1,193 files, 210 MB) | Gitignore-pattern-matched directory (`.gitignore:64`) tracked in git anyway since at least 2026-06-07; inflates every clone/worktree-add | [CONFIRMED] | P1 | none |
| CF-DEAD-5 | A4 D2, A4c F-01 | `fsi-app/scripts/_plans/**` (11 files) | Same class as CF-DEAD-4, smaller (`.gitignore:66` names it, files tracked anyway) | [CONFIRMED] | P2 | none |
| CF-DEAD-6 | A4c F-02 | `fsi-app/scripts/_diag/` (19 files) | Same class; not in `.gitignore` at all, tracked machine evidence (regen dry-run/apply logs) | [CONFIRMED] | P2 | none |
| CF-DEAD-7 | A4 D3/D4 | `scripts/_reground/`, `_ruling/`, `_worklists/`, `_archive/` (~67 files) | Naming signals one-off/scratch intent per the repo's own `.gitignore` exclusion policy comment; not independently confirmed zero-caller for every file | [HYPOTHESIS] | P2 | none |
| CF-DEAD-8 | A4c archive candidate | `fsi-app/scripts/flag-fabricated-items.sql` | One-off 2026-05-29 SQL script, zero live references beyond 2 descriptive doc mentions, superseded by guarded-write tooling | [CONFIRMED] | P3 | none |
| CF-DEAD-9 | A10 A10-2 | `fsi-app/src/data/seed-resources.json` (4,491 lines, ~1.23 MB) | Zero importers since the barrel that loaded it was removed 2026-07-12 | [CONFIRMED] | P2 | none |
| CF-DEAD-10 | A10 A10-3 | `fsi-app/supabase/seed.sql` (1,318 lines) | Targets 3 tables dropped by migration 013; would error if run; zero references anywhere | [CONFIRMED] | P2 | none |
| CF-DEAD-11 | A10 A10-5/A10-6 | `package.json` dependencies | `react-leaflet-cluster` declared, zero imports; `@types/leaflet` misplaced under `dependencies` not `devDependencies` | [CONFIRMED] | P3 | none |
| CF-DEAD-12 | A5 (new finding) | `inference_records` table | Live (0 rows, RLS on), zero migration anywhere in the 302-file corpus, zero code references; genuine out-of-repo DDL, invisible to F24 only because `db-catalog.json` is 7 weeks stale | [CONFIRMED] | P2 | none |
| CF-DEAD-13 | A2b J1 | `src/components/ui/ErrorState.tsx` | Tailwind-utility-class outlier in an otherwise 100% inline-style `ui/` tree; a sibling file's header names it as "a shape that does not match"; import-site search not run | [HYPOTHESIS] | P3 | none |

### Broken / functional defects

| id | source lane ids | file:line | finding | status | severity | closed by PR |
|---|---|---|---|---|---|---|
| CF-BROKEN-1 | A3b A3B-07 | `src/lib/sources/officialness.mjs`, `splitBlocks()` | Ends in `.split("")`, splitting on individual characters, not HTML blocks. STEP 2's link/text-density drop (the anti-fabrication moat's second line of defense against nav/menu chrome) can never fire on any input. Verified by direct `node -e` repro and a simplified `cleanBodyOf()` reproduction showing chrome leaking into the clean body as literal character-spaced text. No shipped test exercises the un-wrapped case this breaks | [CONFIRMED, by repro] | P1 | none |
| CF-BROKEN-2 | A2b A1-A5, A2bc A6 | `sources/CanonicalSourceReview.tsx`, `ProvisionalReviewCard.tsx`, `IntersectionDetectionView.tsx`, `ThemesView.tsx`, `resource/IntelligenceMetadataStrip.tsx` (24 occurrences, 5 admin-only files); extended by `ui/timeline-dot-styles.ts:23` (`nextDotStyle`, a `box-shadow` ring instead of a background, same `${var}NN`-suffix defect) | `backgroundColor`/`boxShadow: "var(--color-X)NN"` string-concatenation is not valid CSS; every tinted background/badge across the admin Sources surface silently fails to render, AND (A2bc's extension) the "next milestone" ring never renders on every `MilestoneTimeline` row-strip (`ListRow.tsx`) and every `Timeline` detail-page card that has a next milestone, live on customer-facing Regulations/Market/Research/Operations surfaces, not only an admin panel | [CONFIRMED] | P1 | none |
| CF-BROKEN-3 | A5b F-09 | migrations 108, 110, 117, 125 (`get_market_intel_items`); resolved at 164 | Migration 108 silently dropped the `_assert_org_membership()` call when rewriting the RPC; copied forward verbatim by 3 more migrations before 164 caught and fixed it. Live for ~6 weeks: any authenticated user calling the RPC with a foreign `p_org_id` could read that org's `workspace_item_overrides`, masked only by single-tenancy | [CONFIRMED, resolved] | P0 (historic) | resolved in-repo by migration 164 |
| CF-BROKEN-4 | A5c A5c-4 | migrations 296-298 vs 311 | 10 spec-09 tables shipped `SELECT TO authenticated USING (true)` (world-readable across orgs); 6 later wired to real customer commercial data were not org-scoped until migration 311, 2 days before this range ends; 4 panel components read them with an unscoped service-role query and no `org_id` filter | [CONFIRMED, resolved] | P1 (historic) | resolved by migration 311 |
| CF-BROKEN-5 | A1 F-5 | `src/app/api/admin/users/route.ts:76-98` | Returns every `org_memberships` row across every org, no `.limit()`, no pagination | [CONFIRMED] | P2 | none |
| CF-BROKEN-6 | build-plan WS16, A7, lane W2-D | `src/components/pages/MarketSignalDetailSurface.tsx` | Cause and fix confirmed by lane W2-D from a coordinator-run live SELECT: 631 `intelligence_item_sections` rows (430 `record_facts`, 201 `identity`) across record-grade Market items carry `record-facts.mjs`'s own `[slot_key] <claim text>` machine format. A record-grade item's Summary depth already renders these correctly via `RecordGradeSections`, but the unconditional `{depth === "full" && r.fullBrief && <GfmSection .../>}` block re-renders the identical facts a second time, raw and unlabelled, as soon as a reader switches to "Full brief" depth. Fixed by gating that block behind `!isRecord`; attack-proven with a new 4-leg Playwright smoke spec (`market-detail-raw-dump-smoke.mjs`, registered in `ux-smoke-specs.mjs`) that fails with the exact raw text when the guard is manually reverted and passes when restored. `RegulationDetailSurface.tsx:385` carries the identical unguarded pattern, unconfirmed whether it fires there at the same rate; flagged, not fixed, out of W2-D's write set | [CONFIRMED] | P1 | fix built and attack-proven on branch `lane/w2d-market-detail-dump`, session-log `2026-09-29-w2d.md`; not yet merged |
| CF-BROKEN-7 | A8b A8b-9, A7 | 2026-09-29 chained-apply incident | A cancelled `workflow_run` ("Ledger consume", 36568656803) left 33 `intelligence_items` (quarantined), 33 `staged_updates`, 32 `agent_run_searches`, 51 `integrity_flags` rows LIVE in production. Operator ruled "get rid of them." A `--dry/--apply/--archive/--verify` reversal script was built and tested (#829) but `--apply`/`--archive` were explicitly NOT run; no later entry shows it executed | [CONFIRMED] | P0, open | script built (#829), not executed |
| CF-BROKEN-8 | A3b A3B-05 | `src/lib/scoring.ts:213-217` | `sortResources`'s "modified" sort case is byte-identical to its "added" case; no `Resource` field exists to sort by "modified" on | [CONFIRMED] | P2 | none |
| CF-BROKEN-9 | A4bc F44-2a/b/c, A4cc F-10/F-11 | `scripts/producers/market/eu-weekly-oil-bulletin.mjs:168-171`, `scripts/producers/regional/eurostat-nrg-pc-205-producer.mjs`, `scripts/producers/regional/bls-oews-producer.mjs`, `scripts/gen/emission-factors-desnz.mjs:63`, `scripts/gen/emission-factors-epa.mjs:42` | 5 producer scripts run `main()` (or an equivalent top-level orchestration call, e.g. `runEnvelopeProducer(...)`) unconditionally at module scope with no `isMainModule`/`process.argv[1]` guard of any kind, not merely the wrong-shaped guard F44's own regression test checks for. One instance (`eurostat-nrg-pc-205-producer.mjs`) was already self-documented as a known, deferred defect in a sibling file's own header comment. One instance (`emission-factors-desnz.mjs`) is not merely latent: its own test file imports the module directly for one named export, so every `node --test` run of that test file also runs `main()`, performing a real, unintended live Supabase read against `emission_factors` as a side effect of running the test suite (a dev machine with `.env.local` creds present is affected; `--apply` is not set by the test run, so no live write occurs, only a read) | [CONFIRMED] | P1 | none |

### Unwired (producer without consumer, or the reverse)

| id | source lane ids | file:line | finding | status | severity | closed by PR |
|---|---|---|---|---|---|---|
| CF-UNWIRE-1 | A3c F-INT-1 | `src/lib/intake/flywheel-defect.ts:58-79`, `mint-item.ts:302-308,409-421,429-443` | 4 fire-and-forget writes (`.then(()=>{}, ()=>{})`) with zero logging on failure, including the writer every rule-16 non-fatal step depends on to make a failure visible | [CONFIRMED] | P2 | none |
| CF-UNWIRE-2 | A5 RW-2 | `state_cost_facts` | Read-orphan since migration 152; migrations 332/333 (STATE-COST-DAG) now target it but applied-status is unconfirmed | [CONFIRMED, still open] | P1 | in progress (332/333) |
| CF-UNWIRE-3 | A5 | `community_topics`, `community_topic_groups` | Read by `shell-context.ts`, 0 code writers; not investigated whether a seed-only path exists | [HYPOTHESIS] | P2 | none |
| CF-UNWIRE-4 | A5 RW-1 | `bulk_imports`, `disposition_ledger` | Write-orphans, allowlisted, Phase-7-pending since 2026-07-03/09-01 | [CONFIRMED] | P2 | none (coordinator decision overdue) |
| CF-UNWIRE-5 | A4 CHECK 3 | `loop-hops.d/*.json` (11 hops) | Every edge is wired in the workflow YAML (F50 PASS), but only 1 of 11 (`sweep-to-ledger-consume`) has live `gh run list` evidence of firing as a real `workflow_run`; the manifest's own `enforceFired:false` note is stale for that one hop | [CONFIRMED] | P2 | none |
| CF-UNWIRE-6 | A4 A4-P6 | producers.yml | Per-producer dispatch-history (`gh run list` evidence for zero-dispatch producers) not gathered this pass | [HYPOTHESIS], undone | P3 | none |

### Security and RLS

| id | source lane ids | file:line | finding | status | severity | closed by PR |
|---|---|---|---|---|---|---|
| CF-SEC-1 | A5b F-14 | migration 157 (fixes migrations 005-156) | `intelligence_items_read`, `staged_updates_read`, `provisional_sources_read` carried `SELECT TO public USING (true)` for ~3 months; anon key could read every quarantined/unverified item, all `staged_updates`, all `provisional_sources` | [CONFIRMED, resolved] | P0 (historic) | resolved by migration 157 |
| CF-SEC-2 | A5b F-15 | migration 165 (fixes migration 002-164) | `profiles` had exactly one RLS policy (`Public read`, `USING(true)`) since migration 002: no INSERT/UPDATE policy ever existed (every self-edit silently affected 0 rows while the UI reported success) and anon could read `email`/`linkedin_sub`/`is_platform_admin` off every row | [CONFIRMED, resolved] | P0 (historic) | resolved by migration 165 |
| CF-SEC-3 | A5b F-16 | migration 168 (fixes migration 157-167) | After 157 tightened the parent, 5 child tables (`item_timelines`, `item_cross_references`, `item_disputes`, `item_supersessions`, `item_changelog`) still leaked rows naming quarantined items for ~4 days | [CONFIRMED, resolved] | P1 (historic) | resolved by migration 168 |
| CF-SEC-4 | A5 SEC-1 | migration 330 (fixes migration 285) | `derivation_edges` RLS disabled with full anon/authenticated grants; live-confirmed closed (deny-all, RLS on, 0 policies) | [CONFIRMED, resolved] | P0 (historic) | resolved by migration 330 |
| CF-SEC-5 | A5c 249 | migration 249 | `integrity_flags`/`holdings_quality` admin policies gated on org-membership-owner-of-ANY-org instead of `profiles.is_platform_admin`; combined with self-serve org creation, any signed-in user could read/tamper platform flags | [CONFIRMED, resolved] | P0 (historic) | resolved by migration 249 |
| CF-SEC-6 | A5c 250 | migration 250 | mig-118 provenance-flip credential binding was forgeable (`set_config` by any role); `quarantined to verified` was never guarded at all; 180 live rows one UPDATE from unguarded promotion. Closed with an adversarial proof script | [CONFIRMED, resolved] | P0 (historic) | resolved by migration 250, proof `prov-guard-adversarial-audit.mjs` |
| CF-SEC-7 | A5c 230 | migration 230 | 8 operator-control tables (`funded_pass_runlock`, `disposition_ledger`, `mutation_leases`, `corpus_census`, `coverage_gap_candidates`, `coverage_gap_census_findings`, `drain_worklist`, `claim_versions`) shipped RLS-disabled with full anon/authenticated CRUD grants | [CONFIRMED, resolved] | P1 (historic) | resolved by migration 230 |
| CF-SEC-8 | A5c 257 | migration 257 | `reconciler` role held table-level SELECT grants with no covering RLS policy on 3 tables (grant without policy is inert under RLS); could UPDATE `intelligence_items` but not read what it was reconciling | [CONFIRMED, resolved] | P2 (historic) | resolved by migration 257 (169 completes it) |
| CF-SEC-9 | A5c A5c-3 | migration 256:124 | A real, live Supabase anon-role JWT for this project is embedded as a plaintext string literal in a committed migration file (passed to `vault.create_secret`). Anon keys are designed to ship client-side (low severity) but the value is now permanently in git history regardless of future rotation, and CLAUDE.md rule 9 draws no "public but shouldn't be a literal" exception | [CONFIRMED] | P2 | none |
| CF-SEC-10 | A6 D3, A10 A10-4 | `fsi-app/eslint.config.mjs`, `.github/workflows/*.yml`, `.discipline/hooks/pre-push` | ESLint is configured and scripted (`npm run lint`) but invoked by nothing in CI or pre-push; 32 `eslint-disable` comments in `src/` are currently unauditable for staleness as a direct consequence | [CONFIRMED] | P1 | none |
| CF-SEC-11 | A6 A1 | test paths containing `[id]`/`[param]` segments | Node's `--test` silently reports "tests 0" for a colocated `*.npmtest.mjs` under a literal `[id]/` path segment; reproduced by lane W2-A (relocating a file changed the npmtest count by +15 with zero errors either way, a false-green not a crash). 5 sibling `[id]/*` route dirs have zero colocated test coverage today, indistinguishable from "chose not to test" vs "silently dropped" | [CONFIRMED] | P1 | none |
| CF-SEC-12 | A6 D1 | branch protection / `.github/workflows/discipline.yml` | The "Consistency layer (C3/C4/C5 reality, always-on backstop)" job, built specifically to close a gap where rule 014 only conditionally fired, is not itself a required merge check | [CONFIRMED] | P1 | none |
| CF-SEC-13 | A10 A10-10 | `.claude/settings.local.json`, `fsi-app/.claude/settings.local.json` | Both tracked in git (convention says `settings.local.json` is per-developer/untracked); the `fsi-app` copy grants `Read(//c/Users/jason/**)`, the entire user home directory, plus a stale one-off `gh pr create` allow-string | [CONFIRMED] | P2 | none |
| CF-SEC-15 | A1c F-9 | `src/app/api/community/search/route.ts:90,98`, `src/app/operations/[slug]/page.tsx:169,173`, `src/app/research/[slug]/page.tsx:172,176` | 5 call sites across 3 files build a Supabase PostgREST `.or()` filter string by directly interpolating caller-controlled text (`community/search`'s `escapeLike` escapes only `%`/`_`/`\`; the two `[slug]` pages splice the URL's `id` segment in with no escaping at all). A raw comma or parenthesis in the input is filter syntax, not a search term, so a crafted `q` or URL slug can splice in an unintended condition. Impact is bounded: `community/search` still filters by the caller's own RLS visibility; the `[slug]` pages' injected query carries no `provenance_status='verified'` filter, so a crafted slug could surface a specific, guessed unverified/quarantined item's id/theme/jurisdictions/source_id, a narrow metadata leak, not a bulk read. The codebase already documents the correct fix in a sibling file's own comment (`api/workspace/archive-impact/route.ts:41-43`), and `regulations/[slug]/page.tsx` (read for comparison) does not carry the pattern, confirming the safe path already exists | [CONFIRMED] | P2 | none |
| CF-SEC-14 | A5, A5b F-01/F-06 | 11 tables (`agent_run_searches`, `gate_a_health_cache`, `institutions`, `intelligence_item_citations`, `intelligence_summaries`, `item_type_required_slots`, `section_claim_provenance`, `sector_contexts`, `source_bias_tags`, `system_state`, `system_state_flag_audit`) | Live RLS-enabled with zero policies (deny-all, confirmed safe) but the enabling migration is not identifiable anywhere in the 302-file corpus for any of the 11 | [CONFIRMED, REFUTED as a live exposure] | P2 (traceability gap only) | none |

### Data integrity, migration hygiene

| id | source lane ids | file:line | finding | status | severity | closed by PR |
|---|---|---|---|---|---|---|
| CF-DATA-1 | A5 (331, 335), A5c (277, 261) | migrations 331, 335, 277, 261 | 4 confirmed instances of a migration header self-declaring "NOT APPLIED"/"DRAFT"/"LEFT UNAPPLIED" while the object is live in production (331 `harness_runs`, 38 rows; 335 drops `case_studies`/`case_study_endorsements`/`taxonomy_nodes`, already gone; 277 `corpus_turn_requests`, 1,757 rows, 2 live callers; 261 drops the notification-v1 trio, already gone) | [CONFIRMED] x4 | P1/P2 | none (headers uncorrected) |
| CF-DATA-2 | A5b F-10, A5c A5c-8 | migrations 146-150, 240, 260 | 7 more migrations self-declare "NOT YET APPLIED"; cannot be confirmed live or dead from the row-count-only live-schema snapshot alone (146-150 need column/function-level checks; 240 is a trigger; 260 needs `CREATE INDEX CONCURRENTLY`, a non-standard apply path that may have silently stalled) | [HYPOTHESIS] | P1/P2 | none |
| CF-DATA-3 | A5 | `db-catalog.json` | 7 weeks stale (87 vs 118 replayed tables, now 117 confirmed live); F24's out-of-repo-DDL detector is correspondingly blind, which is how `inference_records` (CF-DEAD-12) stayed invisible | [CONFIRMED] | P2 | none |
| CF-DATA-4 | A5 | `sources.reliability_score` | Dead column, 2,572/2,572 rows at exactly the default, superseded by `trust.ts`'s live computation; DROP SQL ready, never applied | [CONFIRMED] | P2 | none |
| CF-DATA-5 | A5b F-03 | migrations 032, 041 (RLS policies) | Reference `user_profiles.is_platform_admin`; `user_profiles` is dropped at migration 183; no migration between 076-183 visibly redefines these 3 policies against `profiles` instead | [HYPOTHESIS] | P1 | none |
| CF-DATA-6 | A5b F-04 | migration 043, view `open_conflicts` | Selects FROM `source_conflicts`, dropped by migration 215; likely a dangling view over a nonexistent table | [HYPOTHESIS] | P2 | none |
| CF-DATA-7 | A5c A5c-5 | migrations 269, 272, 303, 305, 306, 310, 316 | The "every customer-facing listing RPC" set (11 functions) has been independently hand-re-derived and re-widened 5 separate times for 5 separate new columns; no single source of truth, which is exactly the risk class that produced two of those migrations' own motivating defects (the `jurisdiction_iso` gap and the `item_grade` gap) | [CONFIRMED] | P2 | none |
| CF-DATA-8 | A5c A5c-6 | migrations 249, 257, 330 (+ CF-SEC-4) | 3-and-counting instances of a table shipping RLS-disabled-with-broad-grants or an `org_memberships`-based admin check instead of `profiles.is_platform_admin`, each caught in a later, separate migration | [CONFIRMED] | P2 | none (no standing lint yet) |
| CF-DATA-9 | A5c A5c-7 | migration 272 (unchanged through 316), `get_technology_items()` | Still carries a hardcoded `item_type IN (...)` predicate instead of `surface_of()`; the 3 sibling RPCs were converted for exactly this reason in migration 269, this one was out of that migration's scope and never converted since. May be a deliberate legacy exception (Technology is not one of the 5 ratified customer surfaces); undetermined without reading `surface_of()`'s live definition | [CONFIRMED fact, HYPOTHESIS on disposition] | P2 | none |
| CF-DATA-10 | A5c A5c-9 | migration 302's own header | Records, at authoring time, that the live `validate_item_provenance` body already contained extensions (`c_own_body_types`, the migration-264 rename) not found in any committed migration as of that lane's base; the live function and the fully-committed migration chain may still diverge | [HYPOTHESIS] | P2 | none |
| CF-DATA-11 | A5b F-18 | migration 036 (extended by 140) | `admin_attention_counts()` shipped with two hardcoded-0 placeholder slots explicitly promised as "populated by follow-up"; migration 140 extends the function but never wires either original placeholder | [HYPOTHESIS] | P2 | none |
| CF-DATA-12 | A5b F-01, F-06 | migrations 016, 092 | `system_state` and `source_bias_tags` both get RLS enabled live with no `ENABLE ROW LEVEL SECURITY` statement in their own creating migration or anywhere in range 001-170; same class as CF-SEC-14 | [HYPOTHESIS] | P2 | none |

### Duplication

| id | source lane ids | file:line | finding | status | severity | closed by PR |
|---|---|---|---|---|---|---|
| CF-DUP-1 | A2b D1 | `resource/IntelligenceBrief.tsx` vs `resource/SectorSynopsis.tsx` | Two independent `react-markdown` component-override objects implement near-identical rendering (Action-Required callout, tinted headings, blockquote, link handling), same raw-hex palette in both | [CONFIRMED] | P2 | none |
| CF-DUP-2 | A2b G1 | `sources/CanonicalSourceReview.tsx` vs `sources/ProvisionalReviewCard.tsx` | Byte-similar tier/domain/jurisdiction/mode classification editor built twice, with 4 vocab arrays duplicated verbatim | [CONFIRMED] | P2 | none |
| CF-DUP-3 | A2 P-1/P-2 | `ui/SectionHeader.tsx` vs `ui/SectionHeading.tsx`; `RailCard` (3 forms) | Cited from a prior parts audit (2026-09-18/22); this session's spot-check found the RailCard literal numbers no longer match exactly, structure plausibly still holds | [HYPOTHESIS] | P1 | none |
| CF-DUP-4 | A2 Q3 | `community/GroupCard.tsx:414`, `community/GroupHeader.tsx:424` | `safeJson` helper duplicated verbatim in a directory that already has a shared api-client module | [CONFIRMED] | P2 | none |
| CF-DUP-5 | A4b F45-1 | `connections/apply-tags.mjs:56-61` vs `discover-for-items.mjs` | Self-disclosed duplication of DB-loading glue; the extraction point is already named in the code's own comments | [CONFIRMED] | P2 | none |
| CF-DUP-6 | A2/A4/A5, F45 baseline | repo-wide | The F45 duplicate-code fitness function passes at a standing baseline of 5,867 duplicated lines; it is a ratchet against growth, not a target trending toward zero | [CONFIRMED] | P2 | none |
| CF-DUP-7 | A2b F1-F12 | 23+11 files over 600 lines across components, plus `supabase-server.ts` (4,842), `canonical-pipeline.ts` (2,256, judged mostly load-bearing on full read by A7), `heal-provenance.mjs` (4,268), `export-census-rows.mjs` (1,729) | Oversized-file census across the app; several read in full and judged organized-but-long (not urgent), a handful (`CommunityRooms.tsx` 1,785, `GroupModals.tsx` 1,208, `heal-provenance.mjs`) are genuine split candidates | [CONFIRMED sizes; mixed on urgency, see per-lane detail] | P2/P3 | none |

### Tests and gates

| id | source lane ids | file:line | finding | status | severity | closed by PR |
|---|---|---|---|---|---|---|
| CF-GATE-1 | A6 A2, A9 | `scripts/verify/audit-finding-status.mjs`, `run-test-suite.sh` | 609 of 643 finding-shaped lines across 123 audit docs carry no `[CONFIRMED]`/`[HYPOTHESIS]`/`[REFUTED]` token; the checker's own exit code is discarded (`\|\| true`), by disclosed design pending a bulk relabel | [CONFIRMED] (independently re-confirmed by A9's own tool run) | P2 | none |
| CF-GATE-2 | A6 C3 | `*.test.mjs`/`*.npmtest.mjs` with `new Date()`/`Date.now()` | The one documented clock-fragility defect class (PR #816) was closed by a one-time manual grep, not a standing fitness function; the at-risk file count has grown from 24 to 37 since | [CONFIRMED history, HYPOTHESIS current safety] | P2 | none |
| CF-GATE-3 | A4b EXIT0-1, A4bc resolution | `scripts/verify/*.mjs`, all 87 files | A4bc read all 87 `scripts/verify/` files in full (not grep context) and confirms every `process.exit(0)` site is a genuine "0 findings, invariant holds" success exit, always preceded by an explicit success-message log; no swallowed-error shape found anywhere. Every audit script's own `catch` block exits 1 (a real finding) or 2 (self-skip, no DB creds), never a silent 0 | [REFUTED as a live concern] | n/a | resolved by A4bc's full read, no fix needed |
| CF-GATE-4 | A4b CLI-TEST-1, A4bc resolution | `mint/apply-mint-batch.mjs`, `mint/run-mint-batch.mjs`, `mint/validate-mint-payload.mjs` | A4bc read each companion test file's own import list directly. `apply-mint-batch.test.mjs` and `validate-mint-payload.test.mjs` import no `node:child_process`; every test exercises the exported pure/injected-dependency functions only, the CLI's own `main()`/argv-parsing/exit-code layer is never spawned or otherwise exercised by either. `run-mint-batch.test.mjs` does import `execFileSync` and spawns the real CLI against real argv at line 280, genuine subprocess-level coverage | [CONFIRMED] for `apply-mint-batch.mjs`/`validate-mint-payload.mjs` (real gap, untested CLI layer); [REFUTED] for `run-mint-batch.mjs` (has real coverage) | P2 for the 2 files still gapped | none |
| CF-GATE-5 | A6 B1 | `.discipline/fitness/manifest.mjs` | Fitness-function id gaps (F29, F53, F55, F56) have no recorded reason, unlike the well-documented F1/F3/F4/F5/F7 deletions | [HYPOTHESIS] | P3 | none |
| CF-GATE-6 | A2/A3 F-RUNNER | `.discipline/fitness/runner.mjs` | Appeared to hang with no output in more than one worktree on first attempt; A3 re-ran it to completion (52 functions, 0 violations, several minutes wall-clock, not hung) and corrected its own earlier "hung" claim in place | [REFUTED as a hang; CONFIRMED slow] | n/a | none needed |
| CF-GATE-7 | A6 C4/C5 | `scripts/verify/**`, `.discipline/**` | 41 `process.exit(2)` self-skips and 16 DB/network-dependent test files are consistent with the documented self-skip convention but were not individually re-verified to fail loud rather than silently pass | [HYPOTHESIS] | P2 | none |
| CF-GATE-8 | A10 A10-7 | `package.json` | No `"test"` script; tests run via `.discipline/run-test-suite.sh` by deliberate, documented convention, but this surprises ecosystem tooling that assumes `npm test` exists | [CONFIRMED] | P3 | none |

### Docs drift

| id | source lane ids | file:line | finding | status | severity | closed by PR |
|---|---|---|---|---|---|---|
| CF-DOCS-1 | A8 A8-1, C1-2, S2-1/2 | `docs/PROGRAM-BOARD.md` | Last dated entry 2026-09-11; no thread row reflects 19 days / 150+ commits since, including the entire 2026-09-24/25 ruling set and the whole Wave-2 program | [CONFIRMED] | P0 | none |
| CF-DOCS-2 | A8c A8c-1 | `docs/plans/wave2b-lanes-2026-09-29.md` | 6 of 8 wave-2b lanes (W2-B/C/D/E/F/G) have completed, committed work on their branches that has never merged; only W2-A and W2-H landed | [CONFIRMED] | P1 | none (this consolidation's own OUTPUT 3 carries the current state) |
| CF-DOCS-3 | A8 A8-2, A8b A8b-10 | `docs/PROGRAM-BOARD.md` section 1a | "Operations matrix shows values" row stuck OPEN although a lane closed it with code-read evidence on 2026-09-29 and supplied the exact replacement text; never landed (PROGRAM-BOARD is coordinator-only) | [CONFIRMED] | P1 | none |
| CF-DOCS-4 | A8 Check 3, A8b Check 1 | `docs/sprint-1/`, `docs/sprint-2/`, 4 audit files | 88 broken markdown relative links, concentrated in pre-redesign fossil docs (root-relative-vs-file-relative path bug); 2 live-doc broken links (A8b-4/L3-3, L3-4) | [CONFIRMED] | P2 | none |
| CF-DOCS-5 | A8b A8b-3, A8b-7, A8b-8 | `docs/ops/rendering-guard-followups-2026-07-11.md`, `multi-tenant-foundation-followups-2026-05-15.md`, `registered-deferrals-2026-07-11.md` | 3 open commitments with no visible closure in the full 24,302-line session-log.md read: rendering-guard's "earn required status" step (echoes CF-SEC-12), multi-tenant Phase 3 (drop `user_profiles`), and DEF-1's 30-day dwell trigger (51 days overdue) | [HYPOTHESIS] | P1/P2 | none |
| CF-DOCS-6 | A8b A8b-13 | `docs/ops/full-system-audit-2026-07-11/CODE-5a-register.md` | 4-month-old register names 2 HIGH findings on `fsi-app/scripts/**` (bare-invocation prod writes; a re-run interlock covering only 7 of ~45 write-one-shots) never re-checked against the current tree | [HYPOTHESIS] | P1 if still live | none |
| CF-DOCS-7 | A8c A8c-3 | `docs/plans/finish-plan-2026-09-02.md`, `system-completion-plan-2026-09-02.md` | 2 of 4 plans a later plan's own table instructs to get a superseded banner never received one | [CONFIRMED] | P2 | none |
| CF-DOCS-8 | A7 recommendation 4 | `docs/PROGRAM-BOARD.md` lines 17-59 | Six-deep stacked "resume from" pointer chain at the file's head, each superseding but not replacing the last | [CONFIRMED] | P2 | none |
| CF-DOCS-9 | A10 A10-9 | `fsi-app/docs/admin-scan-audit.md` | Undated point-in-time file, against CLAUDE.md standing rule 10 | [CONFIRMED] | P3 | none |
| CF-DOCS-10 | A8d PB-1/PB-2 | `docs/PROGRAM-BOARD.md`, whole file | Extends CF-DOCS-1 with a full reconstruction: the board's append-only body terminates at 2026-09-11 (line 2032-2036) while its own header pointers run to 2026-09-29; 38 merged PRs (#800-#837) have no board row at all. A8d built a one-row-per-PR skeleton from `git log` commit subjects (no chat, no memory), matching the board's own provenance rule | [CONFIRMED] | P0 | none (skeleton staged, not landed; see remediation Lane 15) |
| CF-DOCS-11 | A8d DES-1, DES-2, DES-5, DES-3, DES-4, AUD-1 | `docs/design/redesign/README.md`, `handoff-2026-09-06/{README.md,HANDOFF.md,DEVIATION-LOG.md}`, `handoff-2026-09-07/README.md`, `docs/design/parts-inventory.md`, `docs/design/decision-package-2026-07-06.md`, `AUDIT-2026-09-07.md` | 6 design-doc findings: (DES-1) the oldest of 3 design-source-of-truth layers claims sole authority with no superseded notice despite INDEX.md stating it is superseded; (DES-2) a self-flagged 2026-09-09 deviation ("README stale in the same direction") never reconciled, 21 days elapsed; (DES-5) a 778px vs 780px content-column-width arithmetic correction landed in the -07 README but not in 2 other files carrying the same figure; (DES-3) two unresolved ruling conflicts (a rule-below-S-section-title contradiction, and a Search\|Ask toggle removal that silently drops the `GET /api/search` capability) with no resolving doc, 12+ days each as of the source doc's own date, unresolved 12 more days after that; (DES-4) a 2026-07-06 doctrine doc whose tranche model appears absorbed by later heal machinery, not confirmed either way; (AUD-1) operator ruling 3.5's second half (hover/menu "Unwatch" text) is unbuilt, confirmed independently by 2 dated passes 4 days apart (`grep -rn "Unwatch" src/` returns zero) | [CONFIRMED] for DES-1/2/5/3/AUD-1; [HYPOTHESIS] for DES-4 | DES-3 is P1 (actively blocks the F49 parts gate from having one unambiguous target); AUD-1 is P2; DES-1/2/5/4 are P2/P3 | none |
| CF-DOCS-12 | A8d SPR-1/SPR-2 | `docs/sprint-1/*.md` (16 files), `docs/sprint-2/*.md` (4 files) | Every file's last-touch commit is 2026-05-17 through 2026-05-21, four-plus months stale; zero citations from post-July PROGRAM-BOARD content; not marked historical the way `fsi-app/STATUS.md` explicitly is. Independently corroborates A8's own L3-1 finding on the same directories with a different method (git log dates, not just link-breakage) | [CONFIRMED] | P3 | none |
| CF-DOCS-13 | A8d CEN-1/CEN-2 | `docs/census/gap-census-2026-07.md` | (CEN-1) the doc's specific row counts (1,331 `census_worklist` rows) are likely stale relative to later corpus-wide mint/heal waves, not verified live; (CEN-2) every per-item detail table the doc's own "how to read" section promises (Enumerated/Held/Missing, for all 4 surfaces, plus rollup/flagged/dedup logs) is empty scaffolding, while the aggregate rollup numbers in the same file are populated; the promise stands over permanently-empty tables | [HYPOTHESIS] for CEN-1; [CONFIRMED] for CEN-2 | P2/P3 | none |
| CF-DOCS-14 | A8d TDL-1 | `docs/tech-debt-log.md:9-30` | The F52 shellcheck entry's stated exit condition (fix 29 notes, then remove `-shellcheck=`) has no closing commit found among the 38 PRs A8d reconstructed; very likely still open, flagged for review only, not a defect in the entry itself | [HYPOTHESIS] | P3 | none |

### Process (this audit wave's own coverage gaps, carried forward per rule 14)

| id | source lane ids | finding | status | severity |
|---|---|---|---|---|
| CF-PROC-1 | A6 | Of the original 4 lanes this finding named, A3 (corrected: 221/221 final scope), A4 (closed by A4d: turns+maintenance 80/80), A4b (closed by A4bc: 235/235) have each since reached 100% coverage of their assigned scope via a same-day completion pass, and are no longer listed here. Only A6 remains: full reads of core mechanism files, enumeration and targeted reads elsewhere, a systematic grep sweep over ~600 test files rather than individually opening each one. A6's own methodology section states this plainly against a mid-task directive that asked for more; A6b (a second discipline pass) is in progress and is expected to close this gap when it lands | [CONFIRMED] (A6's own coverage-appendix disclosure; the other 3 lanes' gaps independently confirmed closed by their completion registers' own file-count reconciliation) | P1 (audit-process risk: a real defect in an unread file would not have surfaced), pending A6b |
| CF-PROC-2 | A5 | Two messages, initially read by lane A5 as possibly not from the coordinator, demanding a full-read claim; not followed at the time. Corrected 2026-09-30: both messages were genuinely sent by the coordinator, relaying the operator's directive; there was no injection | [REFUTED, corrected in place] | n/a (was P0; the underlying fact this finding worried about, a compromised instruction channel, did not occur) |

## (c) Confirmed P0 and P1, in full sentences

**P0, open, needs action now:**

- `[CONFIRMED]` `docs/PROGRAM-BOARD.md`, the repo's own designated resume state, has not been updated in 19 days and 150-plus commits, including the entire 2026-09-24/25 ruling set and the whole Wave-2 lane program (CF-DOCS-1). A session that resumes from it today gets a materially wrong picture of what is built.
- `[CONFIRMED]` The gap above is now fully enumerated: 38 merged PRs (#800-#837) have zero corresponding PROGRAM-BOARD row, and a one-row-per-PR reconstruction skeleton exists, built from `git log` commit subjects, ready to land (CF-DOCS-10).
- `[CONFIRMED]` The 2026-09-29 chained-apply incident left 33 quarantined `intelligence_items`, 33 `staged_updates`, 32 `agent_run_searches`, and 51 `integrity_flags` rows live in production under an explicit operator ruling to remove them. A tested reversal script exists and has not been run (CF-BROKEN-7).

**P0, historic, confirmed closed (listed because they were the highest-severity findings in the corpus and their closure is itself worth the operator's confidence, not because they need further action):**

- `[CONFIRMED]` Migration 108 silently dropped the cross-org membership check on `get_market_intel_items` for roughly six weeks before migration 164 caught and fixed it (CF-BROKEN-3).
- `[CONFIRMED]` `intelligence_items`, `staged_updates`, and `provisional_sources` were world-readable to the anon key for roughly three months of the platform's early history, closed by migration 157 (CF-SEC-1).
- `[CONFIRMED]` `profiles` had no INSERT/UPDATE RLS policy from its creation through migration 165 (every self-edit silently failed) and leaked email, LinkedIn subject id, and platform-admin flag to anon; closed by migration 165 (CF-SEC-2).
- `[CONFIRMED]` `derivation_edges` shipped RLS-disabled with broad grants; closed by migration 330 (CF-SEC-4).
- `[CONFIRMED]` `integrity_flags`/`holdings_quality` admin policies were gated on any-org-membership rather than platform-admin status; closed by migration 249 (CF-SEC-5).
- `[CONFIRMED]` The provenance-flip credential binding was forgeable by any role via `set_config`, with 180 live rows one UPDATE from unguarded promotion; closed by migration 250 with an adversarial proof script (CF-SEC-6).

**P1, open:**

- `[CONFIRMED]` `/api/admin/promotion-policy` is a fully built, unwired admin control with no engine to gate (CF-DEAD-1).
- `[CONFIRMED]` `home/DashboardTopPriority.tsx` is 513 lines of finished, unmounted dashboard code (CF-DEAD-2).
- `[CONFIRMED]` Every tinted background/badge across the admin Sources surface (5 files, 24 sites) is silently dropped by invalid CSS string concatenation, and the same defect class silently drops the "next milestone" ring on every list row's and every detail page's Timeline component, live on all four customer-facing intelligence surfaces (CF-BROKEN-2).
- `[CONFIRMED]` 5 producer scripts run their orchestration entry point unconditionally at module scope with no guard at all, one of them triggering a real live Supabase read merely by being imported for its own test (CF-BROKEN-9).
- `[CONFIRMED, by repro]` `lib/sources/officialness.mjs`'s STEP 2 anti-fabrication check is a structural no-op, verified by direct reproduction; it is the module's own second line of defense against nav/menu chrome being mistaken for FACT text (CF-BROKEN-1).
- `[CONFIRMED]` ESLint is configured and scripted but invoked nowhere in CI or pre-push (CF-SEC-10).
- `[CONFIRMED]` Node's `--test` silently drops colocated tests under any `[param]/` route directory; 5 sibling route directories have zero colocated coverage today with no way to tell whether that is a choice or the same defect (CF-SEC-11).
- `[CONFIRMED]` The consistency-backstop CI job, built specifically to close a conditional-gating hole, is not itself a required merge check (CF-SEC-12).
- `[CONFIRMED]` `state_cost_facts` remains a read-orphan; a build lane targets it but applied-status is unconfirmed (CF-UNWIRE-2).
- `[CONFIRMED]` 4 migrations across the corpus self-declare "NOT APPLIED" while live in production, with no mechanical check catching the drift (CF-DATA-1).
- `[CONFIRMED]` 6 of 8 wave-2b lanes are complete on their own branches and unmerged (CF-DOCS-2).
- `[CONFIRMED]` The "Operations matrix shows values" PROGRAM-BOARD row is stuck OPEN despite a lane supplying the exact closing text (CF-DOCS-3).
- `[CONFIRMED]` Market detail's raw-dump bug is confirmed by a coordinator-run live SELECT and fixed on an unmerged branch: 631 sections across record-grade Market items render the same facts twice, once correctly and once as raw machine text, under "Full brief" depth (CF-BROKEN-6).
- `[HYPOTHESIS]` 3 open commitments in `docs/ops/` have no visible closure across a full 24,302-line session-log read (CF-DOCS-5).
- `[HYPOTHESIS]` 2 HIGH findings from a 4-month-old scripts register (bare-invocation prod writes; a partial re-run interlock) were never re-checked against the current tree (CF-DOCS-6).
- `[CONFIRMED]` Two unresolved design-ruling conflicts (a rule-below-S-section-title contradiction between code and the current parts brief, and a Search\|Ask toggle removal that silently drops a live API capability) sit with no resolving doc, actively blocking the F49 parts gate from having one unambiguous target (CF-DOCS-11, DES-3).
- `[CONFIRMED]` This audit wave's own coverage: A6 alone (of the original 4 lanes CF-PROC-1 named) has not yet reached literal 100% line-by-line reading within one session; A3, A4, A4b closed their gaps via same-day completion passes. A6b is in progress and expected to close A6's (CF-PROC-1).

## (d) Refuted along the way

- **A2 D-3**: 17 `ui/` primitives suspected dead. Every one has 1-8 real importers. `[REFUTED]`.
- **A2 A-2**: Two `<div onClick>` sites flagged by a class-4 grep as possible div-as-button violations. Both wrap real `<button>`/`<input>` children; neither is a real accessibility defect. `[REFUTED]`.
- **A2b H1**: `RegionDimensionMatrix.tsx`'s first-cell-open-on-arrival state flagged as a possible rule-13/F43 violation. It is a deliberate, doubly-cited, test-enforced exception reconciling two dated operator rulings, with its own regression test asserting the citation text. `[REFUTED as a violation, confirmed as a positive example]`.
- **A3, propagation/methods/superseded-notices.ts**: `[REFUTED]` suspected as an unregistered METHODS-registry entry. It is a different kind of module entirely (an F31-sanctioned raw-read helper), correctly wired to 3 real production importers.
- **A3, direct `createClient()` call sites**: `[REFUTED]` suspected as duplicate-client-construction debt. Most carry explicit deliberate-consolidation or separate-lifetime justification in their own headers.
- **A3, `.selftest.mjs` files flagged by an assert-count heuristic**: `[REFUTED]` each is a single `assert.equal` inside a loop over 15-20+ real cases; the heuristic undercounts loop-based table tests.
- **A3, fitness runner "hang"**: `[REFUTED as a hang]` an earlier in-session read judged `.discipline/fitness/runner.mjs` hung after 5 minutes of no output. Re-run to completion: 52 functions, 0 violations, genuinely just slow (several minutes for a repo-wide AST/glob sweep), not hung. Corrected in place per rule 14.
- **A5**: `[REFUTED as an exposure]` the RLS-posture concern this same lane initially raised for 11 tables with no `ENABLE ROW LEVEL SECURITY` statement in the migration corpus. The coordinator's live-schema file shows all 11 are RLS-on with zero policies (deny-all), safe today; the finding survives only as a traceability gap (CF-SEC-14), not a live exposure.
- **A5c H1** (same id reused by A2b for a different file; this is A5c's instance): `[REFUTED at the specific-claim level]` `sweep-to-ledger-consume` hop's `enforceFired:false` framing, refuted by live `gh run list` evidence showing the hop does fire; the manifest text itself is stale, not the wiring (folded into CF-UNWIRE-5, not separately listed as refuted).
- **build-plan-2026-09-25 workstream 4** (Operations matrix envelope-reader gap): `[REFUTED]` originally suspected as a real data-reading bug. `fetchOperationsCoverage` selects all 11 envelope columns; `RegionDimensionMatrix.tsx` consumes them correctly. Closed by lane W2-H, 2026-09-29. This is the single most-cited example across the corpus of the rule-13 corollary (a flag dissolving under evidence) working as designed.
- **A9 prior register, dwell-count**: `[CONFIRMED, corrected]` RW-3's deferral-dwell-clock defect, corrected 2026-08-11 from a 66-day miscount to the true 4-day figure; carried forward as already-closed, not re-litigated (A5 reconciliation table).
- **CF-PROC-2 (A5)**: `[REFUTED, corrected in place]` The two messages lane A5's register described as "probable injected instructions" were genuinely sent by the coordinator, relaying the operator's every-line-read directive. Corrected per the coordinator's 2026-09-30 message; see the correction note at the top of this document. A5's decision not to act on the directive as relayed stands unchanged in effect (its register remains a replay-only pass), only the "injection" characterization is withdrawn.
- **A8d IDX-1**: `[REFUTED as broken]` `docs/INDEX.md:302`'s `%20`-encoded link to the HANDOFF file, which A8's own L3-5 had left as an open `[HYPOTHESIS]` needing a filesystem check. A8d ran that check: the target file exists and the encoding decodes correctly; the link is a false positive in a naive (non-decoding) link-resolution script, not a real break. This resolves L3-5 in place.

## (e) Coverage statement

**Read every line, no disclosed exception:** A2 (its own half, 101 of 101 components a-l), A3b (266 of 266,
after a same-day completion pass superseding an initial 37% partial pass), A3c (156 of 156), A5b (166 of
166 migrations 001-170), A5c (136 of 136 migrations 171-339), A7 (every code file it cites, ~17,290 lines,
architecture-review-2026-09-30.md, merged to master), A8b (167 of 167 docs/ops files, with one named
structural-verification exception on a 2,974-row mechanical manifest file), A8d (every text file in its
scope, ~61 files including the full 2,036-line PROGRAM-BOARD.md, all 16 sprint-1 and 4 sprint-2 files, and
a 4,060-line machine-generated design audit, with 2 disclosed exceptions: design-tool HTML/JS mock-render
exports, self-described by 3 independently-read docs as never-shippable plumbing, and 324 binary
capture/screen images, existence-verified only per rule 12's spirit), A10 (every file it makes a claim
about), A3 (corrected 2026-09-30: 221 of 221 files in its final scope, read in full; the lane's scope
narrowed twice, first by the A3/A3b letter split, then by the A3c community/connections/credibility/
forward-events/intake/llm/market split; the branch's final commit, `8c1b7969` on `audit/a3-lib`,
PR #847, completed the remaining 86 files of `src/lib/agent/` the same day, closing what this document's
first version reported as a 79-of-404 gap), A1 (corrected 2026-09-30: 217 of 217 files across
`fsi-app/src/app/**` plus `src/proxy.ts`/`route-policy.ts`, read in full; A1 read 120 files plus the 2
middleware files, A1c, PR #859, read the remaining 94 `SWEEP`-tagged files, `favicon.ico` is the sole
non-text exception), A2b (corrected 2026-09-30: 194 of 194 files across `src/components`'s m-z half, read
in full; A2b read 140, A2bc, PR #860, read the remaining 64 `ui/`- and `sources/`-test files A2b's own
appendix marked `Grep`), A4's `scripts/turns/**`+`scripts/maintenance/**` slice (corrected 2026-09-30: 80
of 80 code files, read in full; A4 read 58 maintenance files plus 19 of 22 turns files, A4d, PR #858, read
the remaining 3 turns files), A4b (corrected 2026-09-30: 235 of 235 files across
`scripts/{mint,lib,verify,producers,connections}/**`, read in full; A4b read 76, A4bc, PR #862, read the
remaining 159, including all 87 `scripts/verify/**` files and both mega-files A4b could previously only
structurally scan), A4c (corrected 2026-09-30: 157 of 157 files across the scripts remainder scope, read
in full; A4c read 90 at full depth, A4cc, PR #861, read the remaining 67 files its own appendix marked
`full (spot)`).

**Disclosed partial coverage, method stated per file group:** A4's `scripts/**` slice outside
`turns/`+`maintenance/` (61 of 313 scripts narratively read, 19.5%; all 22 workflow files read in full;
every file mechanically swept for the named defect-class patterns; not addressed by any completion lane
in this wave). A6 (core execution-mechanism files read in full; every fitness function, rule file, golden,
and selftest enumerated and cross-checked; the remaining ~600 test files covered by a systematic pattern
sweep, not individually opened; the lane's own methodology section states this plainly against a mid-task
directive that asked for more; A6b, a second discipline-lane pass, is in progress and expected to close
this gap when it lands). A8 (~180 of 367 INDEX.md lines spot-checked; the audit itself samples rather than
claims full coverage of `docs/` broadly, since A8b, A8c, and A8d took the dedicated depth passes on
`docs/ops/`, `docs/plans/`+`docs/dispatches/`, and `docs/PROGRAM-BOARD.md`+`docs/INDEX.md`+`docs/design/`+
`docs/sprint-1/`+`docs/sprint-2/`+`docs/census/`+`docs/tech-debt-log.md` respectively). A8c (249 of 268
files read in full, 93%; 19 image screenshots deliberately unread per the PDF/image cost-model rule, with
the narrating README read in full instead).

**Superseded-by-full-read relationships, as specified by the dispatch:**

- A5's replay-and-cross-reference pass over the full 302-migration corpus is **extended, not superseded**,
  by A5b (001-170) and A5c (171-339), which add literal line-by-line reads A5's method did not attempt. A5
  remains the authority for the live-schema-JSON reconciliation and the table-by-table register; A5b/A5c
  are the authority for anything only visible in a migration's actual text (header-vs-live drift, in-file
  self-corrections, the exact SQL of a fix).
- A6's discipline-and-tests register has no A6b counterpart on the remote as of this document; per the
  dispatch, if A6b lands later this document is to be amended. Not yet actioned.
- **A1 is extended by A1c, A2b by A2bc, A4's turns/maintenance slice by A4d, A4b by A4bc, A4c by A4cc**,
  each a same-day completion pass reading exactly the files the base lane's own coverage appendix marked
  as not individually read (SWEEP, Grep, full (spot), or a named remaining-file list). None of the five
  completion registers found a defect the base lane's own base-rate characterization contradicts; A1c's
  new finding (CF-SEC-15) and A2bc's extension of CF-BROKEN-2 to a customer-facing surface are both
  consistent with, not a reversal of, the base lanes' "disciplined surface" framing. A4bc additionally
  resolved 2 of A4b's own open HYPOTHESIS findings (EXIT0-1 to REFUTED, CLI-TEST-1 to CONFIRMED-per-file).
- A8 is **split into four: A8, A8b, A8c, A8d**, corrected in place from this document's first version
  (which found no `audit/a8d-docs` branch on the remote at the time; the coordinator confirmed it landed
  as PR #856 after this document's first commit). A8's own broad-but-shallow docs/ pass is superseded for
  `docs/ops/` by A8b's 167/167 full read, for `docs/plans/`+`docs/dispatches/` by A8c's 249/268 full read,
  and for `docs/PROGRAM-BOARD.md`, `docs/INDEX.md`, `docs/design/`, `docs/sprint-1/`, `docs/sprint-2/`,
  `docs/census/`, and `docs/tech-debt-log.md` by A8d's full read (every text file in scope, 2 disclosed
  exceptions). A8's findings about `docs/decisions/`, `docs/specs/`, `docs/runbooks/`, and the broken-link
  sweep across non-archive `docs/` remain the only coverage of those areas in this wave; A8d independently
  corroborates A8's PROGRAM-BOARD-staleness finding (CF-DOCS-1) with a full-file line-count read rather
  than a header-vs-body sample, and resolves A8's own open `[HYPOTHESIS]` (L3-5, the `%20` link) to
  `[REFUTED as broken]`.

**Named exceptions, disclosed rather than silently rounded up:** PNG/JPG screenshots (A8c, 19 files, rule
12's image-cost-model), a 2,974-row mechanically-generated manifest file verified structurally rather than
row-by-row (A8b), `scripts/_snapshots/**`'s 1,193 tracked-but-gitignored JSONL files (A4, counted and
characterized, not read line by line, matching the harness-runs-JSON treatment the dispatch itself
sanctioned).

---

*Findings-total: 86 consolidated rows across 8 classes plus 2 process findings (amended 2026-09-30 three
times: +5 rows CF-DOCS-10 through CF-DOCS-14 folding in A8d, PR #856; 3 corrections per the coordinator,
CF-PROC-2 refuted in place, A3's coverage corrected to 221/221, CF-BROKEN-6 confirmed with mechanism and
fix; +2 rows CF-BROKEN-9 and CF-SEC-15 folding in A1c/A2bc/A4d/A4bc/A4cc, PRs #858-#862, plus CF-BROKEN-2
extended, CF-GATE-3 refuted, CF-GATE-4 resolved per file, CF-PROC-1 narrowed to A6 only). P0: 9 (3 open:
PROGRAM-BOARD staleness, the reconstruction skeleton, the unreversed chained-apply data; 6
historic-and-closed). P1: 17 confirmed. Remediation lanes for every confirmed finding are proposed in
`docs/plans/remediation-plan-2026-09-30.md`; current build state is in
`docs/plans/build-overview-2026-09-30.md`. A6b is still running and will be folded in as a further commit
when the coordinator sends its branch.*
