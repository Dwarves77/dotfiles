# FLAG-1 (lane flag1-disposition-gate), 2026-10-08

Rule 13 becomes a gate. Operator, 2026-10-09: a rule in place and not followed is a system failure, not a miss.
Rule 14 was already enforced by `fsi-app/scripts/verify/audit-finding-status.mjs`; rule 13 now is, in the same
script, and at the dispatch point by the PreToolUse skill gate.

## Accomplished

- `fsi-app/scripts/verify/audit-finding-status.mjs`: the rule-14 status check is unchanged (still first-line
  token, same recognised lines, same counts: 821 finding-shaped lines, 0 unlabeled on this tree). Added the rule-13
  disposition check: exactly one of `[WORK: <lane id or PR N>]`, `[CLOSED: PR N]`, `[REFUTED: <evidence>]`,
  `[NOT-WORK: <reason>]` per finding; bare, empty or malformed tokens and two tokens fail; a bare `[REFUTED]` stays the
  status token and is not a disposition. Findings are the lines the status check already recognises plus every
  top-level list line under a section headed Owed, Facts, Observed, Open, Not done or Residual (audits and registers)
  or Not done, Open items, Open questions, Residual (session logs). Scope: audits and session logs dated 2026-10-01 or
  later by the last date in the path, plus any `*register*.md` under `fsi-app/scripts/tmp/`; an earlier or undated file
  is out of scope (the pre-attack-register backlog is the catalogue's owed list, not this gate's; stated in the
  header). One scan site, `collectOpenFindings(root)`, with an mtime+size cache. `--strict` fails on an
  undispositioned audit finding or a contract contradiction; session logs and registers are reported and enforced by
  the dispatch gate. `--all` lists every offender.
