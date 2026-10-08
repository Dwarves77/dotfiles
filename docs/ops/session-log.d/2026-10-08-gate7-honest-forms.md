# 2026-10-08, lane GATE-7 (gate7-honest-forms): the rules and hooks catch every honest form the attack register found them blind to

Doctrine: the sentence added to ADR-046 by this lane (addendum 2026-10-08). The commit rules, hooks and PreToolUse gates are mistake-catchers for cooperating sessions, not an adversary boundary. A bypass that needs intent is out of scope and recorded; a blind spot on an honest form is a defect. Register: `fsi-app/scripts/tmp/aud-at3-gates-attacked-2026-10-08.md` (216 attacks, 187 ACCEPTED).

## Accomplished

1. **Staged blob, one site.** `ctx.getFileContent` (`lib/context.mjs`) returns `git show :<path>` for a proposed commit, `git show <sha>:<path>` for an existing commit and the range head's tree for a range. The repository root is fixed when the context is built. Rules 015, 019 and 021 decide on what the commit carries.
2. **Honest forms per rule**, each with the register attack as its negative test (tests cite the id):
   - 012: adjacent string literals folded (`lib/mask-source.mjs` `foldStringConcat`), doubled and percent-encoded separators, any drive letter in either case (a URL scheme is not a drive), the two-argument join form, `.cjs .mts .cts .jsx .ps1 .py .toml`, exempt prefixes anchored to the start of the path.
   - 015: the lexer moved to `lib/mask-source.mjs` (one copy; 015 re-exports `maskNonCode`); string-index method names (also split), `const { from: t } = sb` aliases, raw PostgREST writes through `fetch`, `exec_sql` RPCs; guarded-path exemption read on code only (an import specifier or a name outside comments and strings); every script extension; the scripts/lib exemption is `db.mjs` itself; a proof file is exempt only while it builds no real client. `rawWriteHits(content, { honest: true })` is the rule's option; the coverage scan keeps the narrower default so its census does not move.
   - 017: generation files derived from the skill map (G-class entries under `src/lib/agent/`), destructured, alias, spread, computed, optional-chain and `import.meta.env` reads, credential exemption read at the END of the name.
   - 018: `page.jsx/.ts/.js`, `route.ts/.js` outside `/api`, pages router.
   - 019: concatenated reasons, the helper counted as an identifier in code only, an aliased archive helper, every script extension.
   - 021: interface, key constant and consumer literal located with comments masked (the committed key is unchanged, checked on the real file), a split consumer literal, deletion or rename of the shape file refused.
   - 022: escape and entity forms, the look-alikes U+2015, U+2212, U+2011, marker as a token, anchored exemptions (`fixtures` only under the three code roots, `docs/archive/` only at the top).
   - edit-extend: `introducedMatches(info, test, extract)` charges the surplus occurrence on an edited line (used by 012, 015, 017, 019, 022).
