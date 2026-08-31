# L16-disc-B — Discipline engine (dispatch/, governance/, lib/, rendering/, rules/, top-level)

Lane: 70 files under `fsi-app/.discipline/`, path list per `/root/work/audit/lanes/L16-disc-B.txt`.
This entire lane is repo-internal governance/lint tooling (a self-hosted commit-time + CI +
PreToolUse-hook enforcement engine for doctrine/invariants/rules). None of these files write to
application DB tables directly — table-usage.txt is not directly applicable to this lane (no file
here mentions a Supabase table by name in a write/read sense relevant to that ground-truth file).

## Per-file verdicts (path order)

`.discipline/assistant-spend-gate.test.mjs` — TEST — source-text (not execution) test on `src/app/api/ask/route.ts`, pinning the ASSISTANT_ENABLED fail-closed gate, its ordering ahead of the paid call, and routing through spend-client. Not vacuous (asserts ordering by string index, asserts absence of direct-API patterns in comment-stripped code).

`.discipline/dispatch/audit.mjs` — OPERATOR-TOOL — purpose: report on a dispatch's commits by `Dispatch-UUID` trailer.
  - WIRING: overturns GRAPH:UNREACHABLE only partially — refs=0 is correct (no other src file imports it), but it is not dead: its own usage comment documents manual `node .../audit.mjs <uuid>` invocation, and `audit.test.mjs` exercises it as a subprocess. Classified OPERATOR-TOOL, not dead.

`.discipline/dispatch/audit.test.mjs` — TEST — spawns `audit.mjs` as a real subprocess (`--list-recent`, unknown UUID, `--aggregate-by-skill`, no-args); asserts real exit codes/stdout patterns. Not vacuous.

`.discipline/dispatch/start.mjs` — OPERATOR-TOOL — mints a `Dispatch-UUID`.
  - WIRING: confirms GRAPH:TEST-ONLY (refs=1 = its own test importing `mintUuid`); also has a direct-CLI branch for manual operator use. Not dead.

`.discipline/dispatch/start.test.mjs` — TEST — exercises `mintUuid` format, slugify, error cases, real-invocation date/hex shape. Not vacuous.

`.discipline/glob-portability.test.mjs` — TEST — parses `run-test-suite.sh`'s test list and asserts every listed test imports only `node:` builtins + relative `.mjs`, i.e. portable to the no-`npm ci` CI job. Wired into `run-test-suite.sh` itself (self-referential). Not vacuous (self-tests against the real fixed defect: audit-gate.test.mjs jiti import).

`.discipline/governance/check-pretooluse-wired.mjs` — WORKING-WIRED (claimed, unconfirmed in-lane) — verifies `~/.claude/settings.json` PreToolUse actually routes required tools to the skill-gate hook (directly or via a verified scope wrapper).
  - WIRING: refs=0; per its own header this runs "in pre-push (on the operator's machine)". The pre-push hook script that would invoke it is not in this lane, so I cannot independently confirm the invocation — the claim rests on the file's own comment plus `install-hooks.mjs`'s existence.
  - NOTE: never prints settings.json contents (avoids leaking plaintext credentials) — deliberate.

`.discipline/governance/coverage-scan.mjs` — WORKING-WIRED — governed-surface (WRITES/MODEL/ROUTING/PROOF) coverage scanner; CLI + pure `runCoverageScan()`.
  - WIRING: refs=2, consistent with its own header claim of being "the analyzer behind fitness F23" (F23 file is outside this lane, not independently read).
  - NOTE: `stripComments` deliberately keeps `//` when preceded by `:` so URLs like `https://api.anthropic.com` survive stripping — documented, tested indirectly via the exemptions list, not a defect.

`.discipline/governance/doctrine-contradiction.mjs` — WORKING-WIRED — scans the committed doctrine surface for uncited human-gate clauses (GATE_RE) vs visibility/negation/citation exemptions.
  - WIRING: refs=2 (own test + `invariant-coverage.mjs`, confirmed — `invariant-coverage.mjs` imports `scanDoctrineContradictions, DOCTRINE_FILES`).

`.discipline/governance/doctrine-contradiction.test.mjs` — TEST — RED (pre-rewrite gate clause caught), GREEN (rewritten form clean), visibility/negation/citation non-triggers, self-inflicted-gate RED, and a live-surface clean assertion. Not vacuous.

`.discipline/governance/doctrine-register.mjs` — WORKING-WIRED — 632-line declarative registry of ~45 standing doctrines, each `enforcedBy` (invariant IDs) or `exempt.reason`.
  - WIRING: refs=1 (`invariant-coverage.mjs`, confirmed — imports `DOCTRINES`).
  - Purely declarative data; internally cross-checked by `invariant-coverage.mjs`'s `auditDoctrines` (enforced-invariant existence, exempt-non-empty, dangling `conflicts`). No defect found in the prose itself from reading; every entry carries either `enforcedBy` or `exempt.reason` as required.