- Contradiction check (item 4), same script: `contractContradiction(contractText, gateSource)` fails when a contract line
  tells a lane to stop on a hook block with no carve-out for the skill-load block while the gate's own block message
  tells it to load the skills and retry. Fixture test carries the contradiction. On the real tree the contract has no
  such line (the stop-on-any-hook rule lives in the briefs' COMMON.md, not in `docs/dispatches/lane-common-contract.md`).
- `fsi-app/.discipline/governance/pretooluse-skill-gate.mjs` (write set expansion, granted): a dispatch (Agent, Task,
  Workflow, SendMessage, i.e. `DISPATCH_TOOLS`) is denied, tag `dispatch-undispositioned`, while any finding is
  undispositioned in the three sources; the reason lists the first 20 file:line and the total. The dispatch text
  containing the literal `DISPOSITION-LANE` is let through to the normal ask; the header comment says this is a
  cooperating-session mistake-catcher (ADR-046), not an intent barrier. `GATE_DISPOSITION_ROOT` redirects the scanned
  root (used by the tests, same pattern as `GATE_AUDIT_LOG`).
- Tests: `audit-finding-status.test.mjs` (22 tests) and `pretooluse-skill-gate.test.mjs` (150 tests) all pass,
  also under the no-npm resolver hook. Existing dispatch cases run against a clean empty root so they stay hermetic.

## Read and reused

- Read in full: `audit-finding-status.mjs` and its test. Read: `pretooluse-skill-gate.mjs` (header, dispatch branch,
  runGate), its test (setup and dispatch cases), `skill-map.mjs` `DISPATCH_TOOLS`, `lane-common-contract.md` headings and
  every stop/hook line, `docs/ops/session-log.d/README.md`.
- Reused: the existing `listAuditFiles`, `LIST`, `DEFECTY`, `STATUS` constants and `isMainModule`; the gate's own
  `decision()`; the `GATE_*` env-injection convention; the gate test's `LOADED` transcript and temp-dir setup. No second
  scanner: the gate imports `collectOpenFindings` from the verify script.

## Red then green

- Old code (the two source files stashed, tests kept): `audit-finding-status.test.mjs` fails at import, the module
  exports none of the new functions; `pretooluse-skill-gate.test.mjs` 150 tests, 5 fail (the three source-refusal
  attacks, the four-tool refusal, the first-20 listing). New code: 22/22 and 150/150.
- Attack-named tests: no disposition fails; two dispositions fail; `[NOT-WORK]` bare, empty and blank fails; malformed
  CLOSED/WORK/REFUTED fail; `[CLOSED: PR 1040]` passes; a pre-2026-10-01 and an undated file are out of scope; contract
  contradiction fixture fails; dispatch refused with one open finding in each of audit, session log, register; allowed
  with the literal; allowed when all dispositioned; a session-log `[NOT-WORK: reason]` line counts.
- Dispatch scan timing on this tree (699 open findings, 161 audit files, 160 session logs), measured by the gate test:
  cold 72 ms, warm 28 ms, against the 300 ms ceiling. The gate test asserts cold under 300 ms.

## Decisions

- The disposition token may sit on a continuation line of the list item; the scan joins the item.
- A bare `[REFUTED]` is not a disposition (it is the rule-14 status token); `[REFUTED: evidence]` is both.
- Nested sub-bullets (indent 2 or more) under a section are part of their parent, not separate findings, unless
  they match the existing defect-shaped recognition.
- SendMessage is held with the other `DISPATCH_TOOLS` ("the tool classes it already routes"); a continuation of a
  disposition lane carries the literal in its message.

## Undispositioned findings on this tree (the PR is red on this gate until the coordinator dispositions them)

Count: 699 total, 221 in audits (11 files), 478 in session logs (118 files), 0 in registers. Command:
`node fsi-app/scripts/verify/audit-finding-status.mjs --all`. Per audit file: dead-code-census-2026-10-08 53,
gate-evaluation-2026-10-08 41, aud-at1-rls-grants-attacked-2026-10-08 38, aud-at3-gates-attacked-2026-10-08 27,
obl1-obligations-register-2026-10-08 14, aud-at4-gates-attacked-2026-10-08 14, aud-at5-gates-attacked-2026-10-08 12,
verify1-register-unknowns-2026-10-08 11, and three further audit files carrying the remaining 11. The full list, file
then line then finding text truncated to 120 characters, grouped by file with the file's count:

```
docs/audits/aud-at1-rls-grants-attacked-2026-10-08.md  (38)
  12: - [CONFIRMED: schema_migrations read] Migration 370_privilege_table_policies is recorded (ledger version 20261008131555)
  13: - Probes ran 2026-10-08 between 14:26 and 14:34 UTC against the live schema as it stood then.
  14: - Live inventory at run time [CONFIRMED: catalog]: 121 public tables (pg_tables), 0 partitioned, 0 with RLS off, 0 with 
  15: - Grant counts at run time [CONFIRMED: has_table_privilege over 121 tables]: anon SELECT 108, INSERT 44, UPDATE 35, DELE
  66: 1. P2 (org viewer): 121 tables x 5 commands = 605 cells OWED. Reason: no viewer membership exists. Fixture creation insi
  67: 2. P3 (org member of another org): 121 x 5 = 605 cells OWED. Reason: one organization exists.
  68: 3. NX cells (command ran and was refused or returned nothing, but the table had no rows for the probe to act on, so the 
  69: 4. One column privilege not probed by a statement: portfolios has 5 columns without UPDATE for authenticated; 1 of them 
  70: 5. Layer 2 standing alone (the guard trigger with the column grant restored) was not exercised: restoring a grant is a w
  71: 6. Views (6) and functions (EXECUTE grants, SECURITY DEFINER bodies) are outside this lane's enumerator (tables, column 
  72: 7. Policies for the roles reconciler and service_role (13 policies) are not attacked: those are not weaker principals.
  73: 8. The six lenses other than ATTACKED are owed for subsystem 11.
  77: - One DO block per call covered a batch of 15 or 16 tables (8 calls, 121 tables). Inside it, each table ran in its own B
  78: - A first trial call on 5 tables (profiles, organizations, org_memberships, community_member_profiles, notifications) an
  79: - Each cell ran inside its own nested sub-block (savepoint) with SET LOCAL ROLE <principal> and request.jwt.claims set, 
  80: - Statements per cell: SELECT = count(*) over the rows matching the target predicate; INSERT = a copy of the first exist
  81: - Target predicate for P4: when the table has a uuid identity column (user_id, owner_user_id, author_user_id, created_by
  82: - Expected, per cell, from the catalog read inside the block: ng = refused, role holds no grant; np = refused, grant hel
  83: - No row content, e-mail, token or id is printed in this file or was echoed to the transcript; the probe reports row cou
  84: - Two further calls of the same shape (anon only, 11 tables, INSERT/UPDATE/DELETE and SELECT) re-ran cells that the matr
  85: - Side effects not rolled back by design: sequence advances. Nothing else changed (section 8).
  90: - R:grant = refused 42501 "permission denied": the message names a table, a column or, for some policy helpers, a functi
  91: - RD:n = read returned n rows under a policy whose qualifier is literal true. RA:n = read returned n rows under a policy
  92: - (A) = target predicate true; (U) = foreign-row predicate. cols:upd a/b ins c/d = revoked-column probes refused a of b 
  222: - Per table: the PROOF field in section 7 compares count(*) and sum(xmin) before the table's probes and after the sub-bl
  223: - Across the whole run: a snapshot of count(*) and sum(xmin) for all 121 public tables taken at 2026-10-08 14:26:15 UTC 
  224: - pg_stat_user_tables n_tup_ins/n_tup_upd/n_tup_del, before and after, for the 7 tables that carry column or admitted-wr
  225: - Each call returned P0001 with text beginning aud-at1-rollback, which is the sentinel exception [CONFIRMED: error text 
  245: - P1 (anon) SELECT returned rows on these tables: under a literal-true policy: connection_theme_runs 64, connection_them
  246: - P1 SELECT refused R:grant on 13 tables: profiles, derivation_edges, harness_runs, pending_first_fetch, sensitive_field
  247: - P4 (authenticated, platform non-admin, org member) SELECT of foreign rows (rows whose identity column differs from the
  248: - No table returned rows to a principal for which the catalog showed no applicable SELECT policy (0 cells coded ACC:read
  249: - Census staged item compared: the census recorded anon SELECT on 34 profiles columns through a "Public read" policy. At
  250: - Census staged item compared: the census recorded organizations.plan, community_member_profiles verification columns, c
  255: - permission denied for function user_org_role: org_memberships INSERT, UPDATE, DELETE.
  256: - permission denied for function user_group_role: community_group_members INSERT, UPDATE.
  257: - permission denied for function user_can_write_in_org: org_watchlist INSERT, UPDATE, DELETE; workspace_item_overrides I
  258: - permission denied for the table itself: portfolios UPDATE, item_assignments UPDATE, item_notes UPDATE. Permission deni
docs/audits/aud-at2-route-guard-register-2026-10-08.md  (6)
  30: - Routes enumerated: 110 route.ts files. Methods (exported handlers, GET/POST/PUT/PATCH/DELETE): 153 (GET 61, POST 65, P
  73: - ATTACKED: not run. No disposable runtime for routes exists. Owed, with this register as input: the 25 route methods an
  74: - Every other lens on subsystem 13: not run.
  75: - Pages: the client column names the lib function that performs each read and one cited line in it; the full call chain 
  76: - Rows whose guard sits in a shared helper (corrections handlers, runCollab, resolvePortfolioCaller, the member-pref han
  77: - The brief's "service-client writes with no role check" count treats a membership-only check as no role check. A write 
docs/audits/aud-at3-gates-attacked-2026-10-08.md  (27)
  20: - Side effects: the live skill gate answered three of this lane's own commands while it ran (command text containing `rm
  361: - A019-4 (R019): archive helper called through an alias (archiveRows never followed by an open paren) [CONFIRMED: ran, o
  502: - A-P0-3 (PP0): tracked hook file edited in the working tree to exit 0 (edit never committed) [CONFIRMED: ran, output ca
  510: - Pre-push steps 3 (discipline and fitness tests), 3b (invariant-coverage meta-gate), 3d (ESLint), 3e (fitness runner), 
  511: - Repo SessionStart `session-start-vault.mjs`, PreCompact `pre-compact-snapshot.mjs`, SessionEnd echo: no blocking claim
  512: - Settings precedence and switches that sit above the hook command (a project `.claude/settings.local.json` entry, a man
  513: - Step 0b symlink inside a worktree: wt_nm_ensure_link leaves a real symlink alone by design; creating one on Windows ne
  514: - CI side of the ACCEPTED local forms: the validate-commits job could not be run here. The rules engine itself was run i
  515: - Real-session reachability of the path forms in A-PT-E1, A-PT-E4 and A-PT-S4 (relative and short-name file paths): depe
  519: - Text rules read the text of added lines only. Every content rule that reads `ctx.introducedLines` (012, 015, 017, 019,
  520: - Rules 015, 019 and 021 decide on the working-tree file (`ctx.getFileContent` reads the disk), not the staged blob. A s
  521: - The engine that judges a commit is the working-tree copy of `manifest.mjs`, `rules/*.mjs` and `runner.mjs`. A commit t
  522: - Ways a commit lands with no rule run: `--no-verify`, `-c core.hooksPath=/dev/null`, the `GIT_CONFIG_COUNT` environment
  523: - Detection of a bypassed commit: the next hooked commit is judged against the merge base with origin/master, so it re-s
  524: - Pre-push runs no commit-rules step since GATE-2: a pushed commit carrying a rule 012 violation or a rule 022 glyph, la
  525: - `git diff --name-only` lists a rename by its destination path only. Pre-push step 0c, the same classifier in CI, and s
  526: - The memory gate is satisfied by a zero-byte file or a file with an impossible date that matches `docs/ops/session-log.
  527: - Step 1 lists only eight path patterns. An untracked `src/lib/helper.ts` and an untracked file in `.discipline/hooks/li
  528: - Step 2 accepts a `Consistency-Override` trailer with any non-empty rationale and any future date (A-P2-1 used rational
  529: - Step 3c passes for a hook command that only contains the text `pretooluse-skill-gate`, for a wrapper that delegates on
  530: - PreToolUse scope: the shim treats a call as in scope only when `fsi-app` is preceded by a path separator in the cwd, t
  531: - PreToolUse gate (in scope, no skill loaded): the DANGER patterns need the words adjacent and unquoted. `git -C <dir> p
  532: - PreToolUse gate, MCP and skill evidence: a tool named with a read prefix (`get_and_delete_rows`, `search_and_replace`)
  533: - Worktree-isolation belt: `git co` (alias), `git pull`, `git cherry-pick`, `git symbolic-ref HEAD`, `git $(echo checkou
  534: - Pre-commit (RD-19): blocks on a positive marker (`CLAUDE_CODE_CHILD_SESSION` set to anything but empty, 0 or false) or
  535: - Step 0b: refuses a junction at `fsi-app/node_modules`; a real directory holding a junction one level down passes (C-P0
  536: - vault-sync: skipped, correctly, for a modified file, a staged file and a local commit ahead (its own guards); for an a
docs/audits/aud-at4-gates-attacked-2026-10-08.md  (14)
  446: - [CONFIRMED: read governance/skill-contract-map.mjs header and RD-76 residual] The skill-acks mechanism was deleted by 
  447: - [CONFIRMED: runner --list and git log --diff-filter=D] The fitness runner lists 52 functions, not the 60 of register B
  448: - [CONFIRMED: baseline run B7-14, ok=true] invariant-coverage passes on the clean tree; its problem list is empty, so ev
  449: - [CONFIRMED: B6-32] F51 check 4 (a lane branch touching a coordinator-only file) fires only when `git rev-parse --abbre
  450: - [CONFIRMED: B7-35] consistency C4 returns before looking when the CI environment variable is set; GitHub Actions sets 
  451: - [CONFIRMED: B6-25, B6-26, B6-27] F50 accepts a hand-written harness artifact, a hand-written entry in loop-fired-evide
  452: - [CONFIRMED: B7-15 refused, B7-15b accepted] Deleting an invariant file is caught only when a doctrine names it; deleti
  453: - [CONFIRMED: B8-16 refused, B8-16b] F68 reads `uses: actions/upload-artifact@` only at line start; the common `- uses:`
  457: - F9 on the real app project: the fixture project (two files) proved the tsconfig exclude and ts-nocheck forms; a full t
  458: - F45 live ratchet: the detector, ratchet comparison and scope predicates were run in process; `measureAtBase` against a
  459: - F24 and the live-only DDL class: the gate reads a committed snapshot of the database; an object that exists live and i
  460: - F28 time-based legs (STALE RUN, NEVER RUN windows) were not exercised with dated ledger rows; only schema, nesting and
  461: - CLOSURE NEVER-RUN with real git history dates (`introducedAt` from `git log`) was exercised through the exported pure 
  462: - Overlap between gates (whether another gate catches an input one gate accepted) was not measured; ACCEPTED means this 
docs/audits/aud-at5-gates-attacked-2026-10-08.md  (12)
  240: - OWED-1 migration-proof.yml: not on origin/master at 12c69634 (`git ls-tree origin/master` returns 0; it exists only in
  241: - OWED-2 DS23 (`npm ci`) and DS24 (ESLint): need npm install and network; the scratch clones carry no node_modules. Swee
  242: - OWED-3 DS27 actionlint binary: `which actionlint` returns nothing and there is no network; F52 and FC-1/FC-2 ran, the 
  243: - OWED-4 DS35 and the layout guard at runtime: no browser in the scratch environment; only the step text (RG-1, RG-2) an
  244: - OWED-5 DS18/DS19 consistency-backstop: `override-check.mjs` is red at baseline in any scratch clone (`[C4] missing-cla
  245: - OWED-6 branch protection and required checks (is `Discipline engine` a required status, can master be pushed directly)
  246: - OWED-7 live legs: `loop-fired-evidence-audit.mjs` (compares evidence entries with the live harness_runs table) needs c
  247: - OWED-9 gate scripts with no sibling test: run-explicit-tests.mjs (TD-6 covers it end to end), run-goldens.mjs and run-
  248: - OWED-8 chain-proof.yml steps that need Docker or the supabase CLI (CS5 to CS8, CS18): sweeps ran on the workflow text 
  252: - [CONFIRMED: this session] The PreToolUse skill gate blocked three Bash commands with `Data write (prod effect)` and de
  253: - [CONFIRMED: closure-gate output] `current train: 71`; the NEVER-RUN age clock is the train counter (TD-7).
  254: - [CONFIRMED: the full-suite runs] On a loaded machine the test `RACE: C3 and F64 live tests run concurrently ten times`
docs/audits/dead-code-census-2026-10-08.md  (53)
  305: - scripts/verify/defect-signature-scan.mjs (1): WAVE2_CUTOFF [CONFIRMED: listed by the method stated in this section]
  503: - .discipline/fitness/functions/F14-producer-consumer-orphan.mjs (1): fitnessFunction [CONFIRMED: listed by the method s
  533: - .discipline/fitness/functions/F44-broken-main-guard.mjs (2): findBrokenMainGuards, fitnessFunction [CONFIRMED: listed 
  570: - .discipline/governance/orphan-modules.mjs (2): findOrphanModules, findDeadExports [CONFIRMED: listed by the method sta
  676: - scripts/maintenance/remediate-orphan-sources.mjs (3): buildArgs, parseCounts, main [CONFIRMED: listed by the method st
  797: - scripts/verify/defect-signature-scan.mjs (2): detectNumeric, scanItem [CONFIRMED: listed by the method stated in this 
  803: - scripts/verify/lib/ui-orphan-scan.mjs (1): parseSelectList [CONFIRMED: listed by the method stated in this section]
  1116: - scripts/verify/defect-signature-scan.mjs (6): REUSE_MIN, NAMED_ACTS, extractIdentifiers, spanHasIdentifier, detectConf
  1472: - history (36 files, 68 lines): docs/archive/BUILD-BREAKDOWN-2026-05-06.md, docs/archive/GAP-1-RESOLUTION.md, docs/archi
  1511: - code (39 files, 55 lines): .github/workflows/ledger-consume.yml, .github/workflows/maintenance.yml, .discipline/fitnes
  1553: - code (142 files, 388 lines): .github/workflows/maintenance.yml x5, .discipline/fitness/README.md, .discipline/fitness/
  1556: - history (126 files, 397 lines): docs/archive/BUILD-BREAKDOWN-2026-05-06.md, docs/archive/STREAM-AB-POLISH.md, docs/arc
  1629: - fsi-app/src/lib/connections/derive-tags.mjs [2026-08]: Reads parse-output.ts / system-prompt.ts at import (fail-closed
  1657: - table:system_state_flag_audit [2026-09-17] (review: 2026-09-17): Append-only audit trail of pause-flag writes (trigger
  1691: - Orphan-module + dead-export census [2026-09-28] (review: 2026-09-28): orphan-modules.mjs --all is a REPORT that never 
  1692: - Playwright [2026-09-21] (review: 2026-09-21): the rendering-guard job's Playwright + chromium install step; a DIFFEREN
  1708: - intelligence_items_domain_backfill_audit [2026-10-01] (review: 2026-10-01): lane R6-8 own finding: migration 101 heade
  1723: - fsi-app/scripts/lib/db.mjs [2026-06-06]: The guarded-write helper itself - it IS the sanctioned write surface; its raw
  1730: - fsi-app/src/lib/notifications/ [2026-08-11]: Notification dispatch + fallback flag - delivery bookkeeping rows, fail-o
  1732: - fsi-app/src/lib/telemetry/ [2026-08-11]: Error-capture telemetry - deliberately fail-open (capture-error.ts header con
  1748: - nav-card-sticky [2026-09-08]: the nav card is sticky by design so the page never shifts on navigation (operator L5, RE
  1791: - src/lib/tint.ts: documents the defect shape in its own header comment [CONFIRMED: listed by the method stated in this 
  1822: - 770596e6-aeb2-46f9-ad29-a83e16f06fad: eFTI 2020/1056, pre-cutover manual-intake orphan; Unit 3 re-source [CONFIRMED: l
  1823: - 68af8b45-fbbf-4ba1-add8-2c1761d2d120: waste 2024/1157, pre-cutover manual-intake orphan; Unit 3 re-source [CONFIRMED: 
  2084: - .discipline/governance/invariants.d/RD-9-producer-consumer-orphan.mjs (3/3) [CONFIRMED: listed by the method stated in
  2113: - .discipline/governance/invariants.d/RD-36-re-grounds-never-destroy.mjs (2/2) [CONFIRMED: listed by the method stated i
  2165: - docs/plans/defect-fix-plan-2026-09-12.md (1/1) [CONFIRMED: listed by the method stated in this section]
  2179: - .discipline/governance/invariants.d/RD-29-fresh-snapshot-never-paid.mjs (1/1) [CONFIRMED: listed by the method stated 
  2264: - 20260717234619 218_coverage_gap_class2_energy_price_feeds [data-only]: INSERT of coverage_gap_candidates rows. Session
  2265: - 20260718001047 219_coverage_gap_class3_commercial_fuel_assessments [data-only]: INSERT and UPDATE of coverage_gap_cand
  2266: - 20260718003159 220_coverage_gap_class4_state_subnational_trackers [data-only]: INSERT of coverage_gap_candidates rows.
  2267: - 20260718015746 221_coverage_gap_class5_compliance_reporting_portals [data-only]: INSERT of coverage_gap_candidates row
  2268: - 20260718020307 222_coverage_gap_class6_enforcement_verification_systems [data-only]: INSERT of coverage_gap_candidates
  2269: - 20260718020707 223_coverage_gap_class5_eu_epr_expansion [data-only]: INSERT of coverage_gap_candidates rows. Session C
  2270: - 20260718020828 224_coverage_gap_class6_five_surface_test [data-only]: UPDATE of coverage_gap_candidates rows. Session 
  2271: - 20260718021214 225_coverage_gap_class7_lca_disclosure_verification [data-only]: INSERT of coverage_gap_candidates rows
  2272: - 20260718022118 226_coverage_gap_class8_market_intel_sources [data-only]: INSERT of coverage_gap_candidates rows. Sessi
  2273: - 20260718022732 227_coverage_gap_class9_research_horizon_sources [data-only]: INSERT of coverage_gap_candidates rows. S
  2275: - 20260718185947 229_coverage_gap_gate_first_live_dispositions [data-only]: UPDATE of coverage_gap_candidates dispositio
  2279: - 20260718193242 233_coverage_gap_gemini_second_pass_access_model [data-only]: UPDATE of access_model. Session C coverag
  2280: - 20260718200026 234_coverage_gap_section3_final_dispositions [data-only]: UPDATE of dispositions. Session C coverage-ga
  2281: - 20260718200111 235_coverage_gap_section4_final_rulings [data-only]: UPDATE of dispositions. Session C coverage-gap lan
  2282: - 20260718200309 236_coverage_gap_saf_claims_substantiation_membership_check [data-only]: UPDATE and INSERT of coverage_
  2284: - 20260718202706 coverage_gap_rank12_parked_with_watch [data-only]: UPDATE of one disposition. Session C coverage-gap la
  2286: - 20260719210535 coverage_gap_census_sweep1_existing_feeds [data-only]: INSERT of census findings. Session C coverage-ga
  2287: - 20260719212507 source_health_flags_sweep1_dead_urls [data-only]: INSERT of integrity_flags rows. Session C coverage-ga
  2289: - 20260719212830 coverage_gap_census_sweep2_adjacent_universes [data-only]: INSERT of census findings. Session C coverag
  2290: - 20260719213059 coverage_gap_census_sweep3_research_feedstock [data-only]: INSERT of census findings. Session C coverag
  2291: - 20260720151231 census_sweep4_found_then_lost_recovery [data-only]: INSERT of census findings. Session C coverage-gap l
  2492: - docs/plans/unwired-disposition-2026-08-31.md: 1 (1 md) [CONFIRMED: listed by the method stated in this section]
  2882: - docs/runbooks/maintenance.d/39-remediate-orphan-sources.md [CONFIRMED: listed by the method stated in this section]
  2985: - docs/plans/unwired-disposition-2026-08-31.md [CONFIRMED: listed by the method stated in this section]
  3043: - docs/plans/mobile-evidence/08-regulations-ledger-stale-or-broken.jpg: 1 (jpg) [CONFIRMED: listed by the method stated 
docs/audits/gate-evaluation-2026-10-08.md  (41)
  15: - CI failure attribution: all 100 failed runs of discipline.yml created in the 30d window (of 954 runs; 805 success, 44 
  16: - Gate audit log: fsi-app/.discipline/governance/.gate-audit.log (gitignored, main checkout) holds 66,083 PreToolUse dec
  18: - Timing was done on the main checkout with read-only commands. A temporary GIT_INDEX_FILE (outside the repo) was used t
  28: - Rules that fired at all in 30d (any CI failure or session-log narrative of a block or forced rewrite): 5 of 10 (015, 0
  54: - Protects: "Mechanical content-level check ... rejecting commits that contain hardcoded user-home path strings. The cla
  56: - Scope: reads the whole content of every staged code file (ctx.getFileContent), so a pre-existing path string anywhere 
  58: - Firings: 30d none recorded. 90d: one false positive, PR #562 (2026-09-04), the EU Publications Office's own OJ fmx.xml
  72: - Scope: whole staged file under fsi-app/scripts/**/*.mjs except _diag/, lib/, and *.test/npmtest/selftest/golden. A pre
  84: - Protects: direct Anthropic calls only in the permitted wrappers; "the exact bypass that caused source_citations to nev
  109: - Firings: 0 in 90d. Overlap: SC-2 invariant names three layers (this rule, migration 135 DB guard, orphan-source-audit 
  123: - Protects (header): the check "lived only in the coordinator's dispatch text ... and as a byte count the coordinator ra
  125: - Scope: ADDED lines. Because -U0 reports a modified line as removed plus added, an edited line carrying a pre-existing 
  129: - CI (7 runs): 36217460080 master push 2026-09-26, a literal glyph in Absence.tsx that the PR-time per-commit union miss
  149: - Step 0 trampoline guard (stale copy refuses with "STEP 0 FAIL"), 1 mention in logs. 0b dependency resolve 0.14 s. 0c d
  161: - Finding on C4's scope, per the coordinator request: C4 counts any worktree anywhere on the machine, including a scratc
  162: - History: session-log.md records "C4, fixed rather than recorded for the tenth time" (work/lanes/ convention missing fr
  175: - 367 denies: the "skill missing" 320 are the gate working as designed (the write was attempted before a Skill invocatio
  177: - 202 "dispatch" asks (+10 Workflow, 3 Task counted within): every Agent/Task/Workflow call asks; the source comment sta
  179: - DANGER regex matches anywhere in the command text: tested true for `git commit -m "fix truncate bug"`, `echo truncated
  229: - Failed step counts (a run can fail more than one job): Discipline engine unit tests / Run discipline test suite 64 run
  232: - Overlap between the unit-test step and the fitness-runner step: 35 runs failed both steps; 47 runs had a failing "LIVE
  243: 7. Rule 019 and SC-2 (migration 135 and orphan-source-audit); rule 020 and RD-50/F51; rule 017 and SF-9; rule 022 and RD
  250: - 012, 015, 016, 017, 019: read the whole staged file, so any untouched line in the file can fail the commit. [CONFIRMED
  260: - C4 counts any worktree anywhere on the machine, including scratch ones outside .worktrees/, .claude/worktrees/ and wor
  261: - No firing log exists for the git hooks; only the PreToolUse gate keeps an audit log, and it omits the command text (se
  262: - The 30d firing ledger is a lower bound for local firings (section 0).
  275: - Firing = a gate printed `FAIL [Fn]` (fitness runner) or a named step/test failed in a failed run. Firings seen only lo
  378: - Firings: 12 runs, all PROCESS. 7 range-rule "PENDING FILE REQUIRED" (proof3, proof4, g6-gates, p2, s3c, s3a, s1b-s1d w
  382: - Overlap: closure-gate NEVER-RUN (same artifact evidence), F50 (artifact dir per hop), harness_runs ledger table (recor
  388: - Protects: capability built, tested, never called (seek-more.mjs). [CONFIRMED: header]
  389: - Decides: import graph over src, scripts, .discipline; roots = framework entry points, workflow `run:` path mentions, p
  393: - Overlap: it is the import graph. The CI step `orphan-modules.mjs --all` (2 s) reports the same class and never fails. 
  408: - Protects: "nothing fails when a maintenance step or workflow has never run". [CONFIRMED: header] 4 checks: NEVER-RUN, 
  409: - [CONFIRMED: `closure-gate.mjs` run: "current train: 71"; `git log origin/master | grep train/wave`: last train commit 
  411: - Overlap: F28 tree-state, F50, F14, F47 (check 3 reuses producer-consumer-orphan.mjs). [HYPOTHESIS: statement recorded 
  420: - [CONFIRMED: git log] 26 ack files added in 30 days (all 26 existing files). 1 CI firing (run 37207797931, gates1-evide
  430: - Rule 022 (no dash glyphs in added prose): 7 failing runs. Added-line counts 10,609 (audit register), 5,066 (build plan
  444: - Firings: [CONFIRMED: jobs json over 301 runs] 3 failed, 1 cancelled: 2026-09-08 and 2026-09-09 (train branches, 50 fai
  493: - F28 range+tree-state vs closure-gate NEVER-RUN vs F50 vs harness_runs table: four statements about "a harness run exis
  495: - F25 vs orphan-modules census vs F14 vs F47 vs closure check 3 vs F23 orphaned proofs: module and table liveness checke
  507: - Closure NEVER-RUN clock: frozen (7.1). [HYPOTHESIS: statement recorded by the source lane, not re-verified at landing]
docs/audits/migration-history-2026-10-07.md  (4)
  31: 2. [CONFIRMED: statement-level comparison in scripts/migrations/migration-compare.mjs run over every matched pair] The b
  33: 4. [CONFIRMED: read of the stored statements; token payload decoded for its role claim only] Ledger row 20260801181308 (
  35: 6. [CONFIRMED: reading F51 check 4 and lane-common-contract] A lane/ branch that adds a file under docs/audits/ fails F5
  37: 8. [HYPOTHESIS: reading the forensics and the CLI's documented behaviour; not run] The 11 files in files_without_row mak
docs/audits/obl1-obligations-register-2026-10-08.md  (14)
  246: - Whether any of the four instruments has rows in live `obligations` or `item_forward_events` today. [HYPOTHESIS]
  247: - Which `compliance_object_tags` the four live items carry. [HYPOTHESIS]
  248: - Whether item 9566075e is the Empowering Consumers directive. [HYPOTHESIS]
  249: - Whether `origin/master` differs from the checkout at 6028b228 (not fetched).
  253: 1. No obligation row for any of the four instruments exists in any tracked fixture or artifact (git grep over all tracke
  256: 2. No component-obligation decomposition schema: `obligations` has 14 columns and event grain; no pinpoint, verbatim tex
  259: 3. No role-scoped rows: nothing represents CBAM as indirect customs representative, PPWR as user of transport packaging 
  261: 4. No item-level binding-position banner on the Regulations detail page; the only render is the per-row "Binding" cell i
  263: 5. No roleScope or sizeThreshold at obligation grain: no column, no producer; the gate's roleScope exists only at item g
  265: 6. The gate's output has no reader: `applicability` is computed and returned in the `/api/detail/relevance` JSON and no
  267: 7. No instrument-specific input to the gate: identical outputs for all four instruments under identical tags.
  268: 8. The classifier has no rule that returns `monitoring_only` (16 rules: 6 direct_duty, 7 carrier_passthrough, 3
  271: 9. `derive-obligations` classifies on title only: `legal_instrument`, the canonical instrument key and the record-facts
  275: 10. Plan L17 acceptance (>=1 obligation row with non-null binding_position for each of the 4 instruments, and the detail
docs/audits/privilege-census-2026-10-08.md  (1)
  74: 10. Read-side exposure, not a write escalation, but material: [CONFIRMED: Q9] policy `Public read` (SELECT, roles public
docs/audits/verify1-register-unknowns-2026-10-08.md  (11)
  12: - Subsystem per row: 13 (entity spine) for 00S1.3; 14 (components) for 00S4 render, 01S4, 02S6, 03S6; 15 (data layer) fo
  67: 8. 01S4 #1 banner form, #2 applicability panel and recorded exclusion, #4 T-90/T-30/T-7, #5 horizon lane, #6 redline and
  70: 11. A caller for `fsi-app/scripts/verify/ui-orphan-audit.mjs` (B-3 mechanism). [CONFIRMED: git grep over .github, fsi-ap
  76: - 00S1.3 "still unverified": now [CONFIRMED] missing (hierarchy) and partial (alias).
  77: - S-6 "open [H: no evidence found]": [REFUTED] in part, derivation storage exists (tables above); the PROV-shaped chain 
  78: - B-2, B-4, B-5 "status unknown": [CONFIRMED] closed in code with a test each (B-2 vocab-drift-guard plus migrations 148
  79: - B-3 "status unknown": mechanism located and unwired [CONFIRMED: git grep, no caller]; count not re-derived [HYPOTHESIS
  80: - 00S4 "Coverage Index exists, first-class surface unverified": the Index is admin-only by ruling; first-class customer 
  84: - `fsi-app/supabase/migrations/359_item_assignments.sql` (map: applied) plus route, component and mount exist, while reg
  85: - `fsi-app/supabase/migrations/361_count_rpc_membership.sql` (map: applied, identical) exists, while register row S8-4 s
  86: - `fsi-app/src/lib/portfolio/` (client, portfolio-core.mjs with test, read.ts, route-support.ts, types.ts) exists, while
docs/ops/session-log.d/2026-10-01-r11-checks.md  (2)
  141: - None outstanding for this lane's write set. The two false positives found during F66's build are
  143: - CF-GATE-7 (self-skip / DB-dependent-test re-verification) is explicitly out of this lane's write set
docs/ops/session-log.d/2026-10-01-r2-officialness.md  (2)
  121: - The coordinator should amend CF-BROKEN-1 and A3B-07 in place to `[REFUTED]` (rule 13 corollary), citing
  125: - Lane 2 of the remediation plan can close with "no code change required; finding refuted; regression
docs/ops/session-log.d/2026-10-01-r20-producers.md  (1)
  191: - None outstanding from this lane as of round 3. No `.tsx`/`.css` touched; UX compliance section not
docs/ops/session-log.d/2026-10-01-r68-gates.md  (3)
  301: - Migration 342 is AUTHOR-ONLY / NOT YET APPLIED: the coordinator applies it live via the Supabase
  305: - RD-88/RD-89 ids are self-assigned, not coordinator-named; confirm no collision (coordinator has
  307: - The full fitness runner and run-test-suite.sh were each run once before the coordinator's
docs/ops/session-log.d/2026-10-01-r7-lint.md  (2)
  110: - NEEDS WRITE-SET EXPANSION (granted by necessity, not by prior approval): `fsi-app/.discipline/fitness/
  114: - The 304-error `src`-scoped lint debt and the wider 614-problem whole-tree debt are both pre-existing,
docs/ops/session-log.d/2026-10-01-w2r-research.md  (5)
  124: - **NEEDS WRITE-SET EXPANSION (none actually hit):** no file outside the declared write set was needed.
  125: - **COORDINATOR ACTION NEEDED - docs/INDEX.md line** (lane-common-contract forbids a lane editing this
  133: - **COORDINATOR ACTION NEEDED - meta-harness pending file** (F28: registering the `research-assessment`
  139: - Migration 344 is DDL-sketch-only; the coordinator applies it via the Supabase CLI before `--live`
  142: - `tsc --noEmit` is clean throughout. `node fsi-app/.discipline/fitness/runner.mjs` final state: 58
docs/ops/session-log.d/2026-10-01-w2r2-assumptions.md  (3)
  76: - Migration 345 needs the coordinator's apply before the API/UI can read or write anything live (two-
  78: - Lane W2-R (planning-assumption-shift renderer) can now import `readWorkspaceAssumptions` /
  81: - No sprint-N followups.md applies to this lane (wave-based dispatch, not Sprint 1/2 phase work); DP-2
docs/ops/session-log.d/2026-10-02-l3.md  (5)
  167: 1. **NEEDS COORDINATOR ACTION: F25 module-liveness violation on both new files, needs a write-set-
  179: 2. **Un-wired producer call, named by file:line** (brief's own instruction, "Harness and flywheel
  188: 3. **Output shape is richer than the current chip's 3-bucket assumption.** `CredibilityChipAuthority.tsx`
  195: 4. No migration applied or requested. Migration number 361 (reserved per the README's coordinator
  197: 5. No DB credential used anywhere in this lane; no live write of any kind.
docs/ops/session-log.d/2026-10-02-l5.md  (5)
  101: 0. **DESIGN CHANGES OWED** (kept per the coordinator's explicit instruction, even though the guard now passes via the de
  102: 1. NEEDS WRITE-SET EXPANSION (restated, unchanged disposition): `ResearchLedger.tsx`'s `tagsFacet` dependency-array lint
  103: 2. The F23 orphaned-proofs finding surfaced by one fitness-runner pass mid-lane is `[HYPOTHESIS, not independently re-ve
  104: 3. INDEX.md: no new living doc; nothing to add.
  105: 4. `fetchAssessmentHistoryChain`'s real-chain walk is correct and tested, but every live `research_assessments` row toda
docs/ops/session-log.d/2026-10-02-l6.md  (5)
  101: - Backfill of `research_assessments.entity_id` is a separate, later, guarded script (not this lane's
  103: - Population of real `signposts` rows is a separate, later, R14-gated pass (not this lane's job, per the
  105: - A future lane wiring `signposts` into drain.ts's own recompute dispatch (adding it to `PK_COLUMN` and a
  109: - [RULED 2026-10-02, coordinator, under ADR-039] the `delays` direction's mapping to `stalled` lifecycle
  112: - NEEDS WRITE-SET EXPANSION: none - no file outside the declared write set was touched.
docs/ops/session-log.d/2026-10-02-l7.md  (1)
  131: - This lane registers only the 3 NAMED grey-lit sources, never an arbitrary OpenAlex publisher host --
docs/ops/session-log.d/2026-10-02-l8.md  (4)
  475: 1. **Live `--apply` backfill pass**: not run by this lane (R14 hold + no DB credential). A separate,
  478: 2. **The real `harness_runs` INSERT** (replacing `--fire-harness`'s dry/fake client with a genuine
  481: 3. **Model-id literal cleanup, named for the coordinator's same-day follow-up lane**: the full list is
  487: 4. No migration applied; 364 stays reserved, unconsumed.
docs/ops/session-log.d/2026-10-02-l9.md  (4)
  138: 1. **[RESOLVED by coordinator ruling, 2026-10-02, recorded in the amendment below.]** This item
  143: 2. Migration 365 stays RESERVED, not consumed - no schema change was made or needed.
  144: 3. No `docs/decisions/` edit was made; none of the four ADRs grepped governs this specific text, and
  146: 4. The two post-edit full-suite runs (`bash .discipline/run-test-suite.sh`) were still in progress at
docs/ops/session-log.d/2026-10-02-model-ids.md  (2)
  103: - `src/app/api/health/spend/route.ts`'s prose comment and `fsi-app/.claude/CLAUDE.md`'s doctrine table
  105: - Full `run-test-suite.sh` result pending; will be pasted in the push-gate run before this lane reports
docs/ops/session-log.d/2026-10-02-ra-wf.md  (2)
  162: - The live population's actual size (how many research-surface items currently lack a current row) is
  167: - `fetchLiveCandidates`'s join queries (`sources`, `item_forward_events`) are still untested against the
docs/ops/session-log.d/2026-10-03-external-only.md  (5)
  58: - Public-source intake for `auxiliary_energy_profiles` and `indexation_clauses` is owed (coordinator design).
  60: - The Research Summary prompt still mandates a "Planning assumption shift" line. This lane removed the
  64: - `organisation_key` and corporate-email verification no longer serve a benchmark; they only back the
  66: - The generated layout-guard `baseline.json` still lists `/settings` L7 keys for the removed upload card;
  68: - `db-catalog.json` and `table-primary-keys.mjs` had the seven tables removed in this PR (ADR-041
docs/ops/session-log.d/2026-10-03-l-corridor.md  (8)
  139: 1. **Live state-distribution run.** This worktree has no DB credentials; the coordinator (or a lane with
  147: 2. ~~UI wiring is a separate, future lane's scope~~ - SUPERSEDED, see addendum (coordinator overrode this
  149: 3. No INDEX.md entry needed (this file lives in `session-log.d/`, exempted per that directory's own
  151: 4. Branch name divergence: the parent dispatch set up this worktree on branch
  253: 1. **Live state-distribution run** - not performed, no DB credentials; see Addendum 2.
  254: 2. UI wiring - DONE, this addendum. No longer an open item.
  255: 3. No INDEX.md entry needed (unchanged).
  256: 4. Branch-name divergence - unchanged, still flagged.
docs/ops/session-log.d/2026-10-03-l10.md  (3)
  124: 1. **NEEDS WRITE-SET EXPANSION**: a raw-row fetch for `market_series` (either a new fetcher or
  128: 2. **COORDINATOR ACTION NEEDED**: add the `LeadTimeChart.tsx` line to F35's `ROW_COMPONENTS` (exact
  130: 3. Branch naming: this lane's setup used `lane/l10-market-signal-leadtime` (per the outer dispatch's
docs/ops/session-log.d/2026-10-03-l11.md  (4)
  292: 1. **The licence question itself**, operator/coordinator decision, not this lane's: pursue express
  295: 2. **EIA_API_KEY registration**, operator action, coordinator requests it directly (per the brief); this
  297: 3. **L10 coordination**, the `market_series` contract above is this lane's own design, not reviewed by
  300: 4. The WHY behind SBTi's own `"Other"` status label (see "Status vocabulary" above) is unverified, labeled `[HYPOTHESIS]
docs/ops/session-log.d/2026-10-03-l12.md  (4)
  153: 1. **Dispatch premise refuted**: the detail page does not render a carbon-cost-per-FEU figure for any
  160: 2. **New structural gap, CF-BROKEN-6-adjacent**: the entire Substantive Findings section (not just the
  164: 3. **Dead section-index anchor**: `indexEntries` always advertises "S2 Findings" regardless of
  167: 4. No INDEX.md entry needed (this file lives in `session-log.d/`, exempted per that directory's own
docs/ops/session-log.d/2026-10-03-l13.md  (3)
  198: 1. **Fixture-proven, not live-proven** (this lane's central honesty claim, restated): no live row
  202: 2. **COORDINATOR ACTION NEEDED**: add the `LabourChain.tsx` line to F35's `ROW_COMPONENTS` (exact line
  204: 3. No brief question outstanding; the "existing assumption source" pointer in the brief named an example
docs/ops/session-log.d/2026-10-03-l14.md  (3)
  72: - **No materials_sourcing producer exists, and `regional_data_facts` has no structured material key.**
  75: - **No live gate source.** Gates for PPWR, EPR, PFAS, permitting and ETS2 have no producer; the strip
  77: - Spec 04 section 8's empty-space and reuse numbers are now confirmed above; the spec text can be updated.
docs/ops/session-log.d/2026-10-03-rw-wf.md  (2)
  116: - Coordinator re-dispatch command (unchanged shape from the original PR 898 dispatch, same `dry` mode,
  123: - NAMED RESIDUAL (reported, not fixed, out of this lane's write set): `research-assessment.yml`'s own
docs/ops/session-log.d/2026-10-04-rb-split.md  (2)
  25: - Merge (coordinator lands it).
  28: - None.
docs/ops/session-log.d/2026-10-04-s0b-baseline-renewal-tool.md  (4)
  44: - The workflow is not dispatched (coordinator, on or after 2026-10-08). Baseline, results, audit file and
  46: - No harness_runs row: this is a tooling workflow, not a runtime family.
  50: - closure-gate CHECK 1 (NEVER-RUN) treats every dispatchable workflow as a target
  56: - The artifact is named `layout-baseline-<run id>` and unpacks under repo-relative paths.
docs/ops/session-log.d/2026-10-04-s1a-source-register.md  (3)
  20: - No live run, no data population (operator ruling 2026-10-04). Pending marker `brief-apply/pending/2026-10-04-s1a-sourc
  21: - The substring `ilike` host lookup in `registerCitedSources` is unchanged for registration (pre-existing, noted in its 
  24: - Repeat applies of the same batch record repeat class-table opinions (same as the maintenance tier-opinions step; the t
docs/ops/session-log.d/2026-10-04-s1b-host-verdicts.md  (4)
  24: - `ProvisionalReviewCard.tsx` still describes the 0.65 to 0.79 band as proposed on approval (coordinator will fold it in
  25: - No real verdict batch authored; no live run; no workflow edit (resolve-provisional-sources has no `--arg` in maintenan
  26: - Local run limited to the touched test files; CI is the gate.
  29: - None (coordinator ruled: do not pass --arg export-unplaced from the workflow).
docs/ops/session-log.d/2026-10-04-s1c-tier-movement.md  (3)
  30: - No live run, no DB read (brief rule 5). `maintenance:recompute-tiers` shows NEVER-RUN in the closure gate until first 
  31: - Citation promotion weights citers by their stored `effective_tier`, so a citer moving between runs can change a cited 
  32: - The real `readAll("system_state", ...)` in `buildDeps().readCadence` is not exercised by a test (readAll uses the real
docs/ops/session-log.d/2026-10-04-s1d-walker-registers.md  (3)
  42: - Run-001 and run-002 are immutable history and were not rewritten; the new shape lands as run-003.
  43: - No live run, no DB access, no apply.
  58: - None from this lane.
docs/ops/session-log.d/2026-10-04-s2a-typed-edges.md  (3)
  67: - Runbook 26 corrected to the new ownership outcomes (write-set expansion approved).
  68: - OWED BY THE COORDINATOR: the index line for step 59 in `docs/runbooks/MAINTENANCE-RUNBOOK.md`. The lane's range does n
  69: - Record-grade text: of the 2 fixture excerpts in `scripts/mint/testdata`, record-facts `full_brief` alone
docs/ops/session-log.d/2026-10-04-s3a-intersections.md  (1)
  28: - No live run, no migration, no apply.
docs/ops/session-log.d/2026-10-04-s3c-theme-brief-batches.md  (5)
  75: - No real brief authored, nothing applied, no database touched.
  76: - `src/app/research/[slug]/page.tsx` still selects only the exact-id brief row; for the Research reader to
  78: - The workflow is not chained to anything. It should chain after `analyze-corpus` changes theme membership
  83: - The pending marker `scripts/harness-runs/theme-briefs/pending/2026-10-04-s3c.md` is discharged by the first
  85: - The migration 351 header says NOT APPLIED; the coordinator updates it when applied.
docs/ops/session-log.d/2026-10-05-g6-gates.md  (4)
  79: - No runbook step file exists for `apply-deferrals` or `plan-quarantine-disposition`, so none was updated.
  80: - The `apply-deferrals` default path only chains inside one run (item 5 above records the design).
  84: - Index: MAINTENANCE-RUNBOOK index lines 13 and 14 now point at RETIRED stubs; the coordinator may drop them.
  85: - The 'all' dry fan-out now reads the full portal_link_candidates table (paged) instead of refusing fast.
docs/ops/session-log.d/2026-10-05-g7-corrections.md  (5)
  36: - The SQL has not run against any database (none available to the lane). It is covered by a static test of the file (red
  37: - A fact correction matches its claim by id, original machine text or corrected text; a regeneration that changes the cl
  38: - Removal of a suppressed claim's text is exact-match only. A record-grade `claim_text` such as "[slot] ... c" is not al
  39: - Restore on revoke of a tag uses the latest machine ARRAY recorded for that column to decide the single tag's membershi
  40: - No F28 marker needed (none of the touched files is a governing file of any family). No `.tsx` touched, so no UX compli
docs/ops/session-log.d/2026-10-05-g7-tier.md  (2)
  35: - No live database access or apply; nothing run against data.
  42: - source-growth.entry-citations.npmtest.mjs fake client gained `.is()` and update row return so it models the guarded st
docs/ops/session-log.d/2026-10-05-gates2-live-smoke.md  (9)
  29: - Stored bodies that carry a marker today are neither repaired nor counted here: no live database access. The count mech
  30: - The record-grade extractors only emit prose spans, so a marker inside a captured source does not reach a claim today (
  31: - Nothing was dispatched, and no real site was signed in to.
  34: - Closure gate NEVER-RUN: resolved by the `live-smoke` harness family; the first real firing lands `live-smoke-run-001` 
  35: - The hard audit goes red on the first live run if any stored body carries a marker, and Layer C then opens a data-audit
  36: - Owed index line (coordinator): `docs/runbooks/MAINTENANCE-RUNBOOK.md` index line for step 62 `live-smoke` (`maintenanc
  37: - Previews are excluded from the automatic trigger; a protection bypass header is not built.
  38: - AUTH CLIP (blocker, reported to the coordinator, not edited): the new container rule fails the rendering guard on `aut
  40: - Coordinator rulings on PR 954 (2026-10-06): AuthPanel clip fix approved and applied, `boxSizing: "border-box"` on `AUT
docs/ops/session-log.d/2026-10-05-l4a-questions-on-change.md  (5)
  53: - No question is answered (lane L4-B). No migration, no live run, nothing applied.
  54: - Outbox rows from emission_factors, market_series and regional_data_facts carry no entity_id today, so
  56: - propagation-drain.yml chained firings run dry while `scrape_cadence='off'` (the chained-dry-guard step,
  63: - INDEX line owed (coordinator): `- [ADR-044-learning-loop-no-gate](./decisions/ADR-044-learning-loop-no-gate.md) - lear
  64: - `src/lib/sources/seek-more.mjs` still names `operator-priced-only` in comments and the acquisition
docs/ops/session-log.d/2026-10-05-l4b-question-answers.md  (2)
  76: - No workflow chaining. Where it should chain: after the propagation drain raises or re-opens questions, and after
  78: - No real answer authored; no batch under `batches/`.
docs/ops/session-log.d/2026-10-05-l4d-predictions-reliability.md  (3)
  38: - `market_series` and `regional_data_facts` outbox rows still carry no entity: neither table has a column naming an enti
  39: - Lifecycle transition not retried: if `fireSignpost` stamps `fired_at` but its assessment lifecycle update fails, the r
  40: - Nothing applied; migrations 352 and 353 were not run against any Postgres.
docs/ops/session-log.d/2026-10-05-p1-source-rating-display.md  (7)
  112: - (Closed after coordinator ruling on PR 944.) `ListSurfaceRailCards.tsx` legend now uses `tierScaleSpan`; a grep of src
  113: - Operations matrix fact cards now show the source's customer tier (or the Absence part): the existing `source:sources(.
  114: - Sources grid entries other than the item's own registered source carry no bias and keep the tier the brief text
  116: - At 768 to 1023 px the title column is narrow (169 px at 768), so row chips ellipsise heavily; the count stays.
  117: - Claim matching against live rows is unverified (see Decisions). No live read was possible.
  118: - `ProvisionalReviewCard.tsx` and the admin parts pages were not touched (no new part had to be shown there).
  121: - None blocking beyond the two expansions above.
docs/ops/session-log.d/2026-10-05-p2-grade-inference-chips.md  (4)
  106: - PR 944's note stands: row chips ellipsise heavily at 768 to 1023 px (title column 169 px at 768). Not attempted: the g
  109: - Citation-title links: InferenceClaim prints titles as text; links need a change to InferenceClaim.tsx.
  110: - The inference read is inside the cached 300s item bundle, so a new inference can take that long to appear.
  113: - None.
docs/ops/session-log.d/2026-10-05-s1e-source-chain.md  (5)
  57: - No live dispatch, no DB read, no data written (build mode, operator ruling 2026-10-04). `source-resolution.yml` shows 
  58: - `enforceFired` for hops 12 and 13 stays false until a chained row lands in `loop-fired-evidence.json`.
  59: - The chained firing off Brief apply or Research walker was not exercised on a real event (no network); the dispatch pat
  60: - Trust-recompute duplication is recorded above for the coordinator's ruling.
  61: - Index lines owed (coordinator, not edited here): `docs/INDEX.md` for `docs/runbooks/maintenance.d/61-source-resolution
docs/ops/session-log.d/2026-10-05-s3b-cross-page-surfaces.md  (6)
  140: - No live-data check: counts of themes, briefs, structured briefs and intersection entries on live rows are
  142: - Browser look at the real routes (Definition of done item 4) is not done here: no dev server and no data.
  143: - `brief-candidates.mjs` readable line not moved onto the label module (outside the write set).
  144: - Strip and dashboard themes use the exact-id and overlap brief lookup; a theme found only through a
  149: - Ruling needed: the shelved `SectorSynopsisView` and `IntelligenceMetadataStrip` (see Decisions).
  150: - Migration 351 must be applied for structured brief sections to show; until then a brief shows its
docs/ops/session-log.d/2026-10-06-auth1-repeated-signup.md  (2)
  23: - No F35 registration: no registered row component changed. No F28 marker: none of the touched files is a governing file
  24: - tsc and lint left to CI.
docs/ops/session-log.d/2026-10-06-auth2-provision-heal.md  (7)
  78: - Not applied anywhere; no live read or write. The repair script has not been run.
  79: - No file rename (declined). No migration. No `auth.users` trigger (brief item 2).
  80: - Existing personal workspaces created by the old callback are untouched, as instructed.
  81: - Nothing else owed on provisioning: a profile with no organisation is routed to onboarding (see decisions).
  84: - Coordinator: register nothing new (the smoke leg lives in the already-registered `auth-onboarding-smoke.mjs`).
  85: - Repair command for the coordinator's executor (dry first, then `--apply`):
  87: - DESIGN CHANGES OWED (rule 20), for Claude Design: artboard 17 step 1 ("Workspace", the no-workspace
docs/ops/session-log.d/2026-10-06-c-toggle-promote.md  (3)
  34: - Data migration, population-stage, two-track note: schema DDL applies via Supabase CLI before dependent code commits, d
  35: - Owed migration: `notifications_kind_check` (migration 032 L48) still allows `'promote'`; amend it to drop that kind in
  36: - Stale doc text, not in the write set: `docs/plans/C7-notifications-spec.md` still describes `on_promote`.
docs/ops/session-log.d/2026-10-06-g5-terms.md  (3)
  66: - Migration 355 is not applied; no live run. The collector, the `terms` step and the brief-write column need
  68: - Readers honouring adopted terms (G5-READ) and source search targets (G5-NEED). No admin screen.
  69: - OWED to lane G5-READ: the brief-author prompt (`system-prompt.ts`) does not yet ask for `mentioned_terms`.
docs/ops/session-log.d/2026-10-06-g6-drain.md  (4)
  24: - Nothing is applied, no scheduled task, switch off. The plan's export of ledger candidates uses `--with-text` and needs
  25: - Not run live: no database or network. Production deps in `plan-drain.mjs` (`runExporter`, lease client) are proven on 
  28: - Coordinator applies migration 354 before merge (two-track policy); `db-catalog.json` refresh is the credentialed half 
  29: - INDEX line owed: `scripts/harness-runs/judgement-drain/FAMILY.md`; runbook index line owed in MAINTENANCE-RUNBOOK.md f
docs/ops/session-log.d/2026-10-06-g7-ui.md  (3)
  27: - Nothing was run against a database or the real site; the pages were exercised on fixtures only. `/admin/items/[id]` an
  28: - The tab's orphan check makes one request per item with an active fact correction; a larger set shows an "unchecked" no
  29: - No F28 marker: no governing file touched. F35 and `ux-smoke-specs.mjs` edits are the registration the brief names.
docs/ops/session-log.d/2026-10-06-p4-live-smoke-1.md  (2)
  26: - Item 4: `/api/workspace/tags` 403 for a signed-in user with no organisation belongs to lane AUTH-2; the route is untou
  27: - Nothing was run against the real site; the coordinator re-runs Live smoke after merge.
docs/ops/session-log.d/2026-10-07-chain1-artifact-handoff.md  (2)
  27: - (Hop 07 mapping, the stale runbook prose, the sibling-branch hydrate steps and the loop_run_id question are all addres
  28: - Not proven live: nothing here ran in GitHub Actions or against the database (common terms rule 5). The proof is below.
docs/ops/session-log.d/2026-10-07-chain2-loop-run-id.md  (2)
  36: - Not proven live: nothing here ran in GitHub Actions or against the database (common terms rule 5).
  37: - Corpus turn has no F28 marker: `corpus-turn.yml` is not in `GOVERNING_FILES` and the emitter is not either (confirmed 
docs/ops/session-log.d/2026-10-07-dead2-schema.md  (6)
  26: - Not applied, no live check. The read counts in the header are operator-supplied, not read by this lane. Not run: the S
  27: - The skill-gate demanded the sprint-followups-discipline, remediation-discipline and environmental-policy-and-innovatio
  28: - Not changed, outside the write set (none blocks CI): `src/app/api/search/route.npmtest.mjs` (fixture column set still 
  32: - Operator ruling on the drop list: given 2026-10-08 (6 items); the coordinator's executor applies 368 after CI is green
  33: - UNSURE needing a ruling or DEAD-1 first: `estimated_values` (is the estimates mechanism retired after ADR-043; it is s
  34: - Migration number 368 confirmed free on origin/master and on every remote branch scanned (367 exists on a branch).
docs/ops/session-log.d/2026-10-07-g5-need.md  (3)
  70: - Nothing runs live: no migration 355 applied here, no dispatch, no data written.
  71: - No maintenance.d file: the step is chain-only, not dispatchable from maintenance.yml (not in the write set).
  72: - No loop-hops edge: `raise-term-needs` is a step inside one workflow, and the walker reads flags, not a
docs/ops/session-log.d/2026-10-07-g5-read.md  (3)
  97: - Migrations 355 and 357 are not applied; no live run. The theme guard, the `material` kind mint and the
  99: - `docs/inventories/db-check-constraints.json` not regenerated (see above).
  100: - Adopted `term` and `material` kinds have no other reader yet (material only mints an entity; term is a count).
docs/ops/session-log.d/2026-10-07-g5-search.md  (5)
  68: - Nothing ran live: no dispatch, no database read or write, no network.
  69: - The need-search itself (finding URLs) is the session's job; no code searches the web.
  70: - `rate-source-by-class.mjs` could take an optional verdict map so this apply shares it; not in the write set, so
  72: - A lineage flag naming several absent parents is resolved by one URL; the lineage backfill raises a fresh flag for
  77: - Confirm the kind-to-output mapping (lineage to portal candidate, the rest to census) is the intended one.
docs/ops/session-log.d/2026-10-07-gate4-ci.md  (5)
  91: - The required-status setting itself (branch protection: whether `Rendering guard` is a required check) is a
  93: - Live-tree tests outside the fitness functions directory (for example the consistency checks C3 and C5
  95: - `docs/INDEX.md` line for `docs/runbooks/gate-evaluation.md` (the docs pass).
  96: - CI step timings after the change: read from the PR's run (`gh run view <id> --json jobs`); the "Run
  102: - `FITNESS_LIVE_TESTS` is never set by the workflow, as the brief says; a local run sets it by hand.
docs/ops/session-log.d/2026-10-07-idx1-section-index.md  (2)
  44: - Stale "Across pages" comments in seven files were reworded to "Connected intelligence" (comments only, per coordinator
  45: - The admin gallery `/admin/parts/section-index` body fixtures (`section-index-fixtures.ts`) have no bodies for the two
docs/ops/session-log.d/2026-10-07-mighist1-recover.md  (8)
  28: - The 74 code-differs rows are not edited (no body edit of any existing migration, no apply).
  29: - Outside-ledger objects are not verified; the ledger INSERTs are staged in the audit document, not run. Wiring F24's ob
  30: - MIG-HIST-2 (replay and diff residue) is not started.
  33: - Coordinator to land the audit document and rule on the Session C question (objects have consumers or not) and the 74 r
  66: - The 74 code-differs rows are not edited (MIG-HIST-2). Outside-ledger objects are still unverified (findings, not passe
  67: - `docs/runbooks/maintenance.d/64-chain-proof.md` and `docs/decisions/ADR-045-chain-proof-on-a-local-stack.md` carry the
  68: - The audit document stays in the session scratchpad (docs/audits is not this lane's to edit).
  71: - When 370 and 371 are applied, their ledger rows will appear and the audit will name them LEDGER_ROW_NOT_IN_MAP until t
docs/ops/session-log.d/2026-10-07-ops1-maintenance-health.md  (2)
  70: - Live timing of any of this: confirmed after merge by the coordinator's executor.
  71: - Re-cut (F51 check 5): `skill-map.mjs` changed on master (#965) while the first branch was open, so this work was re-cu
docs/ops/session-log.d/2026-10-07-par1-rows-meter.md  (3)
  85: - Artboard 22 is not in `docs/design`, so nothing was compared against its frames; the build is to the verbatim text.
  86: - `docs/design/ux-laws.md` ("mounted at 375 x 812 and 1280 x 800") and the F35 header and `description` text still
  88: - The layout guard (`layout-guard/`, 17 routes at 1440 and 1024) was not run locally. The mid row is measured at 1024
docs/ops/session-log.d/2026-10-07-par1b-meter-spec.md  (1)
  35: - The visible list-row value, pending the design answer above.
docs/ops/session-log.d/2026-10-07-par2-bands-typography.md  (2)
  29: - The Connected intelligence "stated coupling" callout tint is not built here. Reason: `CrossPageSection.tsx` has no cli
  30: - `.discipline/rendering/audit/spec/bandtile.json` still describes the old stacked label; it is an audit measurement spe
docs/ops/session-log.d/2026-10-07-proof1-stack-and-replay.md  (4)
  33: - Not fired. The replay has never run against a real database: which files cannot replay on an empty database is unknown
  34: - Supabase CLI key names, Postgres version, `supabase status -o env` key names (`SERVICE_ROLE_KEY` or `SECRET_KEY`) and 
  35: - Subset export and load, chain steps, attack suite are other lanes' scripts; their steps skip by name.
  38: - A mapping from production names to files (or a ruling that these 46 rows are not errors) is needed before the replay c
docs/ops/session-log.d/2026-10-07-proof2-subset.md  (2)
  23: - Wired after PROOF-1 merged (PR 975): the workflow already called both scripts through run-lane-step; this change remov
  24: - Size and time are measured on the first real run, not here. Whether ON CONFLICT DO NOTHING plus replica role is enough
docs/ops/session-log.d/2026-10-07-proof3-chain-steps.md  (9)
  28: - Not fired, as briefed. PROOF-2 (subset export and load, PR 974) has since merged and its steps are in `chain-proof.yml
  29: - Done after the first CI run (coordinator ruling on PR 987): the lint warnings were fixed (unused `env` argument and tw
  30: - `emit-chain-proof-artifact.mjs` does not read `chain-steps-report.json`; the report is uploaded with the rest of `CP_O
  33: - [HYPOTHESIS] fetch-drain: the stack runs with `edge_runtime` disabled, so the `capture-worker` function that apply mod
  34: - [HYPOTHESIS] brief-apply: NO TARGET was likely on a 40-item subset. The coordinator added `--pin-ids-from <batch file>
  35: - Log output (ruled, PR 987): the step scripts print item ids, URLs and titles to the job log of a public repository. Ru
  36: - [HYPOTHESIS] Column and table names used by the assertions were read from migrations and run artifacts, not from a liv
  37: - [HYPOTHESIS] `apply-record-briefs.mjs` runs an IO preflight in apply mode (`io-preflight.mjs`); whether it passes on a
  38: - Rule 015 and the shared-writer registry match write calls and `UPDATE <table> SET` text in `.mjs` files, so the one da
docs/ops/session-log.d/2026-10-07-proof4-attacks.md  (4)
  22: - Not fired. Every SQL statement is checked against the migration files (table and function names exist) but none has ru
  23: - `chain-proof.yml` (PR 975) calls `scripts/proof/attacks.mjs`; the one-line edit owed after 975 merges is `--script scr
  24: - F25 (module liveness) has no root for `run-attacks.mjs` until that workflow edit lands.
  25: - `s8-c-count-rpcs-membership-gate` is red until migration 361 (PR 979) is in the migration tree the replay applies.
docs/ops/session-log.d/2026-10-07-rules1-gate-precision.md  (6)
  92: - No edit to PR 974 or PR 975 branches (their lanes revert the lines above in their own PRs).
  93: - `applied-migrations.json` has no registry entry (its generator is not on master yet).
  94: - `db-check-constraints.json` stays subject to check 5 (listed, never exempt): the brief's equality cannot
  96: - `coverage-scan.mjs` has its own `WRITE_RE` (the governed-surface classifier, F23); same-name false
  98: - No whole suite or fitness runner run; the touched test files were run with `node --test`, CI is the gate.
  102: - Decision for the operator or coordinator: whether the maintenance workflow that commits
docs/ops/session-log.d/2026-10-07-s8a-notes-assignment.md  (5)
  129: - The data move is staged, not run (no population before every layer is complete).
  130: - Migrations 358 and 359 are not applied; apply both BEFORE deploying the routes, then merge the code.
  131: - No notification email or Slack channel; in-app bell only (the existing machinery).
  134: - `src/app/api/community/notifications/route.ts` header comment still lists the old kinds (comment only).
  135: - `.discipline/rendering/layout-guard/manifests.json` still lists the artboard-derived rail card "Your notes" for `/mark
docs/ops/session-log.d/2026-10-07-s8b-tag-attribution.md  (2)
  23: - No live-data check; no data population.
  24: - No row-level smoke spec beyond the workspace-tags probe: the five ledgers' own row smokes do not mount the tags hook, 
docs/ops/session-log.d/2026-10-07-s8c-count-membership.md  (5)
  30: - Not applied; the coordinator applies it (two-track policy: schema DDL via the Supabase CLI).
  31: - No live adversarial script under `scripts/verify/` (outside the write set); the in-migration self-check is the attack.
  32: - The self-check member cases are skipped when the target has no org_memberships row; the NOTICE at the end says which r
  33: - The migration SQL itself has not been executed (no database); only the static test ran. Whether plpgsql accepts the `W
  36: - Coordinator to apply 361 and read the `migration 361 OK` NOTICE (it states whether the member cases ran).
docs/ops/session-log.d/2026-10-07-s8d-portfolio.md  (3)
  32: - Add-to-portfolio controls on the detail pages: owed to a follow-up after S8-A lands (DetailShell is theirs). Until the
  33: - The scope chip, triggers and cross-surface digest (the rest of L18).
  34: - Entity canonical page (see above).
docs/ops/session-log.d/2026-10-07-s8e0-producer-registry.md  (4)
  42: - `fsi-app/scripts/producers/lib/producer-summary-wiring.test.mjs` asserts the exact list of scripts
  45: - `fsi-app/.discipline/fitness/functions/F25-module-liveness.mjs`: the four producer scripts plus
  48: - `docs/runbooks/eia-api-key-registration.md` lines 66 and 91 carry the old dispatch command.
  52: - PR 977 (RULES-1) edits F51 too; re-cut after it merges before pushing.
docs/ops/session-log.d/2026-10-07-s8f-industry-statements.md  (5)
  18: - No design. The coordinator writes it.
  19: - No live counts were re-queried (no database). Every count is marked `[HYPOTHESIS]` with the document it was taken from
  20: - Not traced: the source function behind `getPublicSurfaceCounts` (`fetchPublicSurfaceCounts`), the number of `nrg_pc_20
  23: - `docs/INDEX.md` needs a line for the new register (coordinator-only file per the lane contract).
  24: - Value Delivery Check: this lane's work does not directly advance customer-facing value delivery. It is a read-only reg
docs/ops/session-log.d/2026-10-07-s8f2-statements-build.md  (3)
  43: - `RegionDimensionMatrix.tsx` was not changed to share the implied-base rule (outside the write set).
  44: - No browser look at the live route (no database here); the layout was measured on fixtures only.
  45: - The dimension facet does not scope the block (decision above); the coordinator may rule otherwise.
docs/ops/session-log.d/2026-10-07-trustret.md  (2)
  30: - Index lines owed (coordinator): `docs/runbooks/MAINTENANCE-RUNBOOK.md` index entry for section 66, and `docs/INDEX.md`
  31: - First dry dispatch is the R14 proof: `gh workflow run maintenance.yml -f step=recompute-trust-scores -f mode=dry`. No 
docs/ops/session-log.d/2026-10-08-alias1-entity-hierarchy.md  (6)
  35: - Migration 377 is not applied and its SQL, including the rolled-back self-check, has not been executed against any data
  36: - (Resolved by the coordinator's grant; see the rulings section.) Attaching `propagation_outbox_trg` to `entity_aliases`
  37: - No seed values (levels, relations, aliases): population is another lane. No screen reads `entityLevelLabel` yet.
  38: - Live assertions 1 (free text), 7, 11, 17 and the UI assertions are skipped by design and listed.
  42: - A writer repeating its own (entity, alias, alias_kind, asserted_by) conflicts on the PK and should use ON CONFLICT DO 
  43: - `F47` (db-object-reference) and `F25` (module-liveness) were reasoned about, not run (the fitness runner is CI-only): 
docs/ops/session-log.d/2026-10-08-audit-catalogue.md  (6)
  36: - No audit was re-run and no finding inside an audit was re-verified. The basis column marks 66 of the 118 rows M (a met
  37: - The three 2026-10-08 registers, the 2026-10-06 register and the privilege census are not landed under `docs/audits/`; 
  38: - `docs/audits/gate-evaluation-2026-10-08.md` (named by ADR-046) was not created: it is outside this lane's write set.
  39: - No CI result yet at the time of writing this entry; see the PR.
  43: - Owed: 47 empty cells and 31 partial-only cells, listed in section 3e of the runbook as O-001 to O-047 and P-001 to P-0
  44: - Decision for the coordinator: whether the ADR-046 reference to `docs/audits/gate-evaluation-2026-10-08.md` is satisfie
docs/ops/session-log.d/2026-10-08-audwire1-orphan-audit.md  (4)
  26: - No live field list. There is no live access in this lane (COMMON rule 5), so the original 17 fields (the last recorded
  27: - The prop column is the selected column name: `scanUiSelects`/`parseSelectList` drop `alias:column` aliases and are out
  31: - Consequence of hard=true, INTENDED (coordinator): on the next dispatched lane run, any live orphan (for example `state
  32: - RD-95 was self-assigned; re-number if it collides with a concurrently registered id.
docs/ops/session-log.d/2026-10-08-chain4-downstream-edges.md  (3)
  50: - Not proven live: nothing ran in GitHub Actions or against the database (common terms rule 5). Post-merge dry proof for
  51: - Stale prose left alone (outside the write set): `docs/runbooks/maintenance.d/60-question-answers.md` and `fsi-app/scri
  52: - Concurrency: both workflows keep `cancel-in-progress: false`; a pending chained export replaced by a newer pending one
docs/ops/session-log.d/2026-10-08-cov1-coverage-surface.md  (4)
  96: - `suppressed` has no live call site. `ObligationRegisterFilterBar` states no hidden count for `not_filtered_in` (the AP
  97: - No live database read and no deploy: the page, loader and routes are proven on fixtures with injected dependencies (CO
  98: - The SeriesProvenance swap in the methodology drawer (see ruling 7).
  99: - Throwaway run scripts and their output (`fsi-app/scripts/tmp/cov1-*`) are gitignored and not part of the commit.
docs/ops/session-log.d/2026-10-08-daudit1-mounts.md  (6)
  196: - The harness-rot rows above are not fixed (needs spec and further mount edits plus a second regeneration; outside the b
  197: - `ui/ActionCard` has no audit spec; the two retired specs' artboard values (03, 05, 07, 09 header card, and the next-ob
  198: - No CI job runs `audit:design`.
  199: - Not run locally, per COMMON rule 9: the whole suite, the fitness runner, tsc and lint (CI is the gate).
  203: - Coordinator: a lane for the HARNESS ROT group (fixture props: `factcard`, `impactmeter` valueVisible, research severit
  204: - Coordinator: whether `audit:design` should become a CI job (ADR-046), now that a regeneration is known to yield 136 no
docs/ops/session-log.d/2026-10-08-dead1-whole-file.md  (4)
  169: - Census 2a and 2b (symbol pruning): DEAD-1b.
  170: - Rows skipped above for a live hit, doctrine or normative spec text. Coordinator rulings after the first push: the
  173: - Comment lines naming deleted modules in `skill-map.mjs`, `apply-mint-batch.mjs`, `run-source-sweep.mjs` and the
  179: - `census-writer.mjs` was a W1 register HOLD (crawl-rebuild scope). If the source-loop wave wires it, restore with
docs/ops/session-log.d/2026-10-08-dead1b-symbols-scripts.md  (4)
  204: - Census sections 2a/2b rows under `src/**` (DEAD-1c), `scripts/proof/**`, `scripts/producers/**`, `scripts/migrations/*
  205: - Census 2c test-only, 2d and 2e are not part of this lane.
  206: - `createPgPool` (kept by skill reference) and `DEFAULT_OUT_PATH` (a test imports it) stay.
  210: - `createPgPool` (scripts/lib/batch-primitives.mjs) has no caller anywhere and is documented by the remediation-discipli
docs/ops/session-log.d/2026-10-08-dead3-docs.md  (6)
  100: - Step 5 (glyph:verbatim removal): GATE-1 not merged.
  101: - The three governing-file comment edits, the code strings, the stale archive-path references, and the skill text (board
  102: - CLAUDE.md line 25 still lists docs/sprint-1 and docs/sprint-2 as live (outside the write set).
  103: - No test was added or run: nothing here adds behaviour (docs and comment lines). Local checks run: INDEX link resolver,
  106: - When GATE-1 merges, run step 5 as one scripted commit with the count.
  107: - The ADR-XXX draft in TRAIN-ASSEMBLY-RUNBOOK needs adopting or dropping.
docs/ops/session-log.d/2026-10-08-docs3-pass.md  (8)
  32: - No audit was re-run and no finding in a landed register was re-verified; the tokens are the registers' own.
  33: - The AT1, AT3, AT4 and AT5 registers are not landed or entered (absent).
  34: - `docs/runbooks/MAINTENANCE-RUNBOOK.md` is not edited (outside the write set); the INDEX lines for steps 64 to 67 are i
  35: - The MIG-CI session log and runbook 67 are cited from the PR 1019 branch; they are not on master until that PR merges.
  36: - The applied-migrations list in the addendum stops at the ledger sync of 13:24:44Z; no live query was made.
  40: - Runbook step number 67 collision (above): needs a coordinator ruling on which file is renumbered.
  41: - `remaining-build-register-2026-10-06.md` is still scratch-only (RB6 cites the scratch name); landing it is a later doc
  42: - Board item 44 (a) and the other DEAD-3 residue items 42, 43 and 45 are unchanged.
docs/ops/session-log.d/2026-10-08-docs4-pass.md  (6)
  27: - No audit was re-run and no finding in a landed register was re-verified.
  28: - The count command is committed in the catalogue as text (not as a script file); its section markers are split so that 
  29: - The DOCS-3 pointer's migrations bullet ("NOT APPLIED in open PRs: 374 (1014) ... 377 (1017)") is left as the DOCS-3 cu
  30: - ADR-045's replay class addendum is a later pass after PR 1019 merges.
  34: - AT1 and AT5 landing notes and catalogue entries name PR 1037 and PR 1042 as open; refresh them when those merge.
  35: - Runbook step 67 collision (DOCS-3 open item) is unchanged.
docs/ops/session-log.d/2026-10-08-gate0-doctrine.md  (3)
  48: - No change to CLAUDE.md (outside the write set); its self-annealing line "every failure becomes an edit to
  50: - The two registers are not landed here (DEAD-3 lands them under docs/audits); the ADR cites them by their
  52: - `docs/runbooks/gate-evaluation.md` is GATE-4's file; the ADR cites it in plain code text.
docs/ops/session-log.d/2026-10-08-gate1-rules.md  (3)
  35: - NEEDS WRITE-SET EXPANSION (not touched, per rule 4): `invariants.d/SF-8-canonical-anthropic-path.mjs` residual text st
  36: - The `glyph:verbatim` markers were not touched (DEAD-3 does that after this merges).
  37: - UX compliance: not applicable, no `.tsx` or `.css` changed.
docs/ops/session-log.d/2026-10-08-gate2-hooks.md  (6)
  37: - The user-level shim `~/.claude/hooks/pretooluse-fsi-app-scope.mjs` is NOT edited (out of repo); the coordinator's exec
  38: - `worktree-isolation.test.mjs` line 157 asserts the gate source mentions `isBranchingGitCommand`; it still does (prefil
  39: - The next sentence of the contract's preflight paragraph and `CLAUDE.md` still mention the UX compliance block as a CI 
  40: - No full pre-push (`DISCIPLINE_PREPUSH_FULL=1`), no fitness runner, no suite run locally (CI is the gate, ADR-040).
  44: - F54 EXEMPT_STEPS entry for validate-commits' runner steps (GATE-3).
  45: - GATE-2b (this follow-up PR, branch `lane/gate2-hooks-2`, cut from origin/master 7939565c after PR 998 merged at its fi
docs/ops/session-log.d/2026-10-08-gate5-baseline-and-race.md  (3)
  33: - The one comment line in `fsi-app/.discipline/manifest.mjs` listing the firing-log keys was granted by the coordinator 
  34: - No rule's substance changed; fitness runner, migrations and workflows untouched. The workflow already exports `BASE_RE
  35: - Full suite and fitness runner not run locally (CI is the gate, ADR-040).
docs/ops/session-log.d/2026-10-08-gate6-guard-container.md  (3)
  68: - `layout-baseline-renewal.yml` is dispatch-only, so this PR does not exercise it; its container form is proven by
  71: - `live-smoke.yml` runs on a Production deployment or by dispatch; not exercised by this PR either.
  75: - First green run timings: appended below once the PR's Rendering guard has run.
docs/ops/session-log.d/2026-10-08-gate7-honest-forms.md  (6)
  194: - Write-set grants received from the coordinator and built: `governance/invariants.d/RD-97-source-diffed-as-text.mjs` (R
  195: - Not run locally, per COMMON rule 9 and ADR-040: the full suite, the fitness runner, `tsc`. ESLint (max-warnings 0) was
  196: - `docs/inventories` were not regenerated (no migration, no component).
  197: - The old `governance/.gate-audit.log` ignore line in `fsi-app/.gitignore` is left; `.discipline/out/` was already ignor
  201: - Item 7 reading RULED by the coordinator: correct and intended (nobody commits in the main checkout; RD-19). A-H1-7 (pl
  202: - Coordinator grant: the local post-commit engine run for cherry-pick, am and rebase is built (hooks/post-commit runs `r
docs/ops/session-log.d/2026-10-08-gate8-fitness-honest-forms.md  (7)
  42: - Intent forms, recorded as out of scope: B1-20 (production file under `__tests__`), B1-29 (production file named `*.sel
  43: - Design decisions kept: B3-19 (an FK `REFERENCES` counts as a reader, F14's documented rule), B3-04 and B3-07 and B3-10
  44: - Not in the brief's BUILD list, still ACCEPTED, mechanical on the shared lexer (the work is one function each): F6 B3-0
  45: - Governance firing records need two follow-ups outside this write set: the workflow step that uploads `fsi-app/.discipl
  46: - F9 live type check on the full app project was not run (no install in this worktree beyond the shared link); only the 
  50: - ADR-046: if GATE-7 also appends its addendum at the end of the file, expect a trivial add/add conflict on that tail; k
  51: - To restore enforcement of hops 01 and 04 and to turn NEVER-RUN into a real clock: run the credentialed `node fsi-app/s
docs/ops/session-log.d/2026-10-08-l4e-outbox-entity.md  (2)
  50: - Migration 373 and the backfill are not applied or run. The backfill needs 373 applied first (it calls the RPC).
  51: - The self-check legs (backfill silent, producer write still emits, other-table marker silences nothing, unknown entity 
docs/ops/session-log.d/2026-10-08-mig374-owed-schema.md  (4)
  33: - `fireSignpost` itself is unchanged: it does not set `lifecycle_applied_at`; the stamp is made by the caller (`predicti
  34: - Migration 374 is not applied; nothing was run against any database.
  35: - A step-2 failure inside `fireSignpost` (outbox row not written after `fired_at` is stamped) is a separate existing gap
  39: - None. (The first version left the backfill to the applier; the coordinator ruled it belongs in the migration, and it i
docs/ops/session-log.d/2026-10-08-mkt1-market-components.md  (5)
  200: - `getPublicMarketIntelItems`-style caching: the detail route's item bundle is cached; the new `market_series` and `lice
  204: - The scoped timeline's hidden count is bounded by the strip's fetched window (limit times five upcoming events), the sa
  209: - Pages with no figure: none under `/market`.
  210: - The request-coverage control (COV-1).
  211: - No migration, no producer change, no live read or write.
docs/ops/session-log.d/2026-10-08-obl2-obligation-objects.md  (4)
  54: - No population, no live read or write, no migration applied.
  55: - No admin override mechanism on `obligation_objects` (migration 356's correction kinds do not include it) and no automa
  56: - The banner is client-fetched; a viewer without an authenticated session gets the failure state because the table polic
  72: - None.
docs/ops/session-log.d/2026-10-08-proof5-oracle-superuser.md  (3)
  29: - Not run against a live stack (no container runtime here, no network). The `supabase_admin` role name and its password 
  30: - `replay-migrations.mjs`, `schema-diff.mjs`, `attacks/**`, the production dump step and the migrations are untouched. W
  34: - Observation, not changed: Node itself consumes any `--env-file <path>` argument anywhere on its command line (it exits
docs/ops/session-log.d/2026-10-08-proof5b-oracle-statements.md  (2)
  25: - Not run against a live stack or real psql. [INFERRED] from psql's documented behaviour that separate `-c` options each
  29: - None blocking.
docs/ops/session-log.d/2026-10-08-routes1-guard-fixes.md  (1)
  80: - Nothing from the brief's seven items is outstanding. The register's ATTACKED lens for the 19 route methods and 7 pages
docs/ops/session-log.d/2026-10-08-rulemerge1-merge-commit-baseline.md  (2)
  27: - No rule, hook or workflow edited. `buildContextForExistingCommit` (CI) is unchanged. A merge with unresolved conflicts
  30: - None.
docs/ops/session-log.d/2026-10-08-rulerange1-squash-verdict.md  (3)
  27: - Nothing is applied or merged. The workflows and pre-push were not touched (not in the write set); a pre-push run on a 
  28: - The rest of the discipline suite and the fitness runner were not run locally (CI is the gate, ADR-040).
  31: - Disclosure: the first edits to `runner.mjs` and `manifest.mjs` were written through a Bash `python` script, not the Ed
docs/ops/session-log.d/2026-10-08-s8e5-aux-energy.md  (7)
  123: - Nothing applied; no live row; no scrape or population.
  124: - `OperationsDimension` consumers beyond the three granted files were not audited for a six-value assumption outside
  126: - `docs/inventories/db-check-constraints.json` (source: live) updates when 378 is applied and the inventory re-run.
  127: - The NESO About page and the API Terms of Use were not fetched by this lane; the ownership claim (the UK government com
  128: - The stats response does not say whether `average` is over forecast or actual half-hours; not determined.
  132: - `host-verdicts-001.json`: batch numbers are per directory and S8-E6 or S8-E1 could also add one; whichever merges seco
  134: - `entity_id`: not needed for this producer (ruling). L4-E's `entity_id` registry field is not on master and is not used
docs/ops/session-log.d/2026-10-08-sec1-profiles-escalation.md  (3)
  29: - Not applied to any database; no live check. The in-migration self-check runs at apply time. Not run locally: no Postgr
  30: - Other self-writable privilege-shaped columns are NOT changed by this migration (outside the four-column design): `veri
  34: - Coordinator ruling needed on the `verifier_status` transition guard (see NOT done). Decision-ready sketch: extend `pro
docs/ops/session-log.d/2026-10-08-sec2-profile-status-columns.md  (7)
  59: - Not applied to any database; nothing run against Postgres (none on this machine). The SQL has been read and statically
  60: - PR 985 is superseded by PR 992 (merging), and the PROOF-4 attack registry is not on origin/master in this branch, so n
  61: - No rendering-guard or UI smoke run (CI runs them); `tsc --noEmit` ran locally with no output.
  65: - 364 is applied and merged. Apply order for the executor: 367, then merge this PR (the code depends on 367: the RPC mus
  68: - Screen/block: Verifier badge tab on /profile (VerifierTab), unchanged layout.
  69: - Primary goal: ask to be verified. Path: open the Verifier badge tab, one tap on "Request verifier sign-off". Primary a
  70: - Feedback states: the button shows "Submitting..." while the call runs (existing); on success the headline changes to "
docs/ops/session-log.d/2026-10-08-sec3a-functions-views.md  (5)
  79: - Not applied. The SQL has not been executed against any database; syntax and semantics were checked by reading only. Th
  80: - Function default privileges for future SECURITY DEFINER functions are untouched (ruling 5); the list above is the inpu
  81: - No src change.
  85: - Risk at apply: the self-check aborts (rolling the whole migration back) if a grant the REVOKE cannot remove exists, fo
  86: - Any later CREATE OR REPLACE VIEW of one of the three flipped views without WITH (security_invoker = on) resets the opt
docs/ops/session-log.d/2026-10-08-sec3b-recursion.md  (2)
  65: - Nothing applied, nothing executed against Postgres. F70 is not on master at the time of writing; `user_org_role` follo
  68: - No `.tsx` or `.css` file changed in this lane; there is no screen, block or control to report.
docs/ops/session-log.d/2026-10-08-sec3b-table-policies.md  (7)
  87: - Item 5 (above; reassigned by the coordinator to a new lane, under the corrected rule that spec 07 amendment R8.7, iden
  88: - No rendering-guard or UX smoke run locally (CI runs them); no local tsc run (CI runs it).
  92: - Apply order for the executor: migration 370 can apply before or after the code; the code changes only hide controls. T
  93: - SEC-3a (369) revokes anon writes by table; the two migrations touch disjoint objects except REVOKE on the same three t
  96: - Screens and blocks: detail action row (+ Tag), detail tag row, team watch pill, priority and dismiss kebab menu, portf
  97: - For a viewer: the primary goal on these screens is reading; the path is unchanged (open the page, read); the one prima
  98: - Feedback states: no new asynchronous action; the existing pending, success and failure states of each control are unto
docs/ops/session-log.d/2026-10-08-sec4-definer-hygiene.md  (7)
  61: - Not applied. The SQL has not been executed against any database; syntax and semantics were checked by reading only. Th
  62: - (Closed by the follow-up commit, coordinator ruling 2026-10-08.) The six definers pinned to `search_path = public` wit
  63: - Trigger functions: the revoke stops a role calling the function by name; nothing here proves a trigger still fires aft
  64: - No src change.
  68: - Risk at apply: the self-check aborts (rolling the whole migration back) if a grant the REVOKE cannot remove exists, fo
  69: - The accept_invitation legs and the class A runtime attack need real rows (an admin, an owner, a member and a viewer me
  70: - 370 (PR 1003) and 371 are independent; order of apply does not matter, but 371's self-check calls accept_invitation, w
docs/ops/session-log.d/2026-10-08-sec5-profiles-read.md  (10)
  96: - Nothing applied; nothing executed against Postgres (none on this machine). The self-check, and the four `sec5-*` attac
  97: - The `is_platform_admin` revoke (above).
  98: - No rendering-guard or UX smoke run locally (CI runs them; Playwright is not set up in this worktree).
  99: - The ordering of the merge with SEC-3b: both append to `scripts/proof/attacks/attacks.json`; whichever merges second re
  103: - Apply order for the executor: migration 372 BEFORE this code merges (the code calls the RPCs; without 372 the Communit
  104: - Residual, by design of R8.7: `community_identity` by name can find any non-anonymous profile in the platform, not only
  105: - Residual: `author_user_id` is still returned on anonymous posts (needed for the author's own edit and delete); it is a
  109: - Block: `AuthorIdentityChip` (the author line on a post and on entity threads). Primary goal: tell the reader who is sp
  110: - Block: `/community` thread rows and the roster (page.tsx), `CouncilMembersRail`. Layout unchanged; the only visible di
  111: - Block: admin members list. Layout unchanged; the data source moved to a platform-admin route; the refresh keeps its ex
docs/ops/session-log.d/2026-10-08-sec6-admin-flag.md  (8)
  32: - Nothing applied; nothing executed against Postgres (none on this machine). The self-check and the two `sec6-*` attacks
  33: - [HYPOTHESIS] that the apply role is sanctioned by the 364 guard for a fixture profile inserted with `is_platform_admin
  34: - [HYPOTHESIS] that `authenticated` holds table SELECT on each of the eleven tables in the self-check; where it holds no
  35: - [CONFIRMED by a tree parse, repeated in the test] none of the 15 tables behind the 22 policies carries a live policy t
  36: - No local tsc or eslint (CI runs them, ADR-040); no rendering guard (no .tsx touched).
  37: - `scripts/maintenance/repair-smoke-account.mjs` still reads the column through the service client; unchanged.
  41: - Apply order for the executor: 370, 371, 372 (already applied), then 375, BEFORE this code merges: the app now calls th
  42: - 375's apply raises the same class of risk SEC-3b-R recorded: the self-check is the first execution of some of these po
docs/ops/session-log.d/2026-10-08-sec7-policy-roles.md  (6)
  116: - Not applied. The migration-proof job applies it on the local stack before any production apply; this lane ran no SQL (
  117: - The helpers' EXECUTE grants (SEC-4) are not touched.
  118: - SELECT policies and anon SELECT are not touched.
  119: - Not run: the whole suite, the fitness runner, tsc (CI is the gate, ADR-040).
  123: - If the migration-proof job or the apply aborts, the error names the policy; a policy absent live or with different rol
  124: - A column-level anon INSERT or UPDATE grant on any public table (seen nowhere in the tree or in AT1) would abort the se
docs/ops/session-log.d/2026-10-08-smoke2-content-invariants.md  (6)
  69: - (GRANTED and done, see the follow-up above) NEEDS WRITE-SET EXPANSION 1: `fsi-app/src/lib/detail/section-index-fixture
  75: - (GRANTED and done, see the follow-up above) NEEDS WRITE-SET EXPANSION 2: `fsi-app/.discipline/rendering/smoke/live-smo
  80: - The missing-credentials path is unchanged: `live-preflight.mjs` and the workflow's preflight step fail with exit 1 and
  83: - No live run. Whether the six elements are present on production for the smoke account is unknown until the first CI ru
  88: - First live-smoke run with content checks on: read its report for any `content-*` line.
  89: - Both expansions above, then the fixture smoke carries the end-to-end proof.
docs/ops/session-log.d/2026-10-08-testfix1-cwd-fixtures.md  (5)
  34: - Gitignored scratch writes kept, by design and cleaned up: `F45-duplicate-code.test.mjs` plants a copy under `fsi-app/s
  35: - `.discipline/governance/.gate-audit.log` is appended by the real hook in `pretooluse-skill-gate.test.mjs` (41 lines pe
  36: - The scratch script `aud-at3/legacy.sh` and its siblings that write cwd-relative paths were not edited (not in the repo
  37: - In the first full local run of `run-test-suite.sh` (15m46s on a heavily loaded machine, 10659 tests) one test timed ou
  40: - None that block. Whether the gate-audit log path should become injectable is a production-code decision.
docs/ops/session-log.d/2026-10-08-token1-capture-worker-grants.md  (3)
  22: - Not applied to any database. No live check that anon is refused; that is the migration's own self-check at apply time.
  23: - Callers that reach the function as a role other than service_role or the owner (for example an agent using a different
  27: - None blocking.
docs/ops/session-log.d/2026-10-08-verd1-stale-verdicts.md  (3)
  37: - Nothing applied, no live row touched, no stale batch authored (the first real stale batch is Stage 9 by operator word)
  38: - Follow-up commit (coordinator grant): the ledger README gained a stale-verdicts section (export mode, write fresh, `--
  41: - Cost note for Stage 9: a stale export fetches page text for up to the batch size (300) rows at the 1 second politeness
docs/ops/session-log.d/2026-10-08-wire1-gate-wiring-owned.md  (5)
  26: - Nothing under the user home was read or written (settings.json holds credentials). The installer is run by the executo
  27: - `hooks/pre-push` step 3c failure text still names the applier (`wire-pretooluse-settings.mjs --apply`), which now also
  28: - Not run locally per COMMON rule 9: the whole suite, the fitness runner, tsc. The five touched test files were run (bel
  41: - After merge, the executor runs the one install command from the main checkout; step 3c then passes on the operator mac
  42: - Whether an already-running Claude Code session picks up the new matcher without a restart was not tested here.
```

## NOT done

Nothing in this list is a finding about the repo; each is a scope boundary of this lane.

- No finding was dispositioned by this lane, as briefed; the coordinator dispositions all 699 in one batch and a follow-up lane applies them. [WORK: coordinator-disposition-batch]
- `--strict` does not fail on session-log or register findings (the brief scopes item 1 to audits); those are enforced at the dispatch point only. [NOT-WORK: the brief scopes the push gate to docs/audits; the dispatch gate covers the other two sources]
- Nothing under docs/audits was edited, as briefed. [NOT-WORK: write set excludes docs/audits]

## Open items

- The gate now refuses every dispatch from the main checkout until the 699 are dispositioned or the dispatch carries `DISPOSITION-LANE`. [WORK: coordinator-disposition-batch]
