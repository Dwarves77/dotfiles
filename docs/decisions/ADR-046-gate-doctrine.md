---
id: ADR-046
title: Gate doctrine, a gate earns its place by true positives or by guarding an irreversible class
status: accepted
date: 2026-10-08
scope: fsi-app/.discipline/** (rules, hooks, fitness functions, governance, consistency, rendering), .github/workflows/discipline.yml, the PreToolUse skill gate and its user-level shim
supersedes: the reading of "every failure becomes an edit to the system" (CLAUDE.md self-annealing protocol) and of the rule manifest's tripwire history as "every failure becomes a new gate", where that reading conflicts with this ADR
related: ADR-005, ADR-009, ADR-040
---

# ADR-046: Gate doctrine

Related: [ADR-040](./ADR-040-ci-is-the-push-gate.md) (CI is the push gate),
[ADR-005](./ADR-005-discipline-enforcement-layered-architecture.md) (the layered discipline design),
[ADR-009](./ADR-009-adr-system-architecture.md) (ADR frontmatter).

## Context

Operator rulings, 2026-10-08, verbatim: "we have a large amount of errant rules and lines of code meant
to protect the system but actually cause slow downs and road bumps"; "remove, repair, replace as needed".

Two read-only fact lanes measured every gate on origin/master 5d61fa01 over the window 2026-09-08 to
2026-10-08. They are landed as `docs/audits/gate-evaluation-2026-10-08.md` (register A: commit rules,
git hooks, Claude Code hooks, markers; register B: fitness functions, governance gates, rendering guard,
the workflow). Every count below is quoted from them with their own status tokens; this ADR does not
re-verify them.

What the registers found, in one paragraph: 100 of 954 discipline.yml runs failed in 30 days; 11 of
those 100 failed on a commit rule or the memory gate and 89 on test, fitness, lint or workflow steps. Of 58 fitness
function failures in CI, 8 were true positives and 40 were process (a marker file to add, a concurrent
merge git would have taken cleanly). Of 32 commit-rule firings, 9 were true positives and 19 were false
positives. The gates also cost time: commit-msg took 12.5 s at 77 staged files, a default push took 7.4 s
to 28.1 s, and the PreToolUse shim added about 2.4 hours of latency in 30 days.

The earlier habit, that each incident adds a gate, produced this. "Every failure becomes an edit to the
system" is correct; the edit is not always a new check. It may be deleting a check, narrowing one, or
making the code carry the property so no check is needed. This ADR fixes that reading.

## Decision: seven doctrine points

1. **A gate earns its place by true positives, or by guarding an irreversible class (security, money,
   data loss) at near-zero cost. Everything else is removed.**
   Evidence: rules 014, 017, 019 and 020 never fired in 90 days; 49 of 60 fitness functions had zero CI
   firings in 30 days; the 8 cosmetic or single-file functions (F17, F26, F37, F54, F57, F58, F60, F62)
   had no CI firing in the window and have no security class. Security and spend guards (F2, F8, F13, F15, F16, F19,
   F20, F21, F22, F31, F32, F61, F64) cost milliseconds and guard irreversible harm, so they stay.
2. **Constructive over detective.** When the code can carry the property (a registry the runtime
   iterates, a writer path that is the only reachable one, an artifact that lands on every run), the gate
   that policed it is deleted.
   Evidence: F51 check 5 fired 14 times on 12 branches and git would have merged all 14 cleanly (git is
   the concurrency check); F28's range and tree-state rules fired 12 times, all process, with 134 pending
   marker files tracked (138 added since 2026-09-08) and no defect prevented, while the harness_runs
   ledger already records that a run happened; the skill-acks mechanism produced 26 files in 30 days
   and one ceremony firing.
3. **One check, one site.** Commit rules run at commit and in CI; nothing runs at commit, push and CI,
   and no gate has a second "self-test against the live tree" in another job.
   Evidence: the ten rules ran at commit-msg, again at pre-push step 2c (per commit plus the whole range)
   and again in CI validate-commits; C3/C4/C5 ran at rule 014, pre-push step 2 and the CI consistency
   job; 36 of 36 CI failures of F51, F28, F39 and F45 failed twice (fitness job and a unit-test live-tree
   self-test), 35 runs failed both steps, and in 10 runs the self-test failed while the gate itself
   passed.
4. **Scope is the change, not the file.** A rule reads introduced lines (the old line lacked the
   pattern, the new line has it), never pre-existing text on an edited line, never the whole file.
   Evidence: rules 012, 015, 016, 017 and 019 read the whole staged file; rule 015 was a false positive
   in 4 of 4 firings and three lanes on 2026-10-07 rewrote correct code to dodge it; rule 022 was a false
   positive in 12 of 22 events (55 percent), including roughly 660 glyphs in 66 moved runbook files and
   pre-existing dashes on lines edited only for an apostrophe; rule 018 fired on three existing,
   operator-authorized routes (/settings, /watchlist, /privacy).
5. **Build mode is a state the gates read (BUILD_MODE).** Calendar and clock rules are suspended by it.
   Evidence: the layout baseline renewal test (a real-clock standing gate) failed 3 runs between
   2026-10-07 23:58 and 2026-10-08 00:30 UTC; the closure gate's NEVER-RUN clock is the train counter,
   frozen at 71 since 2026-09-11, so a workflow introduced after that date can never become overdue;
   CLAUDE.md rule 16 holds the build state. `fsi-app/.discipline/governance/build-mode.mjs` is the one
   switch.
6. **Every gate firing in CI is logged and a gate with zero true positives in 90 days is reviewed for
   removal.** Gate id, branch, verdict and 200 characters of evidence go to a CI artifact, so the next
   evaluation is a query, not a two-day fact lane.
   Evidence: no firing log existed for commit-msg, pre-commit or pre-push; the PreToolUse audit log keeps
   the tool name and decision but never the command; the evaluation had to attribute 100 of 100 failed
   runs by hand through the Actions jobs API, and local firings are a lower bound recovered from session
   narrative.
7. **No unvalidated override trailers.** A marker must carry a reason; a trailer must name the check and
   expire.
   Evidence: Write-Guard-Override, Surface-Decision-Override and Source-Reclassify-Override are accepted
   with any or empty text, cover the whole commit, and had 1, 1 and 0 uses in 30 days; Consistency-Override
   is the only validated one (rationale required, deadline today or later); `glyph:verbatim` stands on
   1,036 lines in 220 files, 683 of them in docs/audits, mostly bulk-stamped on existing audit lines.

## Disposition table

Vocabulary. KEEP: unchanged. REPAIR: the gate stays and is changed to meet a doctrine point. REPLACE: the
policed property moves to a constructive mechanism and the old check goes. DELETE: removed with its tests
and registry entries; where a component test can carry the property, the property is recorded there.
The lane column names who executes it ("none" means no lane touches the gate). A KEEP with a note
"scoreboard" is a gate with no CI firing in the window that this ADR leaves in place, because it guards a
named incident class at low cost or because no lane brief orders a change; its first review is under the
scoreboard rule below.

### Commit rules (register A section 2)

| Gate | Disposition | Lane | Reason |
|---|---|---|---|
| Rule 012 hardcoded user-home path | REPAIR | GATE-1 | introduced-lines scope; the whole-file read failed on third-party text it did not write (PR #562) |
| Rule 014 inventory consistency | DELETE | GATE-1 | 0 firings in 90 days; the same C3/C4/C5 primitive runs at pre-push step 2 and the CI consistency job |
| Rule 015 row-mutation guarded path | REPAIR | GATE-1 | 4 of 4 firings false positive; introduced-lines scope; its override trailer is removed |
| Rule 016 canonical Anthropic path | DELETE | GATE-1 | 2 of 2 firings false positive; F15 holds the same regex; its PERMITTED list merges into F15's sanctioned list |
| Rule 017 generation config no raw env | REPAIR | GATE-1 | introduced-lines scope; 0 firings in 90 days, scoreboard; SF-9 restates it |
| Rule 018 no surface outside the five-surface model | REPAIR | GATE-1 | fires only on ADDED page.tsx files (new routes), never on edits to existing ones; its trailer is removed |
| Rule 019 source-not-item reclassified | REPAIR | GATE-1 | introduced-lines scope; 0 firings in 90 days; migration 135 and SC-2 hold the DB side; its trailer is removed |
| Rule 020 deprecated session-log fork frozen | DELETE | GATE-1 | 0 firings since creation; the frozen fork file moves to docs/archive, so the rule is moot |
| Rule 021 dashboard cache key | KEEP | none | 2 true positives in 30 days, 0 s, prevents the SSR crash of / (2026-08-01) |
| Rule 022 no dash or section-sign glyphs | REPAIR | GATE-1 | 12 of 22 events false positive; introduced-lines scope; one `git diff -U0` per run shared by trigger, check, commit and CI; commit-msg 12.5 s at 77 files |

### Trailers, markers and bypasses (register A section 6)

| Gate | Disposition | Lane | Reason |
|---|---|---|---|
| Write-Guard-Override trailer | DELETE | GATE-1 | any text accepted, whole-commit scope, 1 use in 30 days (doctrine 7) |
| Surface-Decision-Override trailer | DELETE | GATE-1 | same; rule 018 now fires only on new routes |
| Source-Reclassify-Override trailer | DELETE | GATE-1 | same; 0 uses in 30 days |
| Consistency-Override trailer | KEEP | none | the one validated override: rationale required, deadline today or later |
| `glyph:verbatim` marker | REPAIR | GATE-1, DEAD-3 | stays only on genuine verbatim quotations; DEAD-3 strips the rest after GATE-1 merges |
| `fitness-allow: F<n> (reason)` marker | KEEP | GATE-3 | the reason is required; F39 markers are retired wherever the call site is bounded |
| "UX compliance" substring check | DELETE | GATE-2 | a substring match attests nothing; the rendering guard measures UX |
| `--no-verify` bypass | KEEP | none | a git feature, not a gate; no use found in 30 days |

### Git hooks (register A section 4)

| Gate | Disposition | Lane | Reason |
|---|---|---|---|
| pre-commit worktree isolation (RD-19) | KEEP | none | irreversible class (a commit landing in the main checkout), 0.5 s |
| commit-msg discipline engine | REPAIR | GATE-1 | runs the repaired rules; target under 2 s at 77 staged files |
| post-checkout node_modules link and isolation alarm | KEEP | none | constructive: it creates the shared link so no gate has to police a missing install |
| pre-push step 0 trampoline guard | KEEP | none | refuses a stale hook copy (D19) |
| pre-push step 0b dependency resolve | KEEP | none | 0.14 s, repairs the shared link |
| pre-push step 0c docs-only classifier | KEEP | none | 0.33 s, skips heavy steps for docs-only pushes |
| pre-push step 1 untracked critical files | KEEP | none | catches the migration 067 class, 0.2 s |
| pre-push step 2 consistency runner | KEEP | none | the one local site for C3/C4/C5 once rule 014 is deleted |
| pre-push step 2b memory gate | REPAIR | GATE-2 | memory gate only; the UX substring check is removed |
| pre-push step 2c rules in CI mode | DELETE | GATE-2 | re-runs what commit-msg and CI validate-commits already run, 5.2 s to 25.2 s |
| pre-push steps 3 to 4 (suite, meta-gates, skill-gate wiring, ESLint, fitness, npmtests, goldens, closure, tsc) | KEEP | none | opt-in with `DISCIPLINE_PREPUSH_FULL=1` per ADR-040; CI is the gate |
| Pre-push firing log | REPAIR | GATE-2 | commit-msg and pre-push append one line per firing to a gitignored `.hook-firings.log` (doctrine 6) |

### Consistency checks (register A section 4, H6)

| Gate | Disposition | Lane | Reason |
|---|---|---|---|
| C3 and C5 | KEEP | none | the pre-push and CI consistency job run them; no change ordered |
| C4 worktree drift | REPAIR | GATE-2 | counts only worktrees under the repo's own conventions or inside the repo path; a worktree elsewhere on the machine is a note, never drift |

### Claude Code hooks (register A section 5)

| Gate | Disposition | Lane | Reason |
|---|---|---|---|
| PreToolUse scope shim (user-level) | REPAIR | GATE-2 | the gate is called in-process (one node start, not two); the user-level file is reported as a patch, not edited by the lane |
| PreToolUse skill gate: DANGER regex | REPAIR | GATE-2 | matches the command's own tokens, not heredoc bodies, quoted strings or text after `#` |
| PreToolUse skill gate: MCP read or write classification | REPAIR | GATE-2 | explicit allow and write lists, unknown names ask; 16 misclassified reads in 30 days |
| PreToolUse skill gate: worktree-isolation asks | REPAIR | GATE-2 | asks only for branch-changing commands; read-only forms never ask (1,094 asks in 30 days) |
| PreToolUse skill gate: no transcript, skill unresolvable | REPAIR | GATE-2 | "no transcript" asks, "unresolvable" allows with a log line; both were false positives by construction |
| PreToolUse skill gate: skill-missing denies on governed writes | KEEP | none | 320 denies in 30 days; the 2026-09-19 episode confirmed the gate governs the path it denied |
| SessionStart vault-sync and session-start-vault, PreCompact snapshot | KEEP | none | no firing or failure recorded; they carry the read path into a session |
| SessionEnd reminder | KEEP | none | a fixed echo string; no cost recorded |

### Fitness functions (register B section 2, all 60)

| Gate | Disposition | Lane | Reason |
|---|---|---|---|
| F2 admin-routes-isPlatformAdmin | KEEP | none | security class, 0.3 s |
| F6 migrations-numeric-ordering | KEEP | none | migration naming; no change ordered, scoreboard |
| F8 client-server-tier-boundary | KEEP | none | client code writing tier fields; security class |
| F9 build-compiles | KEEP | none | 1 true positive; the type-break class that reached Vercel |
| F10 source-credibility-syndication | KEEP | none | spawns a selftest also cited by SC-3; no change ordered, scoreboard |
| F11 trust-tier-weights | KEEP | none | same; scoreboard |
| F12 moat-base-tier | KEEP | none | same; guards the SC-9 stamp leak; scoreboard |
| F13 single-mint-chokepoint | KEEP | none | insert into intelligence_items only through the mint; data integrity |
| F14 producer-consumer-orphan | KEEP | none | table written, never read; its overlap with F47 is the scoreboard's first question |
| F15 spend-chokepoint | REPAIR | GATE-1 | spend class; absorbs rule 016's permitted paths into its sanctioned set |
| F16 transport-hold-gate | KEEP | none | fetch bypassing the scrape-hold gate; build-mode class |
| F17 size-cap-doctrine | DELETE | GATE-3 | 0 firings, a 2-file registry, no security class |
| F18 one-url-canonicalizer | KEEP | none | 0 firings; the eur-lex false-dedupe class; scoreboard |
| F19 no-service-anon-downgrade | KEEP | none | security class |
| F20 pause-flag-one-writer | KEEP | none | static mirror of the migration 201 guard on the pause flags |
| F21 single-grounding-entry | KEEP | none | spend class ($65 unattributed) |
| F22 source-role-at-birth | KEEP | none | data integrity (1,719 of 2,549 sources had a NULL role) |
| F23 governed-surface-coverage | REPAIR | GATE-3 | `.rpc(` matches only when the RPC name is in a write list; the scan uses `git ls-files` so gitignored files are never scanned |
| F24 db-object-migration-home | KEEP | none | DB object with no migration; no change ordered |
| F25 module-liveness | REPAIR | DEAD-1 | the gate stays; its 30-entry allowlist is cleared by wiring or deleting each module, and proven-but-unwired entries get a dated expiry (the expiry is owed to DEAD-1; its brief is not yet written) |
| F26 storage-ceiling-parity | DELETE | GATE-3 | parity of two files, 0 firings, no security class |
| F27 producer-seam-proof | KEEP | none | no change ordered, scoreboard |
| F28 harness-run-integrity | REPLACE | GATE-3 | the pending-marker mechanism is replaced by the harness ledger (a family is current when a harness_runs row carries the governing-file hash); schema check and LAST-PROPOSER-PASS stay |
| F30 entity-spine | KEEP | none | text-keyed lookups held to baseline counts |
| F31 derived-values-gate | KEEP | none | security class (migration 285 RLS mirror) |
| F32 statutory-purity | KEEP | none | single structural check on the migration 286 trigger; irreversible class |
| F33 surface-acceptance | KEEP | none | no change ordered, scoreboard |
| F34 bundle-safe-module-evaluation | KEEP | none | the carosledge.com 500-on-every-route class (PR #533) |
| F35 row-ux-coverage | KEEP | none | row components registered for 375 px measurement; the rendering guard becomes blocking |
| F36 date-format-timezone-pin | KEEP | none | React #418 hydration class; no change ordered |
| F37 perf-budget | DELETE | GATE-3 | registry only, 0 firings, no security class |
| F38 unbounded-supabase-read | KEEP | none | the 1000-row PostgREST cap class |
| F39 unbounded-in-filter | REPAIR | GATE-3 | recognises a bounded list (a literal `.slice(0, N)` with N <= 500, a spread of a module constant, a chunk-helper callback) as safe; markers are removed where the call site is bounded (136 markers in 66 files) |
| F40 authed-api-fetch | REPAIR | GATE-3 | hoists `guardedRoutes()` out of the per-file loop (46 s to under 1 s locally); the check stays |
| F41 dead-media-query-class | KEEP | none | no change ordered, scoreboard |
| F42 card-shell-outside-SectionCard | KEEP | none | 1 true positive |
| F43 default-open-disclosure | KEEP | none | the operator's /operations rule; no change ordered, scoreboard |
| F44 broken-main-guard | KEEP | none | the Windows `file://` guard class (31 silent exits); scoreboard |
| F45 duplicate-code | KEEP | none | 3 true positives; delta against the merge-base, never pre-existing |
| F46 external-host-home | KEEP | none | a host written in two files; scoreboard |
| F47 db-object-reference | KEEP | none | no change ordered, scoreboard |
| F48 env-file-load-guarded | KEEP | none | 1 true positive |
| F49 parts-not-pages | KEEP | none | no change ordered, scoreboard |
| F50 loop-wiring | KEEP | none | no change ordered, scoreboard |
| F51 no-shared-append | REPAIR | GATE-3 | check 5 is deleted (git is the concurrency check); checks 1 to 4 and the generated-files registry stay |
| F52 workflow-file-validity | KEEP | none | the dead-workflow class (run 35533637184) |
| F54 push-gate-npm-parity | DELETE | GATE-3 | 0 firings; ADR-040 made pre-push skip the steps it mirrored |
| F57 impact-meter-no-full-variant | DELETE | GATE-3 | retired variant; existing npmtests carry the property |
| F58 no-standalone-obligations-strip | DELETE | GATE-3 | retired strip; timeline-math.test carries the property |
| F59 dep-path-resolved | KEEP | none | no change ordered, scoreboard |
| F60 workflow-run-chain-depth | DELETE | GATE-3 | 0 firings; F50 covers the chain |
| F61 chained-dry-guard-wired | KEEP | none | spend and build-mode class (a chained apply that was hand-cancelled) |
| F62 no-css-var-concat | DELETE | GATE-3 | cosmetic, 0 firings, no security class |
| F63 migration-applied-status | DELETE | GATE-3 | a no-op in CI (its input is a gitignored file); migration-history-audit owns the intent |
| F64 rls-admin-gate-class | KEEP | none | security class |
| F65 no-bracket-path-tests | KEEP | none | tests under bracket paths were silently dropped (CF-SEC-11) |
| F66 clock-fragility | KEEP | none | the wall-clock test class (PR #816) |
| F67 unguarded-main-invocation | KEEP | none | no change ordered, scoreboard |
| F68 actions-artifact-budget | KEEP | none | 1 true positive on a spend ceiling |
| F69 model-id-literal | KEEP | none | no change ordered, scoreboard |
| Fitness firing artifact (`fitness-firings.json`) | REPAIR | GATE-3 | new output of the runner: gate, verdict, file, line, 200 characters of evidence (doctrine 6) |

### Governance gates (register B section 7)

| Gate | Disposition | Lane | Reason |
|---|---|---|---|
| Closure gate NEVER-RUN | REPLACE | GATE-3 | the clock is the newest harness_runs date per workflow family (30 days, 90 in BUILD_MODE), not the frozen train counter; the train allowlist is deleted |
| Closure gate STALE-NEXT, WRITER-READER, LANE-CONTRACT | KEEP | none | 0 firings in 30 days at 1 to 5 s; they police the definition of done |
| Invariant-coverage meta-gate | KEEP | none | under 1 s, 0 failures; rule 15 depends on it |
| Execution-wiring | KEEP | none | rule 15 mechanized: a cited proof that no lane runs fails |
| Skill-acks (skill-contract drift step, 26 ack files) | DELETE | GATE-3 | 26 files and 1 ceremony firing in 30 days; skill-map.mjs is the contract |
| Memory gate (CI Validate commits and pre-push 2b) | KEEP | none | code must not outrun the vault; 0.4 s to 1.1 s; no CI failure since 2026-09-12 |
| UX-compliance substring gate (CI) | DELETE | GATE-2, GATE-4 | module change in GATE-2; the workflow call in GATE-4 |
| Orphan-modules census (CI step) | KEEP | none | reports, never fails, 2 s |
| Gate unit tests that run a fitness function against the live tree | DELETE | GATE-4 | 36 of 36 duplicated the fitness job; 10 failed alone; they move behind `FITNESS_LIVE_TESTS=1` and stay runnable locally |

### Rendering guard and the workflow (register B sections 8 and 9)

| Gate | Disposition | Lane | Reason |
|---|---|---|---|
| Rendering guard job | REPAIR | GATE-4 | becomes blocking (continue-on-error removed) now that BUILD_MODE suspends the baseline clock; checkout at fetch-depth 1 with no remote branch fetch |
| UX smoke specs and layout measurement | KEEP | none | the real-browser measurement behind F35, F41 and F43 |
| Layout baseline calendar rule (expiry, 7-day renewal) | REPLACE | none | suspended by BUILD_MODE (PR 978, done) |
| Layout guard allowlists and baseline keys | KEEP | none | a new finding blocks, a baseline finding does not |
| Job: Validate commits | KEEP | none | runs the repaired rules and the memory gate; 15 s |
| Job: Discipline engine unit tests | REPAIR | GATE-4 | live-tree self-tests removed; `concurrency: true` in run-explicit-tests.mjs (172 s to 116 s on a 40-file sample) |
| Job: Consistency layer | KEEP | none | 14 s, 0 failures among the 100 failed runs |
| Job: Fitness functions (ESLint, npmtests, goldens, run fitness) | KEEP | none | true positives in npmtests and the fitness step |
| Step: actionlint | REPAIR | GATE-4 | the pinned binary is cached, keyed on version (one network-reset failure) |
| Docs-only fast path | KEEP | none | docs PRs skip the suite and fitness |
| Push-to-master job set | REPAIR | GATE-4 | master pushes run Validate, Consistency and the build only; the PR head carried the suite (370 master runs, 38 percent of monthly minutes) |
| `gate-firings` artifact | REPAIR | GATE-4 | collects fitness-firings.json and the rules' CI firing lines on every run (doctrine 6) |

## Lanes that execute it

| Lane | Scope |
|---|---|
| GATE-1 | commit rules engine: delete 014, 016, 020; introduced-lines scope for 012, 015, 017, 019, 022; 018 on added pages only; remove three trailers; rule firing log |
| GATE-2 | pre-push (remove 2c, memory gate only in 2b), consistency C4, the PreToolUse skill gate and shim patch, the pre-push firing log |
| GATE-3 | fitness functions and governance: F51 check 5, F28, closure NEVER-RUN, F23, F39, F40, the deletions, skill-acks, `fitness-firings.json` |
| GATE-4 | discipline.yml and run-explicit-tests.mjs: live-tree tests, concurrency, master-push job set, blocking rendering guard, actionlint cache, `gate-firings` artifact, `docs/runbooks/gate-evaluation.md` |
| DEAD-1 | dead code from the census, including the F25 allowlist entries |
| DEAD-2 | dead tables and columns: migration 368, written and reviewed, not applied by the lane |
| DEAD-3 | dead INDEX lines, broken runbook references, orphan docs, stale terms, `glyph:verbatim` stripping after GATE-1 merges, landing the registers under docs/audits |
| GATE-0 | this ADR, its INDEX line and session log entry |

The lanes have disjoint write sets; GATE-0 lands last.

## Scoreboard rule

- Every gate firing in CI is recorded (gate id, branch, verdict, 200 characters of evidence) in the
  `gate-firings` artifact; local hook firings go to the gitignored `.hook-firings.log`.
- A gate with zero true positives in 90 days is reviewed for removal. The gate-firings artifact is the
  record: the review is a query over it (`docs/runbooks/gate-evaluation.md`), not a new investigation.
- The 90 days of a gate start when the artifact first carries that gate's firings, because before then no
  firing log exists to count from.
- The review outcome follows doctrine point 1: removed, or kept with a written reason that it guards an
  irreversible class at near-zero cost. A kept gate records the reason in the review; silence is not a
  reason.

## Consequences

- Rules 014, 016 and 020, F17, F26, F28's pending mechanism, F37, F51 check 5, F54, F57, F58, F60, F62,
  F63, pre-push step 2c, the UX substring check, the skill-acks mechanism and three override trailers
  are removed. Rules 012, 015, 017, 018, 019 and 022 stop reading pre-existing text.
- New gates follow the doctrine at birth: a proposal states the true positives it would have caught or
  the irreversible class it guards, the one site it runs at, the introduced-lines scope it reads, and it
  logs its firings. "Every failure becomes an edit to the system" is satisfied by the smallest edit that
  closes the class, which may be a deletion.
- ADR-040 stands: CI's required checks are the push gate. This ADR narrows what those checks and the
  commit hooks do; it does not move the gate back to the local push.
- Security and spend guards are unchanged by this ADR (rule 15 of CLAUDE.md: a guard is proven by attack,
  not by presence, and `scripts/verify/prov-guard-adversarial-audit.mjs` remains the template).

## Addendum 2026-10-08 (lane GATE-7): the scope of the rules, hooks and gates

Prior decision: the attack register `fsi-app/scripts/tmp/aud-at3-gates-attacked-2026-10-08.md` (lane
AUD-AT-3) ran 216 attacks against the commit rules, the git hooks, the PreToolUse gate and its shim, and
187 were accepted. Reading the 187 against doctrine point 1 needs one sentence the ADR did not carry,
so it is written down here.

The commit rules, hooks and PreToolUse gates are MISTAKE-CATCHERS for cooperating sessions, not an adversary boundary; a bypass that requires intent (`--no-verify`, `core.hooksPath`, `env -i`, deleting origin/master, editing the engine in the same commit, a forged skill name) is OUT OF SCOPE and is recorded as such, with the one exception that intent-forms a session reaches by habit (running from a script file because the gate denied the inline form) are logged by the gate as firings so they are counted; a blind spot on an HONEST form (a construct an agent writes without trying to evade: a split string, a destructured import, a rename, a commit whose staged blob differs from the working tree, a tool the matcher does not route, a cwd the shim mis-scopes) is a DEFECT.

Consequences of the sentence, each built by lane GATE-7 with the register's attack as its negative test:

- A rule decides on the content the commit carries (the staged blob, the commit's own tree in CI), never on
  the working tree. One site: `ctx.getFileContent` in `lib/context.mjs`.
- A rule reads the honest forms of its own pattern (split strings, escapes, aliases, destructured imports,
  edit-extend, look-alike glyphs, decoy comments). A form that cannot be told from code without parsing is
  parsed with the one tokenizer, `lib/mask-source.mjs`. A file git does not diff as text hides every
  introduced line from every content rule, so it is itself a finding (rule 023, one site).
- The classifiers (the docs-only fast path, the memory gate) class a rename by its source path as well as its
  destination; a tracked hook file that differs from HEAD refuses the push.
- The worktree-isolation belt does not trust the child-session marker: the main checkout takes no commit or
  merge commit from anyone, and the alarm covers the landed-commit and ref-move paths git has hooks for.
- Every tool the harness exposes is routed through the gate and classified by its effect (a write is
  skill-gated, a read is allowed); the scope shim's decision lives in the repo (`pretooluse-scope.mjs`) so it
  is versioned and tested.
- Every refusal and every counted intent-form is a line in the shared firing log (`lib/firing-log.mjs`).

What stays out of scope, by this sentence, is listed per attack id in
`docs/ops/session-log.d/2026-10-08-gate7-honest-forms.md`. A later evaluation that finds a blind spot on an
honest form reopens it as a defect; one that finds a bypass that needs intent records it and does not build
for it.
