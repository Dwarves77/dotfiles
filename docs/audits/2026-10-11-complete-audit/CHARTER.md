# The complete audit, second pass (2026-10-11). Operator: "You must stop and redo the complete audit of all
# systems and spaces including supabase." Every lane reads this charter whole before its own section.

WHY A SECOND PASS. The first pass read headers and grep hits and acted on them: a resolver was deleted as a
"duplicate", four "errors" were bugs in the audits, counts were wrong by half. CLAUDE.md rules 14 and 15 govern.

METHOD, binding:
1. WHOLE FILES. You read every file in your scope completely, and every file that imports or calls it. Context cost
   is never a reason to read less. If your scope does not fit, you say so at the top of your register and name the
   files you did not read in full; you do not summarise from a header.
2. EXECUTION. Every row's verdict cites a command you ran and its output (tail, at most 6 lines): `node --test
   <file>`, `node <script> --dry|--plan` on fixtures, `grep -rn <symbol>` with counts, `gh run view <id> --log |
   grep`, a read-only SQL result. A claim with no executed evidence is `[HYPOTHESIS: <why it could not be
   executed>]` and appears in the register's top list "Unverified".
3. ONE ROW SCHEMA for every object (module, script, workflow job, check, table, function, view, policy, doc,
   surface, harness family): ID | WHAT (one line, from the whole read) | FOR (the spec capability id or runtime
   stage it serves; or NONE) | CALLED BY (file:line of callers; or NONE) | CONSUMED BY (what reads its output;
   or NONE) | PROVEN BY (test/attack/golden file; whether it is executed by ci.yml, the hook or a runtime; the
   result of running it now) | LAST REAL RUN (CI run id, ledger run id, or NEVER) | CLASS (CAPABILITY makes the
   product's output better than alternatives / LEARNING lets it improve as sources and rules change /
   SELF-MAINTENANCE protects the first two / NONE) | PRIOR (newest prior audit's claim, file:row, AGREES /
   DISAGREES / NOT COVERED) | STATUS (LIVE / HALF-SLICE (writer or reader missing) / DEAD / UNPROVEN / UNWIRED /
   STALE) | token [CONFIRMED: <command> -> <output>] or [HYPOTHESIS: ...] or [REFUTED: <prior claim> by <command>].
4. SUMMARY AT TOP: counts per STATUS and per CLASS; the list of DISAGREES with prior audits; the list of
   Unverified; the ten rows that matter most, one line each, no adjectives.
5. NO FIXES, NO PROPOSALS, NO DELETIONS. A fact lane creates exactly one file under fsi-app/scripts/tmp/audit2/,
   commits nothing, pushes nothing, opens no PR, runs no CI, and never writes to the database. Sonnet only.
6. Prior audits are the REFERENCE and the PREDICTION (operator: "Looking at old audits as reference"). Before your
   own rows: list every file under docs/audits/ (including subdirectories and docs/archive/) whose subject is your
   scope (by title, by the subsystem names in docs/runbooks/audit-catalogue.md section 2, and by `git grep -l` of
   your scope's directory names in docs/audits), read each one WHOLE, and record for every finding it made about an
   object in your scope: the claim, its date, its status token then, and what you find now by execution: AGREES /
   DISAGREES / FIXED-SINCE (name the PR) / STILL-OPEN. Your register's PRIOR column cites the newest; a second
   section "Prior findings still open" lists every STILL-OPEN finding with file:line, so nothing a past audit found
   is lost. Never restate a prior finding as your own.
7. Report at most 12 lines: register path, counts, the DISAGREES list, the Unverified count. END.

LANES (each a Sonnet FACT lane; its scope is the whole of the paths named; files in no lane's scope are listed by
lane 13 as uncovered):
A1 src-app: fsi-app/src/app/** (every route, page, layout, API handler), fsi-app/src/middleware*.
A2 src-components: fsi-app/src/components/**.
A3 src-lib-1: fsi-app/src/lib/agent/**, sources/**, obligations/**, workspace/**, community/**, propagation/**.
A4 src-lib-2: the rest of fsi-app/src/lib/**, fsi-app/src/workflows/**, fsi-app/src/stores/**, fsi-app/src/types/**.
B1 scripts-runtimes: fsi-app/scripts/turns/**, harness-runs/** (every family: directory, ledger rows via
   the committed export, last real run), maintenance/**, producers/**, mint/**, research/**, obligations/**.
B2 scripts-proof-verify: fsi-app/scripts/proof/**, fsi-app/scripts/verify/**, fsi-app/scripts/lib/**, every other
   fsi-app/scripts/** subdirectory not in B1.
C1 migrations-1: fsi-app/supabase/migrations/001 to 130 (whole files) and their tests; for each: what it creates,
   alters, drops; whether a later migration undoes it; whether its objects exist in db-catalog.json today.
C2 migrations-2: 131 to 260, same.
C3 migrations-3: 261 to the last, plus fsi-app/supabase/config.toml, seed/**, functions/** (edge functions), same.
C4 db-live (the ONLY lane with database access, READ-ONLY, through the Supabase MCP execute_sql tool, project
   kwrsbpiseruzbfwjpvsp; load it with ToolSearch "select:mcp__195a4223-3d5d-4202-92f2-c21ab8592f58__execute_sql"):
   run exactly these, nothing else, and record results verbatim in the register: (a) every table in schema public
   with its row count (`select relname, n_live_tup from pg_stat_user_tables order by 1`), (b) every column with type,
   nullability, default (`information_schema.columns where table_schema='public'`), (c) every policy with cmd, roles,
   qual, with_check (`pg_policies where schemaname='public'`), (d) every trigger with its function and enabled flag
   (`pg_trigger join pg_class join pg_proc`), (e) every function with security type, volatility, owner, and the
   first 200 chars of its body (`pg_proc join pg_namespace where nspname='public'`), (f) every view with its
   definition (`pg_views where schemaname='public'`), (g) grants per table for anon, authenticated, service_role
   (`information_schema.role_table_grants`), (h) default privileges (`pg_default_acl`), (i) the extensions list,
   (j) `select * from system_state`, (k) `select family, count(*), max(created_at) from harness_runs group by 1`,
   (l) the sizes of the 20 largest tables (`pg_total_relation_size`). Then: compare with db-catalog.json on master and
   list every difference. Then: for each table, the writers and readers in code (grep over fsi-app/src and
   fsi-app/scripts and migration bodies) with counts: that is the HALF-SLICE verdict. No other SQL. No writes.
D1 enforcement: .github/workflows/**, .github/actions/**, fsi-app/.discipline/** (registry, fitness, governance,
   rules, hooks), .claude/** at the repo root: every workflow job, every hook step, every registry row: run each
   check once (`node fsi-app/.discipline/fitness/runner.mjs`, each rule's test, each invariant's enforcer where it has
   a CLI), record the outcome; read the last 3 runs of ci.yml and live-smoke.yml job by job.
D2 skills-and-memory: fsi-app/.claude/skills/** (every section: what it governs; what loads it: the gate's trigger
   map in fsi-app/.discipline/governance and the gate-audit.log counts), docs/INDEX.md and every file it indexes
   (specs, decisions, runbooks, plans, doctrine, dispatches, inventories, census, ops): living / stale (contradicted
   by the tree, cite) / superseded (by which doc); docs not indexed; the ten contradictions between living docs.
E1 site-live (browser, read-only, the built-in browser tools): the production site: as an anonymous visitor every
   route the app exposes (from A1's route list or `find fsi-app/src/app -name page.tsx`), then signed in as the
   smoke account (credentials come from fsi-app/scripts/tmp/live-session.json if present, else from the executor's
   LIVE_SMOKE env; never typed by you from memory): each of the five surfaces and the dashboard: what renders, what
   is empty, what errors (console and network), on desktop and 375 px; one screenshot per surface, filed under
   fsi-app/scripts/tmp/audit2/screens/. No clicks that change data.
F1 harness-and-flywheel: the flywheel spec (docs/specs/08-flywheel-design.md whole) and every runtime stage it
   names, traced through the code (the chain files, population-turn, downstream-chain, propagation-drain, the
   learning tables and their writers/readers, trust recompute, change detection, research-or-erase): per stage:
   built, wired, proven, last real run (ledger), consumer. This is the LEARNING class register.
13 coverage: after the others land, `git ls-files` minus the union of their scopes: the uncovered files, with one
   line each; and the cross-register contradictions (the same object with two different verdicts).
