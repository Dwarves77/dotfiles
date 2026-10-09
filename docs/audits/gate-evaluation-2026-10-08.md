# Gate evaluation, 2026-10-08

Two read-only fact lanes, landed verbatim as Part A and Part B below. Part A: discipline rules, git hooks, Claude Code hooks and markers. Part B: fitness functions, governance gates, rendering guard and the discipline.yml job set. Every finding carries a rule-14 status token. Machine evidence the parts name (logs, jobs json) lives in gitignored scratch and is not part of this record.

---

# Gate evaluation A: discipline rules, git hooks, Claude Code hooks, markers

Fact lane, read-only. Base: origin/master 5d61fa01 (fetched 2026-10-08 UTC). Window "30d" = 2026-09-08 to 2026-10-08; "90d" = from 2026-07-09.
Status tokens: [CONFIRMED: method] or [HYPOTHESIS]. No recommendations are made in this file.

## 0. Method and limits (read first)

- Source read: every file under fsi-app/.discipline/rules/, manifest.mjs, runner.mjs, lib/context.mjs, lib/predicates.mjs, hooks/*, governance/{memory-gate,docs-only-range,pretooluse-skill-gate,skill-map,worktree-isolation*,skill-token}.mjs, consistency/*, .github/workflows/discipline.yml, .claude/settings.json, .claude/hooks/*, ~/.claude/settings.json and ~/.claude/hooks/pretooluse-fsi-app-scope.mjs. [CONFIRMED: read in full via git archive of origin/master plus the out-of-repo user files]
- CI failure attribution: all 100 failed runs of discipline.yml created in the 30d window (of 954 runs; 805 success, 44 cancelled, 100 failure, 1 startup_failure, 2 action_required, 2 in progress) were attributed by failed job and step through the Actions jobs API, and the failed job logs were scanned for FAIL [rule id], [F-id] violation lines and failing test names. [CONFIRMED: gh api, 100 of 100 runs, not a sample] [NOT-WORK: fact, no action]
- Gate audit log: fsi-app/.discipline/governance/.gate-audit.log (gitignored, main checkout) holds 66,083 PreToolUse decisions since 2026-06-07; 38,231 are in the 30d window. It records tool name and decision only, never the command, so per-decision TP/FP cannot be read from it. [CONFIRMED: read the file] [NOT-WORK: fact, no action]
- NO firing log exists for the commit-msg, pre-commit or pre-push hooks (they print to the terminal only). Local firings below come from session-log narrative (docs/ops/session-log.d/*.md dated >= 2026-09-08 and session-log.md from 2026-09-07) and are therefore a LOWER BOUND; a hook block the author silently fixed without writing it down is invisible. [CONFIRMED: runner.mjs and hooks print to stderr only]
- Timing was done on the main checkout with read-only commands. A temporary GIT_INDEX_FILE (outside the repo) was used to simulate staged sets of 0, 17, 31, 77 and 300 files; the real index and working tree were never touched. An earlier scratch worktree was created for reading and was removed by the coordinator (see section 9, finding on C4). No worktree is left by this lane. [HYPOTHESIS: statement recorded by the source lane, not re-verified at landing] [NOT-WORK: fact, no action]
- Side effect to disclose: three lines were appended to the gitignored .gate-audit.log by my own timing of the PreToolUse shim (payloads for "ls"). [CONFIRMED]

## 1. Inventory counts

- Registered commit rules: 10 (012, 014, 015, 016, 017, 018, 019, 020, 021, 022). Rules 001-011 and 013 were deleted 2026-05-21 ("zero catches in ~23h live", manifest.mjs header: "ceremony rather than enforcement"). [CONFIRMED: manifest.mjs]
- The task text said "rules 001 to 0NN": the directory holds 10 rule files plus 10 test files, 1,301 lines of rule code and 1,264 lines of rule tests; engine and lib 944 lines. [CONFIRMED: wc -l]
- Git hooks installed as trampolines in .git/hooks: pre-commit, commit-msg, pre-push, post-checkout (4). pre-push has 16 labelled steps (0, 0b, 0c, 1, 2, 2b, 2c, 3, 3b, 3c, 3d, 3e, 3f, 3g, 3h, 4); steps 3 through 4 (ten of them) are skipped by default since ADR-040, 2026-10-03. [CONFIRMED: hooks/pre-push, .git/hooks/*]
- Claude Code hooks: in repo .claude/settings.json: SessionStart x2 (vault-sync, session-start-vault), PreCompact x1, SessionEnd x1 (an echo). Out of repo ~/.claude/settings.json: PreToolUse x1 (scope shim, which calls the skill gate). No PostToolUse hook exists anywhere. [CONFIRMED: both settings files]
- Marker/override mechanisms: 6 trailers or markers (Write-Guard-Override, Surface-Decision-Override, Source-Reclassify-Override, Consistency-Override, glyph:verbatim, fitness-allow) plus the "UX compliance" substring. [CONFIRMED: grep of rules and gates]
- Rules that fired at all in 30d (any CI failure or session-log narrative of a block or forced rewrite): 5 of 10 (015, 016, 018, 021, 022). In 90d: 6 of 10 (adds 012: PR #562, 2026-09-04; 018 also fired 2026-07-28). Never fired in 90d: 014, 017, 019, 020. [CONFIRMED: CI logs + grep of session logs; lower bound for local] [NOT-WORK: fact, no action]
- Incident cited in the rule header: dated incident 4 (012: 2026-05-20, 020: 2026-07-17 to 07-20, 021: 2026-08-01, 022: 2026-09-12 manual-check misses); undated incident 3 (016, 018, 019); no incident 3 (014 cites ADR-005 only, 015 cites the operating-mechanism build, 017 cites a red-team finding). [CONFIRMED: rule headers]
- 30d firing ledger across the 10 rules: 32 firings, TRUE POSITIVE 9, FALSE POSITIVE 19, UNKNOWN 4 (per-rule split in section 2).

## 2. Summary table (rules)

Columns: id | protects | decides by | scope of text read | TP/FP/UNK (30d; 90d note) | seconds | overlaps | incident in header

| id | protects (header) | decides | scope | TP/FP/UNK 30d | seconds | overlap | incident |
|---|---|---|---|---|---|---|---|
| 012 | hardcoded user-home path ("REPO_ROOT class issue") | regex on 4 path patterns, per line | WHOLE staged file (9 extensions) | 0/0/0 (90d: FP 1, PR #562 captured EU content) | 0.03 at 77 files | none found | yes 2026-05-20 |
| 014 | inventory consistency (migration 067 orphan) | runs consistency runner (C3/C4/C5) on resulting state | WHOLE TREE state, only when on master and docs/inventories touched | 0/0/0 | ~1.0 when it triggers | same C3/C4/C5 run at pre-push step 2 and CI consistency-backstop | no (ADR-005) |
| 015 | raw row writes outside scripts/lib/db.mjs | lexer-masked receiver-chain analysis (~390 lines) for .update/.upsert/.delete on a Supabase chain | WHOLE staged file under fsi-app/scripts | 0/4/0 (90d adds PR #507 FP) | 0.02 | RD-1 residual, F13, F22 (writes class); skill gate Bash leg | no (operating-mechanism build) |
| 016 | direct Anthropic call outside canonical path | regex (api.anthropic.com, new Anthropic, @anthropic-ai/sdk) per line, comments included | WHOLE staged code file | 0/2/0 | 0.02 | F15 (same regex), F46, F69, SF-8 | yes (undated: source_citations bypass) |
| 017 | raw process.env knob read in generation logic | regex on 6 files + 1 dir | WHOLE staged file | 0/0/0 | 0 | SF-9 | no (red-team finding) |
| 018 | page.tsx outside the five surfaces | route segment allowlist | PATH only (any edit to an unlisted route's page.tsx) | 0/1/1 (90d: TP 1 on 2026-07-28 /coverage) | 0 | skill gate Edit leg (caros-ledge-platform-intent), PI-1 | yes (undated: Technology page) |
| 019 | source-not-item raw-archived | 3 regexes on file text | WHOLE staged script | 0/0/0 | 0.01 | SC-2, migration 135, orphan-source-audit, RD-1 | yes (undated: 25+5 orphans) |
| 020 | writes to the deprecated session-log fork | numstat additions > 0 on one path | ADDED lines only | 0/0/0 | 0 | RD-50, F51 (shared append class) | yes 2026-07-17..20 |
| 021 | stale dashboard cache key | sha1 of DashboardData interface vs key literal | WHOLE file hash (state check) | 2/0/0 | 0 | none found | yes 2026-08-01 |
| 022 | em/en dash and section-sign glyphs in prose | regex on lines from git diff -U0 | ADDED lines, but an edited line counts whole; moved text counts as added | 7/12/3 | 14.3 at 77 files (the dominant cost of commit-msg) | RD-69, lane-contract manual byte check, rendering guard none | yes 2026-09-12 |

Seconds are the in-process time of trigger plus check measured with 77 staged files (section 7). Ratio of FP (30d): 015 4 of 4; 016 2 of 2; 012 1 of 1 (90d, n=1); 022 12 of 22; 018 1 of 2.

## 3. Rule sections

### Rule 012 Hardcoded user-home path
- Protects: "Mechanical content-level check ... rejecting commits that contain hardcoded user-home path strings. The class of bug that produced REPO_ROOT hardcoding". [CONFIRMED: header] [NOT-WORK: fact, no action]
- Decides: HARDCODED_PATH_RE = /C:[\\/]Users[\\/]|\/c\/Users\/|\/home\/jason\/|\/Users\/jason\//; extensions .mjs .ts .tsx .js .json .yml .yaml .sh .sql; exempt path fragments node_modules/, .git/, fsi-app/scripts/tmp/, .claude/settings.local.json, fsi-app/scripts/_snapshots/. [CONFIRMED: source]
- Scope: reads the whole content of every staged code file (ctx.getFileContent), so a pre-existing path string anywhere in a touched file fails the commit. [CONFIRMED: source, getFileContent reads from disk]
- Escape hatches: path exemptions above only; no trailer; git commit --no-verify named in the message. [CONFIRMED]
- Firings: 30d none recorded. 90d: one false positive, PR #562 (2026-09-04), the EU Publications Office's own OJ fmx.xml metadata carried a Windows path inside captured text under scripts/_snapshots, fixed by adding the exemption (header of the rule). FP: the file was verbatim third-party content. [CONFIRMED: rule header]. CI: no rule 012 FAIL appears in any of the 100 failed runs. [CONFIRMED: log scan]
- Time: 0.028 s at 77 files. Overlap: none found in fitness or consistency (grep for the pattern in fitness/ consistency/ governance/ found no other detector). Lane briefs repeat it as boilerplate "No hardcoded user-home paths" in 6 session entries (checklist text, not firings).

### Rule 014 Inventory consistency
- Protects: "Commits modifying docs/inventories/*.md must satisfy the consistency runner (10 C-checks)"; the description says 10 C-checks but the manifest registers 3 (C3, C4, C5). [CONFIRMED: rule description vs consistency/manifest.mjs]
- Decides: spawns the consistency runner and accepts exit 0, or a valid Consistency-Override trailer (rationale non-empty and deadline today or later). [CONFIRMED: override-check.mjs]
- Scope: whole-tree state. Trigger requires ctx.isOnMaster, so it only runs when the branch name is master or main. On a PR job HEAD is detached (branchName null), so it does not trigger in PR CI mode. [CONFIRMED: rule source + context.mjs currentBranch(); the PR-CI conclusion is [HYPOTHESIS] because CI checkout shape for the push job was not inspected]
- Escape hatch: Consistency-Override trailer. Used in 90d: 6 commits mention it; 0 commits carry it as a real trailer line in 30d. [CONFIRMED: git log --grep at line start]
- Firings: 0 in 30d and 90d. Header cites no incident (manifest cites "caught migration 067", May 2026).
- Time: about 1.0 s when it triggers (override-check --prepush measured 1.03 to 1.08 s). Overlap: the identical primitive runs at pre-push step 2 and in CI job consistency-backstop (median 14 s, n=40); three call sites for one check. [CONFIRMED: timing + workflow]

### Rule 015 Row-mutation guarded path
- Protects: writes to existing rows must go through scripts/lib/db.mjs (snapshot plus skill cite). [CONFIRMED: header]
- Decides (after lane RULES-1, PR 977, 2026-10-07): masks comments, strings, templates, regexes, then walks the receiver chain of every .update/.upsert/.delete call and binds names assigned from Supabase factories or .from() chains. Before RULES-1 it was a bare regex over file text. [CONFIRMED: header + session-log.d/2026-10-07-rules1-gate-precision.md]
- Scope: whole staged file under fsi-app/scripts/**/*.mjs except _diag/, lib/, and *.test/npmtest/selftest/golden. A pre-existing raw write fails the commit when any other line of the file is edited. Known stated limit: a write through a function parameter named oddly passes. [CONFIRMED: source]
- Escape hatches: GUARDED_IMPORT_RE (any mention of lib/db.mjs, guardedUpdate, guardedUpsert, guardedDelete, archiveRows anywhere in the file silences the whole file); Write-Guard-Override: trailer, accepted with ANY text after the prefix (startsWith check), covering every file in the commit. [CONFIRMED: source, predicates.commitMessageLines]
- Firings 30d, all FP:
  1. 2026-09-21 PR #769: scripts/maintenance/lib/vocab-inventory.mjs, map.delete(...) on a JS Map; resolved with a Write-Guard-Override trailer stating it is Map.prototype.delete. FP. [CONFIRMED: git log trailer text]
  2. 2026-10-07 proof1-stack-and-replay: crypto.hash call in export-local-harness-runs.mjs rewritten to avoid the rule. FP. [CONFIRMED: session-log.d/2026-10-07-proof1-stack-and-replay.md]
  3. 2026-10-07 proof2-subset: same, "worked around here with crypto.hash". FP. [CONFIRMED: session log]
  4. 2026-10-07 g5-search: "Rule 015 false positive on a hash call was fixed at the rule (RULES-1, PR 977)". FP. [CONFIRMED: session log]
  Header states "three lanes on 2026-10-07 rewrote correct code to dodge it". 90d adds PR #507 (2026-09-01) test file FP (header). No true positive is recorded anywhere in the logs read.