3. **Rule 023, source file not diffed as text** (new, one site): a `Binary files ... differ` line on a source-extension file (a binary or `-diff` attribute, a NUL byte, UTF-16) is itself a finding, in the commit hook and in CI. Covers the 9 register rows where a content rule saw no hunk.
4. **Pre-push**: step 0d refuses when a tracked hook file differs from HEAD (names the files and prints the diff); step 1 also lists untracked files under `hooks/` and `lib/`; `docs-only-range.mjs` (0c) and `memory-gate.mjs` (2b) read `gitChangedPaths` (`git diff --no-renames --name-only`, new in `lib/change-range.mjs`), so a rename is classed by its source path as well as its destination.
5. **Worktree isolation** (`worktree-isolation.mjs`, hooks): the commit block no longer depends on the child-session marker; the main checkout refuses a commit (pre-commit), a merge commit (new pre-merge-commit) and alarms on a landed commit (new post-commit, cherry-pick path) and, for an agent context, on a ref move by `reset --hard` or `symbolic-ref` (new reference-transaction). No-node fallback in plain shell (`hooks/lib/main-checkout-guard.sh`).
6. **PreToolUse**: `pretooluse-scope.mjs` (new; the scope decision, versioned and tested in the repo); `skill-map.mjs` (canonical path compare, the gate files and the CI workflow governed under remediation-discipline, danger verbs, mutating-word MCP names, tool tables, more isolation forms); the gate (structural git push and rm detection with global options, `.exe`, aliases, wrappers env/nohup/timeout/nice/sudo, heredoc and here-string bodies fed to interpreters, quoted flags, one-pass SQL skeleton with read, suspect and write classes, PowerShell and Monitor as shell tools, EnterWorktree and ExitWorktree asked, ArtifactData and Artifact by action, SendMessage asked, relative and short-name edit paths); `skill-token.mjs` (a Read satisfies a slug only at `/.claude/skills/<slug>/SKILL.md` and only when it resolved).
7. **vault-sync** stops when the fast-forward would overwrite a gitignored local file that origin adds as tracked, naming the path; its merge sets `DISCIPLINE_VAULT_SYNC=1` so the ref-move alarm never fires on it.
8. **Firing log** (`lib/firing-log.mjs`, the one writer; the runner now uses it): the worktree-isolation hooks, vault-sync stops and every PreToolUse deny or ask write a line; a shell interpreter run on a script file is counted as a `note`. The pre-push steps keep their existing `pre_push_log_firing`.
9. **Coordinator addition (TESTFIX-1)**: the gate's audit log moved to `fsi-app/.discipline/out/gate-audit.log` (gitignored directory), path injectable (`GATE_AUDIT_LOG=<path>`, `off`); the gate's test sets both it and the firing log into a temp directory. The only reader of the old file was that test; the wired check never read it.
10. ADR-046 addendum (the scope sentence verbatim).

## Read and reused

Read in full: COMMON, the brief, `CLAUDE.md`, `lane-common-contract.md`, the register, ADR-046, `runner.mjs`, `manifest.mjs`, `lib/context.mjs`, `lib/baseline.mjs`, `lib/result.mjs`, all seven rules and their tests, `governance/pretooluse-skill-gate.mjs` and its test, `skill-map.mjs`, `skill-token.mjs`, `worktree-isolation.mjs` and `-hook.mjs` and test, `hooks/pre-commit`, `commit-msg`, `post-checkout`, `pre-push`, `install-hooks.mjs`, `docs-only-range.mjs`, `memory-gate.mjs`, `check-pretooluse-wired.mjs`, `.claude/hooks/vault-sync.mjs` and test, the user-level shim (read only), the GATE-2 session log. Reused: rule 015's `maskNonCode` (moved, not copied; the brief names `coverage-scan.mjs`'s `stripComments`, but that module imports rule 015, so importing it from the rules would be a cycle, and it is a regex strip, not a tokenizer), `introducedMatches`, `resolveRange`, `skillsForFile`, `skillsForClass`/GOVERNED for rule 017, `isMainModule`, `installHooks` for the hook end-to-end tests, the engine's firing log (extracted to `lib/firing-log.mjs` and reused by every other gate), the GATE-2 `wrapperSourceDelegates` check (the new shim passes it, verified).

## Decisions

- **Item 7 reading.** The brief says the marker being absent, 0, false or empty all mean "not a child" and "the main checkout refuses". Built as: a commit or merge commit in the main checkout is refused for everyone (the marker is not trusted); the branch-move alarms (post-checkout, reference-transaction) stay agent-only because a human legitimately moves branches there. [HYPOTHESIS] this is the intended reading; if the operator commits in the main checkout by hand, `--no-verify` is the existing path, and the coordinator rules.
- **`commit-tree` plus `update-ref` stays out of scope** (A-H1-7): it fires no git hook, and a reference-transaction block would also fire on vault-sync's fast-forward of the main checkout.
- **Scope module in the repo.** The shim's scope logic moved to `pretooluse-scope.mjs`; the shim imports it and fails TOWARD the gate if the import fails. The gate re-exports `inScope`.
- **GOVERNED gate files** go under the existing remediation-discipline entry (the worktree-isolation module already cites that skill as governing).
- **Mutating-word MCP names** use a destructive-verb token list, not every verb, so `get_deployment_check_run` and `list_vercel_ci_job_runs` stay reads. A SELECT calling a mutating-looking function is `unknown` (asked), never silently allowed.
- Commit trailer uses the model name from the session attribution reminder.

## Evidence (red on the old code, green on the new; `node --test <file>`)

