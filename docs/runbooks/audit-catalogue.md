# Audit catalogue: the ten lenses, the eighteen subsystems, and the audit-of-audits matrix

Living runbook. Last matrix refresh: 2026-10-08, on origin/master f706ee09. Owner: the coordinator. Built by the coordinator docs lane AUDIT-CAT; the fact lanes that fill the matrix follow section 5.

Why this exists. Operator, 2026-10-08, verbatim: "We ran audits prior to this but they never caught all of these issues ... I worry about ones I haven't considered because I keep finding them not you." Between 2026-05-05 and 2026-10-08 this repo accumulated 115 top-level files and 4 folders under `docs/audits/`. Most of them ask one question (is it present, is it wired, is it dead) of one slice of the code. This runbook turns "what have we audited, and how" into a table, so the question "what has nobody asked yet" has an answer you can read off it.

Related: [ADR-046 gate doctrine](../decisions/ADR-046-gate-doctrine.md), [ADR-040 CI is the push gate](../decisions/ADR-040-ci-is-the-push-gate.md), [lane common contract](../dispatches/lane-common-contract.md), [consolidated audit 2026-09-30](../audits/audit-consolidated-2026-09-30.md), [wiring audit 2026-09-04](../audits/wiring-audit-2026-09-04.md). Binding rules cited by number: CLAUDE.md rule 14 (status tokens) and rule 15 (execution over existence, attack over presence).

How the matrix was filled. For each file under `docs/audits/` this lane read the opening header and the first method or scope passage it could locate, then recorded which lenses that audit actually ran on which subsystems. No audit was re-run and no finding inside an audit was re-verified [HYPOTHESIS for any cell whose assignment depends on text beyond the header and method passage; the index in section 3 marks each audit M (a method or scope passage was read) or O (opening lines only)]. The three 2026-10-08 registers and the 2026-10-06 register are read in full for their method, inventory and summary sections. A cell counts a lens as run only when the audit's method matches the lens's method in section 1. Reading code is the enumerator for EXISTS and nothing else.

## 1. The ten lenses

Each lens has: the question in one sentence; the method that answers it (a query, a dry run, an attack, a count, never "read the code"); the subsystems it applies to; and the evidence shape it must produce. Every finding produced under any lens carries a rule-14 token: [CONFIRMED: method named], [HYPOTHESIS], or [REFUTED]. Severity (P0, P1, P2) is orthogonal to status.

### EXISTS (presence)

- Question: is every member of this subsystem present as the record says, with the shape the record says?
- Method: enumerate the members from their registry (a glob, a manifest, `git ls-files`, a `pg_catalog` or `information_schema` query, a `--list` flag), count them, and diff the count against what the record claims. Reading files is only the enumerator.
- Applies to: all 18 subsystems.
- Evidence shape: the count; the full member list or the path of a list; two diff lists (present but not recorded, recorded but not present); each entry carries a status token.

### RUNS (fired once, with an artifact)

- Question: has it executed end to end at least once, and can you show the artifact?
- Method: fire it. Dry mode, fixture, or a CI dispatch, and keep the artifact: exit code plus output, a `harness_runs` row id, an Actions run id. A gate is fired twice, once on an input it must flag and once on an input it must pass. Citing an existing artifact counts only when the artifact names the commit and the run id.
- Applies to: all 18 subsystems.
- Evidence shape: per member: ran / never ran / ran and failed, with the artifact id; a never-ran list; the commit the run was made on.

### CALLED (liveness: importer, caller, reader, writer)

- Question: does anything reach it, and does it reach anything that exists?
- Method: a graph, not a grep alone. Import graph with workflow and package.json dispatch roots (the F25 walk); `.from()` and `.rpc()` literals against the live catalog; `workflow_run` edges; inbound INDEX links for docs. Both directions are reported (member with no caller; caller whose target does not exist). A write needs a reader and a read needs a writer (the F14 and F47 shape). Reachable-from-live-roots is counted separately from "has any importer".
- Applies to: all 18 subsystems.
- Evidence shape: counts per direction with lists; the root set used; the members reachable only from other dead members.

### ATTACKED (adversarial check against the real schema or runtime)

- Question: can the guard be defeated by the actor it exists to stop?
- Method: a scripted attack, run in a rolled-back transaction or on the disposable local stack of ADR-045, never against live data. Connect as the weakest principal that should be refused (anon, authenticated, a non-admin org member, a sub-agent session) and attempt the forbidden action; record refused or accepted. Template: `fsi-app/scripts/verify/prov-guard-adversarial-audit.mjs` (forged-input escalation, denied under rollback). For a privilege surface: every column INSERT and UPDATE, every table DML and TRUNCATE, every function EXECUTE, per principal. For a gate: an input that must be blocked in a form the gate's author did not list (a renamed variable, a heredoc, a split string, a different tool). Checking that the enforcement object exists or is enabled never substitutes (rule 15).
- Applies to: every subsystem except 14 (components hold no guard of their own; their guards are rows 4, 6 and 13) and 17 (no guard).
- Evidence shape: an attack table (attack id, principal, target, expected, observed, status token), accepted attacks listed first; the count attempted against the count of guards in the subsystem.

### COSTS (seconds, CI minutes, tokens, prompts)

- Question: what does one use cost, and what does the window's total come to?
- Method: measure with a clock. Wall seconds per commit, push or run at stated input sizes (for example 0, 17, 77 and 300 staged files); CI job seconds from the Actions jobs API over a stated window; tokens from the session ledger; prompts counted from a gate audit log. Multiply by the observed frequency in the window.
- Applies to: all 18 subsystems (for row 17 the cost is tokens loaded per session, CLAUDE.md rule 11).
- Evidence shape: a table of seconds (median, p90, n), the window total, and the share of the whole; which numbers are measured and which are estimates.

### FIRED-TRUE (outcomes from firing logs)

- Question: when it fired, was it right?
- Method: take every firing in a window from a firing log (CI logs for all failed runs, the gate audit log, the hook firing log once ADR-046 doctrine point 6 is implemented) and classify each TP, FP, PROCESS (the fix was adding a marker or file, no defect prevented) or UNKNOWN by reading the violation and the lane's next commit. A gate with no firing log is reported as having none, and its counts are a lower bound. Gates with zero firings in 90 days are listed separately.
- Applies to: rows 1 to 7, 9 and 16 (the subsystems that fire a verdict). Not applicable to rows 8, 10 to 15, 17 and 18: nothing there produces a TP or FP verdict of its own; where a gate fires about them, the count belongs to the gate's row.
- Evidence shape: counts of TP, FP, PROCESS, UNKNOWN per gate; the list of firings (run id or date) with the classification evidence; "no log exists" stated as a finding.

### MODE (assumptions about build versus live, serial versus parallel, clock)

- Question: what does it assume about the state of the world, and what happens when the assumption is false?
- Method: list every state read the member performs (BUILD_MODE, `system_state.scrape_cadence`, the train counter, `Date.now()`, `process.env`, the current branch, the platform, a gitignored file) and run it once in each mode, plus once with a second concurrent instance. Record the behaviour change.
- Applies to: every subsystem except 14 and 17.
- Evidence shape: a table (state read, value tried, outcome); frozen clocks and local-state-dependent no-ops listed by name.

### OVERLAPS (same class checked twice)

- Question: is the same defect class detected in more than one place, and does each place add detection the others lack?
- Method: key on the defect class, not the gate. For each class list every site that detects it and when it runs (tool time, commit, push, CI, live). For each pair find a firing or a test where one caught what the other missed.
- Applies to: all 18 subsystems.
- Evidence shape: class to sites table; pairs with a unique catch against pairs with none.