- CI: lane/rules1-gate-precision failed its own 015 test (run 37705267764), a change to the gate, not a firing.
- Time: 0.015 s at 77 files. Overlap: partial with F13 (insert into intelligence_items), F22 (insert into sources), RD-1 residual, and the PreToolUse Bash leg (ops regexes in skill-map.mjs include /\.delete\s*\(/ and /is_archived/ at tool-call time). [CONFIRMED: skill-map.mjs, F13/F22 headers]

### Rule 016 Canonical Anthropic path
- Protects: direct Anthropic calls only in the permitted wrappers; "the exact bypass that caused source_citations to never populate". [CONFIRMED: header] [NOT-WORK: fact, no action]
- Decides: per-line regex /api\.anthropic\.com|new\s+Anthropic\s*\(|anthropic\.messages\.create|@anthropic-ai\/sdk/ with no comment or string masking. PERMITTED list of 11 path prefixes. [CONFIRMED: source]
- Scope: whole staged .ts/.tsx/.mjs/.js file outside .discipline/, _diag/ and the list. [CONFIRMED]
- Escape: edit the PERMITTED list in the rule (done 2026-09-17), or --no-verify. No trailer. [CONFIRMED]
- Firings 30d, both FP:
  1. 2026-09-17 lane L35: the new one-home sweep test contains the host string by design (it enforces F46); fixed by adding anthropic-stream.test.mjs to PERMITTED. FP. [CONFIRMED: session-log.md line 122]
  2. 2026-10-02 lane L8: backfill-themes.mjs and model-ids.mjs comments spelled out "@anthropic-ai/sdk"; "rule 016 content-matches comments and code alike, it does not distinguish"; comments reworded. FP. [CONFIRMED: session-log.d/2026-10-02-l8.md]
- Time: 0.02 s. Overlap: F15 holds an equivalent regex (DIRECT_API_RE has the same three tokens plus x-api-key) with a different allowlist (SANCTIONED 2 entries plus a shrinking allowlist, versus rule 016 PERMITTED 11 entries); F69 gates model-id literals; F46 gates the host string; SF-8 invariant cites it. Four detectors of one class with two allowlists. [CONFIRMED: both sources read]

### Rule 017 Generation config no raw env
- Protects: tuning knobs read inline from process.env change generation behaviour with no reviewable diff ("red-team Finding 1"). [CONFIRMED: header]
- Decides: regex for process.env.NAME on lines of 5 named files plus src/lib/agent/formats/*.ts; credential-shaped names exempt by regex. Scope: whole file. Escape: none besides editing generation-config.ts or --no-verify. [CONFIRMED]
- Firings: 0 in 90d. Time 0. Overlap: SF-9 invariant restates it. Incident: a red-team finding, no production incident. A comment in the rule records it already produced one false positive in CI (credential reads) that was fixed by the credential exemption (undated). [CONFIRMED: header comment]

### Rule 018 No surface outside the five-surface model
- Protects: no customer page.tsx outside Regulations, Market, Research, Operations, Community plus plumbing ("the Technology-page catch"). [CONFIRMED]
- Decides: top route segment of any staged src/app/**/page.tsx against an ALLOWED_SEGMENTS set of 18 entries. Deleted pages skipped by content absence. [CONFIRMED]
- Scope: path level, so any edit to an existing page whose segment is not in the set fires, even though the route predates the rule. [CONFIRMED: rule source; evidence below]
- Escape: Surface-Decision-Override: trailer with any text; used once in 30d (PR #769, 2026-09-21, citing operator ruling 2 of 2026-09-20). [CONFIRMED: git log]
- Firings: 2026-09-07: rule fired on /settings, /watchlist, /privacy (existing, operator-authorized; allowlist entries added: "operator ruling 2026-09-07: authorized surface ... predates the rule"). FP (1 episode, 3 entries). 2026-09-21: /search new route; the lane had to add the override trailer although the operator had already ruled (UNKNOWN: a real new route needing a recorded authorization, but already authorized). 90d: 2026-07-28 B1 Coverage Index first built as standalone /coverage route and rule 018 "correctly" stopped it (TP; session-log.md line 2070). [CONFIRMED: session logs]
- Time 0. Overlap: skill gate Edit leg maps all of fsi-app/src/app/ to caros-ledge-platform-intent (so the same edit demands the skill at tool time and the allowlist at commit time).

### Rule 019 Source-not-item reclassified
- Protects: "the EXACT error the operator corrected: a script archived 5 portals (and 25 earlier ones) ... without registering them". [CONFIRMED: header]
- Decides: three regexes on whole file text (source-y archive_reason literal, an archive call, absence of reclassifyToSource). Scope: whole staged fsi-app/scripts/**/*.mjs except _diag/ and lib/ (note: test files are NOT excluded here, unlike 015). Escape: Source-Reclassify-Override trailer (0 in 30d; 1 commit mentions it in 90d). [CONFIRMED]
- Firings: 0 in 90d. Overlap: SC-2 invariant names three layers (this rule, migration 135 DB guard, orphan-source-audit live scan). [CONFIRMED: invariant residual text] [NOT-WORK: fact, no action]

### Rule 020 Deprecated session-log fork is frozen
- Protects: four recorded writes to fsi-app/docs/ops/session-log.md between 2026-07-17 and 07-20. [CONFIRMED: header]
- Decides: numstat additions > 0 on exactly one path. Scope: added lines only (the one rule with true new-lines behaviour via numstat). Escape: none besides --no-verify. [CONFIRMED]
- Firings: 0 since creation (2026-07-20). Overlap: RD-50 invariant; the per-lane session-log.d/ files (D28, 2026-09-13) removed the shared-file conflicts in the live log. F51 holds the shared-append class.

### Rule 021 Dashboard cache key carries the shape hash
- Protects: the SSR crash of / on 2026-08-01 (digest 2552218741) from a shape change without a cache-key bump. [CONFIRMED: header]
- Decides: sha1[0:8] of the normalized `export interface DashboardData` block compared with DASHBOARD_DATA_CACHE_KEY; data.ts must not inline "app-data-". Scope: hashes the whole file state whenever supabase-server.ts or data.ts is staged. Stated limit: nested types are invisible to it. Escape: none (the message prints the exact new key). [CONFIRMED]
- Firings 30d, both TP: CI run 34276036475 (train/wave62, 2026-09-08) key app-data-7b3d90e4 versus computed app-data-e1ae7713 after a payload change; and the fold-63B re-rotation the next day ("rule 021 requires"). Each fix was a one-line key edit. [CONFIRMED: CI log + session-log.md lines 3914 and 4351]
- Time 0. Overlap: none found.

### Rule 022 No dash/section-sign glyphs in added prose
- Protects (header): the check "lived only in the coordinator's dispatch text ... and as a byte count the coordinator ran by hand", with 7, 36 and 4 glyphs added in three tasks. The defect class is house style; no functional defect is cited. [CONFIRMED: header] [NOT-WORK: fact, no action]
- Decides: for each staged file, git diff -U0 (git show -U0 in CI per commit; one cumulative git diff for the whole range), regex [\u2014\u2013\u00A7] on each added line; skip lines containing the literal marker glyph:verbatim. [CONFIRMED: rule + context.mjs]
- Scope: ADDED lines. Because -U0 reports a modified line as removed plus added, an edited line carrying a pre-existing glyph fails; text moved or split into new files counts as wholly added. Exempt paths: record-briefs/batches, any directory named fixtures, docs/archive/, the delivered files of a dated design-handoff bundle. [CONFIRMED: source + firings below]
- Escape hatches: the glyph:verbatim marker on the same line (1,036 occurrences in 220 files on master: 683 in docs/audits, 234 in fsi-app/.discipline, 42 in fsi-app/src, 24 in fsi-app/scripts, 19 in docs/design; 31 commits added it since the rule landed 2026-09-12); path exemptions; --no-verify. [CONFIRMED: git grep -c, git log -S]
- Cost: the rule computes offendingLines() in trigger() and again in check(), and each call spawns one `git diff --cached -U0 -- <path>` per staged file, so commit-msg time is about 0.15 s per staged file times two. [CONFIRMED: in-process profile, section 7]
- Firings (30d): 22 events.
  - CI (7 runs): 36217460080 master push 2026-09-26, a literal glyph in Absence.tsx that the PR-time per-commit union missed: TP (style only). 36321392594 (lane/master-022-fix, 09-27, file generate-theme-brief.mjs): UNKNOWN. 35175975551 (09-17, scripts/harness-runs/brief-apply/brief-apply-run-004.json, a machine-emitted run record): FP. 36959645434 (10-02, 8 lines in flag-namespaces.test.mjs and seek-more.test.mjs, files unrelated to an audit relabel branch), 36961482489 (10-02, 5,066 lines in docs/audits/BRIEF-STRUCTURE-AUDIT.md), 36971166947 (10-02, 10,609 lines in scripts/_diag snapshots): FP, the two-dot range defect fixed by lane R23 the same day ("111 inherited em dashes in a file never touched locally", runner.mjs header); the PR-number mapping to #866/#869 is not verified. 36967440894 (10-02, 2 lines in seed-derived-values.test.mjs): UNKNOWN. [CONFIRMED: job logs; classification of the three range-defect runs rests on the impossible line counts plus the R23 header]
  - Local narrative (15 events): TP (author wrote a new glyph, style only): w10a 09-18, g4 09-22, state-cost-producer 09-26, w2c 09-29, l8 10-02 (section sign), proof1 10-07. UNKNOWN: g3 09-22. FP (pre-existing, moved, generated or verbatim text): n5 09-19 (data glyph in a table cell needed its own mechanism), r22 09-20 (205 lines in the operator's delivered design canvas, led to a new path exemption), lint-a 10-02 (one pre-existing em dash on a line touched only for an apostrophe escape), lint-c 10-02 (two, same cause), r45 10-01 (verbatim glyphs needed the marker), rb-split 10-04 (591 em dashes, 1 en dash, 3 double and 72 single section signs rewritten across 66 moved runbook files), trustret 10-07 (two pre-existing em dashes on lines edited in secrets-registry.mjs, "coordinator ruling"), build-mode-pause 10-08 (the layout-guard generator itself writes an em dash into audit element names; "Generator fix owed"). [CONFIRMED: each from the named session-log.d file]
  - Totals 30d: TP 7, FP 12, UNKNOWN 3. FP ratio 55%.
- Overlap: RD-69 invariant; the lane contract still tells lanes to run a manual byte check in places; and the rule runs three times per change (commit-msg, pre-push 2c per commit plus whole range, CI validate-commits per commit plus whole range). [CONFIRMED: hooks/pre-push, discipline.yml, runner.mjs]

## 4. Git hooks

### H1 pre-commit (worktree isolation, RD-19)
- Protects: an orchestrator or agent commit landing in the main checkout on an agent-owned branch ("the corrupted state from the incident"). Decides: git rev-parse for git-dir, common-dir, branch, plus env CLAUDE_CODE_CHILD_SESSION; blocks if main checkout and (agent context or agent-owned branch name). Scope: every commit, all files irrelevant. [CONFIRMED: governance/worktree-isolation.mjs]
- Time: 0.46 to 0.48 s (3 runs, includes sh, git x3 and node start). [CONFIRMED: timing] It returned exit 1 for this lane's own timing run because this sub-agent runs with the child-session marker in the main checkout: correct by design.
- Firings: 30d none narrated. UNKNOWN locally. Overlap: three legs for one doctrine: PreToolUse Bash ask, post-checkout alarm, this block (the code calls it belt and suspenders).

### H2 commit-msg (discipline engine, the 10 rules)
- Time: 0.52 s with nothing staged; 2.0 s at 17 files; 3.2 s at 31; 12.5 s at 77; 46.7 s at 300 (each 2 to 3 runs). [CONFIRMED: timing] Profile at 77 files: context build 0.2 s, rules 012/015/016/019 under 0.03 s each, rule 022 trigger 6.7 s plus check 7.6 s. [CONFIRMED: in-process profile]
- Distribution: the 366 squash commits on master in 30d changed median 8, p75 18, p90 32, max 1,292 files; 1,614 non-merge commits exist across all branches in 30d. [CONFIRMED: git log --name-only]

### H3 post-checkout
- Fires on every branch checkout and git worktree add: links fsi-app/node_modules for the worktree (wt_nm_ensure_link, 253-line library) and runs the isolation alarm. It printed a warning when this lane ran `git worktree add` outside .claude/worktrees ("create worktrees there"). Time: not measured because wt_nm_ensure_link can write a link: [HYPOTHESIS] 0.5 to 1 s (sh, two node launches). Firings: none recorded.

### H4 pre-push (default path, steps 0 to 2c)
- Step 0 trampoline guard (stale copy refuses with "STEP 0 FAIL"), 1 mention in logs. 0b dependency resolve 0.14 s. 0c docs-only classifier 0.33 s. 1 untracked critical files 0.20 s. 2 consistency runner override-aware 1.03 to 1.08 s. 2b memory gate 0.43 s (1 commit range) to 1.11 s (8 commits). 2c runner.mjs --mode=ci: 5.2 s for one commit of 17 files; 25.2 s for an 8-commit range of 125 files (per-commit walk plus a whole-range pass, both dominated by rule 022). [CONFIRMED: timing, each read-only against explicit ranges] [NOT-WORK: fact, no action]
- Total default push: about 7.4 s (1 commit) to 28.1 s (8 commits) plus trampoline overhead 0.1 s. [CONFIRMED: sum of measured components; real pre-push not executed because it can create a node_modules link]
- Steps 3 to 4 (test suite, meta-gates, lint, fitness, npmtest, goldens, closure, tsc) are skipped unless DISCIPLINE_PREPUSH_FULL=1. ADR-040 (2026-10-03): "10-20 minutes per push on Windows"; session-log 2026-09-22 measured 30 to 45 minutes per lane; the opt-in is not timed here. [CONFIRMED: ADR text and session log]
- The lane contract (docs/dispatches/lane-common-contract.md, Wiring preflight step 1) still describes running the push gate as "the full discipline and fitness suite", which the hook now skips by default. [CONFIRMED: text vs pre-push line 261]
- Firings: step 1 (untracked), step 2, 2c: no recorded failure in 30d. 2b: no recorded local failure in 30d; the memory/UX gates failed in CI 3 times, all 2026-09-09 to 09-12 (runs 34380538063 UX gate; 34662169223 and 34716733871 memory gate), before session-log.d (D28, 09-13) existed: TP (procedural: no session-log entry); no CI failure of either gate since. [CONFIRMED: CI logs]

### H5 Memory gate and UX-compliance gate (pre-push 2b and CI validate-commits)
- Protects: "code must not outrun the vault". Decides: CODE = changed paths under fsi-app/{src,supabase/migrations,scripts,.discipline}/ (minus harness-runs, LAST-TURN.json, record-briefs batches); MEMORY = docs/ops/session-log.md, docs/PROGRAM-BOARD.md or docs/ops/session-log.d/YYYY-MM-DD-slug.md; SURFACE = fsi-app/src/**/*.tsx|css; UX gate passes if any ADDED line of the session-log diff matches /^\+.*UX compliance/. [CONFIRMED: memory-gate.mjs]
- The UX gate is a substring match, not a check of any content (5e3ae41 "ceremony rather than enforcement" lesson stated in the manifest). Of 209 session-log.d files dated since 09-08, 113 contain "UX compliance" and 15 lines in the 30d corpus are "not applicable" variants; 79 of 366 master commits touched .tsx or .css; 270 touched memory-gate CODE paths. [CONFIRMED: grep and git log counts]

### H6 consistency runner C3/C4/C5 (pre-push 2, CI consistency-backstop, rule 014)
- C4 decides from `git worktree list --porcelain` against docs/inventories/worktrees.md; only three path conventions are exempt (/.worktrees/, /.claude/worktrees/, /work/lanes/). [CONFIRMED: C4 source]
- Finding on C4's scope, per the coordinator request: C4 counts any worktree anywhere on the machine, including a scratch one outside those three paths, as drift; the worktree list is machine-global (shared .git), so one stray worktree fails pre-push step 2 for every lane on that machine, and CI cannot see it because CI has one checkout. The coordinator reported exactly this on 2026-10-08 for this lane's scratch worktree. [CONFIRMED: C4 source + coordinator report; CI-cannot-see is [HYPOTHESIS] from the CI checkout shape]
- History: session-log.md records "C4, fixed rather than recorded for the tenth time" (work/lanes/ convention missing from the exempt list), C4 fixes on 2026-07-18 (two commits) and "known C4 artefact" lines on four other occasions. [CONFIRMED: session-log.md lines 248, 454, 606, 737, 1085; git log]
- CI: the consistency-backstop job recorded no failure among the 100 failed runs. [CONFIRMED: log scan]

## 5. Claude Code hooks

### P1 PreToolUse scope shim (~/.claude/hooks/pretooluse-fsi-app-scope.mjs, out of repo)
- Matcher: ^(Bash|Edit|Write|MultiEdit|NotebookEdit|Agent|Task|Workflow|mcp__.+)$ , so every Bash call, every file write and every MCP tool call. Scope regex /[\\/]fsi-app(?![\w-])/ on the file path (edits) or on cwd or command text (Bash). Out of scope it returns permissionDecision "allow" (which also skips the permission prompt for that call). [CONFIRMED: source + settings]
- Time: 0.23 s per in-scope call (3 runs: 227, 233, 260 ms) because the shim spawns the gate as a second node process; 0.14 s out of scope. 38,231 gated decisions in 30d times 0.23 s is about 8,800 s (2.4 hours) of added latency. [CONFIRMED: timing x log count]

### P2 PreToolUse skill gate (governance/pretooluse-skill-gate.mjs, 218 lines, plus skill-map, skill-token, agent-transcript)
- Protects (header): "skills must be USED before you can write code", for actions with no commit yet (applies, governed-file edits, MCP writes). Decides by: Bash command text matched against a DANGER regex (--apply, --execute, --write, b2-runner, git push, rm -rf, drop table|column, truncate, delete from, set not null, add constraint, update intelligence_items, update sources, set provenance_status, supabase db reset|push, run-migration, exec_sql, seed/apply-); file path prefix lookup in skill-map.mjs for Edit/Write; tool-name regex for MCP; plus the acting agent's transcript searched for a Skill tool_use. [CONFIRMED: source]
- Decision counts, 30d (38,231): allow 35,972 (bash-read 27,606; edit-ungoverned 7,031; edit-governed-ok 1,310; mcp-read and other 25); ask 1,892 (worktree-isolation 1,094; bash-write-ok 314; dispatch 202; mcp-write-ok 169; skillunresolvable 107; unparseable/empty 6); deny 367 (edit-governed-skillmissing 170; bash-write-skillmissing 105; mcp-write-skillmissing 45; mcp-write-notranscript 35; edit-governed-notranscript 12). [CONFIRMED: audit log]
- Classification:
  - 367 denies: the "skill missing" 320 are the gate working as designed (the write was attempted before a Skill invocation); no case in the logs shows a deny that prevented a code or data defect: UNKNOWN as defect prevention. The 47 "notranscript" denies are a gate infrastructure condition (no readable transcript) refused as a write: FP in effect (the gate code treats no transcript as deny). [CONFIRMED: gate source; defect-prevention is UNKNOWN]
  - 107 "skillunresolvable" asks: the gate's own header says the demand is unsatisfiable in that session and downgrades to a human prompt: FP by construction. [CONFIRMED: source comment]
  - 202 "dispatch" asks (+10 Workflow, 3 Task counted within): every Agent/Task/Workflow call asks; the source comment states the gate "cannot inspect what the sub-agent will do". Never denies. [CONFIRMED] [NOT-WORK: fact, no action]
  - 1,094 "worktree-isolation" asks: isBranchingGitCommand matches git merge-base, git branch --show-current, git branch -a, git branch --list, git checkout -- file, git rebase --abort, git switch (tested: all true). So read-only commands prompt. Share of the 1,094 that were read-only is UNKNOWN (the log keeps no command). [CONFIRMED: function run on 16 sample commands; share is [HYPOTHESIS]]
  - DANGER regex matches anywhere in the command text: tested true for `git commit -m "fix truncate bug"`, `echo truncated`, `grep -rn "git push" docs`, `git log --grep="rm -rf"`, and a heredoc containing those strings. This lane's own read-only `cat > file <<EOF` command was DENIED during this task for that reason ("Missing: remediation-discipline") because the heredoc text contained them. [CONFIRMED: regex run on real gate source; live deny observed]
  - MCP read/write is classified by tool-name regex: query_logs (8 decisions), list_deployments and list_deployment_events (2), mark_chapter (4: 3 deny, 1 ask), Claude_Browser navigate (1 deny) and terminal stop_terminal_tab (1 deny) are classed as writes. Tested: list_deployments, list_deployment_events, query_logs, mark_chapter, navigate, list_comments, browser_batch, find, computer all gate as writes. 16 clear misclassifications in 30d. [CONFIRMED: log tool names x regex]
  - Lower-bound FP in 30d: 47 notranscript + 107 unresolvable + 16 MCP misclassified = 170 of 2,259 non-allow decisions (7.5%), before the unknown read-only share of the 1,094 worktree asks. [CONFIRMED: arithmetic on counts above]
- Evidence of a legitimate deny: 2026-09-19 lane M3 (8 Edit and 3 Write denies of scripts/turns/ edits); the coordinator ruled the lane's "misfire" label REFUTED because skill-map.mjs does govern that path (session-log.md line 11107). The same episode produced lane G1 (gate changed to read the acting agent's own transcript) and a stale "does not fire in sub-agents" claim REFUTED. [CONFIRMED: session logs]
- Not in the repo: the hook registration lives in ~/.claude/settings.json; the in-repo check that it is wired (check-pretooluse-wired.mjs, pre-push step 3c) only runs when DISCIPLINE_PREPUSH_FULL=1. [CONFIRMED: pre-push lines 261-320]

### P3 SessionStart / PreCompact / SessionEnd (in-repo .claude/settings.json)
- vault-sync.mjs runs `git fetch --quiet origin` then `git merge --ff-only` on the operator checkout at every session start (startup, resume, clear, compact, fork). fetch measured 1.3 s on an up-to-date repo. session-start-vault.mjs makes 3 git calls and prints the read path into context; pre-compact-snapshot.mjs writes a file. SessionEnd prints a fixed reminder string. No firings or failures recorded. Wall time: vault-sync [CONFIRMED 1.3 s fetch], others [HYPOTHESIS] 0.2 to 0.4 s each. [CONFIRMED: source; timing of fetch only]

## 6. Marker and override mechanisms

| mechanism | accepted by | validation | scope | use in 30d | note |
|---|---|---|---|---|---|
| Write-Guard-Override: | rule 015 | line starts with prefix; any or empty text | whole commit, all files | 1 (PR #769, FP justification) | no per-file or expiry |
| Surface-Decision-Override: | rule 018 | same | whole commit | 1 (PR #769) | |
| Source-Reclassify-Override: | rule 019 | same | whole commit | 0 | |
| Consistency-Override: | rule 014, pre-push 2, CI backstop | regex, rationale non-empty, deadline today or later | per C-check | 0 real trailers | only validated override |
| glyph:verbatim | rule 022 | literal substring on the same line | per line | 31 commits added it; 1,036 lines in tree | 683 of them in docs/audits, mostly bulk-stamped on existing audit lines |
| fitness-allow: F<n> (reason) | 20+ fitness functions via isOverridden() | regex needs non-empty parenthetical | per line | 271 lines in 128 files (F39 134, F42 10, F38 4, F43 3, F6 1, F22 1 in src and scripts) | |
| "UX compliance" substring | memory-gate UX check | /^\+.*UX compliance/ on added session-log lines | per range | 113 of 209 session-log.d files contain it | attestation, not content |
| git commit --no-verify / git push --no-verify | all hooks | none | everything | no use found; 31 session lines state "no --no-verify" | |
[CONFIRMED: git grep, git log, source for each row]

## 7. Timing table (all measured on this machine, 2026-10-07 evening)

| item | seconds | method |
|---|---|---|
| node start | 0.14 to 0.17 | 3 runs |
| pre-commit | 0.46 to 0.48 | 3 runs |
| commit-msg, 0 staged | 0.52 to 0.54 | 3 runs |
| commit-msg, 17 files | 2.0 to 2.1 | 2 runs, GIT_INDEX_FILE simulation |
| commit-msg, 31 files | 3.1 to 3.2 | 2 runs |
| commit-msg, 77 files | 11.9 to 13.3 | 2 runs (rule 022 7.6 + 6.7 of this in-process) |
| commit-msg, 300 files | 46.6 to 46.8 | 2 runs |
| pre-push step 0b | 0.14 | 1 run |
| pre-push 0c docs-only | 0.33 | 2 ranges |
| pre-push 1 untracked | 0.20 | 1 run |
| pre-push 2 consistency | 1.03 to 1.08 | 2 runs |
| pre-push 2b memory gate | 0.43 (1 commit), 1.11 (8 commits) | explicit ranges |
| pre-push 2c rules CI mode | 5.2 (1 commit, 17 files), 25.2 (8 commits, 125 files) | explicit ranges |
| PreToolUse shim in scope | 0.23 | 3 runs |
| SessionStart git fetch | 1.3 | 1 run |
| CI jobs (PR runs, n=40, median) | unit tests 228 s, rendering guard 392 s (non-blocking), fitness 154 s, validate-commits 15 s, consistency 14 s | Actions jobs API |

Per commit (pre-commit + commit-msg): about 1.0 s with nothing staged, about 2.5 s at 17 files, about 3.7 s at 31 files, about 13 s at 77. Per default push: about 7.4 s (1 commit) to about 28 s (8 commits). Opt-in full push: 10 to 45 minutes per ADR-040 and the 2026-09-22 session log. [CONFIRMED: sums of measured parts]
Typical branch commit at the master median of 8 files: about 1.3 s for commit-msg by interpolation [HYPOTHESIS].

## 8. CI failure attribution (100 of 100 failed runs, 30d)

- Runs: 954 (event pull_request 583, push 371); failure 100 (96 PR, 4 push); first run 2026-09-08, last 2026-10-08.
- Failed step counts (a run can fail more than one job): Discipline engine unit tests / Run discipline test suite 64 runs; Fitness functions / Run fitness functions 47; ESLint 8; npmtest 4 (3 + 1); actionlint 4; Validate commits / discipline engine (PR) 7 (rule 022 x6, rule 021 x1); (push to master) 1 (rule 022); Memory gate step 3 (2 memory, 1 UX); rendering guard 2; goldens 1. [CONFIRMED: jobs API] [NOT-WORK: fact, no action]
- Runs attributable to the Scope A rules and gates: 11 of 100 (rule 022 x7, rule 021 x1, memory gate x2, UX gate x1). The other 89 are test, fitness, lint and workflow failures (Scope B).
- Fitness-function ids in failed fitness runs: F51 14, F28 12, F25 10, F23 6, F45 5, F39 5, F42 2, F48 1, F65 1, F68 1, F9 1. [CONFIRMED]
- Overlap between the unit-test step and the fitness-runner step: 35 runs failed both steps; 47 runs had a failing "LIVE/live tree" test inside the unit-test suite that re-runs a fitness function against the tree (top names: "check 5 (Amendment 2) wired to the live tree" 17 runs, "F28 passes GREEN against the live tree" 12, "LIVE ratchet (plan 6.8 Rule B)" 5, "check 5 (lane F51c) LIVE-TREE PROOF" 6, "the whole scoped tree passes F39" 6, "STANDING GATE, real clock, real baseline.json: the renewal warning" 3 which depends on the calendar). [CONFIRMED: test names from failed job logs] [NOT-WORK: fact, no action]
- Per-run table of the 100 runs (id, date, branch, failed steps, test names) is saved at C:/Users/jason/AppData/Local/Temp/claude/C--Users-jason-dotfiles/53f591a2-7a98-48fe-af76-1a6e857e2041/scratchpad/fail_table.txt.

## 9. Overlaps (same defect class checked more than once)

1. The 10 rules run at commit-msg, again at pre-push 2c (per commit plus whole range), again in CI validate-commits (per commit plus whole range). [CONFIRMED: hooks/pre-push, discipline.yml, runner.mjs]
2. C3/C4/C5: rule 014, pre-push step 2, CI consistency-backstop, one primitive (override-check.mjs) at three sites.
3. Memory/UX gate: pre-push 2b and CI validate-commits run the same script.
4. Rule 016 and F15 (same regex, two allowlists), plus F69 and F46 and invariant SF-8.
5. Rule 015 and RD-1, F13, F22, and the PreToolUse Bash ops regexes (skill-map.mjs), same "guarded write" class at tool time, commit time and CI.
6. Rule 018 and the Edit leg of the skill gate (fsi-app/src/app/ maps to caros-ledge-platform-intent) and invariant PI-1.
7. Rule 019 and SC-2 (migration 135 and orphan-source-audit); rule 020 and RD-50/F51; rule 017 and SF-9; rule 022 and RD-69. [HYPOTHESIS: statement recorded by the source lane, not re-verified at landing]
8. RD-19 worktree isolation: PreToolUse ask, post-checkout alarm, pre-commit block.
9. Unit-test suite versus fitness runner live-tree tests (section 8).
10. skill-map.mjs is consumed by both the action-time gate and rules 015 and 019 (one table, two enforcement times).

## 10. Rules (and gates) that fire on PRE-EXISTING text when a different part of the file or an adjacent line is edited

- 012, 015, 016, 017, 019: read the whole staged file, so any untouched line in the file can fail the commit. [CONFIRMED: getFileContent usage]
- 018: path level; editing any existing page.tsx under an unlisted route fires (the 2026-09-07 /settings, /watchlist, /privacy episode). [CONFIRMED]
- 021: state check when supabase-server.ts or data.ts is staged.
- 014: whole-tree state on master.
- 022: edited lines with a pre-existing glyph (lint-a, lint-c, trustret), moved or split text (rb-split, 664 glyphs), and range-computation inheritance (the 10-02 CI runs, fixed by R23). [CONFIRMED: session logs]
- 020 is the only rule that reads additions only without an edited-line effect.
- Memory gate and UX gate: range-level, not text.

## 11. Facts the coordinator asked to be recorded

- C4 counts any worktree anywhere on the machine, including scratch ones outside .worktrees/, .claude/worktrees/ and work/lanes/, as drift (section 4, H6). [CONFIRMED: C4 source + coordinator report]
- No firing log exists for the git hooks; only the PreToolUse gate keeps an audit log, and it omits the command text (section 0).
- The 30d firing ledger is a lower bound for local firings (section 0). [NOT-WORK: fact, no action]

---

# Gate evaluation B: fitness functions, governance gates, rendering guard, discipline.yml (read-only fact lane)

Read at origin/master 5d61fa01 (2026-10-08). Window: 2026-09-08 to 2026-10-08. Every statement carries a status token.
Machine evidence (logs, jobs json, scripts) is in fsi-app/scripts/tmp/gateB/ (gitignored): runs.json, logs/, jobs/, failed-summary.json, fitness-timing.json.

## 0. Method and limits

- [CONFIRMED: gh run list --workflow discipline.yml --created ">=2026-09-08", 953 runs] 583 pull_request, 370 push (master), 0 other. 100 concluded `failure` (96 PR, 4 push), 44 cancelled, 5 other.
- [CONFIRMED: gh run view --log-failed for ALL 100 failed runs, 301 jobs.json fetched (all 100 failures plus every 4th success)] Every failed run was examined, not a sample. Job and step timings come from the 301 jobs.json (failures over-represented; medians quoted are over that set).
- Firing = a gate printed `FAIL [Fn]` (fitness runner) or a named step/test failed in a failed run. Firings seen only locally (pre-commit, pre-push, PreToolUse) are NOT in the CI counts unless stated. [HYPOTHESIS: statement recorded by the source lane, not re-verified at landing] [NOT-WORK: fact, no action]
- Classification evidence: the violation text in the log, the lane's own session-log.d entry (docs/ops/session-log.d, 209 files), and for F51 a dry merge (see section 3).
- Not measured: local pre-push duration, per-function CI seconds (the runner prints one step time, 27 s median; per-function times below are local Windows ms).

## 1. Headline counts

- [CONFIRMED: fitness-timing.json, runner `--list`] 60 fitness functions registered (F2..F69 with gaps: no F1,3,4,5,7,29,53,55,56 files; F65 exists; F66 to F69 exist). 60 .mjs files (F65 is no-bracket-path-tests; its name hid it from a `grep -v test` listing).
- [CONFIRMED: log scan] 47 of 100 failed runs failed the "Run fitness functions" step. 58 function-failures in those 47 runs across 11 functions. The other 49 functions: zero CI firings in 30 days.
- Classification of the 58 function-failures: TP 8, FP 4, PROCESS 40, UNKNOWN 6. By function: F51 14 PROCESS; F28 12 PROCESS; F25 1 TP, 7 PROCESS, 2 UNK; F23 1 FP, 5 PROCESS; F39 3 FP, 2 UNK; F45 3 TP, 1 PROCESS, 1 UNK; F42 1 TP, 1 UNK; F9 1 TP; F48 1 TP; F68 1 TP; F65 1 PROCESS.
- [CONFIRMED] Failed-run job steps (100 runs): Discipline "Run discipline test suite" 64; Fitness "Run fitness functions" 47; Fitness ESLint 8; Fitness npmtests 4; Fitness actionlint 4; Fitness goldens 1; Validate commits 11 (rule 022 7, memory gate 3 incl. 1 UX gate, rule 021 1); Rendering guard 3 (non-blocking).
- [CONFIRMED: jobs json] CI cost per PR run, post-2026-10-02 10:50 UTC (PR #875) medians: Validate 15 s, Consistency 14 s, Discipline unit tests job 218 s, Fitness job 115 s, Rendering guard 295 s. Sum 657 job-seconds (10.9 job-minutes); blocking wall clock 218 s (3.6 min); with rendering guard 295 s. Before #875: sum 414 s, blocking wall 88 s.
- [CONFIRMED: estimate = run counts x sampled means] about 7,850 job-minutes over the 953 runs in 30 days; failed runs consumed 924 job-minutes (11.8 percent); 370 master-push runs (38 percent of minutes) re-run the same checks on the already-merged content.
- [CONFIRMED: gh run list] 376 PR branches, 583 PR runs, mean 1.55 runs per branch, max 14. PR run failure rate 16.5 percent (96 of 583).

## 2. Summary table (fitness functions, 60)

Columns: id name | protects (header incident) | decides / scope | CI firings 30d TP/FP/PROC/UNK | local ms | allowlist or marker entries | overlap | blocks on pre-existing?
"Whole tree" = every file in scope on every PR, regardless of changed files. Local ms = Windows, one run of enumerate+check (CI step total is 27 s median).

| id name | protects | decides / scope | TP/FP/PROC/UNK | ms | escape entries | overlap | pre-existing |
|---|---|---|---|---|---|---|---|
| F2 admin-routes-isPlatformAdmin | admin route without auth gate (OBS-17 sweep of 28 routes) | regex per route.ts, whole tree (38 files) | 0/0/0/0 | 280 | 2 (worker-secret routes) | F40 guardedRoutes, F64 (admin gate at RLS layer) | yes, whole tree |
| F6 migrations-numeric-ordering | NNN_name naming, duplicate numbers | holistic over 324 migrations | 0/0/0/0 | 923 | 5 historical duplicates | F51 check 3, F63, F64, F24, F47 all parse migrations | yes |
| F8 client-server-tier-boundary | client code writing tier fields (OBS-62) | regex, 321 client files | 0/0/0/0 | 537 | 0 | none | yes |
| F9 build-compiles | type break reaching Vercel (OBS-64, commit 2494a74) | runs tsc --noEmit once | 1/0/0/0 | 3631 | 0 | Vercel build, ESLint step, pre-push | yes |
| F10 source-credibility-syndication | syndication collapse math regress | spawns selftest, passes iff exit 0 | 0/0/0/0 | 138 | 0 | selftest also cited by invariant SC-3 | n/a |
| F11 trust-tier-weights | tier weights T1..T7 and decay | spawns selftest | 0/0/0/0 | 95 | 0 | same | n/a |
| F12 moat-base-tier | `?? effective_tier` leak into fact stamp (SC-9) | spawns selftest | 0/0/0/0 | 86 | 0 | same | n/a |
| F13 single-mint-chokepoint | INSERT into intelligence_items outside mintIntelligenceItem ("38 pre-gate polluters") | line regex, 1039 files | 0/0/0/0 | 738 | fitness-allow F13 markers: 0 found | rule 015 (row mutation guarded path), DB guard | yes |
| F14 producer-consumer-orphan | table written, never read (half-slice class) | holistic graph | 0/0/0/0 | 1184 | terminal-sink allowlist (in governance module) | F47 check 2, closure-gate check 3 (same core module), F24 | yes |
| F15 spend-chokepoint | Anthropic call outside spend client | regex, 894 files | 0/0/0/0 | 413 | 5 legacy + 2 sanctioned | rule 016, F69 | yes |
| F16 transport-hold-gate | fetch bypassing scrape-hold gate | regex, 849 files | 0/0/0/0 | 258 | 2 sanctioned | F61 (hold in chains) | yes |
| F17 size-cap-doctrine | silent size caps on grounding path ("GROUND_SECTION_MAX_CHARS=12000") | registry, 2 files | 0/0/0/0 | 1 | registry | F26 | yes |
| F18 one-url-canonicalizer | ad-hoc URL normalization (eur-lex false dedupe) | regex, 1033 files | 0/0/0/0 | 184 | 0 markers found | F46 (host homes), F45 | yes |
| F19 no-service-anon-downgrade | SERVICE_ROLE or ANON fallback | regex, 851 files | 0/0/0/0 | 140 | 0 | none | yes |
| F20 pause-flag-one-writer | direct write of pause flags | regex, 850 files | 0/0/0/0 | 171 | 1 sanctioned route | DB trigger migration 201 (static mirror) | yes |
| F21 single-grounding-entry | direct grounding calls ($65 unattributed spend) | regex, 850 files | 0/0/0/0 | 81 | sanctioned set | F15, rule 016 | yes |
| F22 source-role-at-birth | sources INSERT without source_role (1,719 of 2,549 NULL) | regex, 1231 files | 0/0/0/0 | 237 | 0 allowlist, 1 marker | none | yes |
| F23 governed-surface-coverage | writers/proofs with no governing skill | coverage-scan whole tree, ceilings all 0 | 0/1/5/0 | 1917 | exemptions.mjs 20 entries; skill-map entries | execution-wiring (orphaned proofs), invariant-coverage | yes, and local-state dependent |
| F24 db-object-migration-home | DB object with no migration (22 of 181) | snapshot db-catalog.json vs migrations | 0/0/0/0 | 292 | 1 net-egress sanctioned | F47, F63, F64 | yes |
| F25 module-liveness | module with no production importer (seek-more.mjs class) | import graph whole tree (src, scripts, .discipline) | 1/0/7/2 | 2767 | 30 (24 LEGACY + 5 PROVEN_BUT_UNWIRED + 1 COMPONENTS) | orphan-modules census (reports), F14, F23 | yes (stale-allowlist branch fires when ANY lane wires a module) |
| F26 storage-ceiling-parity | Deno worker without 10M ceiling | parity of two files | 0/0/0/0 | 2 | 0 | F17 | yes |
| F27 producer-seam-proof | producer chain never run together (WO-17) | holistic, producers vs proofs | 0/0/0/0 | 167 | 0 | F23, execution-wiring | yes |
| F28 harness-run-integrity | harness change with no run record | schema + range rule + tree-state rule + attestation | 0/0/12/0 | 482 | 134 pending markers tracked | closure-gate NEVER-RUN, F50, harness ledger | range rule no; tree-state and attestation yes |
| F30 entity-spine | text-keyed lookups creeping back | counts per pattern vs baseline | 0/0/0/0 | 870 | baseline counts (source_url_eq 2, url_host_derivation 13) | none | yes |
| F31 derived-values-gate | `.from("derived_values")` outside propagation | regex, 1254 files | 0/0/0/0 | 381 | sanctioned dir | migration 285 RLS | yes |
| F32 statutory-purity | migration 286 trigger weakened | structural presence | 0/0/0/0 | 1 | 0 | DB trigger 286 | yes |
| F33 surface-acceptance | surface with no route/data path/rendering spec | register + import graph | 0/0/0/0 | 1058 | exemptions in register json | F35, F25 | yes |
| F34 bundle-safe-module-evaluation | fs call at module scope (carosledge.com 500 on every route, PR #533) | regex, 847 files | 0/0/0/0 | 343 | 1 | none | yes |
| F35 row-ux-coverage | row component never measured at 375 px (one word per line, operator phone) | registry 28 files vs smoke specs | 0/0/0/0 | 28 | registry | UX smoke, F43, F41 | yes |
| F36 date-format-timezone-pin | React #418 hydration mismatch | regex, 435 client files | 0/0/0/0 | 99 | 14 pre-existing | none | yes |
| F37 perf-budget | per-route perf ratchet | registry | 0/0/0/0 | 1 | registry | none | yes |
| F38 unbounded-supabase-read | PostgREST 1000-row cap | regex, 1190 files | 0/0/0/0 | 388 | 0 allowlist, 4 markers | F39 | yes |
| F39 unbounded-in-filter | `.in()` list past ~2,000 ids (two runs, 400 after write) | lexical: any `.in(col, runtimeVar)` with no cap visible at call site | 0/3/0/2 | 215 | 136 markers in 66 files | F38, readAllByIds helper | yes |
| F40 authed-api-fetch | guarded route called without Bearer (workspace tags dead in prod) | regex, 611 files | 0/0/0/0 | 46111 | 3 | F2 | yes |
| F41 dead-media-query-class | media query targeting wrong element (MapPageView) | CSS parse, 292 files | 0/0/0/0 | 61 | 1 marker | layout guard measures real layout | yes |
| F42 card-shell-outside-SectionCard | hand-built card shell (eighteen cards with no 3px rule) | regex, 292 files | 1/0/0/1 | 78 | 11 markers | F49, F45 | yes |
| F43 default-open-disclosure | panel open on first load (operator /operations) | static, 228 files | 0/0/0/0 | 22 | 3 markers | no-default-open-smoke.mjs checks the same rule in a browser | yes |
| F44 broken-main-guard | `file://${argv[1]}` guard dead on Windows (31 silent exits) | regex, 757 files | 0/0/0/0 | 359 | 0 | F67, is-main tests | yes |
| F45 duplicate-code | same code written 3 times (EUR-Lex; 381 clone blocks) | 8-line window hash, total duplicated lines HEAD vs merge-base | 3/0/1/1 | 943 | 0 | F46, F42, F49, review | no (delta vs merge-base; any net increase blocks) |
| F46 external-host-home | host written in two files | URL literal census | 0/0/0/0 | 432 | ceiling 0 | F18, F45 | yes |
| F47 db-object-reference | unreferenced and write-only tables | schema replay vs code refs | 0/0/0/0 | 1939 | 2 allowlist, ceilings 0 | F14, closure-gate check 3 | yes |
| F48 env-file-load-guarded | unguarded loadEnvFile (ENOENT in CI) | regex, 1339 files | 1/0/0/0 | 514 | 0 | env-file tests | yes |
| F49 parts-not-pages | literal part styles in page.tsx | regex, 48 pages | 0/0/0/0 | 43 | 0 ("No grandfathering") | F42, F45 | yes |
| F50 loop-wiring | workflow_run edge missing or hop never fired | manifest vs workflows | 0/0/0/0 | 8 | enforce flags | F60, F28, closure-gate NEVER-RUN | yes |
| F51 no-shared-append | two lanes colliding on one line (six merge-train stops 2026-09-18) | 5 checks; 4 and 5 are git-range | 0/0/14/0 | 521 | 13 (2 zero-ceiling, 2 migration-dup, 9 hotspot) | git's own merge (check 5), lane contract | checks 1-3 yes; 4-5 no (range) |
| F52 workflow-file-validity | dead workflow (runner context in job env, run 35533637184) | 5 structural checks + actionlint if present | 0/0/0/0 | 32 | allowed env contexts | actionlint step (same class) | yes |
| F54 push-gate-npm-parity | pre-push passes, CI fails (PR #769) | parity of hook vs workflow job | 0/0/0/0 | 4 | 4 exempt steps | F52 | yes |
| F57 impact-meter-no-full-variant | retired variant="full" | regex, 610 files | 0/0/0/0 | 102 | 1 | npmtests | yes |
| F58 no-standalone-obligations-strip | retired strip | regex, 4 files | 0/0/0/0 | 0 | 0 | timeline-math.test | yes |
| F59 dep-path-resolved | hard-coded node_modules path in worktree | regex, 640 files | 0/0/0/0 | 93 | 3 | worktree link tests | yes |
| F60 workflow-run-chain-depth | workflow_run chain over 3 levels | parse workflows | 0/0/0/0 | 19 | 0 | F50 | yes |
| F61 chained-dry-guard-wired | chained apply in build mode (hand-cancelled run) | 30 files | 0/0/0/0 | 2 | 0 | chained-dry-guard tests | yes |
| F62 no-css-var-concat | `var(--x)15` tint (24 sites) | regex, 610 files | 0/0/0/0 | 111 | 1 | none | yes |
| F63 migration-applied-status | migration header says NOT APPLIED while live (4 instances) | header vs live-schema export | 0/0/0/0 | 187 | 0 | F24, rule 014 | CI: no-op (see 4) |
| F64 rls-admin-gate-class | RLS-disabled grants, wrong admin gate | regex on migrations | 0/0/0/0 | 267 | 12 RLS_ENABLE_ALLOWLIST | F2, F24 | yes |
| F65 no-bracket-path-tests | tests under `[id]` dirs silently dropped (CF-SEC-11) | tracked path check | 0/0/1/0 | 50 | 0 | runner fix in #875 (same class) | yes |
| F66 clock-fragility | test reading wall clock (PR #816, a68111cf) | regex, 764 tests | 0/0/0/0 | 249 | 0 | none | yes |
| F67 unguarded-main-invocation | main() at module scope | regex, 724 files | 0/0/0/0 | 74 | 0 | F44 | yes |
| F68 actions-artifact-budget | artifact storage at 90 percent of plan (6.2 GB) | parse workflows | 1/0/0/0 | 2 | 0 | none | yes |
| F69 model-id-literal | 14 independent model-id literals | regex, 1212 files | 0/0/0/0 | 209 | 1 | F15, rule 016 | yes |

Totals of the table: TP 8, FP 4, PROCESS 40, UNK 6. Local total 73 s (F40 alone 46.1 s, 63 percent: `guardedRoutes()` is called inside `check()` for each of 611 files and re-globs and re-reads every route.ts each time [CONFIRMED: F40 source line `const guarded = guardedRoutes();` in check(), and measured 46111 ms]; share of the 27 s CI step is [HYPOTHESIS]).

## 3. F51 no-shared-append (checks 1 to 5)

- Protects: plan 6.8 causes A and B. "six merge-train stops on 2026-09-18". [CONFIRMED: header]
- Decides: check 1 hand entries in converted files; 2 stored measurements; 3 id uniqueness; 4 `lane/` branch touching a coordinator-only file; 5 CONCURRENCY: a file the lane touches that another commit also touched on origin/master while the lane branch was open.
- Scope: checks 1-3 whole tree; 4 and 5 git range (base vs HEAD). On master or no range: no violation.
- Escape hatches: ZERO_CEILING_ALLOWLIST 2, MIGRATION_DUPLICATE_ALLOWLIST 2, HOTSPOT_ALLOWLIST 9, generated-files registry (exempt when generator output equals committed copy, since RULES-1 2026-10-07).
- Firings: 14 runs on 12 branches, all check 5. [CONFIRMED: log scan]
- Evidence for classification: [CONFIRMED: `git merge-tree` legacy three-way dry merge of each PR head SHA into origin/master at the run time, 14 of 14] zero conflict markers. Git would have merged all 14 cleanly. Files named: chain-proof.yml (PROOF-3, PROOF-4), docs/ops/secrets-topology.md and secrets-registry.mjs (trustret), skill-map.mjs (ops1), docs/inventories/migrations.md (g7-corrections, g5-terms; a generated file, partly fixed later by RULES-1), AuthPanel.tsx and claim-ledger-block.ts (gates2-live-smoke), drain.test.mjs (l4b), MAINTENANCE-RUNBOOK.md (s1b x2, s1c x2), MarketSignalDetailSurface.tsx (l-corridor), producer-summary-wiring.test.mjs and supabase-server.ts (r7-lint-ci).
- Classification: 14 PROCESS (a concurrent merge; the correct change was unchanged by the re-cut).
- Re-cuts forced: [CONFIRMED: session-log.d] 3 logs say the branch was re-cut because of F51 check 5 (ops1-maintenance-health r2, proof4-attacks r2, g5-terms after G7-CORR). 7 session logs contain "re-cut" in the last 7 days (the other causes: a real file conflict g7-corrections; rule 015 false positive g5-search; anticipatory s8e0; gates2 rulings).
- Overlap: check 5 vs git. [CONFIRMED: dry merge above] The only thing the gate adds over git is the refusal itself.
- Second-job duplication: [CONFIRMED: 14 of 14 F51 CI firings also failed the Discipline unit-test job, via live-tree self-tests `check 5 (Amendment 2) wired to the live tree` (18 runs) and `check 5 (lane F51c) LIVE-TREE PROOF` (6 runs)]. In 7 more runs the unit-test version failed while the fitness job passed [CONFIRMED: failed-summary.json]; and 2 master push runs (2026-09-20, runs 35481577668 and 35535285687) failed on master itself only through this self-test.
- Pre-existing blocking: checks 4-5 no. Checks 1-3 yes. Standing hotspot number prints every run (observability; 7 to 19 files).

## 4. F28 harness-run integrity (pending markers)

- Protects: harness code changed with no run artifact. Header cost of the previous design: "17 scripted re-pins across four logged days, three lanes colliding on the SAME marker line". [CONFIRMED: header]
- Decides: (a) artifact schema; (b) range rule: governing file changed in range and no new `<family>-run-NNN.json` then a file under `<family>/pending/` must be added; (c) tree-state rule: family with no artifact at the LIVE governing-file hash must have a pending file, and a family WITH an artifact at the live hash must have none; (d) a family with 2+ artifacts needs LAST-PROPOSER-PASS.md naming the latest run.
- Scope: whole tree for (a)(c)(d); git range for (b). Governing files include every family.json for meta-harness, and shared files (host-authority.ts is governing for 3 families).
- Firings: 12 runs, all PROCESS. 7 range-rule "PENDING FILE REQUIRED" (proof3, proof4, g6-gates, p2, s3c, s3a, s1b-s1d walker), 2 "STALE PENDING FILE(S)", 5 "STALE PROPOSER ATTESTATION" (3 on s1d-walker-registers, 2 on automated `propagation run 007/008` PRs 2026-09-11), 1 old hash-pin "STALE PENDING-RUN.md ... drifted AGAIN" (2026-09-16). [CONFIRMED: log scan]. Defect prevented in each: none; the fix was adding or deleting a markdown file. [NOT-WORK: fact, no action]
- Markers: [CONFIRMED: git log --diff-filter=A] 138 pending markers added since 2026-09-08 (96 since 2026-10-01); 4 deleted; 134 tracked now across 32 families. 40 of 122 merges since 2026-10-01 (33 percent) added at least one. Run artifacts added in the same window: 53 (automated).
- [CONFIRMED: runner output] No family currently has an artifact at its live hash, so every family owes a marker permanently; any edit to a governing file changes the hash again.
- Ceremony text in session logs: [CONFIRMED: grep] "F28" appears in 61 of 209 session-log files (39 since 10-01), typically "F28: no edited file is a governing file ... so no pending marker" after a manual grep of every family.json.
- Overlap: closure-gate NEVER-RUN (same artifact evidence), F50 (artifact dir per hop), harness_runs ledger table (records that runs occurred). F28 records that a run is owed. [CONFIRMED: closure-gate.mjs hasRunEvidence uses harness artifact; F50 checks artifact directory]
- Second-job duplication: 12 of 12 also failed `F28 passes GREEN against the live tree` in the unit-test job. [CONFIRMED]
- Pre-existing blocking: tree-state and attestation rules yes (they failed the automated propagation PRs); range rule no.

## 5. F25 module liveness

- Protects: capability built, tested, never called (seek-more.mjs). [CONFIRMED: header] [NOT-WORK: fact, no action]
- Decides: import graph over src, scripts, .discipline; roots = framework entry points, workflow `run:` path mentions, package.json scripts, esbuild stubs, data-audit markers. Violations: UNWIRED, STALE ALLOWLIST (module got wired, remove the entry), GHOST entry. [HYPOTHESIS: statement recorded by the source lane, not re-verified at landing] [NOT-WORK: fact, no action]
- Firings: 10 runs on 9 modules. TP 1 (C-SOCIAL: orphaned dashboard/pulse-shared.mjs deleted, commit a8f2f328). PROCESS 7: proof/run-attacks.mjs, sync-applied-migrations.mjs, export-subset.mjs and load-subset.mjs, lineage-gap-targets.mjs (created before the workflow or importer that references them; wired later in the same PR, e.g. PROOF-4 session log "F25 has no root for run-attacks.mjs until that workflow edit lands"); plan-drain.mjs (wired by adding a `drain:plan` line to package.json "so F25 sees a production reach", G6-DRAIN session log); repair-smoke-account.mjs (reason-bearing allowlist entry granted by coordinator, AUTH-2); chip-selection.mjs (STALE ALLOWLIST, P1). UNK 2: pool-row-contract.mjs x2 (L17, 2026-09-13).
- Allowlist: 30 entries; 24 LEGACY_ALLOWLIST include 6 "dormant-capability ruling" and 4 permanent test doubles or fixtures marked "n/a". The F25 file was edited by 26 commits in 30 days (allowlist adds and removes), 1,374 lines. [CONFIRMED: git log]
- Evidence of cost beyond CI: L-CORRIDOR session log: an F25 allowlist entry kept a dormant module alive, later "DELETED (an allowlist-kept module is dormant)". [CONFIRMED]
- Overlap: it is the import graph. The CI step `orphan-modules.mjs --all` (2 s) reports the same class and never fails. F14, F47, closure check 3 cover tables the same way. [HYPOTHESIS: statement recorded by the source lane, not re-verified at landing]
- Pre-existing: whole tree. A lane that wires an allowlisted module must also edit F25 (hotspot).

## 6. F45 duplicate-code, F23, F39, F42, F65, F35

- F45: header incident "same EUR-Lex route written three times ... 381 exact clone blocks, 7,716 duplicated lines". Decides total duplicated normalized lines (8-line windows) on HEAD no worse than merge-base tree. 5 firings: 3 TP (S8-F2 +18 lines: SourceLink.tsx extracted; G7-UI: styles.ts extracted; P2 +19: rowValueFields extracted; each confirmed in session-log.d), 1 PROCESS (2026-09-17 old stored-ceiling era "IMPROVEMENT ... re-seed" message), 1 UNK (g5-need). Zero tolerance: +16 lines blocked. Does not block on pre-existing duplication (delta). Local 943 ms.
- F23: zero ceilings (orphaned proofs 0, unmapped writes 0, unmapped model 0, unmapped routing 0). 6 firings: FP 1 (OPS-1: coverage-scan WRITE_RE matched a read `.rpc(` in gate-a-gauges.mjs, session log says "a read RPC; the scan cannot tell"), PROCESS 5 (create-org.mjs and adopted-entities.mjs needed skill-map/exemptions entries; two orphaned-proof +1 on L15/L20). exemptions.mjs 20 entries. [CONFIRMED] Locally F23 reports 4 violations on a clean checkout because it scans gitignored files (scripts/tmp/task6-inserts*.sql, backfill-classify-metadata-batch-1.mjs, wave1-api-discovery-apply-routing.mjs; `git check-ignore` confirms ignored). CI passes at the same commit.
- F39: 136 `fitness-allow: F39` markers in 66 files [CONFIRMED: git grep]; 22 commits added the marker string in 30 days. 5 firings: FP 3 (s3a: 100-element slice; g5-read: already chunked via fetchAllByIdChunks, gate cannot see inside callback; g5-need: spreads of module constants), UNK 2 (g5-terms changed to readAllByIds; g7-corrections). Lexical check: it cannot see a cap, only a marker.
- F42: 11 markers. 2 firings: TP 1 (G7-UI: hand-built shells moved to SectionCard), UNK 1 (2026-09-08 introduction run).
- F65: 1 firing (G7-CORR: `[id]` test paths) PROCESS: the lane moved files; the message itself allows run-explicit-tests, and #875 made the runners literal-path.
- F35: 0 firings. Registry of 28 row components; the measurement runs inside the rendering guard. Session logs name F35 in 27 files (ceremony of registering new rows).

## 7. Governance gates (outside the fitness runner)

### 7.1 Closure gate (NEVER-RUN clock)
- Protects: "nothing fails when a maintenance step or workflow has never run". [CONFIRMED: header] 4 checks: NEVER-RUN, STALE-NEXT, WRITER-READER (migrations >= 266), LANE-CONTRACT. CI cost 1 to 5 s. Firings in 30 days: 0 [CONFIRMED: no failed run has a failed closure-gate step; the unit-test live closure-gate test passed in all logs]. [NOT-WORK: fact, no action]
- [CONFIRMED: `closure-gate.mjs` run: "current train: 71"; `git log origin/master | grep train/wave`: last train commit train/wave71 on 2026-09-11] The train counter has not advanced for 27 days. NEVER-RUN age is `currentTrain - introducedTrain`; a workflow introduced after 2026-09-11 has age 0 and can never become overdue until trains resume. [CONFIRMED by reading checkNeverRun]. Two allowlist entries expire at train 80 (downstream-chain.yml, producers.yml), unreachable at the current rate.
- Allowlists: NEVER_RUN 2, STALE_NEXT 0, WRITER_READER 0.
- Overlap: F28 tree-state, F50, F14, F47 (check 3 reuses producer-consumer-orphan.mjs). [HYPOTHESIS: statement recorded by the source lane, not re-verified at landing]

### 7.2 Invariant-coverage meta-gate and execution-wiring
- 151 invariants (152 files in invariants.d), 13 exempt; enforcers: selftest 124, fitness 61, audit 28, migration 18, rule 11, consistency 4. CI step under 1 s; 0 failures in 30 days. [CONFIRMED]
- Execution-wiring (rule 15 mechanization) resolves `selftest:`/`audit:` tokens to what runners actually execute. The motivating incident: 15 goldens cited and run by nothing. 0 firings.
- Overlap: F23 ORPHANED PROOFS (a test no rule claims) checks the converse of the same wiring; F27 (proof imports seams); F25.

### 7.3 Skill-acks (skill-contract-map)
- Protects: a pinned SKILL.md or GOVERNING SKILL citation moved with nobody looking. Decides: range adds `skill-acks/<date>-<lane>.md` naming the skill and citing files.
- [CONFIRMED: git log] 26 ack files added in 30 days (all 26 existing files). 1 CI firing (run 37207797931, gates1-evidence, "missing-skill-ack remediation-discipline") PROCESS. Skill-contract drift step 1 s. [NOT-WORK: fact, no action]
- Local companion: PreToolUse skill gate. [CONFIRMED: governance/.gate-audit.log on this machine, entries since 2026-09-08] 38,549 decisions: allow 36,261; ask 1,918 (worktree-isolation 1,104; bash-write 328; dispatch 204; mcp-write 169; skill-unresolvable 107); deny 370 (edit-governed-skillmissing 170, bash-write-skillmissing 108, mcp-write-skillmissing 45, mcp-write-notranscript 35, edit-governed-notranscript 12). [CONFIRMED: this session] the gate denied a read-only `git merge-tree --write-tree` dry merge as "Data write (prod effect)".

### 7.4 Memory gate and UX-compliance gate (Validate commits job)
- Memory gate: code under fsi-app/(src|migrations|scripts|.discipline) needs a session-log, session-log.d file or PROGRAM-BOARD change in the range. UX gate: any .tsx/.css under src needs an added line containing "UX compliance" in the session-log addendum.
- Firings in 30 days: memory 3 runs (2026-09-09, 2026-09-12 x2), UX 1 run (2026-09-09), all PROCESS (absent documentation). [CONFIRMED: log scan] Since then 0.
- Ceremony volume: "UX compliance" appears in 112 of 209 session-log files (51 since 10-01). [CONFIRMED: grep]
- Overlap: none mechanically; pre-push step 2b runs the same module.

### 7.5 Commit rules in Validate commits (10 rules)
- Rule 022 (no dash glyphs in added prose): 7 failing runs. Added-line counts 10,609 (audit register), 5,066 (build plan), 73 (the fix PR for the rule itself), 8, 2, 1, 1. PROCESS 3 (the 10,609, 5,066, 73 line cases), TP 4. Escape: `glyph:verbatim` marker, 302 occurrences in 134 files [CONFIRMED: git grep -c]. [NOT-WORK: fact, no action]
- Rule 021: 1 firing (train/wave62, cache key not rotated) TP.
- Write-Guard-Override trailers: 9 in all history, 1 in the last 30 days [CONFIRMED: git log --grep].

### 7.6 Unit-test self-tests of the gates (Discipline engine unit tests job)
- 64 of 100 failed runs failed this step. 35 of those also failed the fitness runner; 29 failed only here. [CONFIRMED: failed-summary.json]
- Gate self-tests that execute the live gate against the live repo: `F28 passes GREEN against the live tree` 12 runs, `check 5 (Amendment 2) wired to the live tree` 18, `LIVE-TREE PROOF` 6, `LIVE ... F39 clean` 6, `LIVE ratchet HEAD does not exceed merge-base` 5, `F27 passes GREEN` 1. Cases where the self-test failed and the gate itself passed in the fitness job: 10 runs (F51 7, F39 1, F27 1, F45 1).
- Layout baseline calendar rule: `STANDING GATE, real clock, real baseline.json: the renewal warning is not due yet` failed 3 runs (37705267764, 37706117823, 37708052871, 2026-10-07 23:58 to 2026-10-08 00:30 UTC) PROCESS (clock). [CONFIRMED]. Pause landed in master (build-mode.mjs, BUILD_MODE true); `layout-baseline-renewal.yml` has 1 run ever (2026-10-08, output discarded).
- Time cost: [CONFIRMED: step timings around PR #875] "Run discipline test suite" step: 88 to 94 s on 2026-09-30 and 77 s at 2026-10-02 10:06; 201 s at #875 (10:51); 202 s median since. #875 replaced `node --test` with `run-explicit-tests.mjs`, which calls `run({ files, execArgv })` with no concurrency option (line 70). [CONFIRMED: local 40-file sample: default programmatic run 172 s vs `concurrency: true` 116 s]. That the whole 110 s CI increase comes from serialization is [HYPOTHESIS]. Slowest tests: F51 REPLAY 8 to 10 s, schema replay 5 to 6 s, F40 live census 3 s; they sum to about 27 s of the 202 s.

## 8. Rendering guard, UX smoke harness, layout guard

- Job: continue-on-error true [CONFIRMED: discipline.yml line 525]; 10-minute timeout. Median job 295 s post-#875 (265 s over all), p90 433 s, max 604 s; Playwright+chromium install 46 s; guard run 231 s median, p90 369 s. One sampled run: 380 s (02:25:42 to 02:32:02). Checkout fetches every remote branch (hundreds of `[new branch]` lines).
- Composition (one run log): 14 fixtures x 12 viewports (1,308 checks), 16 SM smoke specs, 27 UX smoke specs, 36 layout route x width measurements. UX smoke registry: 69 files under rendering/smoke.
- Firings: [CONFIRMED: jobs json over 301 runs] 3 failed, 1 cancelled: 2026-09-08 and 2026-09-09 (train branches, 50 failures, baseline wave-65 era), 2026-10-03 r7-lint-ci (hydration smoke "Missing getServerSnapshot", plausible TP, UNK). Non-pass rate about 1.5 percent. Because it is non-blocking, none of these stopped a merge by themselves. [NOT-WORK: fact, no action]
- Layout guard baseline: baseline.json 792 keyed findings written 2026-09-08 (338 covered in the last run), expiry 2026-10-15; allowlists: ANTON 10, POSITION 7, SCROLLER 2; exemptions-375 1; law2-desktop 1. [CONFIRMED] Expiry had been extended before by ruling (wave65). Calendar rule paused by BUILD_MODE 2026-10-08.
- Overlap: F35 (coverage half) and the smoke measure (measurement half); F41 and F43 static versions of rules also measured in a browser (no-default-open-smoke.mjs; layout guard).
- Pre-existing: fixtures and baseline are whole-app; a new finding blocks, a baseline finding does not. The rendering job's own result is advisory.

## 9. discipline.yml job set

| job | median s (post-#875, PR) | blocking | steps that dominate | failed steps in 100 failed runs |
|---|---|---|---|---|
| Validate commits | 15 | yes | rules 012-022, memory gate | 11 |
| Discipline engine unit tests | 218 | yes | test suite 202; closure 1; orphan census 2; invariant-coverage <1 | 64 |
| Consistency layer | 14 | yes | runner 1 | 0 |
| Fitness functions | 115 | yes | ESLint 54; npm ci 14; run fitness 27; npmtests 29; goldens 1 | 64 (fitness 47, ESLint 8, npmtests 4, actionlint 4, goldens 1) |
| Rendering guard | 295 | no (continue-on-error) | chromium install 46; guard 231 | 3 |

- ESLint (`--max-warnings 0`): 8 failures: 5 warnings only (unused vars), 2 errors, 1 `eslint: not found`. Added 2026-10-03 (+54 s per run).
- actionlint (pinned): 4 failures: 1 network reset on the download (run 37607165874), 1 YAML parse error (TP), 1 shellcheck info notes (FP), 1 UNK.
- npmtests: 4 failures, all real test regressions (TP).
- Docs-only fast path exists on two jobs ("Resolve docs-only fast path"), so docs PRs skip the suite and fitness.

## 10. Allowlist and exemption inventory today

| gate | entries |
|---|---|
| F25 | 30 (24 LEGACY, 5 PROVEN_BUT_UNWIRED, 1 COMPONENTS) |
| F39 markers | 136 in 66 files |
| F36 | 14 |
| F51 | 13 (2 + 2 + 9) |
| F64 | 12 |
| F42 markers | 11 |
| F15 | 5 (+2 sanctioned) |
| F6 | 5 |
| F38 markers | 4; F54 exempt steps 4; F43 markers 3; F40 3; F59 3 |
| F2 2; F47 2; F24 1; F34 1; F57 1; F62 1; F69 1; F22 marker 1; F41 marker 1 | 
| governance/exemptions.mjs (F23) | 20 |
| closure-gate NEVER_RUN | 2 |
| invariants exempt | 13 of 151 |
| layout guard allowlists + exemptions | ANTON 10, POSITION 7, SCROLLER 2, 375 exemption 1, law2 1; baseline 792 keys |
| F28 pending markers tracked | 134 |
| skill-acks files | 26 |
| glyph:verbatim | 302 occurrences, 134 files |
| Write-Guard-Override trailers (all history) | 9 (1 in 30 days) |
| F65, F23 ceilings, F27 SEAM_EXEMPTIONS, F38 ALLOWLIST, F24 BROKEN/CRON | 0 |

Sum of fitness-function allowlist and marker entries: 30 + 136 + 14 + 13 + 12 + 11 + 5 + 5 + 4 + 4 + 3 + 3 + 3 + 2 + 2 + 1 x 7 = 254; with exemptions.mjs 20 and closure 2 = 276.

## 11. Gate-by-gate overlap (same defect class checked twice or more)

- F51 check 5 vs git merge: 14 of 14 firings merge clean in git. [CONFIRMED]
- F28 range+tree-state vs closure-gate NEVER-RUN vs F50 vs harness_runs table: four statements about "a harness run exists". [CONFIRMED by reading the four]
- Fitness runner vs unit-test job: every F51, F28, F39, F45 CI failure (36 of 36) failed twice (fitness job and live self-test). [CONFIRMED]
- F25 vs orphan-modules census vs F14 vs F47 vs closure check 3 vs F23 orphaned proofs: module and table liveness checked five ways. [CONFIRMED]
- F52 vs actionlint step: workflow validity. F54 vs pre-push step parity. F44 vs F67 vs is-main tests: main-guard idiom.
- F43 static vs no-default-open-smoke browser spec; F41 static vs layout guard measurement; F35 coverage vs UX smoke measure.
- F42, F49, F45: card/part shell written by hand. F15 vs rule 016 vs F69: Anthropic call and model id (commit-time and CI-time).
- F20, F31, F32: static mirrors of DB guards (migrations 201, 285, 286).
- F65 vs run-explicit-tests.mjs: both aimed at bracket-path tests.
- Memory gate in CI and pre-push step 2b: one module, two surfaces.

## 12. Items that are effectively no-ops or local-state dependent

- F63: [CONFIRMED: header and CI log `PASS [F63]`] its live-schema export is a gitignored file absent in CI, so it returns PASS for every file in CI. Locally with a stale scratch export it reported 3 violations on the clean checkout.
- F23: counts gitignored files locally (4 violations locally, 0 in CI at the same commit).
- Closure NEVER-RUN clock: frozen (7.1). [HYPOTHESIS: statement recorded by the source lane, not re-verified at landing]
- F58 enumerates 4 files; F61 30; F17 2; F26, F32, F37, F54, F60, F68 are single-file or registry checks with no firing in 30 days.

## 13. Not verified

- [HYPOTHESIS] F40 accounts for about half of the 27 s CI fitness step (local share measured 63 percent).
- [HYPOTHESIS] The #875 serialization explains the entire 110 s increase.
- [HYPOTHESIS] F25 firings classified PROCESS (7) would have been wired anyway in the same PR; the logs show they were, but not what the author would have done without the gate.
- Local pre-push firings and durations; per-function CI seconds; success-run job timing beyond the every-4th-success sample.