| File | Old code | New code |
|---|---|---|
| `rules/012` test | 28 pass, 8 fail | 36 pass |
| `rules/015` test | 34 pass, 8 fail | 42 pass |
| `rules/017` test | 10 pass, 8 fail | 18 pass |
| `rules/018` test | 12 pass, 3 fail | 15 pass |
| `rules/019` test | 12 pass, 6 fail | 18 pass |
| `rules/021` test | 11 pass, 4 fail | 15 pass |
| `rules/022` test | 35 pass, 7 fail | 42 pass |
| `rules/023` test (new rule) | file cannot import | 7 pass (4 on real throwaway repositories, commit-msg and CI mode) |
| `lib/context.test.mjs` | blob, binary and extract tests absent | 22 pass |
| `governance/worktree-isolation-hooks.test.mjs` (real git hooks) | 1 pass, 4 fail | 5 pass |
| `hooks/pre-push-honest-forms.test.mjs` | 1 pass, 2 fail | 3 pass |
| `governance/rename-source-class.test.mjs` | 2 pass, 1 fail | 3 pass |
| `.claude/hooks/vault-sync-collision.test.mjs` | cannot import `ignoredCollisions` | 2 pass |
| `governance/pretooluse-honest-forms.test.mjs` | cannot import the new exports | 69 pass |
| existing gate, isolation, token, memory, docs-only, change-range, install, runner tests | | green (runner 20 pass) |

## Attack ids mapped (187 ACCEPTED rows)

**131 turned from ACCEPTED to refused or alarmed in repo code** (each has a named test above); **56 stay** (listed with the reason below). Of the 131: 12 (the seven A-PT-R tool-routing rows and A-PT-S1, S2, S3, S4, S8) take effect only when the executor applies the shim and the matcher below; four hook rows (A-H1-5, A-H1-6, A-H3-2, A-H3-3) take effect only after `node fsi-app/.discipline/install-hooks.mjs` is re-run (four new hook names). A-H1-5, A-H3-2 and A-H3-3 are alarms, not blocks (git has already moved).

Fixed:
- R012: A012-1 to A012-10 (incl. 3b; A012-8 and A012-9 through rule 023)
- R015: A015-1 to A015-10, A015-12 (rule 023), A015-13
- R017: A017-1 to A017-9 (A017-9 through rule 023)
- R018: A018-1, A018-1b, A018-2, A018-6
- R019: A019-1, A019-2, A019-4, A019-6, A019-7 (rule 023), A019-8, A019-10
- R021: A021-1, A021-1b, A021-3, A021-5, A021-7
- R022: A022-1 to A022-6, A022-7 and A022-8 (rule 023), A022-9
- H1: A-H1-1 (marker 0, false, empty), A-H1-2, A-H1-3, A-H1-4 (three branch names), A-H1-5, A-H1-6
- H3: A-H3-2, A-H3-3
- CI mode: A-CI-012, A-CI-binary, A-CI-022, A-CI-015
- PT-bash: A-PT-B1 to B8, B10 to B15, B17, B19, B20, B22, B23
- PT-edit: A-PT-E1 to E9 (E4 expands the short name only when the file system has one)
- PT-skill: A-PT-T2; PT-mcp: A-PT-M1 to M5; PT-iso: A-PT-I2, I3, I4, I6, I7
- PT-shim: A-PT-S1, S2, S3, S4, S8; PT-reg: A-PT-R-PowerShell, -Monitor, -EnterWorktree, -ExitWorktree, -ArtifactData, -Artifact, -SendMessage
- CC-vault: A-V-7; pre-push: A-P0-3, A-P0c-1 (both range forms), A-P1-2, A-P2b-1, A-P3-3

Not fixed (56 rows), id then reason:

| id | reason |
|---|---|
| A015-11 | scope: rule 015 polices scripts/; src writers are held by the shared-writer registry and the F-functions |
| A018-3, A018-3b | a nested route below an allowed segment is a sub-view; no second-level surface list exists |
| A019-3 | reason imported from another module: needs cross-file resolution; migration 135 holds the property in the database |
| A021-2, A021-6 | nested type or a type in an unwatched file: needs the TypeScript type graph (npm dependency, not importable in the no-npm glob); the author's stated limit |
| A022-11 | commit-message channel not in the brief; scanning messages would fail every in-flight branch in validate-commits |
| A-H2-1, -2, -3, -4, -6, -7, -8, -9, -10c | intent (`--no-verify`, `core.hooksPath`, `GIT_CONFIG_COUNT`, `DISCIPLINE_REPO_ROOT`, plumbing, engine edited or deleted in the same commit, deleting origin/master) |
| A-H2-5 | commit-msg skips without node on PATH; not in the brief (the isolation hooks now decide in shell) |
| A-H2-11, -13, -14 | cherry-pick, am and rebase run no commit-msg; CI validate-commits runs the repaired engine over the pushed range |
| A-H1-7 | plumbing (commit-tree plus update-ref) fires no git hook |
| A-M-1 | a merge commit is skipped per commit by design; the whole-range pass (A-M-2, refused) covers it |
| A-PT-B9, B16, B21 | intent: variable indirection, npm script indirection, verb built from pieces |
| A-PT-B18 | psql reading a file: the file is not the command line |
| A-PT-B24 to B27 | not in the brief: a Bash edit of a governed file |
| A-PT-T1 | intent: forged skill name |
| A-PT-M6 | not in the brief: navigate to a destructive GET |
| A-PT-I1 | an alias defined in git config is not visible to the gate; the command-line `-c alias.x=y` form is fixed |
| A-PT-I5 | intent: subcommand by substitution |
| A-PT-S5, S6, S7 | the call names no project path and its cwd is outside every project directory: not attributable to this project (a call that names one is now in scope) |
| A-P3c-1, A-P3c-3 | step 3c is not in the brief; its REQUIRED list is in `check-pretooluse-wired.mjs` (NEEDS WRITE-SET EXPANSION, below) |
| A-P3c-2 | intent: forged wrapper |
| A-P0-1, A-P0-2b, A-P0b-2, A-P-1, A-P-2, A-P2c-1b, A-P2c-2 | intent (exported variable, replaced installed hook, `NODE_PATH`, `--no-verify`, `core.hooksPath`, landed with `--no-verify`) |
| A-P0b-1b | content of a forged package.json: not in the brief |
| A-P1-1 | an untracked ordinary source file is scratch until added |
| A-P2-1 | consistency-override content: the consistency lane, not in the brief |
| A-P2b-2, -3, -4 | memory gate content and CODE set: not in the brief |
| A-P3-1 | heavy steps are opt-in by ADR-040 |
| A-P0c-2, A-P0c-3 | not in the brief: a pinned SKILL.md or an executable under docs/ classed docs-only |

## User-level changes for the executor (NOT applied by this lane; out of repo)

Back up first. Both changes are needed for the 12 rows marked above.

**1. Matcher.** In `~/.claude/settings.json`, in the single PreToolUse entry that runs `pretooluse-fsi-app-scope.mjs`, change the `matcher` value from
`^(Bash|Edit|Write|MultiEdit|NotebookEdit|Agent|Task|Workflow|mcp__.+)$` to
`^(Bash|PowerShell|Monitor|Edit|Write|MultiEdit|NotebookEdit|Agent|Task|Workflow|SendMessage|EnterWorktree|ExitWorktree|ArtifactData|Artifact|mcp__.+)$`.
The lane did not read or write that file (it holds credentials).

**2. Shim.** Replace the whole content of `~/.claude/hooks/pretooluse-fsi-app-scope.mjs` with the block below (it is a replacement file, not a diff, because the old file carries dash glyphs in comments that a diff block would repeat). It differs from the current file in: a `SCOPE` constant, the scope regexes and the per-tool branches removed, `inScope` taken from `pretooluse-scope.mjs`, fail toward the gate if that import fails, and the comment text. Verified before this entry was written: `wrapperSourceDelegates` accepts it; a copy repointed at this worktree answered `ask` for `node fsi-app/scripts/x.mjs --apply` from an unrelated cwd (A-PT-S1), `ask` for `git push` from a worktree root (A-PT-S3), `ask` for an Agent dispatch naming fsi-app (A-PT-S6), `ask` for PowerShell `git push`, and `allow` for `git push` from an unrelated directory (another project).