### OPERATOR-SEAT (every stop, re-cut, prompt, override, after-the-fact grant)

- Question: where does the operator sit in the loop?
- Method: from `docs/ops/session-log.d`, `docs/ops/session-log.md`, the gate audit log and the lane reports of the window, count: gate blocks that forced a rewrite; permission prompts; override trailers and markers; scope grants made after the fact ("NEEDS WRITE-SET EXPANSION" stops); worktree stops; operator interventions quoted verbatim. Cross-check against firing logs; an event recorded only in prose makes the count a lower bound.
- Applies to: all 18 subsystems.
- Evidence shape: counts per category with dated references; the operator's own words as the primary evidence where they exist.

### RECORD-VS-REALITY (repo versus database ledger versus docs versus inventories)

- Question: do the stores that describe one fact agree?
- Method: pick one fact (a migration is applied; a count; a header claim; an ADR's statement of what exists), read it from every store that holds it by a query (the migration ledger via `list_migrations`, `git ls-files`, `information_schema`, `docs/INDEX.md`, a generated inventory), then diff. Registers to compare: migration files against ledger rows against live objects; INDEX lines against files; inventories against their generators; board rows against merged PRs; ADR claims against the tree.
- Applies to: all 18 subsystems.
- Evidence shape: a disagreement table (fact, store A value, store B value, status token); a zero-disagreement result names the stores compared.

## 2. The subsystems the lenses apply to

The eighteen subsystems are the coordinator's list. One extension, stated once: row 15 also holds `fsi-app/src/lib`, because no listed row holds application library code and the 2026-09-30 audits A3, A3b and A3c read it; row 13 holds `page.tsx` files as well as `route.ts` files; row 18 holds the dispatch contracts (briefs, lane common terms, the lane contract) as doctrine instructions. The auditors are subsystems like any other: rows 1 to 7 and 18 are the auditors.

| # | Subsystem | The unit one audit enumerates | Where the members are listed |
|---|---|---|---|
| 1 | Commit rules | each rule file (10 today) | `fsi-app/.discipline/rules/`, `fsi-app/.discipline/manifest.mjs` |
| 2 | Hooks | each git hook step and each Claude Code hook, in repo and user level | `fsi-app/.discipline/hooks/`, `.claude/settings.json`, the user-level settings file (out of repo) |
| 3 | PreToolUse gates | each decision class of the skill gate and its scope shim | `fsi-app/.discipline/governance/pretooluse-skill-gate.mjs`, `skill-map.mjs`, the gate audit log |
| 4 | Fitness functions | each F-id | `fsi-app/.discipline/fitness/functions/`, `runner.mjs --list` |
| 5 | Governance gates | closure gate, memory gate, invariant-coverage and execution-wiring meta-gates, skill-acks, worktree isolation, consistency checks | `fsi-app/.discipline/governance/`, `fsi-app/.discipline/consistency/` |
| 6 | Rendering guard | each fixture by viewport, each UX smoke spec, the layout guard | `fsi-app/.discipline/rendering/` |
| 7 | CI workflow | each job and step of `discipline.yml`, and the other workflows' CI side | `.github/workflows/` |
| 8 | Chain workflows and hops | each `workflow_run` edge and each dispatch hop | `.github/workflows/`, the F50 hop manifest |
| 9 | Harness families | each family | `fsi-app/scripts/harness-runs/*/FAMILY.md` |
| 10 | Migrations and ledger | each migration file, each ledger row, each live object | `fsi-app/supabase/migrations/`, the ledger (`list_migrations`), `docs/inventories/migrations.md` |
| 11 | RLS and grants | each table by principal by command, each column privilege, each policy | `pg_catalog`, `information_schema.role_table_grants`, `information_schema.column_privileges` |
| 12 | SECURITY DEFINER functions | each function with `prosecdef` (owner, search_path, EXECUTE grants) | `pg_proc` |
| 13 | API routes | each `route.ts` and `page.tsx` | `fsi-app/src/app/` |
| 14 | Components | each component file | `fsi-app/src/components/` |
| 15 | Scripts | each file under scripts, library code and seeds | `fsi-app/scripts/`, `fsi-app/src/lib/`, `fsi-app/supabase/seed/`, root `scripts/` |
| 16 | Producers | each producer runtime and the rows it writes | `fsi-app/scripts/producers/`, the population and corpus runtimes, the tables they write |
| 17 | Docs and INDEX | each living doc, each INDEX line, each inventory | `docs/INDEX.md`, `docs/inventories/` |
| 18 | Skills, dispatch contracts and the doctrine's own claims | each SKILL.md, the lane contract, lane common terms, each CLAUDE.md rule, each ADR claim of what exists | `fsi-app/.claude/skills/`, `docs/dispatches/`, `docs/decisions/`, `CLAUDE.md` |

## 3. The audit-of-audits matrix

Cell notation. `YYYY-MM-DD ID` means that audit ran this lens on this subsystem by the lens's method; the ID resolves in the index below. A leading `~` marks a partial run: the method differs from the lens's method, the evidence is a lower bound, or only part of the subsystem was covered. `-` marks an empty cell, which is an owed audit. `n/a` marks a lens that does not apply to the subsystem (reasons are in section 1). Where one cell lists several audits, the latest is first.

Counts, computed mechanically from the tables in 3a and 3b (18 subsystems x 10 lenses = 180 cells): **89 filled, 31 partial only, 47 empty (owed), 13 not applicable.** Of the 167 applicable cells, 47 are empty and 31 more hold a partial entry only, so 78 cells still owe an audit.

| Lens | Filled | Partial only | Empty | n/a |
|---|---|---|---|---|
| EXISTS (EX) | 18 | 0 | 0 | 0 |
| RUNS (RU) | 12 | 3 | 3 | 0 |
| CALLED (CA) | 15 | 0 | 3 | 0 |
| ATTACKED (AT) | 0 | 1 | 15 | 2 |
| COSTS (CO) | 9 | 4 | 5 | 0 |
| FIRED-TRUE (FT) | 8 | 1 | 0 | 9 |
| MODE (MO) | 7 | 1 | 8 | 2 |
| OVERLAPS (OV) | 10 | 3 | 5 | 0 |
| OPERATOR-SEAT (OS) | 1 | 9 | 8 | 0 |
| RECORD-VS-REALITY (RR) | 9 | 9 | 0 | 0 |
| **All** | **89** | **31** | **47** | **13** |


Lens columns: EX = EXISTS, RU = RUNS, CA = CALLED, AT = ATTACKED, CO = COSTS, FT = FIRED-TRUE, MO = MODE, OV = OVERLAPS, OS = OPERATOR-SEAT, RR = RECORD-VS-REALITY.

### 3a. EXISTS, RUNS, CALLED, ATTACKED, COSTS

| # | Subsystem | EX | RU | CA | AT | CO |
|---|---|---|---|---|---|---|
| 1 | Commit rules | 2026-10-08 GA; 2026-09-30 A6B | 2026-10-08 GA | - | - | 2026-10-08 GA |
| 2 | Hooks | 2026-10-08 GA; 2026-09-30 A10; 2026-09-30 A6B | ~2026-10-08 GA | 2026-10-08 GA | - | 2026-10-08 GA |
| 3 | PreToolUse gates | 2026-10-08 GA; 2026-09-30 A6B | 2026-10-08 GA | 2026-10-08 GA | ~2026-10-08 GA | 2026-10-08 GA |
| 4 | Fitness functions | 2026-10-08 GB; 2026-09-30 A6B; 2026-08-31 FRA | 2026-10-08 DC; 2026-10-08 GB; 2026-09-30 A9 | 2026-09-07 WV52; 2026-08-09 GWT | - | 2026-10-08 GB |
| 5 | Governance gates | 2026-10-08 GB; 2026-09-30 A6B; 2026-08-31 FRA | 2026-10-08 GB; 2026-09-30 A9; ~2026-09-18 STG; 2026-08-09 GWT | 2026-10-08 GB; ~2026-09-18 STG; 2026-08-09 GWT | - | 2026-10-08 GB |
| 6 | Rendering guard | 2026-10-08 GB; 2026-09-30 A6B; 2026-09-08 LGD | 2026-09-12 RGC; 2026-09-08 LGD | - | - | 2026-10-08 GB |
| 7 | CI workflow | 2026-10-08 GB; 2026-09-30 A10; 2026-09-30 A4 | 2026-10-08 DC; 2026-10-08 GB; 2026-07-08 BCI | 2026-07-08 BCI | - | 2026-10-08 GB |
| 8 | Chain workflows and hops | 2026-09-30 A4; 2026-09-30 A7; 2026-09-18 STG; 2026-09-04 WIR; 2026-07-18 DSA | 2026-10-06 RB6; 2026-09-18 STG; 2026-09-04 WIR | 2026-09-18 STG; 2026-09-04 WIR; 2026-09-01 SRV | - | ~2026-08-10 RCI |
| 9 | Harness families | 2026-09-04 WIR | 2026-10-08 GB; 2026-09-18 STG; 2026-09-04 WIR | 2026-09-04 WIR | - | ~2026-10-08 GB |
| 10 | Migrations and ledger | 2026-09-30 A5; 2026-09-30 A5B; 2026-09-30 A5C; 2026-08-31 FRA | ~2026-10-06 RB6; ~2026-05 W1S | 2026-10-08 DC; 2026-09-30 A5; 2026-09-25 SIW; 2026-09-17 SHA; 2026-08-11 DLC; 2026-07-19 SSA | - | - |
| 11 | RLS and grants | 2026-09-30 A5; 2026-09-25 SIW; ~2026-08-11 DLC; ~2026-08-09 FCR; 2026-05-15 CSA | - | - | - | - |
| 12 | SECURITY DEFINER functions | 2026-08-11 DLC | - | 2026-09-17 SHA; 2026-08-11 DLC | - | - |
| 13 | API routes | 2026-09-30 A1; 2026-09-30 A1C; 2026-08-31 FRA; 2026-08-09 FCA; 2026-08-09 FCR; 2026-07-18 DSA; 2026-05-10 AUA | 2026-07-18 DS7; 2026-05-25 CSS; 2026-05-12 CCA; 2026-05-06 E2E | 2026-10-08 DC; 2026-09-30 A1; 2026-08-09 FCA; 2026-08-09 PWT; 2026-07-18 DSA; 2026-05-08 WAA; 2026-05-06 ISR | - | 2026-09-04 PCT; 2026-09-04 PWF; 2026-09-04 WIR; 2026-09-03 PLT; 2026-05-11 DPA; 2026-05-07 HF3; 2026-05-06 ISR; 2026-05-06 PLP; 2026-05-05 PPF; 2026-05-05 PRF |
| 14 | Components | 2026-09-30 A2; 2026-09-30 A2B; 2026-09-30 A2BC; 2026-08-31 FRA | 2026-09-08 LGD; 2026-05-25 CSS; 2026-05-12 CCA | 2026-10-08 DC; 2026-09-30 A2; 2026-08-09 FCA; 2026-08-09 PWT; 2026-05-11 FUA | n/a | 2026-09-04 PCT; 2026-09-04 PWF; 2026-09-03 PLT; 2026-05-07 HF3; 2026-05-06 PLP; 2026-05-05 PPF; 2026-05-05 PRF |
| 15 | Scripts | 2026-09-30 A3; 2026-09-30 A3B; 2026-09-30 A3C; 2026-09-30 A4; 2026-09-30 A4B; 2026-09-30 A4BC; 2026-09-30 A4C; 2026-09-30 A4CC; 2026-09-06 INF; 2026-08-31 FRA; 2026-08-09 FCR; 2026-05-11 CLN | 2026-08-11 DAL; 2026-08-09 GWT | 2026-10-08 DC; ~2026-09-30 A10; 2026-09-30 A3; 2026-09-05 PCA; 2026-09-04 WIR; 2026-08-11 WCN; ~2026-08-09 FCA; 2026-05-11 CLN; 2026-05 W1A | - | ~2026-08-10 RCI |
| 16 | Producers | 2026-09-25 SIW; 2026-07-18 IBR; 2026-07-15 GTV; 2026-07-14 HRC; 2026-07-14 R33; 2026-05-12 AMT; 2026-05-12 USC; 2026-05-11 JNA; 2026-05-10 SME; 2026-05-10 W1T; 2026-05-09 CRA; 2026-05-09 FPA; 2026-05-09 PRM; 2026-05-09 SCD; 2026-05-09 TRI; 2026-05-05 BSA; 2026-05-05 RDA; 2026-05-04 W1C | 2026-09-25 SIW; ~2026-08-11 DDR; 2026-05-11 SCF; 2026-05-04 CAP | 2026-09-25 SIW; 2026-09-12 QHF; 2026-08-09 PWT; 2026-07-18 IBR; 2026-07-14 ACQ; 2026-05-08 WAA | - | ~2026-05-04 CAP |
| 17 | Docs and INDEX | 2026-10-08 DC; 2026-09-30 A8; 2026-09-30 A8B; 2026-09-30 A8C; 2026-09-30 A8D; 2026-07-07 ARC | ~2026-09-30 A9 | 2026-10-08 DC | n/a | - |
| 18 | Skills, contracts, doctrine claims | 2026-09-30 A6; 2026-09-05 PCA | - | 2026-08-09 PWT; 2026-08-09 SVR | - | - |


### 3b. FIRED-TRUE, MODE, OVERLAPS, OPERATOR-SEAT, RECORD-VS-REALITY

| # | Subsystem | FT | MO | OV | OS | RR |
|---|---|---|---|---|---|---|
| 1 | Commit rules | 2026-10-08 GA | - | 2026-10-08 GA | ~2026-10-08 GA | ~2026-10-08 GA |
| 2 | Hooks | ~2026-10-08 GA | - | 2026-10-08 GA | ~2026-10-08 GA | ~2026-10-08 GA |
| 3 | PreToolUse gates | 2026-10-08 GA | ~2026-10-08 GA | 2026-10-08 GA | 2026-10-08 GA | ~2026-10-08 GA |
| 4 | Fitness functions | 2026-10-08 GB | 2026-10-08 GB | 2026-10-08 GB | ~2026-10-08 GB | 2026-10-08 DC |
| 5 | Governance gates | 2026-10-08 GB | 2026-10-08 GB; ~2026-07-18 DSA | 2026-10-08 GB | ~2026-10-08 GB | ~2026-07-30 SPD |
| 6 | Rendering guard | 2026-10-08 GB | 2026-09-12 RGC | 2026-10-08 GB | - | 2026-09-12 RGC |
| 7 | CI workflow | 2026-10-08 GB | 2026-10-08 GB; 2026-09-12 RGC | 2026-10-08 GB | ~2026-10-08 GB | ~2026-10-08 DC |
| 8 | Chain workflows and hops | n/a | 2026-08-10 RCI; 2026-07-18 DS7 | - | ~2026-09-04 WIR | 2026-10-06 RB6; 2026-09-05 PCA; 2026-09-04 WIR |
| 9 | Harness families | 2026-10-08 GB | - | 2026-10-08 GB | ~2026-10-08 GB | ~2026-10-08 GB; ~2026-09-04 WIR |
| 10 | Migrations and ledger | n/a | - | - | - | 2026-10-08 DC; 2026-09-30 A5; 2026-09-04 WIR; 2026-05-15 CSA; 2026-05-12 MDI |
| 11 | RLS and grants | n/a | - | - | - | ~2026-09-30 A5; ~2026-09-25 SIW |
| 12 | SECURITY DEFINER functions | n/a | - | - | - | ~2026-05-12 MDI |
| 13 | API routes | n/a | 2026-07-18 DS7 | ~2026-09-17 SHA | ~2026-09-12 QHF | ~2026-05-15 CPA; ~2026-05 W1B |
| 14 | Components | n/a | n/a | 2026-09-17 SHA | - | 2026-07-08 RDC; 2026-05-24 FNP; 2026-05-06 VRC; 2026-05 DSN |
| 15 | Scripts | n/a | - | 2026-09-17 SHA; 2026-09-05 PCA | - | 2026-10-08 DC |
| 16 | Producers | 2026-07-15 GTV; 2026-05-06 ITR | 2026-07-15 W2R | ~2026-09-25 SIW | ~2026-09-12 QHF | 2026-09-18 DDC; ~2026-09-01 SRV; 2026-08-11 DDR; 2026-07-15 GTV; 2026-07-15 RCL; 2026-07-15 W2C; ~2026-05-15 CPA; 2026-05-11 SCV; 2026-05-11 W1BS; ~2026-05-10 SME; ~2026-05-05 BSA; 2026-05-05 RDA |
| 17 | Docs and INDEX | n/a | n/a | - | - | 2026-10-08 DC; 2026-09-30 A8; 2026-09-30 A8B; 2026-09-30 A8C; 2026-09-30 A8D; 2026-08-31 FRA; ~2026-07-07 ARC; 2026-05-06 SES |
| 18 | Skills, contracts, doctrine claims | n/a | - | ~2026-10-08 GA | - | 2026-09-30 A7; 2026-09-05 PCA; 2026-09-04 WIR; 2026-08-31 FRA; 2026-08-09 SVR |


### 3c. Facts found while filling the matrix

- [CONFIRMED: `git ls-files docs/audits` at f706ee09 returns no file matching gate-eval] ADR-046 states the two gate registers "are landed as `docs/audits/gate-evaluation-2026-10-08.md`". That file is not on origin/master. The registers exist only as gitignored scratch files under `fsi-app/scripts/tmp/` (`gate-evaluation-A-rules-hooks-2026-10-08.md`, `gate-evaluation-B-fitness-governance-2026-10-08.md`), which is why the index below cites them as GA and GB by scratch name.
- [CONFIRMED: file listing] The dead-code census (`dead-code-census-2026-10-08.md`, ID DC) and the remaining-build register (`remaining-build-register-2026-10-06.md`, ID RB6) are likewise scratch-only. Their cells move to a `docs/audits/` file name when a docs pass lands them; that pass also adds the INDEX line and refreshes this matrix.
- [CONFIRMED: `git ls-files docs/audits` at f706ee09 returns no file matching priv] The standard privilege-escalation census has not landed. Every ATTACKED and RLS and grants cell that census would fill stays owed until it does.
- [CONFIRMED: computed from the tables above] ATTACKED is the emptiest lens: the only entry anywhere is the partial GA run on PreToolUse gates, which fed crafted strings to try to over-trigger the gate and none to defeat it. The per-guard attack scripts that exist in the repo (`prov-guard-adversarial-audit.mjs`, `derivation-edges-rls-adversarial-audit.mjs`, `harness-runs-rls-adversarial-audit.mjs`, `spec09-org-rls-adversarial-audit.mjs`) were read by A4bc on 2026-09-30, not fired by an audit.
- [CONFIRMED: audit text] The audit DLC (2026-08-11) records that RLS policies "were read as a reference surface, not audited as policies". [HYPOTHESIS] This is the gap the user-writable privilege columns of 2026-10-08 sat in: the matrix shows no audit enumerated column privileges per principal or attacked them (rows 11 and 12 have no RUNS, no ATTACKED and no COSTS entry).

### 3d. The audit index

Every file and folder under `docs/audits/` as of f706ee09, plus the four scratch registers. Subsystems are row numbers from section 2; lenses are the codes above; a lens appears here if the audit ran it at least partially on one of the listed subsystems (the matrix shows which cells are partial). Basis M: a method or scope passage was read in this pass. Basis O: opening lines only. Files that are rulings, data artifacts or syntheses fill no cell and say what they derive from.

| ID | File or folder | Date | Subsystems | Lenses run (see the matrix for partials) | Basis |
|---|---|---|---|---|---|
| GA | scratch `gate-evaluation-A-rules-hooks-2026-10-08.md` | 2026-10-08 | 1, 2, 3, 18 | EX, RU, CA, AT, CO, FT, MO, OV, OS, RR | M |
| GB | scratch `gate-evaluation-B-fitness-governance-2026-10-08.md` | 2026-10-08 | 4, 5, 6, 7, 9 | EX, RU, CA, CO, FT, MO, OV, OS, RR | M |
| DC | scratch `dead-code-census-2026-10-08.md` | 2026-10-08 | 4, 7, 10, 13, 14, 15, 17 | EX, RU, CA, RR | M |
| RB6 | scratch `remaining-build-register-2026-10-06.md` | 2026-10-06 | 8, 10 | RU, RR | M |
| A1 | `app-audit-a1-routes-2026-09-30.md` | 2026-09-30 | 13 | EX, CA | M |
| A1C | `app-audit-a1c-routes-completion-2026-09-30.md` | 2026-09-30 | 13 | EX | M |
| A2 | `app-audit-a2-components-2026-09-30.md` | 2026-09-30 | 14 | EX, CA | M |
| A2B | `app-audit-a2b-components-m-z-2026-09-30.md` | 2026-09-30 | 14 | EX | O |
| A2BC | `app-audit-a2bc-components-completion-2026-09-30.md` | 2026-09-30 | 14 | EX | M |
| A3 | `app-audit-a3-lib-2026-09-30.md` | 2026-09-30 | 15 | EX, CA | M |
| A3B | `app-audit-a3b-lib-n-z-2026-09-30.md` | 2026-09-30 | 15 | EX | O |
| A3C | `app-audit-a3c-lib-community-market-2026-09-30.md` | 2026-09-30 | 15 | EX | M |
| A4 | `app-audit-a4-scripts-workflows-2026-09-30.md` | 2026-09-30 | 7, 8, 15 | EX | M |
| A4B | `app-audit-a4b-scripts-mint-lib-verify-2026-09-30.md` | 2026-09-30 | 15 | EX | M |
| A4BC | `app-audit-a4bc-scripts-completion-2026-09-30.md` | 2026-09-30 | 15 | EX | O |
| A4C | `app-audit-a4c-scripts-remainder-2026-09-30.md` | 2026-09-30 | 15 | EX | M |
| A4CC | `app-audit-a4cc-scripts-completion-2026-09-30.md` | 2026-09-30 | 15 | EX | M |
| A5 | `app-audit-a5-database-2026-09-30.md` | 2026-09-30 | 10, 11 | EX, CA, RR | M |
| A5B | `app-audit-a5b-migrations-001-170-2026-09-30.md` | 2026-09-30 | 10 | EX | O |
| A5C | `app-audit-a5c-migrations-171-339-2026-09-30.md` | 2026-09-30 | 10 | EX | O |
| A6 | `app-audit-a6-discipline-tests-2026-09-30.md` | 2026-09-30 | 18 | EX | M |
| A6B | `app-audit-a6b-discipline-full-2026-09-30.md` | 2026-09-30 | 1, 2, 3, 4, 5, 6 | EX | O |
| A7 | `architecture-review-2026-09-30.md` | 2026-09-30 | 8, 18 | EX, RR | O |
| A8 | `docs-vs-reality-2026-09-30.md` | 2026-09-30 | 17 | EX, RR | M |
| A8B | `docs-vs-reality-ops-2026-09-30.md` | 2026-09-30 | 17 | EX, RR | M |
| A8C | `docs-vs-reality-plans-2026-09-30.md` | 2026-09-30 | 17 | EX, RR | O |
| A8D | `docs-vs-reality-board-and-remainder-2026-09-30.md` | 2026-09-30 | 17 | EX, RR | M |
| A9 | `mechanical-checkers-2026-09-30.md` | 2026-09-30 | 4, 5, 17 | RU | M |
| A10 | `app-audit-a10-remainder-2026-09-30.md` | 2026-09-30 | 2, 7, 15 | EX, CA | M |
| CONS | `audit-consolidated-2026-09-30.md` | 2026-09-30 | - | none: synthesis of A1 to A10 and their splits; it re-verifies findings and adds no run of its own | O |
| BSA | `BRIEF-STRUCTURE-AUDIT.md` | 2026-05-05 | 16 | EX, RR | M |
| DSN | `DESIGN-AUDIT-2026-05.md` | 2026-05 | 14 | RR | O |
| E2E | `E2E-VERIFICATION.md` | 2026-05-06 | 13 | RU | O |
| ITR | `INTEGRITY-TRIAGE-REPORT.md` | 2026-05-06 | 16 | FT | O |
| ISR | `ISR-WRITE-INVESTIGATION.md` | 2026-05-06 | 13 | CA, CO | M |
| PLP | `PAGE-LOAD-PERF-AUDIT-2026-05-06.md` | 2026-05-06 | 13, 14 | CO | M |
| PRF | `PERF-AUDIT.md` | 2026-05-05 | 13, 14 | CO | M |
| PPF | `PERF-PROFILING-FINDINGS.md` | 2026-05-05 | 13, 14 | CO | M |
| RDA | `REGIONAL-DATA-COLLECTION-AUDIT.md` | 2026-05-05 | 16 | EX, RR | M |
| SES | `SESSION-AUDIT-2026-05-05.md` | 2026-05-06 | 17 | RR | M |
| VRC | `VISUAL-RECONCILIATION-2026-05-06.md` | 2026-05-06 | 14 | RR | M |
| W1A | `W1A-dual-write-audit.md` | 2026-05 | 15 | CA | O |
| W1B | `W1B-approval-handler-analysis.md` | 2026-05 | 13 | RR | M |
| W1C | `W1C-source-attribution-summary.md` | 2026-05-04 | 16 | EX | O |
| WAA | `WORKER-ACTIVATION-AUDIT-2026-05-08.md` | 2026-05-08 | 13, 16 | CA | M |
| AMT | `access-method-triage-2026-05-12.md` | 2026-05-12 | 16 | EX | O |
| AUA | `auth-architecture-audit-2026-05-10.md` | 2026-05-10 | 13 | EX | O |
| CAP | `california-pilot-summary.md` | 2026-05-04 | 16 | RU, CO | O |
| CCA | `cards-clickable-audit-2026-05-12.md` | 2026-05-12 | 13, 14 | RU | M |
| CPA | `caros-ledge-product-audit-2026-05-15.md` | 2026-05-15 | 13, 16 | RR | M |
| CSA | `caros-ledge-supabase-schema-audit-2026-05-15.md` | 2026-05-15 | 10, 11 | EX, RR | M |
| CRA | `classification-rules-audit-2026-05-09.md` | 2026-05-09 | 16 | EX | M |
| CLN | `cleanup-audit-2026-05-11.md` | 2026-05-11 | 15 | EX, CA | M |
| CSS | `comprehensive-site-audit-2026-05-25.md` | 2026-05-25 | 13, 14 | RU | M |
| DPA | `dashboard-payload-audit-2026-05-11.md` | 2026-05-11 | 13 | CO | O |
| FUA | `font-usage-audit-2026-05-11.md` | 2026-05-11 | 14 | CA | O |
| FPA | `four-page-architecture-survey-2026-05-09.md` | 2026-05-09 | 16 | EX | O |
| FNP | `functional-purpose-audit-2026-05-24.md` | 2026-05-24 | 14 | RR | M |
| HF3 | `hotfix-3-perf-audit-2026-05-07.md` | 2026-05-07 | 13, 14 | CO | O |
| JNA | `jurisdiction-normalization-audit-2026-05-11.md` | 2026-05-11 | 16 | EX | M |
| MDI | `migration-drift-investigation-2026-05-12.md` | 2026-05-12 | 10, 12 | RR | M |
| PRM | `primitives-audit-2026-05-09.md` | 2026-05-09 | 16 | EX | O |
| SCF | `source-classification-final-summary-2026-05-11.md`, `source-classification-step1-log.json`, `source-classification-step2-log.json` | 2026-05-11 | 16 | RU | O |
| SCD | `source-coverage-diagnostic-2026-05-09.md` | 2026-05-09 | 16 | EX | M |
| SME | `source-map-existence-check-2026-05-10.md` | 2026-05-10 | 16 | EX, RR | M |
| SMG | `source-map-from-esgtoday-2026-05-09.md` | 2026-05-09 | - | none: a source-registry expansion map built from an external site, not an audit of a subsystem | O |
| SCV | `sources-content-verification-2026-05-11.md` | 2026-05-11 | 16 | RR | M |
| TRI | `topic-relevance-investigation-2026-05-09.md` | 2026-05-09 | 16 | EX | O |
| USC | `us-state-code-audit-2026-05-12.md` | 2026-05-12 | 16 | EX | O |
| W1S | `wave1-step1-verification.md` | 2026-05 | 10 | RU | O |
| W1T | `wave1-track1-summary.md` | 2026-05-10 | 16 | EX | O |
| W1BS | `wave1b-stub-quality-investigation-2026-05-11.md` | 2026-05-11 | 16 | RR | M |
| PH2 | `phase-2b-flag-ingest-errors-log.json` | 2026-05 | - | none: machine-evidence JSON of the phase 2b flag ingest; fills no cell | O |
| BCI | `blind-ci-window-audit-2026-07-08.md` | 2026-07-08 | 7 | RU, CA | M |
| RDC | `redesign-completeness-2026-07-08.md` | 2026-07-08 | 14 | RR | O |
| ARC | `wave1-archive-logs-disposition-2026-07-07.md` | 2026-07-07 | 17 | EX, RR | O |
| R33 | `rd33-retro-apply-2026-07-14.md` | 2026-07-14 | 16 | EX | O |
| HRC | `host-registration-census-2026-07-14.md` | 2026-07-14 | 16 | EX | O |
| ACQ | `acquisition-ladder-post-mortem-2026-07-14.md` | 2026-07-14 | 16 | CA | O |
| GTV | `ground-truth-verification-2026-07-15.md` | 2026-07-15 | 16 | EX, FT, RR | M |
| RCL | `remediation-close-2026-07-15.md` | 2026-07-15 | 16 | RR | O |
| W2C | `wave2-archive-collision-reconciliation-2026-07-15.md` | 2026-07-15 | 16 | RR | O |
| W2R | `wave2-concurrent-race-incident-2026-07-15.md` | 2026-07-15 | 16 | MO | O |
| DSA | `dormant-systems-audit-2026-07-18.md` | 2026-07-18 | 5, 8, 13 | EX, CA, MO | M |
| DS7 | `dormant-systems-section7-results-2026-07-18.md` | 2026-07-18 | 8, 13 | RU, MO | M |
| IBR | `ingest-behavioral-read-2026-07-18.md` | 2026-07-18 | 16 | EX, CA | O |
| SSA | `supabase-structure-audit-2026-07-19.md` | 2026-07-19 | 10 | CA | M |
| SPD | `spend-authority-disarm-case-file-2026-07-30.md` | 2026-07-30 | 5 | RR | M |
| FCA | `full-code-audit-2026-08-09.md` | 2026-08-09 | 13, 14, 15 | EX, CA | M |
| FCR | `full-code-reading-audit-2026-08-09.md` | 2026-08-09 | 11, 13, 15 | EX | O |
| GWT | `goldens-wiring-truth-2026-08-09.md` | 2026-08-09 | 4, 5, 15 | RU, CA | M |
| PWT | `product-code-wiring-truth-2026-08-09.md` | 2026-08-09 | 13, 14, 16, 18 | CA | O |
| SVR | `skill-vs-runtime-analysis-delta-2026-08-09.md` | 2026-08-09 | 18 | CA, RR | O |
| RCI | `runtime-clock-inventory-2026-08-10.md` | 2026-08-10 | 8, 15 | CO, MO | O |
| WCN | `wiring-census-2026-08-11.md` | 2026-08-11 | 15 | CA | M |
| DLC | `db-layer-census-2026-08-11.md` | 2026-08-11 | 10, 11, 12 | EX, CA | M |
| DAL | `data-audit-lane-diagnosis-2026-08-11.md` | 2026-08-11 | 15 | RU | O |
| DDR | `data-drift-remediation-2026-08-11.md` | 2026-08-11 | 16 | RU, RR | M |
| NTH | `null-tier-host-ruling-2026-08-11.md`, `null-tier-host-ruling-2026-08-11.csv` | 2026-08-11 | - | none: the operator ruling and applied data for the host census HRC; fills no cell | O |
| TCN | `tier-canonicalization-2026-08-11.csv` | 2026-08-11 | - | none: data artifact of the tier canonicalization; fills no cell | O |
| GAB | `gate-a-route-b-baseline-2026-08-11.csv` | 2026-08-11 | - | none: data artifact, a per-item validity baseline; fills no cell | O |
| DCM | `dead-code-manifest-2026-08-11.txt` | 2026-08-11 | - | none: list of 495 paths from the 2026-08-11 dead-code sweep; fills no cell | O |
| FRA | `full-read-audit-2026-08-31.md`, `full-read-2026-08-31/` | 2026-08-31 | 4, 5, 10, 13, 14, 15, 17, 18 | EX, RR | M |
| SRV | `system-review-2026-09-01.md` | 2026-09-01 | 8, 16 | CA, RR | O |
| WIR | `wiring-audit-2026-09-04.md`, `wiring-audit-2026-09-04/` | 2026-09-04 | 8, 9, 10, 13, 15, 18 | EX, RU, CA, CO, OS, RR | M |
| PLT | `perf-load-times-2026-09-03.md` | 2026-09-03 | 13, 14 | CO | M |
| PCT | `perf-clickthrough-2026-09-04.md` | 2026-09-04 | 13, 14 | CO | O |
| PWF | `perf-waterfall-2026-09-04.md` | 2026-09-04 | 13, 14 | CO | O |
| PCA | `plan-completion-audit-2026-09-05/` | 2026-09-05 | 8, 15, 18 | EX, CA, OV, RR | M |
| INF | `in-filter-audit-2026-09-06.md` | 2026-09-06 | 15 | EX | M |
| WV52 | `f25-wave52-dispositions-2026-09-07.md` | 2026-09-07 | 4 | CA | M |
| LGD | `layout-guard-2026-09-08.md` | 2026-09-08 | 6, 14 | EX, RU | O |
| QHF | `quarantine-and-human-flag-writers-2026-09-12.md` | 2026-09-12 | 13, 16 | CA, OS | M |
| RGC | `rendering-guard-local-vs-ci-2026-09-12.md` | 2026-09-12 | 6, 7 | RU, MO, RR | M |
| SHA | `system-health-audit-2026-09-17.md` | 2026-09-17 | 10, 12, 13, 14, 15 | CA, OV | O |
| DDC | `data-duplicate-census-2026-09-18.md` | 2026-09-18 | 16 | RR | M |
| STG | `stage-audit-2026-09-18/` | 2026-09-18 | 5, 8, 9 | EX, RU, CA | M |
| SIW | `supabase-integrity-and-wiring-audit-2026-09-25.md` | 2026-09-25 | 10, 11, 16 | EX, RU, CA, OV, RR | M |


### 3e. The owed audits, in priority order

Priority order: ATTACKED and RECORD-VS-REALITY first (a guard never attacked and a record never compared hide the defects the operator then finds by hand), then RUNS, FIRED-TRUE, CALLED, MODE, OPERATOR-SEAT, COSTS, OVERLAPS, EXISTS. Inside a lens the order follows what the subsystem can lose: privilege surfaces, then migrations, routes, the gates, then chain and producers, then scripts, components and docs. Each entry is one fact lane (section 5): the lens method from section 1 applied to the unit named. O entries are empty cells; P entries are cells that hold only a partial run and are owed in full. Entry numbers are stable labels, not a schedule.

#### ATTACKED (AT): 15 empty, 1 partial only

- O-001 row 11, RLS and grants: each table by principal by command, each column privilege, each policy
- O-002 row 12, SECURITY DEFINER functions: each function with prosecdef
- O-003 row 10, Migrations and ledger: each migration file, ledger row and live object
- O-004 row 13, API routes: each route.ts and page.tsx
- O-005 row 5, Governance gates: each governance gate and consistency check
- O-006 row 4, Fitness functions: each F-id (60 today)
- O-007 row 1, Commit rules: each of the 10 rule files
- O-008 row 2, Hooks: each git hook step and each Claude Code hook (repo and user level)
- O-009 row 7, CI workflow: each job and step of discipline.yml and the other workflows
- O-010 row 8, Chain workflows and hops: each workflow_run edge and dispatch hop
- O-011 row 9, Harness families: each harness family
- O-012 row 16, Producers: each producer runtime and the rows it writes
- O-013 row 15, Scripts: each file under scripts, src/lib, supabase/seed and root scripts
- O-014 row 6, Rendering guard: each fixture by viewport, each UX smoke spec, the layout guard
- O-015 row 18, Skills, contracts, doctrine claims: each SKILL.md, the lane contract, lane common terms, each CLAUDE.md rule, each ADR claim of what exists
- P-001 row 3, PreToolUse gates: on file ~2026-10-08 GA; each decision class of the skill gate and its scope shim

#### RECORD-VS-REALITY (RR): 0 empty, 9 partial only

- P-002 row 11, RLS and grants: on file ~2026-09-30 A5; ~2026-09-25 SIW; each table by principal by command, each column privilege, each policy
- P-003 row 12, SECURITY DEFINER functions: on file ~2026-05-12 MDI; each function with prosecdef
- P-004 row 13, API routes: on file ~2026-05-15 CPA; ~2026-05 W1B; each route.ts and page.tsx
- P-005 row 3, PreToolUse gates: on file ~2026-10-08 GA; each decision class of the skill gate and its scope shim
- P-006 row 5, Governance gates: on file ~2026-07-30 SPD; each governance gate and consistency check
- P-007 row 1, Commit rules: on file ~2026-10-08 GA; each of the 10 rule files
- P-008 row 2, Hooks: on file ~2026-10-08 GA; each git hook step and each Claude Code hook (repo and user level)
- P-009 row 7, CI workflow: on file ~2026-10-08 DC; each job and step of discipline.yml and the other workflows
- P-010 row 9, Harness families: on file ~2026-10-08 GB; ~2026-09-04 WIR; each harness family

#### RUNS (RU): 3 empty, 3 partial only

- O-016 row 11, RLS and grants: each table by principal by command, each column privilege, each policy
- O-017 row 12, SECURITY DEFINER functions: each function with prosecdef
- O-018 row 18, Skills, contracts, doctrine claims: each SKILL.md, the lane contract, lane common terms, each CLAUDE.md rule, each ADR claim of what exists
- P-011 row 10, Migrations and ledger: on file ~2026-10-06 RB6; ~2026-05 W1S; each migration file, ledger row and live object
- P-012 row 2, Hooks: on file ~2026-10-08 GA; each git hook step and each Claude Code hook (repo and user level)
- P-013 row 17, Docs and INDEX: on file ~2026-09-30 A9; each living doc, INDEX line and inventory

#### FIRED-TRUE (FT): 0 empty, 1 partial only

- P-014 row 2, Hooks: on file ~2026-10-08 GA; each git hook step and each Claude Code hook (repo and user level)

#### CALLED (CA): 3 empty, 0 partial only

- O-019 row 11, RLS and grants: each table by principal by command, each column privilege, each policy
- O-020 row 1, Commit rules: each of the 10 rule files
- O-021 row 6, Rendering guard: each fixture by viewport, each UX smoke spec, the layout guard

#### MODE (MO): 8 empty, 1 partial only

- O-022 row 11, RLS and grants: each table by principal by command, each column privilege, each policy
- O-023 row 12, SECURITY DEFINER functions: each function with prosecdef
- O-024 row 10, Migrations and ledger: each migration file, ledger row and live object
- O-025 row 1, Commit rules: each of the 10 rule files
- O-026 row 2, Hooks: each git hook step and each Claude Code hook (repo and user level)
- O-027 row 9, Harness families: each harness family
- O-028 row 15, Scripts: each file under scripts, src/lib, supabase/seed and root scripts
- O-029 row 18, Skills, contracts, doctrine claims: each SKILL.md, the lane contract, lane common terms, each CLAUDE.md rule, each ADR claim of what exists
- P-015 row 3, PreToolUse gates: on file ~2026-10-08 GA; each decision class of the skill gate and its scope shim

#### OPERATOR-SEAT (OS): 8 empty, 9 partial only

- O-030 row 11, RLS and grants: each table by principal by command, each column privilege, each policy
- O-031 row 12, SECURITY DEFINER functions: each function with prosecdef
- O-032 row 10, Migrations and ledger: each migration file, ledger row and live object
- O-033 row 15, Scripts: each file under scripts, src/lib, supabase/seed and root scripts
- O-034 row 14, Components: each component file
- O-035 row 6, Rendering guard: each fixture by viewport, each UX smoke spec, the layout guard
- O-036 row 17, Docs and INDEX: each living doc, INDEX line and inventory
- O-037 row 18, Skills, contracts, doctrine claims: each SKILL.md, the lane contract, lane common terms, each CLAUDE.md rule, each ADR claim of what exists
- P-016 row 13, API routes: on file ~2026-09-12 QHF; each route.ts and page.tsx
- P-017 row 5, Governance gates: on file ~2026-10-08 GB; each governance gate and consistency check
- P-018 row 4, Fitness functions: on file ~2026-10-08 GB; each F-id (60 today)
- P-019 row 1, Commit rules: on file ~2026-10-08 GA; each of the 10 rule files
- P-020 row 2, Hooks: on file ~2026-10-08 GA; each git hook step and each Claude Code hook (repo and user level)
- P-021 row 7, CI workflow: on file ~2026-10-08 GB; each job and step of discipline.yml and the other workflows
- P-022 row 8, Chain workflows and hops: on file ~2026-09-04 WIR; each workflow_run edge and dispatch hop
- P-023 row 9, Harness families: on file ~2026-10-08 GB; each harness family
- P-024 row 16, Producers: on file ~2026-09-12 QHF; each producer runtime and the rows it writes

#### COSTS (CO): 5 empty, 4 partial only

- O-038 row 11, RLS and grants: each table by principal by command, each column privilege, each policy
- O-039 row 12, SECURITY DEFINER functions: each function with prosecdef
- O-040 row 10, Migrations and ledger: each migration file, ledger row and live object
- O-041 row 17, Docs and INDEX: each living doc, INDEX line and inventory
- O-042 row 18, Skills, contracts, doctrine claims: each SKILL.md, the lane contract, lane common terms, each CLAUDE.md rule, each ADR claim of what exists
- P-025 row 8, Chain workflows and hops: on file ~2026-08-10 RCI; each workflow_run edge and dispatch hop
- P-026 row 9, Harness families: on file ~2026-10-08 GB; each harness family
- P-027 row 16, Producers: on file ~2026-05-04 CAP; each producer runtime and the rows it writes
- P-028 row 15, Scripts: on file ~2026-08-10 RCI; each file under scripts, src/lib, supabase/seed and root scripts

#### OVERLAPS (OV): 5 empty, 3 partial only

- O-043 row 11, RLS and grants: each table by principal by command, each column privilege, each policy
- O-044 row 12, SECURITY DEFINER functions: each function with prosecdef
- O-045 row 10, Migrations and ledger: each migration file, ledger row and live object
- O-046 row 8, Chain workflows and hops: each workflow_run edge and dispatch hop
- O-047 row 17, Docs and INDEX: each living doc, INDEX line and inventory
- P-029 row 13, API routes: on file ~2026-09-17 SHA; each route.ts and page.tsx
- P-030 row 16, Producers: on file ~2026-09-25 SIW; each producer runtime and the rows it writes
- P-031 row 18, Skills, contracts, doctrine claims: on file ~2026-10-08 GA; each SKILL.md, the lane contract, lane common terms, each CLAUDE.md rule, each ADR claim of what exists

#### EXISTS (EX): 0 empty, 0 partial only

None.

## 4. The rules of an audit

1. An audit declares its lenses and subsystems up front, in its opening lines, using the codes and row numbers of this runbook.
2. A lens the audit did not run is written as owed in the audit itself, never omitted. A declared subsystem with no lens run is a failed audit.
3. Every finding carries a rule-14 token, and the status token names its method. `scripts/verify/audit-finding-status.mjs` enforces the form for files under `docs/audits/`.
4. A mechanism is audited by running it (RUNS), and a guard is audited by attacking it (ATTACKED). A statement that something is wired, enabled or present is an EXISTS or CALLED result and is labeled as one.
5. The auditors are subsystems like any other. Gates, skills, hooks, the lane contract and the doctrine's own claims (rows 1 to 7 and 18) are audited with the same lenses, including the claim that a gate is wired and the claim that a number in an ADR is true.
6. Incident to lens: every surprise the operator finds that an audit should have found adds a lens, a subsystem, or a sharper method to this runbook in the same week, recorded in the ledger below with the evidence. The first four entries are the surprises of 2026-10-08.
7. Outside checklists are imported as lenses or methods when they ask a question this catalogue does not. The first three to import are named below.
8. Every audit PR refreshes the matrix: the docs pass that lands the audit adds its index row and updates the affected cells, and the PR is not complete without it.
9. A fact lane creates nothing but its one output file and proposes nothing (section 5).

### Incident-to-lens ledger

| # | Date | Surprise | What the earlier audits did instead | Lens or subsystem it adds or sharpens | Evidence |
|---|---|---|---|---|---|
| I-1 | 2026-10-08 | Gate friction. Operator, verbatim in ADR-046: "we have a large amount of errant rules and lines of code meant to protect the system but actually cause slow downs and road bumps" and "remove, repair, replace as needed". | A6 and A6b (2026-09-30) read every gate and counted its tests; no audit timed a gate or classified its firings. | COSTS, FIRED-TRUE, OVERLAPS and OPERATOR-SEAT on rows 1 to 7 and 9; the standing requirement of a firing log per gate (ADR-046 doctrine point 6). | GA, GB. [CONFIRMED: GA reports 32 commit-rule firings in 30 days, 9 true positives, 19 false positives, 4 unknown; GB reports 58 fitness-function CI failures, 8 true positives] |
| I-2 | 2026-10-08 (the week's finding: the repo cannot rebuild the database) | The migration files, the ledger and the live objects disagree, so the committed corpus alone does not reproduce the database. | Several audits touched the ledger (CSA, MDI, SES, A5b, DC) and A5 replayed the corpus with a statement parser; CSA (2026-05-15) predicted from reading what `supabase db reset` from a fresh checkout would do. No file in `docs/audits/` records a replay into an empty database [CONFIRMED: grep of `docs/audits` for empty, fresh and clean database and for db reset returns only that prediction]. | RECORD-VS-REALITY on row 10 across files, ledger rows and live objects, and RUNS as a replay of the whole corpus into an empty stack with the ledger compared at the end. | DC section 11. [CONFIRMED: DC reports 112 ledger rows with no stored statements, 36 ledger rows with no file, and 11 files with no ledger row]; ADR-045 [CONFIRMED: states the data layer has never run in apply mode against a real schema] |
| I-3 | 2026-10-08 | User-writable privilege columns: a signed-in user could change their own platform-admin flag, verifier status, tier and score. Closed by migrations 364 (SEC-1, PR 991) and 367 (SEC-2). | A5 recorded `rls_all_tables_enabled: true`; DLC recorded that policies were read as a reference surface, not audited as policies. Both are presence results. | ATTACKED on rows 11 and 12 by principal and column, and the privilege-escalation census imported below. | `docs/ops/session-log.d/2026-10-08-sec2-profile-status-columns.md` [CONFIRMED: states an authenticated user still held column UPDATE on `verifier_status` after migration 364]; A5, DLC |
| I-4 | 2026-10-08 | Lane scope creep. Operator ruling, recorded in rule 4 of the lane common terms: "Why is a lane creating anything not in the build created by you?!" | No audit compared what a lane created with what its brief allowed. | Row 18 gains the dispatch contracts as a subsystem unit; ATTACKED on the contract (does a lane told to create nothing create anything: worktrees, branches, files in the repo or the scratchpad) and OPERATOR-SEAT counts of write-set expansions requested and ungranted edits. | Rule 4 of the lane common terms (2026-10-04 wave) [CONFIRMED: rule text read in full, carries the 2026-10-08 ruling] |

### Imported checklists (first three)

| # | Outside checklist | The question this catalogue did not ask | How it runs | Cells it fills | Last evidence in `docs/audits/` |
|---|---|---|---|---|---|
| X-1 | A standard privilege-escalation census | For every principal (anon, authenticated, PUBLIC, each service role), which tables, columns and functions can it write or execute, and which of those must never be user-writable (admin flags, tier, score, verification, membership)? | Column-level grants from `information_schema.column_privileges` and `role_table_grants`; policy `WITH CHECK` text; for each `SECURITY DEFINER` function, owner, `search_path` and EXECUTE grants; then every privileged column attacked as `authenticated` and `anon` in a rolled-back transaction. | AT, EX, RR on rows 11 and 12; AT on row 13 for admin routes. | None [CONFIRMED: no matching file at f706ee09]. Partial: SIW (2026-09-25) queried grants for one table. |
| X-2 | A standard dead-code tool run (knip or ts-prune, plus depcheck) | Exports with no importer and unused dependencies, over the whole tree, by a tool other than the repo's own import graph. | Run the tool on `fsi-app/src`, `fsi-app/scripts` and `fsi-app/.discipline`; diff its output against the F25 allowlist and the DC counts. | CA on rows 13, 14, 15. | FCA ran ts-prune and depcheck on `fsi-app/src` only (2026-08-09) [CONFIRMED: audit header]. DC states no dead-code tool is in `package.json` or `node_modules` [CONFIRMED: DC gap 1]. |
| X-3 | Standard database hygiene | Do the platform's own advisors, unused or duplicate indexes, foreign keys without indexes, tables without primary keys, and bloat show anything the repo's checks do not? | `get_advisors` for security and for performance; `pg_stat_user_indexes` for unused indexes; catalog queries for unindexed foreign keys and missing primary keys. | EX and CA on rows 10, 11, 12. | SIW (2026-09-25) cites the security advisor inline; A7 (2026-09-30) states no audit cites `get_advisors` as a lane's method [CONFIRMED: A7 lines 89 to 90]. No file cites the performance advisor [CONFIRMED: grep of `docs/audits`]. |

## 5. Fact-lane brief template (one page)

A coordinator fills one of these per owed cell. Replace every angle-bracket field.

```
LANE <ID>: fact lane for <subsystem number and name> x <lens>
Prior decisions: <operator quotes; ADRs; the matrix cell as it stands today>
Base: origin/master <sha>, fetched <time>. Window: <dates>.
Read first, in full: CLAUDE.md, docs/dispatches/lane-common-contract.md, the audits named in
  the cell, and section 1 of docs/runbooks/audit-catalogue.md for this lens.

DECLARE UP FRONT (in the output file's opening lines)
  Lenses run: <this lens>. Lenses not run: all others, written as owed.
  Subsystem: <number, name>. Unit: <from section 2>. Enumerator: <the exact command or query>.

QUESTION: <the lens question from section 1, in one sentence>
METHOD: <the lens method from section 1, with the exact commands, queries or attack
  script names filled in; "read the code" is not a method>
EVIDENCE SHAPE: <from section 1>. Every finding carries [CONFIRMED: method], [HYPOTHESIS]
  or [REFUTED]. A count carries the enumerator that produced it.

CREATE NOTHING. The lane creates exactly one file, <scratch path>/<name>-<date>.md under
  the gitignored scratch path, and nothing else: no scratch worktree, no extra branch, no
  file in the repo or the scratchpad. If the lane needs anything else it stops and reports
  NEEDS WRITE-SET EXPANSION with the file and the reason, and waits. (Lane common terms,
  rule 4; operator ruling 2026-10-08.)
NO PROPOSALS. The file states what is, with tokens. It contains no recommendation, no
  fix design and no "should". Open items are listed as facts with their evidence.
No live writes, no network call beyond read-only git, gh and SELECT-only queries named in
  the method, no sub-agents, no spend.

ACCEPTANCE
  - The member count equals the enumerator's count, and every member appears.
  - Every row carries a status token; a hypothesis is spoken as one in prose too.
  - Owed items are listed with their reason, and nothing is silently dropped.
  - A final line states the matrix cell content to enter: "<date> <ID>" or "~<date> <ID>".

AFTER THE LANE (the coordinator's docs pass, not the lane)
  Land the file under docs/audits/, add its INDEX line, add its row to the index in
  section 3d of this runbook, update the affected cells, and refresh the counts.
```