`.discipline/governance/execution-wiring.mjs` — WORKING-WIRED — resolves whether a `selftest:`/`audit:` enforcedBy token is actually *executed* by a real CI surface (run-test-suite.sh globs, `*.npmtest.mjs`, goldens dir, data-audit-lane AUDITS list, fitness sentinels, discipline.yml named paths, rendering guard).
  - WIRING: refs=3 (`invariant-coverage.mjs`, `coverage-scan.mjs`, its own test — consistent).

`.discipline/governance/execution-wiring.test.mjs` — TEST — one real known-wired path per surface (positive), a synthetic never-wired path (negative — proves the resolver isn't a rubber stamp), and directory-scoping of the goldens surface. Not vacuous.

`.discipline/governance/exemptions.mjs` — WORKING-WIRED — recorded governance exemptions (`isExempt(path, kind)`), each with a stated `reason` + `by`.
  - WIRING: refs=1 (`coverage-scan.mjs`, confirmed — imports `isExempt`).

`.discipline/governance/invariant-coverage.mjs` — WORKING-WIRED — the meta-gate: per-invariant enforced-or-exempt, enforcement-token resolution, anchor presence, marker-count baselines, orphan-mechanism detection, rule-fire-test presence, doctrine-register audit, secrets-reference audit, doctrine-contradiction scan.
  - WIRING: refs=1 (its own test — `invariant-coverage.test.mjs`), which is itself wired into `run-test-suite.sh` (`governance/*.test.mjs` glob) and is described as also running as a CI CLI step.

`.discipline/governance/invariant-coverage.test.mjs` — TEST — real-registry positive assertion (every invariant enforced-or-exempt, live) plus a full battery of negative/seeded-drift cases for `auditInvariants`, `auditDoctrines`, `auditMarkerBaselines`. Not vacuous.

`.discipline/governance/invariants.mjs` — WORKING-WIRED — 1240-line registry of ~100 named invariants (EP-*, SC-*, AC-*, PI-*, SCS-1, RD-*, RG-1, SF-*) mapped to `enforcedBy` tokens or `exempt.reason`.
  - WIRING: refs=1 (`invariant-coverage.mjs`, confirmed).
  - NOTE (naming hygiene, not a functional bug): the `RD-` numeric prefix is reused for unrelated invariants — `RD-13-one-url-canonicalizer` (~line 874) and `RD-13-error-body-groundability-gate` (~line 904) both use prefix "RD-13"; `RD-14-line-read-is-not-verification` (~line 884) and `RD-14-transport-escalation-write-gate` (~line 914) both use "RD-14". The full id *strings* are distinct (no key-collision risk in any Set/Map keyed by the full string, and `doctrine-register.mjs` cites the full strings, not the bare prefix), so this does not cause wrong enforcement resolution — but a reader searching prose for "RD-13" or "RD-14" alone will find two unrelated invariants under one number. A separate, unfinished `RD-15` (no-unreachability-hold-without-exhaustion-record) is deliberately left as a comment, not an array entry (lines ~923-935) — correctly does not collide with the real `RD-15-no-service-anon-downgrade` entry.

`.discipline/governance/pretooluse-skill-gate.mjs` — WORKING-WIRED (out-of-repo hook) — the PreToolUse hook: gates Bash data-writes, Edit/Write/MultiEdit/NotebookEdit on governed files, Agent/Task/Workflow dispatch, and `mcp__*` writes behind a same-session `Skill` tool invocation (via `skill-token.mjs`); includes a worktree-isolation belt (`isBranchingGitCommand`) and a deadlock-escape path for skills unregistered in the session.
  - WIRING: overturns GRAPH:UNREACHABLE (refs=0) — this file is never `import`ed by any other repo file (confirmed: no import of it found anywhere in the lane), but it is invoked as an external subprocess by `~/.claude/settings.json`'s PreToolUse hook, a wiring that lives *outside* the repo by design (documented at the top of the file and in `wire-pretooluse-settings.mjs`/`check-pretooluse-wired.mjs`, both in-repo). Its own fire-test spawns it as a real subprocess. I could not independently confirm the actual `~/.claude/settings.json` on any machine (not a repo artifact); the claim rests on the three in-repo pieces agreeing with each other.

`.discipline/governance/pretooluse-skill-gate.test.mjs` — TEST — spawns the real hook as a subprocess with synthetic transcripts (loaded vs empty) across every tool class (Edit/Write governed & ungoverned, Bash read/write, MCP read/write, Agent/Task/Workflow dispatch, fail-closed on empty/unparseable payload, and two "efficacy" checks that the deny reason actually names the missing skill). Not vacuous.

`.discipline/governance/producer-consumer-orphan.mjs` — WORKING-WIRED — the write-orphan / read-orphan (informational) detector over the DB schema + code.
  - WIRING: refs=2 (its own CLI + presumably fitness F14, per the RD-9 invariant's `enforcedBy: ['fitness:F14']` — the F14 file itself is outside this lane).
  - NOTE (minor completeness gap, informational-only path): `SQL_WRITE_RE = /\b(?:INSERT\s+INTO|UPDATE)\s+.../` (line 79) does not include `DELETE FROM`. A table written *only* via SQL `DELETE FROM` (no INSERT/UPDATE, no CODE writer) would not register as SQL-written, so `hasAnyWriter()` could return false for it — this only affects the (b) READ-ORPHANS informational branch (never the gating write-orphan check, which requires a CODE writer), so it is low-severity: at most a spurious informational "read but never written" report for a delete-only-written table.

`.discipline/governance/secrets-reference-audit.mjs` — WORKING-WIRED — scans `.github/workflows/*.yml` for `secrets.X` references not present in `WORKFLOW_SECRETS`.
  - WIRING: refs=2 (its own test + `invariant-coverage.mjs`, confirmed — `runSecretsReferenceAudit` is called inside `runInvariantCoverage`).

`.discipline/governance/secrets-reference-audit.test.mjs` — TEST — real-tree positive (every reference registered), negative (fabricated `PROBE_SECRET`/`MADE_UP_KEY` caught), control (registered-only is clean). Not vacuous.

`.discipline/governance/secrets-registry.mjs` — WORKING-WIRED — `WORKFLOW_SECRETS` (5-name enforceable set) + full `TOPOLOGY` documentation array (names/vaults/consumers only, no values).
  - WIRING: refs=2 (`secrets-reference-audit.mjs` + its test, confirmed).
  - Did not independently re-verify the claimed live GitHub secret store (`gh secret list`) matches the 5-name set; this is stated as verified "2026-07-12" in-file, not re-checked here.

`.discipline/governance/skill-contract-map.mjs` — WORKING-WIRED — pin-then-compare drift gate between a `GOVERNING SKILL:` code citation and the cited skill file's content hash (sha256 of EOL-normalized text) + the citing-file list, catching 4 drift classes (skill file missing, skill content changed, citation dropped, citation unpinned).
  - WIRING: confirms GRAPH:TEST-ONLY (refs=1 = `skill-drift-gate.test.mjs`, which is itself explicitly listed in `run-test-suite.sh`, so this module is exercised on every CI/pre-push run despite having only one importer).
  - Did not independently recompute the six sha256 `contentHash` values in `PINNED_MANIFEST` against the real skill files (would require running the hash function); correctness is asserted by the module's own wired real-repo test (`skill-drift-gate.test.mjs`'s first test), not re-derived by hand here.

`.discipline/governance/skill-map.mjs` — WORKING-WIRED — the file/op → governing-skill lookup table (5 skill entries with directory-scoped `files` + op regexes), consumed by both the commit-time rules and the PreToolUse hook.
  - WIRING: refs=3 (`pretooluse-skill-gate.mjs`, and rules 015/019 via `skillsForOp`, confirmed by direct import reads).

`.discipline/governance/skill-token.mjs` — WORKING-WIRED — pure transcript-parsing primitives: `skillLoadedInTranscript` (resolved, non-errored `Skill` tool_use required — not just presence), `skillUnresolvableInTranscript` (errored-invocation escape hatch), `skillFileReadInTranscript` (SKILL.md Read as substantive consultation), `missingFromTranscript`.
  - WIRING: refs=2 (`pretooluse-skill-gate.mjs` + its own test, confirmed).
  - Read the resolution logic closely (`erroredById.has(u.id) && erroredById.get(u.id) === false`) — correct: requires a result to exist AND be non-error; an in-flight (no result) invocation correctly does not count.

`.discipline/governance/skill-token.test.mjs` — TEST — covers resolved/errored/in-flight/retry-after-error, scoped-slug forms, passive-prose non-match, suffix-collision non-match, literal (non-regex) slug matching, `missingFromTranscript`, empty inputs, and both deadlock-escape primitives (unresolvable, file-read). Not vacuous.

`.discipline/governance/wire-pretooluse-settings.mjs` — OPERATOR-TOOL — idempotent applier that writes a combined PreToolUse hook entry into `~/.claude/settings.json` (dry-run by default, `--apply` to write, timestamped backup first, never prints settings.json contents).
  - DEAD: line 38 declares `canonicalCommand` (`node "${pathToFileURL(HOOK).pathname.replace(/^\//, "")}" ...`) but this variable is **never referenced again in the file** — only `cmdWin` (line 40) is used to build the actual `command` written to disk (line 51: `const command = existingCmd || cmdWin`). `canonicalCommand` is a computed-then-discarded value.
  - Latent defect inside the dead code (would only matter if it were ever wired in): `pathToFileURL(HOOK).pathname.replace(/^\//, "")` strips the **leading slash** from an absolute POSIX path, turning e.g. `/home/user/repo/.discipline/.../pretooluse-skill-gate.mjs` into the *relative* path `home/user/repo/.../pretooluse-skill-gate.mjs`. If this string were ever used as the `node "<path>"` command (as its sibling `cmdWin` is), the hook would fail to launch under any cwd other than `/`, and the built-in fallback (`|| printf %s '<FALLBACK-ask-JSON>'`) would silently mask the failure by returning a permissive "ask" every time. Currently harmless because the buggy variable is unused, but it is the kind of latent bug that resurfaces if someone "cleans up" the two near-duplicate command-builders by keeping the wrong one.

`.discipline/governance/worktree-isolation-hook.mjs` — WORKING-WIRED (git-hook runner) — runs `evaluateCheckout`/`evaluateCommit` from `worktree-isolation.mjs` against real `git rev-parse` output, exits nonzero on a positive, resolved violation; fail-open on infra errors (missing git/node handled by the shell wrapper).
  - WIRING: confirmed by `worktree-isolation.test.mjs`'s dedicated WIRING assertion, which reads `fsi-app/.discipline/hooks/post-checkout` and `.../pre-commit` (outside this lane) and asserts each references this runner with the correct `--mode=`. Not independently re-read here (those hook files are not in my lane list), but the cross-file assertion existing and presumably passing (it is wired into `run-test-suite.sh`) is corroborating evidence.
  - NOTE: the file's own header records a previously-shipped defect (plain `--git-common-dir` returning a relative path, defeating the equality test) that was fixed by switching to `--path-format=absolute`; the current code (line 50) already uses the fixed form.

`.discipline/governance/worktree-isolation.mjs` — WORKING-WIRED — pure WHERE (git-dir vs git-common-dir) + WHO (`CLAUDE_CODE_CHILD_SESSION`) + branch-name-shape detection, `evaluateCheckout`/`evaluateCommit`, and the shared `isBranchingGitCommand` matcher.
  - WIRING: refs=2 (`worktree-isolation-hook.mjs` + `pretooluse-skill-gate.mjs`, confirmed by direct import reads).
  - NOTE (self-documented, not newly found): the WHO signal is fail-open by design when absent (assumed orchestrator) — an agent whose harness omits `CLAUDE_CODE_CHILD_SESSION` slips the WHO gate; the pre-commit branch-name-shape belt is the stated backstop for that case.

`.discipline/governance/worktree-isolation.test.mjs` — TEST — RED (agent-in-main-checkout for both checkout and commit, plus agent-owned-branch-without-env-marker), GREEN (agent-in-worktree, orchestrator-in-main), doctrine-verbatim, `isBranchingGitCommand` positive/negative set, and the WIRING assertion described above. Not vacuous.

`.discipline/install-hooks.mjs` — OPERATOR-TOOL — copies tracked `hooks/*` into `.git/hooks/` (byte-identical idempotent, backs up on divergence unless `--force`, dry-run mode).
  - WIRING: refs=1 (its own test, confirmed).

`.discipline/install-hooks.test.mjs` — TEST — create/idempotent-unchanged/backup-on-divergence/`--force`/`--dry-run`/nested-directory-creation/pre-push-hook-content cases, all against a real temp directory (no real `.git/hooks` touched). Not vacuous.

`.discipline/lib/adr-loader.mjs` — WORKING-UNWIRED — ADR frontmatter parser + glob scope-matcher (`listAllAdrs`, `listAcceptedAdrs`, `loadAdr`, `findIntersectingAdrs`, `matchScopeGlob`).
  - WIRING: overturns nothing (GRAPH:TEST-ONLY, refs=1 = its own test) but the classification matters: the file's own docstring says its job is "to expose enough metadata for the **13th binding rule** to do scope intersection." `manifest.mjs` documents that rules 001-011 and **013 were deleted** in the 2026-05-21 post-slim audit, leaving only rules 012 and 014-021 (none of which import `adr-loader.mjs`). So this module is fully built and well-tested but has had **no production caller since rule 013 was deleted** — a genuinely orphaned capability, not a false "unwired" flag. Nothing calls `listAllAdrs`/`findIntersectingAdrs` outside its own test.

`.discipline/lib/adr-loader.test.mjs` — TEST — valid-ADR parse, malformed-ADR error surfacing, missing-frontmatter, all `matchScopeGlob` shapes, `findIntersectingAdrs` (hit/error-skip/no-intersection). Not vacuous; tests a module nothing in production calls (see above).

`.discipline/lib/context.mjs` — WORKING-WIRED — builds the `CheckContext` object (commit-msg / existing-commit / fixture modes) every rule consumes; `getRepoRoot()` (env override → git rev-parse → throw).
  - WIRING: refs=27 — the shared foundation of the whole rules layer, confirmed by extensive cross-references throughout this lane (every rule + `runner.mjs` + `predicates.test.mjs`).

`.discipline/lib/predicates.mjs` — WORKING-WIRED — `commitMessageLines`, `filesMatching`/`hasFileMatching` (lightweight glob), `isApplicableDispatchType` + its four sub-predicates.
  - WIRING: refs=6 (rules 014/015/019 + `context.mjs` + its test, confirmed).

`.discipline/lib/predicates.test.mjs` — TEST — trailer-line extraction, all glob-pattern shapes, every `isApplicableDispatchType` branch (feat/audit/hotfix-small/hotfix-large/research/conversation/docs-with-code/merge/revert), and `getRepoRoot` env-override/trim/empty-fallthrough/throw-on-no-git cases (including a real PATH-clearing simulation). Not vacuous.

`.discipline/lib/read-migration-sql.mjs` — WORKING-WIRED — `readMigrationSql`/`normalizeEol` (CRLF→LF only, no trim/case/whitespace changes).
  - WIRING: refs=9 (used by `vocab-drift-guard.test.mjs`, `relationship-check-literals.test.mjs` (indirectly via its own pattern, though that file uses raw `readFileSync` not this helper — actually `relationship-check-literals.test.mjs` reads migration 004 directly via `readFileSync`, NOT via this shared reader; only `vocab-drift-guard.test.mjs` and `skill-contract-map.mjs`'s `normalizeEol` import are confirmed from files read in this lane) and other migration-parsing guards outside this lane per its own header comment.

`.discipline/lib/read-migration-sql.test.mjs` — TEST — CRLF-vs-LF-identical-content-normalizes-equal, genuine-content-divergence-stays-unequal (guard keeps its teeth), lone-CR handling + idempotency + EOL-only (no other normalization). Not vacuous.

`.discipline/lib/result.mjs` — WORKING-WIRED — `pass()/fail()/skip()` result-shape constructors with required-field validation (`fail` throws without `message`/`remediation`; `skip` throws without `reason`).
  - WIRING: refs=10 — every rule (012, 014-021) plus `runner.mjs`.

`.discipline/manifest.mjs` — WORKING-WIRED — the 9-rule registry (012, 014-021); documents the 2026-05-21 post-slim deletion of rules 001-011+013.
  - WIRING: refs=2 (`runner.mjs` + `invariant-coverage.mjs`, confirmed).

`.discipline/relationship-check-literals.test.mjs` — TEST — parses migration 004's live `relationship` CHECK constraint (fails loudly if the anchor moves, rather than asserting a stale copy), self-tests the scanner against the exact historical `mint-item.ts:251` defect string, and sweeps all of `src/` for CHECK-illegal `relationship:` literals with one named, justified exclusion (`discover.mjs`'s internal `"none"` scoring label). Wired into `run-test-suite.sh`. Not vacuous.

`.discipline/rendering/assertions.mjs` — WORKING-WIRED — pure detector core: `detectOverflows` (excludes `.leaflet-container`), `findPlaceholderLiterals` (reuses `isPlaceholderText`/`HEADER_LITERALS` from `src/lib/agent/source-entry-filter.mjs`, not a hand-duplicated copy), `hydrationAgrees`/`isNowIndependent`.
  - WIRING: refs=2 (`assertions.test.mjs` + `run-rendering-guard.mjs`, confirmed).

`.discipline/rendering/assertions.test.mjs` — TEST — overflow tolerance boundary, leaflet-exclusion, F-1 RED/GREEN using the real `stripSourcesSection` vs a reconstructed pre-fix version, V-07 RED/GREEN using the real `stableDateLabel`/`relativeTimeLabel` formatters, and a fixture-set-integrity check (every RED class has a GREEN sibling). Wired into `run-test-suite.sh`. Not vacuous.

`.discipline/rendering/fixtures.mjs` — WORKING-WIRED — self-contained HTML/markdown fixtures reproducing three audited layout defects (timeline overflow, long-URL wrap, placeholder-literal leak) in RED/GREEN pairs, at the app's real breakpoint set.
  - WIRING: refs=2 (`assertions.test.mjs` + `run-rendering-guard.mjs`, confirmed).
  - Honestly scoped by its own header: layout fixtures reproduce the *fix's layout contract* via equivalent raw CSS, not the literal `.tsx` (F-1/V-07 legs do reuse the real app modules directly).

`.discipline/rendering/run-rendering-guard.mjs` — WORKING-WIRED (claimed, unconfirmed in-lane) — Playwright-chromium browser runner: renders every fixture at every viewport, measures real `scrollWidth`/`clientWidth`, feeds the same pure detectors `assertions.test.mjs` proves.
  - WIRING: refs=0 with no GRAPH flag (consistent with being a CI-job entry point rather than an imported module). Its header claims invocation by a dedicated, `continue-on-error` "Rendering guard" CI job in `.github/workflows/discipline.yml`; that workflow file is outside this lane, so I did not independently confirm the job exists or currently passes. Requires `playwright`, so it cannot run in the no-npm discipline suite — correctly absent from `run-test-suite.sh`.

`.discipline/rules/012-hardcoded-user-path.mjs` — WORKING-WIRED — content-scan for hardcoded Windows/Git-Bash/operator-Unix/macOS home paths across staged code files, with a narrow exemption list (`node_modules/`, `.git/`, `scripts/tmp/`, `.claude/settings.local.json`).
  - WIRING: refs=2 (`manifest.mjs` + its own test, confirmed).

`.discipline/rules/012-hardcoded-user-path.test.mjs` — TEST — regex-level (all four path shapes + two negative controls), trigger (merge/revert/no-code-files/scripts-tmp/deletion skip), check (pass-on-clean, pass-on-unreadable, fail-per-pattern, multi-violation aggregation across files, scripts/tmp exemption), and metadata. Not vacuous.

`.discipline/rules/014-inventory-consistency.mjs` — WORKING-WIRED — invokes the shared `consistency/override-check.mjs` runner (outside this lane) and evaluates `Consistency-Override:` trailers against its verdict.
  - WIRING: refs=2 (`manifest.mjs` + its own test, confirmed). The imported `consistency/override-check.mjs` and `consistency/runner.mjs` are outside this lane and were not read as part of this pass.

`.discipline/rules/014-inventory-consistency.test.mjs` — TEST — trigger-only coverage (not-on-master, no-inventory-touch, fires-on-touch, skips-merge) + metadata; does not exercise `check()` against a real consistency-runner failure (that would require the out-of-lane runner). Not vacuous for what it does test, but narrower in scope than the sibling rules' tests.

`.discipline/rules/015-row-mutation-guarded-path.mjs` — WORKING-WIRED — flags raw `.update()/.upsert()/.delete()` in staged `scripts/*.mjs` (excluding `_diag/`, `lib/`) not routed through `scripts/lib/db.mjs`'s guarded helpers, with a `Write-Guard-Override:` trailer escape.
  - WIRING: refs=2 (`manifest.mjs` + its own test, confirmed).

`.discipline/rules/015-row-mutation-guarded-path.test.mjs` — TEST — trigger scoping, FAIL on raw write, PASS on guarded helper, PASS on override trailer, metadata. Not vacuous.

`.discipline/rules/016-canonical-anthropic-path.mjs` — WORKING-WIRED — flags direct Anthropic SDK/API usage outside an explicit permitted-file allowlist (canonical wrappers + sanctioned `/api/*` routes), with a `.discipline/` self-exemption (the engine references the pattern to enforce it, not to call it).
  - WIRING: refs=2 (`manifest.mjs` + its own test, confirmed).

`.discipline/rules/016-canonical-anthropic-path.test.mjs` — TEST — FAIL outside permitted set, PASS inside a permitted route, PASS on clean file, metadata. Not vacuous.

`.discipline/rules/017-generation-config-no-raw-env.mjs` — WORKING-WIRED — flags raw `process.env.<KNOB>` reads in generation files (excluding the sanctioned `generation-config.ts`), with a credential-name exemption regex so API keys/DB URLs aren't false-flagged.
  - WIRING: refs=2 (`manifest.mjs` + its own test, confirmed).

`.discipline/rules/017-generation-config-no-raw-env.test.mjs` — TEST — FAIL on knob read, PASS in the config module itself, PASS in a non-generation file, PASS for credential-shaped names, FAIL isolates only the knob when mixed with credentials, metadata. Not vacuous.

`.discipline/rules/018-new-surface-five-model.mjs` — WORKING-WIRED — flags a staged `page.tsx` whose top route segment is outside the five-surface + sanctioned-plumbing allowlist, with a `Surface-Decision-Override:` trailer escape.
  - WIRING: refs=2 (`manifest.mjs` + its own test, confirmed).
  - The `relevant()` filter's boolean precedence (`f.status !== 'D' && n.startsWith(...) && n.endsWith(...) || n === '.../page.tsx'`) is confusing to read (root `page.tsx` is admitted by the `||` branch regardless of the first clause's status check) but is **not a functional defect**: a second `.filter((f) => f.status !== 'D')` immediately after removes deleted files either way, so the net behavior is correct.

`.discipline/rules/018-new-surface-five-model.test.mjs` — TEST — FAIL on a sixth surface (the Technology-page catch), PASS on an allowed surface, PASS on override trailer, PASS on a removed page.tsx (deletion, not a new surface), metadata. Not vacuous.

`.discipline/rules/019-source-reclassify-not-archive.mjs` — WORKING-WIRED — flags a staged script that archives a row with a "source-y" `archive_reason` literal without routing through `reclassifyToSource`, with a `Source-Reclassify-Override:` trailer escape.
  - WIRING: refs=2 (`manifest.mjs` + its own test, confirmed). Its header states the `SOURCEY_REASONS` list is a literal mirror of `db.mjs`'s `SOURCEY_ARCHIVE_REASONS`, kept in sync "by the invariant registry" — that cross-check module is outside this lane and was not independently verified.

`.discipline/rules/019-source-reclassify-not-archive.test.mjs` — TEST — trigger scoping (_diag/lib excluded), FAIL on raw source-archive (the corrected historical error), PASS via `reclassifyToSource`, PASS for a non-source archive reason, PASS on override trailer, metadata. Not vacuous.

`.discipline/rules/020-fork-log-frozen.mjs` — WORKING-WIRED — rejects any commit adding lines to the deprecated `fsi-app/docs/ops/session-log.md` fork (pure deletions allowed), merge commits exempted.
  - WIRING: refs=2 (`manifest.mjs` + its own test, confirmed).

`.discipline/rules/020-fork-log-frozen.test.mjs` — TEST — fires on additions, not on pure deletion, not on the canonical path, skips merges, FAIL/PASS content checks, and Windows-backslash-path normalization (both delete-only-pass and additions-fail cases). Not vacuous.

`.discipline/rules/021-cached-shape-key.mjs` — WORKING-WIRED — asserts `DASHBOARD_DATA_CACHE_KEY` in `supabase-server.ts` equals `"app-data-" + sha1(normalized DashboardData interface block)[0:8]`, and that `data.ts` doesn't re-inline a raw `"app-data-"` literal.
  - WIRING: refs=2 (`manifest.mjs` + its own test, confirmed).
  - NOTE (self-documented limit): the hash covers only the `DashboardData` interface's own text; a shape change via a nested type (`Resource`, `Supersession`, …) does not rotate the key mechanically.

`.discipline/rules/021-cached-shape-key.test.mjs` — TEST — hash changes on shape edit, stable under comment/whitespace-only edits, trigger scoping (shape file / consumer file / unrelated-file / merge / revert), PASS on matching key, FAIL reproducing the exact #395 defect (remediation message prints the correct new key), FAIL on missing constant, FAIL on consumer re-inlining a raw literal, SKIP when content unavailable, FAIL when the interface anchor is renamed/gone. Not vacuous — the most thorough test file in this lane.

`.discipline/run-test-suite.sh` — WORKING-WIRED — the single canonical `node --test` invocation list, shared by the CI "Discipline engine unit tests" job and the pre-push hook (by the file's own explicit design rationale: the two lists had previously drifted). Contains extensive "NAMED EXCLUSIONS" documentation for every `.mjs`/`.ts` test that cannot join the no-`npm-ci` glob (transitively reaches `pg`/`typescript`/`@supabase/supabase-js`/`jiti`), each cross-referenced against `coverage-scan.mjs`'s F23 orphaned-proof ratchet so a silently-dropped proof would fail CI.
  - WIRING: refs=0, no GRAPH flag = entry point, consistent with being invoked directly by CI/pre-push rather than imported.

`.discipline/runner.mjs` — WORKING-WIRED — the rule-execution engine (`commit-msg`/`ci`/`fixture`/`--list` modes), iterating `manifest.mjs`'s rules, catching trigger/check exceptions as engine-level FAILs (fail-loud, never silently skips a rule that throws).
  - WIRING: refs=0, no GRAPH flag = entry point; invoked by git hooks (outside this lane) and exercised directly as a subprocess by `runner.test.mjs`.

`.discipline/runner.test.mjs` — TEST — `--list` output, trivial-commit exit 0, substantial-commit-with-no-trailers exit 0 (post-slim: no attestation required), migration-commit-without-inventory-touch exit 0. Narrow (does not exercise a FAIL path end-to-end via the real CLI, unlike most rule-level tests which do), but not vacuous for what it covers.

`.discipline/skill-drift-gate.test.mjs` — TEST — real-repo positive proof (`checkDrift()` clean against the live checkout) + a non-triviality guard (manifest isn't vacuously empty) + all five seeded-drift negative cases (skill-content-changed, citation-dropped, citation-unpinned, skill-file-missing, unresolved-skill-not-allowlisted) against a synthetic fixture repo in a temp dir. Wired into `run-test-suite.sh`. Not vacuous.

`.discipline/vocab-drift-guard.test.mjs` — TEST — five independent drift guards read directly against migration SQL + TS source: (3a) no competing `DOMAINS` map in `constants.ts`; (3b) no DB-invalid `"medium"` severity literal; (3c) migration 148's SQL `surface_of()` CASE is byte-identical to the generated `renderSurfaceOfSql()` output, plus a produced-surfaces sanity check; (3d) `surface-coverage.ts` delegates to `surfaceOf` rather than keeping a competing vocab set; (3e) retired customs/dangerous-goods scenario tags stay out of the system-prompt glossary, with a vacuousness guard (the replacement group must still exist). Wired into `run-test-suite.sh`. Not vacuous.

## Lane summary

**Counts by status** (70 files):
- TEST: 28 (all non-vacuous — each asserts real RED/GREEN behavior, several with explicit "prove-the-guard-isn't-vacuous" meta-tests)
- WORKING-WIRED: 37 (confirmed by refs>0 cross-imports read directly in-lane, or by a wired test file exercising the module against the real repo)
- OPERATOR-TOOL: 4 (`dispatch/audit.mjs`, `dispatch/start.mjs`, `install-hooks.mjs`, `governance/wire-pretooluse-settings.mjs` — each has an explicit manual-CLI usage comment and no automated caller)
- WORKING-UNWIRED: 1 (`lib/adr-loader.mjs`)

Several files nominally WORKING-WIRED rest on wiring that lives partly *outside* this lane (git hook scripts under `.discipline/hooks/`, `consistency/override-check.mjs`, `.github/workflows/discipline.yml`, `~/.claude/settings.json`) — flagged individually above as "claimed, unconfirmed in-lane" rather than silently assumed.

**Ranked findings**

1. **DEAD code with a latent path-stripping bug** — `.discipline/governance/wire-pretooluse-settings.mjs:38`. `canonicalCommand` is computed and never used (only `cmdWin` on line 40 feeds the actual written command, line 51). The dead expression itself strips the leading `/` off an absolute POSIX path (`pathToFileURL(HOOK).pathname.replace(/^\//, "")`), which would silently turn the hook's `node` command into a broken relative path — and the built-in `|| printf %s '<ask-JSON>'` fallback would mask that failure as an innocuous "ask" every time, if this variable were ever swapped in for `cmdWin`. Currently harmless only because it's unused.

2. **WORKING-UNWIRED capability, orphaned by a rule deletion** — `.discipline/lib/adr-loader.mjs`. Fully built and well-tested (ADR frontmatter parsing + scope-glob intersection), but by its own docstring exists to serve "the 13th binding rule" — and `manifest.mjs` documents that rule 013 (along with 001-011) was deleted in the 2026-05-21 post-slim audit. No surviving rule (012, 014-021) imports it. Only its own test calls it.

3. **GRAPH:UNREACHABLE overturned** — `.discipline/governance/pretooluse-skill-gate.mjs` (refs=0) is not dead: it is the actual PreToolUse hook script, invoked out-of-repo via `~/.claude/settings.json`, corroborated in-repo by `wire-pretooluse-settings.mjs` (writes that wiring) and `check-pretooluse-wired.mjs` (verifies it) plus its own subprocess-spawning fire-test. The static import-graph correctly can't see hook registration that lives outside the repo by design — worth recording so this isn't mistaken for dead code on graph evidence alone.

4. **Naming-hygiene collision, not a functional bug** — `.discipline/governance/invariants.mjs` reuses the `RD-13` prefix for two unrelated invariants (`RD-13-one-url-canonicalizer` ~L874 and `RD-13-error-body-groundability-gate` ~L904) and `RD-14` for two more (`RD-14-line-read-is-not-verification` ~L884 and `RD-14-transport-escalation-write-gate` ~L914). Full ID strings differ so no code-level collision exists, but a reader cross-referencing bare "RD-13"/"RD-14" in prose elsewhere would be ambiguous about which invariant is meant.

5. **Minor completeness gap in an informational-only detector** — `.discipline/governance/producer-consumer-orphan.mjs:79` — `SQL_WRITE_RE` matches `INSERT INTO`/`UPDATE` but not `DELETE FROM`, so a table written only via SQL DELETE could be mis-reported by the (non-gating) read-orphan informational pass. Does not affect the gating write-orphan check, which requires a CODE writer.

6. **Wiring claims not independently verifiable within this lane** — `check-pretooluse-wired.mjs` (pre-push invocation), `worktree-isolation-hook.mjs` (git post-checkout/pre-commit hook files), `run-rendering-guard.mjs` (`.github/workflows/discipline.yml` CI job), and rule 014's `consistency/override-check.mjs` dependency all point at real mechanisms whose other half lives outside `.discipline/` (in `.discipline/hooks/`, `.discipline/consistency/`, `.github/workflows/`, or `~/.claude/`) — none of those paths are in this lane's file list, so their existence/correctness is taken on the in-lane file's own word, not independently confirmed.

7. **`rules/014-inventory-consistency.test.mjs` has narrower coverage than its 8 sibling rule tests** — it exercises only `trigger()` (branch/no-touch/fires/merge-skip), never `check()` against a real consistency-runner PASS/FAIL, because that requires the out-of-lane `consistency/override-check.mjs` and `consistency/runner.mjs`. Not a defect in what's tested, but a gap relative to the lane's otherwise-consistent pattern of full trigger+check coverage per rule.

8. No file in this lane writes to, or reads from, any table in `table-usage.txt` — this is pure repo-governance tooling (git/filesystem/CI scans), so the 0-row-table cross-check the brief calls for does not apply to this lane.

**Coverage attestation**: files read in full: 70/70, lines read: 9,923 (sum of the lane manifest's stated line counts; the two largest files, `governance/doctrine-register.mjs` at 632 lines and `governance/invariants.mjs` at 1240 lines, were each read to completion across multiple offset chunks due to per-call token limits — confirmed complete by matching the final line number to the file's reported length in both cases).