```js
#!/usr/bin/env node
// Scopes the Caro's Ledge action-time skill gate (pretooluse-skill-gate.mjs) so it only
// fires for tool calls that actually touch the fsi-app project or one of its git worktrees
// (e.g. dotfiles-wt-*/fsi-app, dotfiles-events/fsi-app). Outside that scope (any other
// repo, e.g. Pet Pursuit, corvette23) this allows unconditionally so unrelated projects
// are never blocked by fsi-app-specific governance.
//
// Scope is decided by pretooluse-scope.mjs in the repo (lane GATE-7, 2026-10-08), where it is versioned and
// tested: fsi-app as a path part or a word in the command or the tool input, a relative file path resolved
// against the cwd, a cwd that is or sits under a directory holding fsi-app (a repo or worktree root), and the
// repo-root governed files. This shim only loads it. Outside that scope (any other repo, e.g. Pet Pursuit)
// the call is allowed so unrelated projects are never blocked by fsi-app governance.
//
// Fails TOWARD the real gate, not away from it: if this wrapper can't read or parse the
// payload, it hands off to the real gate rather than allowing, so a bug here can never
// silently disable Caro's Ledge governance. Only a confirmed out-of-scope target short-circuits.
//
// Lives under ~/.claude/, not dotfiles/fsi-app: this is a harness-level routing shim,
// not product doctrine, so it is untouched by any fsi-app/dotfiles sync or commit.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const GATE = "C:/Users/jason/dotfiles/fsi-app/.discipline/governance/pretooluse-skill-gate.mjs";
const SCOPE = "C:/Users/jason/dotfiles/fsi-app/.discipline/governance/pretooluse-scope.mjs";

async function runGate(input) {
  let out = "";
  try { out = (await import(pathToFileURL(GATE).href)).runGate(input); } catch { /* fall through: fail closed */ }
  if (out) {
    process.stdout.write(out);
  } else {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: "skill-gate: node hook unavailable, failing closed.",
      },
    }));
  }
  process.exit(0);
}

function allow() {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" },
  }));
  process.exit(0);
}

let raw = "";
try { raw = readFileSync(0, "utf8"); } catch { await runGate(""); }

let payload;
try { payload = JSON.parse(raw); } catch { await runGate(raw); }

// Fails TOWARD the gate: a scope module that cannot be loaded, or that throws, sends the call to the gate.
let inScope = true;
try { inScope = (await import(pathToFileURL(SCOPE).href)).inScope(payload); } catch { /* keep true */ }

if (inScope) await runGate(raw);
allow();
```

**3. Hooks.** After this merges, from the main checkout: `node fsi-app/.discipline/install-hooks.mjs` (installs trampolines for the new `pre-merge-commit`, `post-commit` and `reference-transaction` hooks; the others pick up the changed files with no re-install).

## NOT done

- **NEEDS WRITE-SET EXPANSION: `fsi-app/.discipline/governance/invariants.d/RD-96-source-diffed-as-text.mjs`**, because rule 023 is registered in `manifest.mjs` and the invariant-coverage meta-gate (`governance/invariant-coverage.test.mjs`) fails with "ORPHAN MECHANISM: rule 023 is in the manifest but no invariant references it". Proposed fix: one file in the shape of `RD-69-no-dash-glyphs.mjs` (id `RD-96-source-diffed-as-text`, skill `remediation-discipline`, the same section and anchor, `enforcedBy: ['rule:023']`, text: a source file that git does not diff as text hides its lines from every content rule, so it is a finding). Until it is granted this lane's branch is NOT pushed.
- NEEDS WRITE-SET EXPANSION (optional, separate): `governance/check-pretooluse-wired.mjs` `REQUIRED` list does not name PowerShell, Monitor, EnterWorktree, ExitWorktree, ArtifactData, Artifact or SendMessage, so step 3c cannot notice an unrouted matcher (A-P3c rows).
- Not run locally, per COMMON rule 9 and ADR-040: the full suite, the fitness runner, `tsc`. ESLint (max-warnings 0) was run on every changed file under `fsi-app/` and is clean.
- `docs/inventories` were not regenerated (no migration, no component).
- The old `governance/.gate-audit.log` ignore line in `fsi-app/.gitignore` is left; `.discipline/out/` was already ignored.

## Open items

- Whether the main checkout should refuse commits for the human operator as well (item 7 reading above).
- A-H2-11, -13, -14 (cherry-pick, am, rebase run no commit-msg) are covered only by CI validate-commits; a local post-commit run of the engine in CI mode on the landed commit would close the local gap if the coordinator wants it.
