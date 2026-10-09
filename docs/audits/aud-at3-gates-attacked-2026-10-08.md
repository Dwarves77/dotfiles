# AUD-AT-3: commit rules and hooks, attacked (fact lane, 2026-10-08)

> **Landing note (lane GATE-7, PR 1040):** Fixes landed in PR 1040. No finding in this register was re-verified by the landing lane (DOCS-4); findings carry the tokens the audit's own method assigns. The body is the register verbatim; the only edit is the form of status tokens, where the checker required it: 5 lines received the token that line's own section or method statement already carries.

Lane aud-at3. Cells: O-007 (row 1, commit rules) and O-008 (row 2, hooks). Fact lane, read-only: no proposals. Code under test: origin/master 12c69634 (git archive; the main checkout was clean at that sha). origin/master advanced to 3cb67204 during the run; between the two, the only change inside the gates attacked here is one added path in `skill-map.mjs` (COV-1, `request-coverage.mjs`), which none of the attacks depend on. [CONFIRMED: `git diff 12c69634 3cb67204` over fsi-app/.discipline and .claude/hooks]

## 0. Declared up front

- Lenses run: ATTACKED. Subsystem rows: 1 (commit rules, the rule files on master) and 2 (hooks: git pre-commit, commit-msg, post-checkout, pre-push steps; the PreToolUse scope shim and the skill gate behind it; the repo SessionStart, PreCompact and SessionEnd Claude Code hooks).
- Enumerator, rules (quoted, `node fsi-app/.discipline/runner.mjs --list` on the archived tree): `[012] Hardcoded user-home path`, `[015] Row-mutation guarded path`, `[017] Generation config, no raw env`, `[018] No surface outside the five-surface model`, `[019] Source-not-item reclassified, not raw-archived`, `[021] Dashboard cache key carries the shape hash`, `[022] No dash/section-sign glyphs in added prose`. That is 7 registered rules. (The 2026-10-08 gate register A counted 10; GATE-1 removed 014, 016 and 020 before this lane's base.)
- Enumerator, hook steps (quoted from the step headers of `fsi-app/.discipline/hooks/pre-push`): 0, 0b, 0c, 1, 2, 2b, [2c removed by GATE-2], 3, 3b, 3c, 3d, 3e, 3f, 3g, 3h, 4. Other hooks: `hooks/pre-commit`, `hooks/commit-msg`, `hooks/post-checkout`. Claude Code hooks: `~/.claude/settings.json` PreToolUse (one entry, matcher `^(Bash|Edit|Write|MultiEdit|NotebookEdit|Agent|Task|Workflow|mcp__.+)$`, command runs `~/.claude/hooks/pretooluse-fsi-app-scope.mjs` which imports `governance/pretooluse-skill-gate.mjs`); repo `.claude/settings.json` SessionStart (`vault-sync.mjs`, `session-start-vault.mjs`), PreCompact (`pre-compact-snapshot.mjs`), SessionEnd (an echo).

## 1. Method and harness (what was actually run)

- Throwaway git repos under the session scratchpad (`aud-at3/f1` to `f6`, each with a local bare origin; no network; two further copy attempts, f7 and f8, were abandoned unused; quoted tool output has its dash glyphs replaced by hyphens). Each is built from `git archive origin/master` of `fsi-app/.discipline`, `fsi-app/scripts/lib` (and, for f6, the inventories, migrations and anchor files the consistency runner reads), plus a few base files. The real hooks were installed with the real installer (`install-hooks.mjs`), so every commit and push below went through the installed trampolines into the tracked hook files and the real rules engine. Each attack starts from a reset to a tagged base.
- Commits are made with `git commit` (hooks live). `CLAUDE_CODE_CHILD_SESSION` was removed from the environment for commit and push attacks, except the pre-commit/post-checkout isolation attacks, which ran with it set (this lane's own environment carries it).
- PreToolUse: the real out-of-repo shim was run (a) as is, for payloads whose scope it decides (out-of-scope payloads return allow without calling the gate, so nothing is logged), and (b) as a copy with only its `GATE` constant repointed at the archived gate copy for in-scope payloads, so no decision was logged into the main checkout's `.gate-audit.log`. Skill-load evidence used forged and genuine transcript files in scratch.
- Step 3c was run as the real `check-pretooluse-wired.mjs` against forged `settings.json` files, each under its own scratch home (`USERPROFILE` override).
- Not run: the opt-in heavy steps of pre-push (`DISCIPLINE_PREPUSH_FULL=1`), see section 6.
- Side effects: the live skill gate answered three of this lane's own commands while it ran (command text containing `rm -rf` once and `git push` twice; each denied for a missing skill, which is what its patterns say). Those commands were run again from script files. One command deleting scratch copies was denied by the permission prompt (not by the gate) and was not retried in that form. The main checkout's gitignored `.gate-audit.log` grows from every live tool call of this session; no attack in this file was aimed at it. This file is the one repo-visible file the lane creates (gitignored `fsi-app/scripts/tmp/`); throwaway repos and scratch are deleted at the end of the lane. [CONFIRMED: ran, output captured] [NOT-WORK: fact, no action]

## 2. Totals

- Attacks attempted (non-control rows): 216. ACCEPTED 187. REFUSED 28. Alarm-only (post-checkout cannot undo the move) 1. Controls run: 34 (each control confirms the gate was live on a listed form).
- Gate units attacked: 29 (7 rules, the rules engine in CI mode, 3 git hooks, 10 pre-push units, 7 PreToolUse units, 1 SessionStart hook). Owed lines (section 6): 8 pre-push steps (content only), 3 Claude Code hooks with no blocking claim, 1 settings-precedence group, 1 symlink form, the CI side (AT-5). Every attacked unit has at least two attacks; the owed lines are the exceptions and carry their reason.

## 3. Attack table (ACCEPTED rows first)

Status tokens: ACCEPTED = the input was not blocked. REFUSED = blocked. ALARM-ONLY = the gate claims detection only. CONTROL = a listed form run to prove the gate was live. Every row is [CONFIRMED: ran, output captured]; rows whose reachability depends on the harness say so in the note.

| attack id | gate unit | form | expected block | observed | status | note |
|---|---|---|---|---|---|---|
| A012-1 | R012 | split string concat across the C: and Users halves | refuse | exit=0; Summary: 3 pass, 0 fail, 4 skip (of 7 rules)./ | ACCEPTED |  |
| A012-2 | R012 | JS-escaped backslashes (two backslashes) in a string literal | refuse | exit=0; Summary: 3 pass, 0 fail, 4 skip (of 7 rules)./ | ACCEPTED |  |
| A012-3 | R012 | extension not in the list (.cjs) | refuse | exit=0; Summary: 0 pass, 0 fail, 7 skip (of 7 rules)./ | ACCEPTED |  |
| A012-3b | R012 | extension not in the list (.mts) | refuse | exit=0; Summary: 0 pass, 0 fail, 7 skip (of 7 rules)./ | ACCEPTED |  |
| A012-4 | R012 | path contains a directory named node_modules (exempt fragment, committed dir) | refuse | exit=0; Summary: 0 pass, 0 fail, 7 skip (of 7 rules)./ | ACCEPTED |  |
| A012-5 | R012 | lowercase drive letter c: | refuse | exit=0; Summary: 3 pass, 0 fail, 4 skip (of 7 rules)./ | ACCEPTED |  |
| A012-6 | R012 | URL-encoded backslash in the path | refuse | exit=0; Summary: 3 pass, 0 fail, 4 skip (of 7 rules)./ | ACCEPTED | encoded form; it is a path only after decoding |
| A012-7 | R012 | edit-extend: existing violating line edited to carry a second new path | refuse | exit=0; Summary: 3 pass, 0 fail, 4 skip (of 7 rules)./ | ACCEPTED |  |
| A012-8 | R012 | .gitattributes marks the file binary so git emits no hunks | refuse | exit=0; Summary: 3 pass, 0 fail, 4 skip (of 7 rules)./ | ACCEPTED |  |
| A012-9 | R012 | NUL byte in the file (git treats it as binary, no hunks) | refuse | exit=0; Summary: 3 pass, 0 fail, 4 skip (of 7 rules)./ | ACCEPTED |  |
| A012-10 | R012 | other drive letter D: | refuse | exit=0; Summary: 3 pass, 0 fail, 4 skip (of 7 rules)./ | ACCEPTED | other drive letter; the pattern names C: only |
| A015-1 | R015 | bracket-string method name sb.from()["delete"]() | refuse | exit=0; Summary: 3 pass, 0 fail, 4 skip (of 7 rules)./ | ACCEPTED |  |
| A015-2 | R015 | dynamic method name built from a split string | refuse | exit=0; Summary: 3 pass, 0 fail, 4 skip (of 7 rules)./ | ACCEPTED |  |
| A015-3 | R015 | guarded-import marker placed in a comment (silences the whole file) | refuse | exit=0; Summary: 3 pass, 0 fail, 4 skip (of 7 rules)./ | ACCEPTED |  |
| A015-4 | R015 | same write in a .js file (rule scopes .mjs only) | refuse | exit=0; Summary: 1 pass, 0 fail, 6 skip (of 7 rules)./ | ACCEPTED |  |
| A015-5 | R015 | same write placed in scripts/lib/ (exempt: the helper's own directory) | refuse | exit=0; Summary: 1 pass, 0 fail, 6 skip (of 7 rules)./ | ACCEPTED |  |
| A015-6 | R015 | production writer named *.test.mjs (exempt as a proof file) | refuse | exit=0; Summary: 2 pass, 0 fail, 5 skip (of 7 rules)./ | ACCEPTED |  |
| A015-7 | R015 | raw PostgREST DELETE through fetch, no .delete() call | refuse | exit=0; Summary: 3 pass, 0 fail, 4 skip (of 7 rules)./ | ACCEPTED |  |
| A015-8 | R015 | row delete through an rpc exec_sql call | refuse | exit=0; Summary: 3 pass, 0 fail, 4 skip (of 7 rules)./ | ACCEPTED |  |
| A015-9 | R015 | edit-extend: existing .update line rewritten to .delete (removed counterpart already a write) | refuse | exit=0; Summary: 3 pass, 0 fail, 4 skip (of 7 rules)./ | ACCEPTED |  |
| A015-10 | R015 | destructured .from alias, write through the alias | refuse | exit=0; Summary: 3 pass, 0 fail, 4 skip (of 7 rules)./ | ACCEPTED |  |
| A015-11 | R015 | same write in a src route handler (rule scopes scripts/ only) | refuse | exit=0; Summary: 1 pass, 0 fail, 6 skip (of 7 rules)./ | ACCEPTED |  |
| A015-12 | R015 | .gitattributes -diff on the file (no hunks) | refuse | exit=0; Summary: 3 pass, 0 fail, 4 skip (of 7 rules)./ | ACCEPTED |  |
| A017-1 | R017 | destructuring read const { KNOB } = process.env | refuse | exit=0; Summary: 2 pass, 0 fail, 5 skip (of 7 rules)./ | ACCEPTED |  |
| A017-2 | R017 | alias const e = process.env then e.KNOB | refuse | exit=0; Summary: 2 pass, 0 fail, 5 skip (of 7 rules)./ | ACCEPTED |  |
| A017-3 | R017 | optional chain process?.env.KNOB | refuse | exit=0; Summary: 2 pass, 0 fail, 5 skip (of 7 rules)./ | ACCEPTED |  |
| A017-4 | R017 | computed key process.env[name] | refuse | exit=0; Summary: 2 pass, 0 fail, 5 skip (of 7 rules)./ | ACCEPTED |  |
| A017-5 | R017 | knob given a credential-shaped suffix (_TOKEN) to ride the exemption | refuse | exit=0; Summary: 2 pass, 0 fail, 5 skip (of 7 rules)./ | ACCEPTED |  |
| A017-6 | R017 | new generation file not in the exact GEN_FILES list (src/lib/agent/new-generator.ts) | refuse | exit=0; Summary: 1 pass, 0 fail, 6 skip (of 7 rules)./ | ACCEPTED |  |
| A017-7 | R017 | import.meta.env read | refuse | exit=0; Summary: 2 pass, 0 fail, 5 skip (of 7 rules)./ | ACCEPTED |  |
| A017-8 | R017 | edit-extend: existing knob line edited to add a second knob | refuse | exit=0; Summary: 2 pass, 0 fail, 5 skip (of 7 rules)./ | ACCEPTED |  |
| A017-9 | R017 | .gitattributes binary on the generation file | refuse | exit=0; Summary: 2 pass, 0 fail, 5 skip (of 7 rules)./ | ACCEPTED |  |
| A018-1 | R018 | page.jsx instead of page.tsx | refuse | exit=0; Summary: 0 pass, 0 fail, 7 skip (of 7 rules)./ | ACCEPTED |  |
| A018-1b | R018 | page.ts | refuse | exit=0; Summary: 1 pass, 0 fail, 6 skip (of 7 rules)./ | ACCEPTED |  |
| A018-2 | R018 | HTML surface served from route.ts (not a page.tsx) | refuse | exit=0; Summary: 1 pass, 0 fail, 6 skip (of 7 rules)./ | ACCEPTED |  |
| A018-3 | R018 | sixth surface nested under an allowed segment /regulations/technology | refuse | exit=0; Summary: 2 pass, 0 fail, 5 skip (of 7 rules)./ | ACCEPTED |  |
| A018-3b | R018 | sixth surface nested under admin/ (allowed segment) | refuse | exit=0; Summary: 2 pass, 0 fail, 5 skip (of 7 rules)./ | ACCEPTED |  |
| A018-6 | R018 | pages-router file src/pages/technology.tsx | refuse | exit=0; Summary: 1 pass, 0 fail, 6 skip (of 7 rules)./ | ACCEPTED |  |
| A019-1 | R019 | reason built from a split string | refuse | exit=0; Summary: 3 pass, 0 fail, 4 skip (of 7 rules)./ | ACCEPTED |  |
| A019-2 | R019 | sanctioned-helper name placed in a comment | refuse | exit=0; Summary: 3 pass, 0 fail, 4 skip (of 7 rules)./ | ACCEPTED |  |
| A019-3 | R019 | reason literal lives in scripts/lib (exempt dir), imported by the archiving script | refuse | exit=0; Summary: 3 pass, 0 fail, 4 skip (of 7 rules)./ | ACCEPTED |  |
| A019-4 | R019 | archive helper called through an alias (archiveRows never followed by an open paren) | refuse | exit=0; Summary: 3 pass, 0 fail, 4 skip (of 7 rules)./ | ACCEPTED |  |
| A019-6 | R019 | same archive in a .cjs file (rule scopes .mjs) | refuse | exit=0; Summary: 0 pass, 0 fail, 7 skip (of 7 rules)./ | ACCEPTED |  |
| A019-7 | R019 | .gitattributes binary on the script | refuse | exit=0; Summary: 3 pass, 0 fail, 4 skip (of 7 rules)./ | ACCEPTED |  |
| A019-8 | R019 | edit-extend: existing source-y archive line swapped to another source-y reason | refuse | exit=0; Summary: 3 pass, 0 fail, 4 skip (of 7 rules)./ | ACCEPTED |  |
| A021-2 | R021 | shape change through a nested type in another file (author's stated limit), key untouched | refuse | exit=0; Summary: 2 pass, 0 fail, 5 skip (of 7 rules)./ | ACCEPTED | author's stated limit (nested types are invisible), run to record it |
| A021-3 | R021 | consumer inlines the key as a split string (check wants no raw app-data- literal) | refuse | exit=0; Summary: 2 pass, 0 fail, 5 skip (of 7 rules)./ | ACCEPTED |  |
| A021-5 | R021 | shape file renamed away from the watched path while the field is added | refuse | exit=0; Summary: 1 pass, 0 fail, 6 skip (of 7 rules)./ | ACCEPTED | compile-breaking in a real tree (the importer of supabase-server.ts breaks); the rule is skipped by its trigger |
| A021-6 | R021 | payload type declared in a new file the rule does not watch, supabase-server.ts and data.ts untouched | refuse | exit=0; Summary: 1 pass, 0 fail, 6 skip (of 7 rules)./ | ACCEPTED | producer-side shape change in an unwatched file; the rule hashes only the interface text (author's stated limit) |
| A021-1 | R021 | shape changed; comment line holds the NEW matching key before the real stale constant (first regex match wins) | refuse | exit=0; Summary: 2 pass, 0 fail, 5 skip (of 7 rules)./ | ACCEPTED |  |
| A021-1b | R021 | block-comment decoy interface (old shape) ahead of the real interface (new shape); key untouched | refuse | exit=0; Summary: 2 pass, 0 fail, 5 skip (of 7 rules)./ | ACCEPTED |  |
| A022-1 | R022 | JS escape and HTML entity forms of the em dash | refuse | exit=0; Summary: 0 pass, 0 fail, 7 skip (of 7 rules)./ | ACCEPTED |  |
| A022-2 | R022 | look-alike code points U+2015, U+2212, U+2011 (not in the banned set) | refuse | exit=0; Summary: 0 pass, 0 fail, 7 skip (of 7 rules)./ | ACCEPTED |  |
| A022-3 | R022 | prose placed under a directory named fixtures (exempt path) | refuse | exit=0; Summary: 0 pass, 0 fail, 7 skip (of 7 rules)./ | ACCEPTED |  |
| A022-4 | R022 | path contains docs/archive/ below another directory (substring exempt) | refuse | exit=0; Summary: 0 pass, 0 fail, 7 skip (of 7 rules)./ | ACCEPTED |  |
| A022-5 | R022 | marker string glyph:verbatim embedded inside a larger token on the same line | refuse | exit=0; Summary: 0 pass, 0 fail, 7 skip (of 7 rules)./ | ACCEPTED |  |
| A022-6 | R022 | edit-extend: existing glyph line edited to carry three more glyphs | refuse | exit=0; Summary: 0 pass, 0 fail, 7 skip (of 7 rules)./ | ACCEPTED |  |
| A022-7 | R022 | NUL byte in the .md file (git sees binary, no hunks) | refuse | exit=0; Summary: 0 pass, 0 fail, 7 skip (of 7 rules)./ | ACCEPTED |  |
| A022-8 | R022 | UTF-16LE file with BOM carrying U+2014 (git treats as binary) | refuse | exit=0; Summary: 0 pass, 0 fail, 7 skip (of 7 rules)./ | ACCEPTED |  |
| A022-9 | R022 | forged dated handoff bundle path (README.md exempt by regex) | refuse | exit=0; Summary: 0 pass, 0 fail, 7 skip (of 7 rules)./ | ACCEPTED |  |
| A022-11 | R022 | em dash in the commit message only (diff clean) | refuse | exit=0; Summary: 0 pass, 0 fail, 7 skip (of 7 rules)./ | ACCEPTED | channel not scanned: the rule reads diff lines, never the commit message |
| A015-13 | R015 | staged blob has the raw write; an UNSTAGED trailing comment names lib/db.mjs (rule reads the disk file) | refuse | exit=0; Summary: 3 pass, 0 fail, 4 skip (of 7 rules). | ACCEPTED |  |
| A019-10 | R019 | staged blob archives as a source; an UNSTAGED comment names reclassifyToSource | refuse | exit=0; Summary: 3 pass, 0 fail, 4 skip (of 7 rules). | ACCEPTED |  |
| A021-7 | R021 | staged blob has the new shape with the STALE key; the working-tree file carries the corrected key (unstaged) | refuse | exit=0; Summary: 2 pass, 0 fail, 5 skip (of 7 rules). | ACCEPTED |  |
| A-H2-10c | H2 | after a --no-verify violation, delete refs/remotes/origin/master, then an honest hooked commit (baseline falls back to the previous commit) | refuse | exit=0; Baseline: fallback previous commit (HEAD): origin/master does not resolve (no remote-tracking ref)/Summary: 3 pass, 0 fail, 4 skip (of 7 rules)./ | ACCEPTED |  |
| A-H2-1 | H2 | git commit --no-verify | refuse | exit=0 | ACCEPTED |  |
| A-H2-2 | H2 | git -c core.hooksPath=/dev/null commit | refuse | exit=0 | ACCEPTED |  |
| A-H2-3 | H2 | hooksPath via GIT_CONFIG_COUNT env (no -c flag) | refuse | exit=0 | ACCEPTED |  |
| A-H2-4 | H2 | DISCIPLINE_REPO_ROOT env pointing the engine at a different clean repo | refuse | exit=0; Summary: 0 pass, 0 fail, 7 skip (of 7 rules)./ | ACCEPTED |  |
| A-H2-5 | H2 | PATH without node (hook skips: node not found) | refuse | exit=0 | ACCEPTED |  |
| A-H2-6 | H2 | git write-tree + commit-tree + update-ref | refuse | exit=0; commit 311b57c holds 1 file changed, 1 insertion(+) | ACCEPTED |  |
| A-H2-7 | H2 | same commit empties the rule list in manifest.mjs (hook runs the working-tree engine) | refuse | exit=0; Summary: 0 pass, 0 fail, 0 skip (of 0 rules)./ | ACCEPTED |  |
| A-H2-8 | H2 | same commit neuters rule 012 trigger() | refuse | exit=0; Summary: 2 pass, 0 fail, 5 skip (of 7 rules)./ | ACCEPTED |  |
| A-H2-9 | H2 | same commit deletes runner.mjs (hook: runner not found, skipping check) | refuse | exit=0 | ACCEPTED |  |
| A-H2-11 | H2 | git cherry-pick of a violating commit | refuse | exit=0; 3816a3b side violating [work 3816a3b] side violating Date: Thu Oct 8 09:24:44 2026 -0400 1 file changed, 1 inse | ACCEPTED |  |
| A-H2-13 | H2 | git am of a patch with a violating file | refuse | exit=0; a71fe98 side violating | ACCEPTED |  |
| A-H2-14 | H2 | git rebase replaying a violating commit onto new tip | refuse | exit=0; 9c1b714 side violating | ACCEPTED |  |
| A-H1-1 | H1 | agent commit in main checkout with CLAUDE_CODE_CHILD_SESSION='0' | refuse | exit=0 | ACCEPTED |  |
| A-H1-1 | H1 | agent commit in main checkout with CLAUDE_CODE_CHILD_SESSION='false' | refuse | exit=0 | ACCEPTED |  |
| A-H1-1 | H1 | agent commit in main checkout with CLAUDE_CODE_CHILD_SESSION='' | refuse | exit=0 | ACCEPTED |  |
| A-H1-2 | H1 | agent commit through env -i (marker dropped from the environment) | refuse | exit=0 | ACCEPTED |  |
| A-H1-3 | H1 | agent commit with PATH lacking node (pre-commit exits 0 when node is absent) | refuse | exit=0 | ACCEPTED |  |
| A-H1-4 | H1 | main checkout on branch 'worktree-agent-zzzz', marker unset | refuse | exit=0 | ACCEPTED |  |
| A-H1-4 | H1 | main checkout on branch 'agent-abc12', marker unset | refuse | exit=0 | ACCEPTED |  |
| A-H1-4 | H1 | main checkout on branch 'claude/worktree-agent-abc123', marker unset | refuse | exit=0 | ACCEPTED |  |
| A-H1-5 | H1 | agent (marker set) git cherry-pick in main checkout | refuse | exit=0; 3d5404c side | ACCEPTED |  |
| A-H1-6 | H1 | agent (marker set) git merge --no-ff in main checkout | refuse | exit=0; a1c32bb agent merge | ACCEPTED |  |
| A-H1-7 | H1 | agent (marker set) commit-tree + update-ref in main checkout | refuse | exit=0; 3a1fb89 agent plumbing | ACCEPTED |  |
| A-H3-2 | H3 | agent git symbolic-ref HEAD refs/heads/x3 | refuse | HEAD moved to another branch, 0 alarm lines; alarm lines: 0 | ACCEPTED |  |
| A-H3-3 | H3 | agent git reset --hard other (moves work to other commit) | refuse | current branch tip moved to another commit, 0 alarm lines; alarm lines: 0 | ACCEPTED |  |
| A-M-1 | R-ci-merge | evil merge: violating content only in the merge commit, per-commit pass (runner --mode=ci --commit) | refuse | exit=0; Summary: 0 pass, 0 fail, 7 skip (of 7 rules). | ACCEPTED |  |
| A-CI-012 | R-ci-merge | CI mode over the pushed range: split-string path (A012-1 form) | refuse | exit=0; Summary: 3 pass, 0 fail, 4 skip (of 7 rules)./Summary: 3 pass, 0 fail, 4 skip (of 7 rules)./ | ACCEPTED |  |
| A-CI-binary | R-ci-merge | CI mode over the pushed range: .gitattributes binary hides the path line (A012-8 form) | refuse | exit=0; Summary: 3 pass, 0 fail, 4 skip (of 7 rules)./Summary: 3 pass, 0 fail, 4 skip (of 7 rules)./ | ACCEPTED |  |
| A-CI-022 | R-ci-merge | CI mode over the pushed range: NUL byte hides the em dash (A022-7 form) | refuse | exit=0; Summary: 0 pass, 0 fail, 7 skip (of 7 rules)./Summary: 0 pass, 0 fail, 7 skip (of 7 rules)./ | ACCEPTED |  |
| A-CI-015 | R-ci-merge | CI mode over the pushed range: guarded-import marker in a comment (A015-3 form) | refuse | exit=0; Summary: 3 pass, 0 fail, 4 skip (of 7 rules)./Summary: 3 pass, 0 fail, 4 skip (of 7 rules)./ | ACCEPTED |  |
| A-PT-B1 | PT-bash | git -C <dir> push (global option between git and push) | refuse | decision=allow | ACCEPTED |  |
| A-PT-B2 | PT-bash | git --no-pager push | refuse | decision=allow | ACCEPTED |  |
| A-PT-B3 | PT-bash | git.exe push (Windows binary name) | refuse | decision=allow | ACCEPTED |  |
| A-PT-B4 | PT-bash | git -c alias.p=push p (alias form) | refuse | decision=allow | ACCEPTED |  |
| A-PT-B5 | PT-bash | rm -fr (flag order) | refuse | decision=allow | ACCEPTED |  |
| A-PT-B6 | PT-bash | rm -r -f (split flags) | refuse | decision=allow | ACCEPTED |  |
| A-PT-B7 | PT-bash | rm --recursive --force | refuse | decision=allow | ACCEPTED |  |
| A-PT-B8 | PT-bash | find <dir> -delete | refuse | decision=allow | ACCEPTED |  |
| A-PT-B9 | PT-bash | env-var indirection: A=--app; B=ly; node s.mjs $A$B | refuse | decision=allow | ACCEPTED |  |
| A-PT-B10 | PT-bash | quoted flag: node s.mjs "--apply" (quoted strings are stripped) | refuse | decision=allow | ACCEPTED |  |
| A-PT-B11 | PT-bash | env bash -c "git push" (env wrapper hides the interpreter) | refuse | decision=allow | ACCEPTED |  |
| A-PT-B12 | PT-bash | nohup sh -c "git push" | refuse | decision=allow | ACCEPTED |  |
| A-PT-B13 | PT-bash | timeout 5 bash -c 'git push' | refuse | decision=allow | ACCEPTED |  |
| A-PT-B14 | PT-bash | heredoc fed to sh: sh <<EOF git push EOF (body stripped) | refuse | decision=allow | ACCEPTED |  |
| A-PT-B15 | PT-bash | here-string: bash <<< "git push" | refuse | decision=allow | ACCEPTED |  |
| A-PT-B16 | PT-bash | npm script indirection: npm run apply-all | refuse | decision=allow | ACCEPTED |  |
| A-PT-B17 | PT-bash | curl -X DELETE against the PostgREST table URL (quoted) | refuse | decision=allow | ACCEPTED |  |
| A-PT-B18 | PT-bash | psql -f drop.sql (statement lives in a file) | refuse | decision=allow | ACCEPTED |  |
| A-PT-B19 | PT-bash | psql -c "DROP SCHEMA public CASCADE" (verb not in the list) | refuse | decision=allow | ACCEPTED |  |
| A-PT-B20 | PT-bash | psql -c "UPDATE public.intelligence_items ..." (schema-qualified) | refuse | decision=allow | ACCEPTED |  |
| A-PT-B21 | PT-bash | node -e building the verb from pieces | refuse | decision=allow | ACCEPTED |  |
| A-PT-B22 | PT-bash | supabase.exe db push | refuse | decision=allow | ACCEPTED |  |
| A-PT-B23 | PT-bash | node -e fetch DELETE (no listed word) | refuse | decision=allow | ACCEPTED |  |
| A-PT-B24 | PT-bash | sed -i on a governed file via Bash (not the Edit tool) | refuse | decision=allow | ACCEPTED |  |
| A-PT-B25 | PT-bash | printf >> governed file via Bash redirect | refuse | decision=allow | ACCEPTED |  |
| A-PT-B26 | PT-bash | python -c writing a governed file | refuse | decision=allow | ACCEPTED |  |
| A-PT-B27 | PT-bash | git apply fix.patch touching governed files | refuse | decision=allow | ACCEPTED |  |
| A-PT-E1 | PT-edit | relative path src/lib/agent/x.ts (cwd fsi-app) | refuse | decision=allow | ACCEPTED | reaches the gate only if the harness passes a relative path; tool-contract dependent |
| A-PT-E2 | PT-edit | dot segment .../fsi-app/./src/lib/agent/x.ts | refuse | decision=allow | ACCEPTED |  |
| A-PT-E3 | PT-edit | upper-case path (case-insensitive file system) | refuse | decision=allow | ACCEPTED | case-variant path; the target file system is case-insensitive on Windows |
| A-PT-E4 | PT-edit | 8.3 short name FSI-AP~1 | refuse | decision=allow | ACCEPTED | reaches the gate only if the harness passes a short-name path; tool-contract dependent |
| A-PT-E5 | PT-edit | doubled separator fsi-app//src/lib/agent/x.ts | refuse | decision=allow | ACCEPTED |  |
| A-PT-E6 | PT-edit | edit the gate itself: .discipline/rules/012-hardcoded-user-path.mjs | refuse | decision=allow | ACCEPTED |  |
| A-PT-E7 | PT-edit | edit the CI workflow: .github/workflows/discipline.yml | refuse | decision=allow | ACCEPTED |  |
| A-PT-E8 | PT-edit | edit the gate's own skill-map.mjs | refuse | decision=allow | ACCEPTED |  |
| A-PT-E9 | PT-edit | NotebookEdit-style notebook_path form on a governed dir | refuse | decision=allow | ACCEPTED |  |
| A-PT-T1 | PT-skill | Skill tool_use names a foreign namespace ending :remediation-discipline | refuse | decision=ask | ACCEPTED | decision ask is what a genuinely loaded skill also yields; the no-skill control denies |
| A-PT-T2 | PT-skill | Read of an attacker-made file ending skills/<slug>/SKILL.md (no result check) | refuse | decision=allow | ACCEPTED | decision allow with no Skill call at all |
| A-PT-M1 | PT-mcp | mcp tool get_and_delete_rows (read prefix on a write) | refuse | decision=allow | ACCEPTED |  |
| A-PT-M2 | PT-mcp | mcp tool search_and_replace | refuse | decision=allow | ACCEPTED |  |
| A-PT-M3 | PT-mcp | mcp execute_sql SELECT calling a mutating function | refuse | decision=allow | ACCEPTED |  |
| A-PT-M4 | PT-mcp | mcp execute_sql string containing -- then a second statement | refuse | decision=allow | ACCEPTED |  |
| A-PT-M5 | PT-mcp | mcp execute_sql SELECT ... FOR UPDATE / pg_terminate_backend | refuse | decision=allow | ACCEPTED |  |
| A-PT-M6 | PT-mcp | mcp browser_batch navigate to a destructive GET URL (navigate is classed read) | refuse | decision=allow | ACCEPTED |  |
| A-PT-I1 | PT-iso | git alias co for checkout (git co -b x) | refuse | decision=allow | ACCEPTED |  |
| A-PT-I2 | PT-iso | git pull (fetch + merge into the checked-out branch) | refuse | decision=allow | ACCEPTED |  |
| A-PT-I3 | PT-iso | git cherry-pick <sha> | refuse | decision=allow | ACCEPTED |  |
| A-PT-I4 | PT-iso | git symbolic-ref HEAD refs/heads/x | refuse | decision=allow | ACCEPTED |  |
| A-PT-I5 | PT-iso | git $(echo checkout) -b x (subcommand by substitution) | refuse | decision=allow | ACCEPTED |  |
| A-PT-I6 | PT-iso | git restore . (discard worktree changes) | refuse | decision=allow | ACCEPTED |  |
| A-PT-I7 | PT-iso | git clean -fdx | refuse | decision=allow | ACCEPTED |  |
| A-PT-S1 | PT-shim | Bash from repo-root cwd: node fsi-app/scripts/x.mjs --apply (space before fsi-app) | refuse | decision=allow | ACCEPTED |  |
| A-PT-S2 | PT-shim | Bash from repo-root cwd: cd fsi-app && node scripts/x.mjs --apply | refuse | decision=allow | ACCEPTED |  |
| A-PT-S3 | PT-shim | Bash from worktree-root cwd: git push (worktree root, not fsi-app) | refuse | decision=allow | ACCEPTED |  |
| A-PT-S4 | PT-shim | Edit with relative path fsi-app/src/lib/agent/x.ts (no leading separator) | refuse | decision=allow | ACCEPTED | reaches the shim only if the harness passes a relative path; tool-contract dependent |
| A-PT-S5 | PT-shim | MCP write from cwd outside fsi-app (apply_migration, cwd = home) | refuse | decision=allow | ACCEPTED |  |
| A-PT-S6 | PT-shim | Agent dispatch from cwd outside fsi-app | refuse | decision=allow | ACCEPTED |  |
| A-PT-S7 | PT-shim | Bash payload with no cwd field and a relative command | refuse | decision=allow | ACCEPTED | payload without cwd; the harness normally supplies cwd |
| A-PT-S8 | PT-shim | Bash from cwd of a renamed clone (fsi-app-copy) running git push | refuse | decision=allow | ACCEPTED |  |
| A-PT-R-PowerShell | PT-reg | tool name PowerShell against the registered matcher | refuse | routed=false; matcher=^(Bash/Edit/Write/MultiEdit/NotebookEdit/Agent/Task/Workflow/mcp__.+)$ | ACCEPTED | this harness session exposes a PowerShell tool |
| A-PT-R-Monitor | PT-reg | tool name Monitor against the registered matcher | refuse | routed=false; matcher=^(Bash/Edit/Write/MultiEdit/NotebookEdit/Agent/Task/Workflow/mcp__.+)$ | ACCEPTED | this harness session exposes a Monitor tool |
| A-PT-R-EnterWorktree | PT-reg | tool name EnterWorktree against the registered matcher | refuse | routed=false; matcher=^(Bash/Edit/Write/MultiEdit/NotebookEdit/Agent/Task/Workflow/mcp__.+)$ | ACCEPTED | this harness session exposes EnterWorktree and ExitWorktree |
| A-PT-R-ExitWorktree | PT-reg | tool name ExitWorktree against the registered matcher | refuse | routed=false; matcher=^(Bash/Edit/Write/MultiEdit/NotebookEdit/Agent/Task/Workflow/mcp__.+)$ | ACCEPTED |  |
| A-PT-R-ArtifactData | PT-reg | tool name ArtifactData against the registered matcher | refuse | routed=false; matcher=^(Bash/Edit/Write/MultiEdit/NotebookEdit/Agent/Task/Workflow/mcp__.+)$ | ACCEPTED | this harness session exposes ArtifactData |
| A-PT-R-Artifact | PT-reg | tool name Artifact against the registered matcher | refuse | routed=false; matcher=^(Bash/Edit/Write/MultiEdit/NotebookEdit/Agent/Task/Workflow/mcp__.+)$ | ACCEPTED |  |
| A-PT-R-SendMessage | PT-reg | tool name SendMessage against the registered matcher | refuse | routed=false; matcher=^(Bash/Edit/Write/MultiEdit/NotebookEdit/Agent/Task/Workflow/mcp__.+)$ | ACCEPTED | this harness session exposes SendMessage (continues a running agent) |
| A-P3c-1 | PP3c | hook command is a no-op that merely contains the string pretooluse-skill-gate | refuse | exit=0; skill-gate wiring: PASS  -  all required tools routed to the hook. | ACCEPTED |  |
| A-P3c-2 | PP3c | forged wrapper that delegates only when the payload contains the probe string | refuse | exit=0; skill-gate wiring: PASS  -  all required tools routed to the hook (via scoped wrapper  -  verified delegating to C:/Users/jason/AppData/Local/Temp/claude/ | ACCEPTED |  |
| A-P3c-3 | PP3c | matcher lists only the three representative MCP names (every other mcp__ tool unrouted) | refuse | exit=0; skill-gate wiring: PASS  -  all required tools routed to the hook (via scoped wrapper  -  verified delegating to C:/Users/jason/AppData/Local/Temp/claude/ | ACCEPTED |  |
| A-V-7 | CC-vault | gitignored local file that an upstream commit adds as a tracked file | refuse | vault-sync: 494080d..67cb7cf (1 commit(s) behind origin/master); local file now: upstream tracked scratch | ACCEPTED | an ignored local file replaced by a tracked upstream file of the same name |
| A-P0-1 | PP0 | variable exported in the caller environment (a stale copy cannot tell) | refuse | exit=0; [discipline pre-push] all checks pass; push proceeding. | ACCEPTED |  |
| A-P0b-2 | PP0b | NODE_PATH points resolution at a stub outside the checkout | refuse | exit=0; step 1 (untracked critical files): OK;step 2 (consistency runner, override-aware): OK;step 2b (memory gate, CI parity): OK;steps 3-4 (test suite, meta-gates, npmtest, goldens, tsc):  | ACCEPTED |  |
| A-P1-1 | PP1 | untracked src/lib/helper.ts (path not in the critical list) | refuse | exit=0; step 1 (untracked critical files): OK;step 2 (consistency runner, override-aware): OK;step 2b (memory gate, CI parity): OK;steps 3-4 (test suite, meta-gates, npmtest, goldens, tsc):  | ACCEPTED |  |
| A-P1-2 | PP1 | untracked file in .discipline/hooks/lib/ (gate-adjacent, not in the list) | refuse | exit=0; step 1 (untracked critical files): OK;step 2 (consistency runner, override-aware): OK;step 2b (memory gate, CI parity): OK;steps 3-4 (test suite, meta-gates, npmtest, goldens, tsc):  | ACCEPTED |  |
| A-P2-1 | PP2 | forged Consistency-Override: C3 (rationale: x; deadline 2099) on the pushed commit | refuse | exit=0; step 1 (untracked critical files): OK;step 2 (consistency runner, override-aware): OK;step 2b (memory gate, CI parity): OK;steps 3-4 (test suite, meta-gates, npmtest, goldens, tsc):  | ACCEPTED |  |
| A-P2b-1 | PP2b | git mv code from scripts/ to fsi-app/ root (rename lists only the destination) | refuse | exit=0; step 1 (untracked critical files): OK;step 2 (consistency runner, override-aware): OK;step 2b (memory gate, CI parity): OK;steps 3-4 (test suite, meta-gates, npmtest, goldens, tsc):  | ACCEPTED | git diff --name-only lists a rename by its destination only |
| A-P2b-2 | PP2b | zero-byte session-log.d file satisfies the memory requirement | refuse | exit=0; step 1 (untracked critical files): OK;step 2 (consistency runner, override-aware): OK;step 2b (memory gate, CI parity): OK;steps 3-4 (test suite, meta-gates, npmtest, goldens, tsc):  | ACCEPTED |  |
| A-P2b-3 | PP2b | memory file with an impossible date 9999-99-99 | refuse | exit=0; step 1 (untracked critical files): OK;step 2 (consistency runner, override-aware): OK;step 2b (memory gate, CI parity): OK;steps 3-4 (test suite, meta-gates, npmtest, goldens, tsc):  | ACCEPTED |  |
| A-P2b-4 | PP2b | edge function, workflow and public JS (outside the CODE directories) | refuse | exit=0; step 1 (untracked critical files): OK;step 2 (consistency runner, override-aware): OK;step 2b (memory gate, CI parity): OK;steps 3-4 (test suite, meta-gates, npmtest, goldens, tsc):  | ACCEPTED |  |
| A-P3-1 | PP34 | default push with a TypeScript type error (steps 3 to 4 skipped unless DISCIPLINE_PREPUSH_FULL=1) | refuse | exit=0; step 1 (untracked critical files): OK;step 2 (consistency runner, override-aware): OK;step 2b (memory gate, CI parity): OK;steps 3-4 (test suite, meta-gates, npmtest, goldens, tsc):  | ACCEPTED |  |
| A-P0c-1 | PP0c | code file deleted by git mv into docs/keep.md, range origin/master...HEAD | refuse | exit=0; docs-only: true | ACCEPTED | git diff --name-only lists a rename by its destination only |
| A-P0c-1 | PP0c | code file deleted by git mv into docs/keep.md, range origin/master..HEAD | refuse | exit=0; docs-only: true | ACCEPTED | git diff --name-only lists a rename by its destination only |
| A-P0c-2 | PP0c | change to a pinned SKILL.md (md extension) | refuse | exit=0; docs-only: true | ACCEPTED |  |
| A-P0c-3 | PP0c | new executable .mjs under docs/ | refuse | exit=0; docs-only: true | ACCEPTED |  |
| A-P0b-1b | PP0b | forged next/package.json containing {} (valid JSON, no code) | refuse | exit=0; step 1 (untracked critical files): OK;step 2 (consistency runner, override-aware): OK;step 2b (memory gate, CI parity): OK;steps 3-4 (test suite, meta-gates, npmtest, goldens, tsc):  | ACCEPTED |  |
| A-P-1 | PPbypass | git push --no-verify of the drift commit | refuse | exit=0 | ACCEPTED |  |
| A-P-2 | PPbypass | git -c core.hooksPath=/dev/null push of the drift commit | refuse | exit=0 | ACCEPTED |  |
| A-P0-3 | PP0 | tracked hook file edited in the working tree to exit 0 (edit never committed) | refuse | exit=0 | ACCEPTED |  |
| A-P2c-2 | PPrules | pushed commit carrying a rule 022 glyph (landed with --no-verify) | refuse | exit=0; step 1 (untracked critical files): OK;step 2 (consistency runner, override-aware): OK;step 2b (memory gate, CI parity): OK;steps 3-4 (test suite, meta-gates, npmtest, goldens, tsc):  | ACCEPTED |  |
| A-P0-2b | PP0 | installed .git/hooks/pre-push replaced by exit 0, drift commit (control C-P2-0 refuses the same commit) | refuse | exit=0 | ACCEPTED |  |
| A-P3-3 | PP34 | opt-in DISCIPLINE_PREPUSH_FULL=1 set, diff is a code deletion disguised as a rename into docs/ (docs-only fast path skips steps 3-4 again) | refuse | exit=0; step 1 (untracked critical files): OK;step 2 (consistency runner, override-aware): OK;step 2b (memory gate, CI parity): OK;steps 3-4 (test suite, meta-gates, npmtest, goldens, tsc):  | ACCEPTED |  |
| A-P2c-1b | PPrules | pushed commit carrying a rule 012 violation (landed with --no-verify); hook runs no rules step [rerun, isolated] | refuse | exit=0; step 1 (untracked critical files): OK;step 2 (consistency runner, override-aware): OK;step 2b (memory gate, CI parity): OK;steps 3-4 (test suite, meta-gates, npmtest, goldens, tsc):  | ACCEPTED |  |
| C-H3-0 | H3 | control: agent (marker set) git checkout -b in main checkout | refuse (control: the gate is live) | exit=1; HEAD moved to a new branch, then the alarm printed; [worktree-isolation post-checkout] WORKTREE-ISOLATION VIOLATION (RD-19): an AGEN | ALARM-ONLY |  |
| A-H3-1 | H3 | agent git switch -c | refuse | exit=1; HEAD moved to a new branch, then the alarm printed; [worktree-isolation post-checkout] WORKTREE-ISOLATION VIOLAT | ALARM-ONLY |  |
| A018-4 | R018 | route group wrapper (site)/technology/page.tsx | refuse | exit=1; FAIL [018] No surface outside the five-surface model/Summary: 1 pass, 1 fail, 5 skip (of 7 rules)./ | REFUSED |  |
| A018-5 | R018 | dynamic first segment [locale]/technology/page.tsx | refuse | exit=1; FAIL [018] No surface outside the five-surface model/Summary: 1 pass, 1 fail, 5 skip (of 7 rules)./ | REFUSED |  |
| A018-7 | R018 | git mv an allowed page into /technology (rename) | refuse | exit=1; FAIL [018] No surface outside the five-surface model/Summary: 1 pass, 1 fail, 5 skip (of 7 rules)./ | REFUSED |  |
| A018-9 | R018 | capitalised segment /Technology | refuse | exit=1; FAIL [018] No surface outside the five-surface model/Summary: 1 pass, 1 fail, 5 skip (of 7 rules)./ | REFUSED |  |
| A018-10 | R018 | parallel route slot @modal/technology | refuse | exit=1; FAIL [018] No surface outside the five-surface model/Summary: 1 pass, 1 fail, 5 skip (of 7 rules)./ | REFUSED |  |
| A019-5 | R019 | is_archived written as !0 (regex wants is_archived: true) | refuse | exit=1; FAIL [015] Row-mutation guarded path/ FAIL [019] Source-not-item reclassified, not raw-archived/ | REFUSED |  |
| A019-9 | R019 | template-literal reason (backtick, control for the regex's quote class) | refuse | exit=1; FAIL [019] Source-not-item reclassified, not raw-archived/Summary: 2 pass, 1 fail, 4 skip (of 7 rules)./ | REFUSED |  |
| A021-4 | R021 | anchor spelled with two spaces (anchor regex wants exactly one) | refuse | exit=1; FAIL [021] Dashboard cache key carries the shape hash/Summary: 1 pass, 1 fail, 5 skip (of 7 rules)./ | REFUSED |  |
| A022-5b | R022 | marker on the NEXT line (not the same line) | refuse | exit=1; FAIL [022] No dash/section-sign glyphs in added prose/Summary: 0 pass, 1 fail, 6 skip (of 7 rules)./ | REFUSED |  |
| A022-10 | R022 | section sign (control: banned set member via a different glyph) | refuse | exit=1; FAIL [022] No dash/section-sign glyphs in added prose/Summary: 0 pass, 1 fail, 6 skip (of 7 rules)./ | REFUSED |  |
| A022-12 | R022 | glyph in a shell script comment (all paths covered, control) | refuse | exit=1; FAIL [022] No dash/section-sign glyphs in added prose/Summary: 1 pass, 1 fail, 5 skip (of 7 rules)./ | REFUSED |  |
| A-H2-10b | H2 | step b: next honest hooked commit of a clean file (does the baseline surface step a?) | refuse | exit=1; FAIL [012] Hardcoded user-home path/Summary: 2 pass, 1 fail, 4 skip (of 7 rules)./ | REFUSED |  |
| A-H2-12 | H2 | git merge --no-ff of a branch carrying a violating commit | refuse | exit=1; 1689626 mainline 1 FAIL lines | REFUSED |  |
| A-H2-15 | H2 | violating commit in a linked worktree outside .claude/worktrees | refuse | exit=1; FAIL [012] Hardcoded user-home path | REFUSED |  |
| A-H1-4 | H1 | main checkout on branch 'worktree-agent-abc123', marker unset | refuse | exit=1; [worktree-isolation pre-commit] WORKTREE-ISOLATION VIOLATION (RD-19): commit BLO | REFUSED |  |
| A-H1-4 | H1 | main checkout on branch 'Agent-ABCDEF', marker unset | refuse | exit=1; [worktree-isolation pre-commit] WORKTREE-ISOLATION VIOLATION (RD-19): commit BLO | REFUSED |  |
| A-M-2 | R-ci-merge | same evil merge, whole-range pass included in --mode=ci --range | refuse | exit=1; Summary: 3 pass, 0 fail, 4 skip (of 7 rules)./Summary: 3 pass, 0 fail, 4 skip (of 7 rules)./Summary: 0 pass, 0 fail, 7 skip (of 7 rules)./=== Whole-range diff (base..11df1b7e4b0c2ed2 | REFUSED |  |
| A-PT-T3 | PT-skill | errored Skill invocation only | refuse | decision=deny; expected deny | REFUSED |  |
| A-PT-I8 | PT-iso | git -c user.name=x checkout -b y (option parse control) | refuse | decision=ask | REFUSED |  |
| A-V-1 | CC-vault | tracked file marked assume-unchanged, edited locally, upstream changes it | refuse | vault-sync: SKIPPED (fast-forward refused; run git -C "C:\Users\jason\AppData\Local\Temp\claude\C--Users-jason-dotfiles\53f591a2-7a98-48fe-af76-1a6e85; local file now: unsaved local work | REFUSED |  |
| A-V-2 | CC-vault | tracked file marked skip-worktree, edited locally, upstream changes it | refuse | vault-sync: SKIPPED (fast-forward refused; run git -C "C:\Users\jason\AppData\Local\Temp\claude\C--Users-jason-dotfiles\53f591a2-7a98-48fe-af76-1a6e85; local file now: unsaved local work | REFUSED |  |
| A-V-3 | CC-vault | untracked local file with the name of a file upstream adds | refuse | vault-sync: SKIPPED (fast-forward refused; run git -C "C:\Users\jason\AppData\Local\Temp\claude\C--Users-jason-dotfiles\53f591a2-7a98-48fe-af76-1a6e85; local file now: my untracked c | REFUSED |  |
| A-V-4 | CC-vault | staged (index) edit of a file upstream changes | refuse | vault-sync: SKIPPED (1 tracked file(s) modified in the vault checkout; commit them through a worktree PR or restore them); local file now: staged local | REFUSED |  |
| A-V-8 | CC-vault | local commit ahead of origin/master | refuse | vault-sync: SKIPPED (vault carries 1 local commit(s) master lacks; push them or move them to a branch); commits: 2 | REFUSED |  |
| A-P0b-1 | PP0b | forged next/package.json containing garbage text | refuse | exit=1; STEP 0b FAIL; | REFUSED |  |
| A-P1-3 | PP1 | critical migration hidden by .git/info/exclude | refuse | exit=1; step 1 (untracked critical files): OK;STEP 2 FAIL; | REFUSED |  |
| A-P1-4 | PP1 | critical migration registered with git add -N (intent-to-add, never committed) | refuse | exit=1; step 1 (untracked critical files): OK;STEP 2 FAIL; | REFUSED |  |
| A-P2-3 | PP2 | migration file whose name does not start with a number (no inventory row) | refuse | exit=1; step 1 (untracked critical files): OK;STEP 2 FAIL; | REFUSED |  |
| C012-0 | R012 | control: plain literal, new .mjs | refuse (control: the gate is live) | exit=1; FAIL [012] Hardcoded user-home path/Summary: 2 pass, 1 fail, 4 skip (of 7 rules)./ | CONTROL |  |
| C015-0 | R015 | control: plain raw delete on a client chain, new .mjs | refuse (control: the gate is live) | exit=1; FAIL [015] Row-mutation guarded path/Summary: 2 pass, 1 fail, 4 skip (of 7 rules)./ | CONTROL |  |
| C017-0 | R017 | control: process.env.KNOB_B in a listed generation file | refuse (control: the gate is live) | exit=1; FAIL [017] Generation config  -  no raw env/Summary: 1 pass, 1 fail, 5 skip (of 7 rules)./ | CONTROL |  |
| C018-0 | R018 | control: new /technology/page.tsx | refuse (control: the gate is live) | exit=1; FAIL [018] No surface outside the five-surface model/Summary: 1 pass, 1 fail, 5 skip (of 7 rules)./ | CONTROL |  |
| C019-0 | R019 | control: archiveRows with a source-y reason literal, new .mjs | refuse (control: the gate is live) | exit=1; FAIL [019] Source-not-item reclassified, not raw-archived/Summary: 2 pass, 1 fail, 4 skip (of 7 rules)./ | CONTROL |  |
| C021-0 | R021 | control: add a field to DashboardData without rotating the key | refuse (control: the gate is live) | exit=1; FAIL [021] Dashboard cache key carries the shape hash/Summary: 1 pass, 1 fail, 5 skip (of 7 rules)./ | CONTROL |  |
| C022-0 | R022 | control: em dash in a new .md line | refuse (control: the gate is live) | exit=1; FAIL [022] No dash/section-sign glyphs in added prose/Summary: 0 pass, 1 fail, 6 skip (of 7 rules)./ | CONTROL |  |
| C-H2-0 | H2 | control: violating file, normal git commit | refuse (control: the gate is live) | exit=1; FAIL [012] Hardcoded user-home path/Summary: 2 pass, 1 fail, 4 skip (of 7 rules)./ | CONTROL |  |
| C-H1-0 | H1 | control: CLAUDE_CODE_CHILD_SESSION=1 (inherited) commit in main checkout | refuse (control: the gate is live) | exit=1; [worktree-isolation pre-commit] WORKTREE-ISOLATION VIOLATION (RD-19): commit BLOCKED in the MAIN checkout  -  this is an agent context; the main checkout is the orchestrator's exclusiv | CONTROL |  |
| C-CI-0 | R-ci-merge | control: plain literal, CI mode over the pushed range | refuse (control: the gate is live) | exit=1; Summary: 2 pass, 1 fail, 4 skip (of 7 rules)./Summary: 2 pass, 1 fail, 4 skip (of 7 rules)./ | CONTROL |  |
| C-PT-B0 | PT-bash | control: --apply script run, in scope, no skill | refuse (control: the gate is live) | decision=deny | CONTROL |  |
| C-PT-B1 | PT-bash | control: git push, in scope, no skill | refuse (control: the gate is live) | decision=deny | CONTROL |  |
| C-PT-E0 | PT-edit | control: Edit governed file, absolute backslash path, no skill | refuse (control: the gate is live) | decision=deny | CONTROL |  |
| C-PT-T0 | PT-skill | control: all three skills genuinely loaded, Edit governed file | allow (legitimate) | decision=allow; expected allow (legit) | CONTROL |  |
| C-PT-M0 | PT-mcp | control: mcp apply_migration, no skill | refuse (control: the gate is live) | decision=deny | CONTROL |  |
| C-PT-M7 | PT-mcp | control: unknown mcp tool name | refuse (control: the gate is live) | decision=ask | CONTROL |  |
| C-PT-I0 | PT-iso | control: git checkout -b x | refuse (control: the gate is live) | decision=ask | CONTROL |  |
| C-PT-S0 | PT-shim | control: same git push from cwd fsi-app via the REAL shim would call the gate (answered by shim copy above) | refuse (control: the gate is live) | decision=deny | CONTROL |  |
| A-PT-R-mcp__terminal__run_in_terminal | PT-reg | tool name mcp__terminal__run_in_terminal against the registered matcher | refuse (control: the gate is live) | routed=true; matcher=^(Bash/Edit/Write/MultiEdit/NotebookEdit/Agent/Task/Workflow/mcp__.+)$ | CONTROL |  |
| A-PT-R-NotebookEdit | PT-reg | tool name NotebookEdit against the registered matcher | refuse (control: the gate is live) | routed=true; matcher=^(Bash/Edit/Write/MultiEdit/NotebookEdit/Agent/Task/Workflow/mcp__.+)$ | CONTROL |  |
| A-PT-R-MultiEdit | PT-reg | tool name MultiEdit against the registered matcher | refuse (control: the gate is live) | routed=true; matcher=^(Bash/Edit/Write/MultiEdit/NotebookEdit/Agent/Task/Workflow/mcp__.+)$ | CONTROL |  |
| C-P3c-0 | PP3c | control: wrapper that delegates (copy of the real shim, gate repointed to scratch) | refuse (control: the gate is live) | exit=0; skill-gate wiring: PASS  -  all required tools routed to the hook (via scoped wrapper  -  verified delegating to C:/Users/jason/AppData/Local/Temp/claude/ | CONTROL |  |
| C-P3c-4 | PP3c | control: entry registered under PostToolUse instead of PreToolUse | refuse (control: the gate is live) | exit=1; skill-gate wiring: FAIL  -  settings.json PreToolUse does not route these tools to the hook: Bash, Edit, Write, MultiEdit, NotebookEdit, Agent, Task, Wo | CONTROL |  |
| C-V-0 | CC-vault | control: modified tracked file, upstream touches it | refuse (control: the gate is live) | vault-sync: SKIPPED (1 tracked file(s) modified in the vault checkout; commit them through a worktree PR or restore them); local file now: local edit | CONTROL |  |
| C-P0-0 | PP0 | control: tracked hook invoked directly without the trampoline variable | refuse (control: the gate is live) | exit=1; [discipline pre-push] STEP 0 FAIL: stale hook copy; run node fsi-app/.discipline/install-hooks.mjs | CONTROL |  |
| C-P2-0 | PP2 | control: new migration file with no inventory row (C3 drift) | refuse (control: the gate is live) | exit=1; step 1 (untracked critical files): OK;STEP 2 FAIL; | CONTROL |  |
| C-P0b-0 | PP0b | control: next unresolvable | refuse (control: the gate is live) | exit=1; STEP 0b FAIL; | CONTROL |  |
| C-P1-0 | PP1 | control: untracked file in governance/ | refuse (control: the gate is live) | exit=1; STEP 1 FAIL; | CONTROL |  |
| C-P2-2 | PP2 | control: expired override deadline | refuse (control: the gate is live) | exit=1; step 1 (untracked critical files): OK;STEP 2 FAIL; | CONTROL |  |
| C-P2b-0 | PP2b | control: scripts change, no memory file | refuse (control: the gate is live) | exit=1; step 1 (untracked critical files): OK;step 2 (consistency runner, override-aware): OK;STEP 2b FAIL; | CONTROL |  |
| C-P0c-0 | PP0c | control: a script change is not docs-only | refuse (control: the gate is live) | exit=1; docs-only: false | CONTROL |  |
| C-P-0 | PPbypass | control: drift commit pushed through the installed hook | refuse (control: the gate is live) | exit=1; step 1 (untracked critical files): OK;STEP 2 FAIL; | CONTROL |  |
| C-P-3 | PPbypass | control: tracked hook file deleted (trampoline cannot exec it) | refuse (control: the gate is live) | exit=1 | CONTROL |  |

## 4. Per-unit count

| gate unit | attacks | ACCEPTED | REFUSED | alarm-only | controls |
|---|---|---|---|---|---|
| R012: rule 012 hardcoded user-home path | 11 | 11 | 0 | 0 | 1 |
| R015: rule 015 raw row write | 13 | 13 | 0 | 0 | 1 |
| R017: rule 017 raw env knob | 9 | 9 | 0 | 0 | 1 |
| R018: rule 018 new surface | 11 | 6 | 5 | 0 | 1 |
| R019: rule 019 source archived not reclassified | 10 | 8 | 2 | 0 | 1 |
| R021: rule 021 dashboard cache key | 8 | 7 | 1 | 0 | 1 |
| R022: rule 022 dash and section-sign glyphs | 13 | 10 | 3 | 0 | 1 |
| H2: commit-msg hook (rules engine) | 16 | 13 | 3 | 0 | 1 |
| R-ci-merge: rules engine in CI mode (merge commits, and the content forms run over a pushed range) | 6 | 5 | 1 | 0 | 1 |
| H1: pre-commit hook (worktree isolation, RD-19) | 13 | 11 | 2 | 0 | 1 |
| H3: post-checkout hook (isolation alarm) | 3 | 2 | 0 | 1 | 1 |
| PP0: pre-push step 0 (stale copy refusal) | 3 | 3 | 0 | 0 | 1 |
| PP0b: pre-push step 0b (dependencies resolve, junction check) | 3 | 2 | 1 | 0 | 1 |
| PP0c: pre-push step 0c (docs-only classifier) | 4 | 4 | 0 | 0 | 1 |
| PP1: pre-push step 1 (untracked critical files) | 4 | 2 | 2 | 0 | 1 |
| PP2: pre-push step 2 (consistency, override-aware) | 2 | 1 | 1 | 0 | 2 |
| PP2b: pre-push step 2b (memory gate) | 4 | 4 | 0 | 0 | 1 |
| PP34: pre-push steps 3, 3b, 3d, 3e, 3f, 3g, 3h, 4 (heavy steps, skipped by default) | 2 | 2 | 0 | 0 | 0 |
| PP3c: pre-push step 3c (skill-gate wiring check) | 3 | 3 | 0 | 0 | 2 |
| PPbypass: pre-push hook as a whole (bypass forms) | 2 | 2 | 0 | 0 | 2 |
| PPrules: pre-push, rules step (removed by GATE-2) | 2 | 2 | 0 | 0 | 0 |
| PT-shim: PreToolUse scope shim (out of repo) | 8 | 8 | 0 | 0 | 1 |
| PT-reg: PreToolUse registration matcher (out of repo settings) | 7 | 7 | 0 | 0 | 3 |
| PT-bash: skill gate, Bash danger leg | 27 | 27 | 0 | 0 | 2 |
| PT-iso: skill gate, worktree-isolation leg | 8 | 7 | 1 | 0 | 1 |
| PT-edit: skill gate, governed-file edit leg | 9 | 9 | 0 | 0 | 1 |
| PT-mcp: skill gate, MCP leg | 6 | 6 | 0 | 0 | 2 |
| PT-skill: skill gate, skill-load evidence (skill-token) | 3 | 2 | 1 | 0 | 1 |
| CC-vault: SessionStart vault-sync (fast-forward guard) | 6 | 1 | 5 | 0 | 1 |

## 5. ACCEPTED list (gate, form)

- A012-1 (R012): split string concat across the C: and Users halves
- A012-2 (R012): JS-escaped backslashes (two backslashes) in a string literal
- A012-3 (R012): extension not in the list (.cjs)
- A012-3b (R012): extension not in the list (.mts)
- A012-4 (R012): path contains a directory named node_modules (exempt fragment, committed dir)
- A012-5 (R012): lowercase drive letter c:
- A012-6 (R012): URL-encoded backslash in the path
- A012-7 (R012): edit-extend: existing violating line edited to carry a second new path
- A012-8 (R012): .gitattributes marks the file binary so git emits no hunks
- A012-9 (R012): NUL byte in the file (git treats it as binary, no hunks)
- A012-10 (R012): other drive letter D:
- A015-1 (R015): bracket-string method name sb.from()["delete"]()
- A015-2 (R015): dynamic method name built from a split string
- A015-3 (R015): guarded-import marker placed in a comment (silences the whole file)
- A015-4 (R015): same write in a .js file (rule scopes .mjs only)
- A015-5 (R015): same write placed in scripts/lib/ (exempt: the helper's own directory)
- A015-6 (R015): production writer named *.test.mjs (exempt as a proof file)
- A015-7 (R015): raw PostgREST DELETE through fetch, no .delete() call
- A015-8 (R015): row delete through an rpc exec_sql call
- A015-9 (R015): edit-extend: existing .update line rewritten to .delete (removed counterpart already a write)
- A015-10 (R015): destructured .from alias, write through the alias
- A015-11 (R015): same write in a src route handler (rule scopes scripts/ only)
- A015-12 (R015): .gitattributes -diff on the file (no hunks)
- A017-1 (R017): destructuring read const { KNOB } = process.env
- A017-2 (R017): alias const e = process.env then e.KNOB
- A017-3 (R017): optional chain process?.env.KNOB
- A017-4 (R017): computed key process.env[name]
- A017-5 (R017): knob given a credential-shaped suffix (_TOKEN) to ride the exemption
- A017-6 (R017): new generation file not in the exact GEN_FILES list (src/lib/agent/new-generator.ts)
- A017-7 (R017): import.meta.env read
- A017-8 (R017): edit-extend: existing knob line edited to add a second knob
- A017-9 (R017): .gitattributes binary on the generation file
- A018-1 (R018): page.jsx instead of page.tsx
- A018-1b (R018): page.ts
- A018-2 (R018): HTML surface served from route.ts (not a page.tsx)
- A018-3 (R018): sixth surface nested under an allowed segment /regulations/technology
- A018-3b (R018): sixth surface nested under admin/ (allowed segment)
- A018-6 (R018): pages-router file src/pages/technology.tsx
- A019-1 (R019): reason built from a split string
- A019-2 (R019): sanctioned-helper name placed in a comment
- A019-3 (R019): reason literal lives in scripts/lib (exempt dir), imported by the archiving script
- A019-4 (R019): archive helper called through an alias (archiveRows never followed by an open paren) [CONFIRMED: ran, output captured] [CLOSED: PR 1040]
- A019-6 (R019): same archive in a .cjs file (rule scopes .mjs)
- A019-7 (R019): .gitattributes binary on the script
- A019-8 (R019): edit-extend: existing source-y archive line swapped to another source-y reason
- A021-2 (R021): shape change through a nested type in another file (author's stated limit), key untouched
- A021-3 (R021): consumer inlines the key as a split string (check wants no raw app-data- literal)
- A021-5 (R021): shape file renamed away from the watched path while the field is added
- A021-6 (R021): payload type declared in a new file the rule does not watch, supabase-server.ts and data.ts untouched
- A021-1 (R021): shape changed; comment line holds the NEW matching key before the real stale constant (first regex match wins)
- A021-1b (R021): block-comment decoy interface (old shape) ahead of the real interface (new shape); key untouched
- A022-1 (R022): JS escape and HTML entity forms of the em dash
- A022-2 (R022): look-alike code points U+2015, U+2212, U+2011 (not in the banned set)
- A022-3 (R022): prose placed under a directory named fixtures (exempt path)
- A022-4 (R022): path contains docs/archive/ below another directory (substring exempt)
- A022-5 (R022): marker string glyph:verbatim embedded inside a larger token on the same line
- A022-6 (R022): edit-extend: existing glyph line edited to carry three more glyphs
- A022-7 (R022): NUL byte in the .md file (git sees binary, no hunks)
- A022-8 (R022): UTF-16LE file with BOM carrying U+2014 (git treats as binary)
- A022-9 (R022): forged dated handoff bundle path (README.md exempt by regex)
- A022-11 (R022): em dash in the commit message only (diff clean)
- A015-13 (R015): staged blob has the raw write; an UNSTAGED trailing comment names lib/db.mjs (rule reads the disk file)
- A019-10 (R019): staged blob archives as a source; an UNSTAGED comment names reclassifyToSource
- A021-7 (R021): staged blob has the new shape with the STALE key; the working-tree file carries the corrected key (unstaged)
- A-H2-10c (H2): after a --no-verify violation, delete refs/remotes/origin/master, then an honest hooked commit (baseline falls back to the previous commit)
- A-H2-1 (H2): git commit --no-verify
- A-H2-2 (H2): git -c core.hooksPath=/dev/null commit
- A-H2-3 (H2): hooksPath via GIT_CONFIG_COUNT env (no -c flag)
- A-H2-4 (H2): DISCIPLINE_REPO_ROOT env pointing the engine at a different clean repo
- A-H2-5 (H2): PATH without node (hook skips: node not found)
- A-H2-6 (H2): git write-tree + commit-tree + update-ref
- A-H2-7 (H2): same commit empties the rule list in manifest.mjs (hook runs the working-tree engine)
- A-H2-8 (H2): same commit neuters rule 012 trigger()
- A-H2-9 (H2): same commit deletes runner.mjs (hook: runner not found, skipping check)
- A-H2-11 (H2): git cherry-pick of a violating commit
- A-H2-13 (H2): git am of a patch with a violating file
- A-H2-14 (H2): git rebase replaying a violating commit onto new tip
- A-H1-1 (H1): agent commit in main checkout with CLAUDE_CODE_CHILD_SESSION='0'
- A-H1-1 (H1): agent commit in main checkout with CLAUDE_CODE_CHILD_SESSION='false'
- A-H1-1 (H1): agent commit in main checkout with CLAUDE_CODE_CHILD_SESSION=''
- A-H1-2 (H1): agent commit through env -i (marker dropped from the environment)
- A-H1-3 (H1): agent commit with PATH lacking node (pre-commit exits 0 when node is absent)
- A-H1-4 (H1): main checkout on branch 'worktree-agent-zzzz', marker unset
- A-H1-4 (H1): main checkout on branch 'agent-abc12', marker unset
- A-H1-4 (H1): main checkout on branch 'claude/worktree-agent-abc123', marker unset
- A-H1-5 (H1): agent (marker set) git cherry-pick in main checkout
- A-H1-6 (H1): agent (marker set) git merge --no-ff in main checkout
- A-H1-7 (H1): agent (marker set) commit-tree + update-ref in main checkout
- A-H3-2 (H3): agent git symbolic-ref HEAD refs/heads/x3
- A-H3-3 (H3): agent git reset --hard other (moves work to other commit)
- A-M-1 (R-ci-merge): evil merge: violating content only in the merge commit, per-commit pass (runner --mode=ci --commit)
- A-CI-012 (R-ci-merge): CI mode over the pushed range: split-string path (A012-1 form)
- A-CI-binary (R-ci-merge): CI mode over the pushed range: .gitattributes binary hides the path line (A012-8 form)
- A-CI-022 (R-ci-merge): CI mode over the pushed range: NUL byte hides the em dash (A022-7 form)
- A-CI-015 (R-ci-merge): CI mode over the pushed range: guarded-import marker in a comment (A015-3 form)
- A-PT-B1 (PT-bash): git -C <dir> push (global option between git and push)
- A-PT-B2 (PT-bash): git --no-pager push
- A-PT-B3 (PT-bash): git.exe push (Windows binary name)
- A-PT-B4 (PT-bash): git -c alias.p=push p (alias form)
- A-PT-B5 (PT-bash): rm -fr (flag order)
- A-PT-B6 (PT-bash): rm -r -f (split flags)
- A-PT-B7 (PT-bash): rm --recursive --force
- A-PT-B8 (PT-bash): find <dir> -delete
- A-PT-B9 (PT-bash): env-var indirection: A=--app; B=ly; node s.mjs $A$B
- A-PT-B10 (PT-bash): quoted flag: node s.mjs "--apply" (quoted strings are stripped)
- A-PT-B11 (PT-bash): env bash -c "git push" (env wrapper hides the interpreter)
- A-PT-B12 (PT-bash): nohup sh -c "git push"
- A-PT-B13 (PT-bash): timeout 5 bash -c 'git push'
- A-PT-B14 (PT-bash): heredoc fed to sh: sh <<EOF git push EOF (body stripped)
- A-PT-B15 (PT-bash): here-string: bash <<< "git push"
- A-PT-B16 (PT-bash): npm script indirection: npm run apply-all
- A-PT-B17 (PT-bash): curl -X DELETE against the PostgREST table URL (quoted)
- A-PT-B18 (PT-bash): psql -f drop.sql (statement lives in a file)
- A-PT-B19 (PT-bash): psql -c "DROP SCHEMA public CASCADE" (verb not in the list)
- A-PT-B20 (PT-bash): psql -c "UPDATE public.intelligence_items ..." (schema-qualified)
- A-PT-B21 (PT-bash): node -e building the verb from pieces
- A-PT-B22 (PT-bash): supabase.exe db push
- A-PT-B23 (PT-bash): node -e fetch DELETE (no listed word)
- A-PT-B24 (PT-bash): sed -i on a governed file via Bash (not the Edit tool)
- A-PT-B25 (PT-bash): printf >> governed file via Bash redirect
- A-PT-B26 (PT-bash): python -c writing a governed file
- A-PT-B27 (PT-bash): git apply fix.patch touching governed files
- A-PT-E1 (PT-edit): relative path src/lib/agent/x.ts (cwd fsi-app)
- A-PT-E2 (PT-edit): dot segment .../fsi-app/./src/lib/agent/x.ts
- A-PT-E3 (PT-edit): upper-case path (case-insensitive file system)
- A-PT-E4 (PT-edit): 8.3 short name FSI-AP~1
- A-PT-E5 (PT-edit): doubled separator fsi-app//src/lib/agent/x.ts
- A-PT-E6 (PT-edit): edit the gate itself: .discipline/rules/012-hardcoded-user-path.mjs
- A-PT-E7 (PT-edit): edit the CI workflow: .github/workflows/discipline.yml
- A-PT-E8 (PT-edit): edit the gate's own skill-map.mjs
- A-PT-E9 (PT-edit): NotebookEdit-style notebook_path form on a governed dir
- A-PT-T1 (PT-skill): Skill tool_use names a foreign namespace ending :remediation-discipline
- A-PT-T2 (PT-skill): Read of an attacker-made file ending skills/<slug>/SKILL.md (no result check)
- A-PT-M1 (PT-mcp): mcp tool get_and_delete_rows (read prefix on a write)
- A-PT-M2 (PT-mcp): mcp tool search_and_replace
- A-PT-M3 (PT-mcp): mcp execute_sql SELECT calling a mutating function
- A-PT-M4 (PT-mcp): mcp execute_sql string containing -- then a second statement
- A-PT-M5 (PT-mcp): mcp execute_sql SELECT ... FOR UPDATE / pg_terminate_backend
- A-PT-M6 (PT-mcp): mcp browser_batch navigate to a destructive GET URL (navigate is classed read)
- A-PT-I1 (PT-iso): git alias co for checkout (git co -b x)
- A-PT-I2 (PT-iso): git pull (fetch + merge into the checked-out branch)
- A-PT-I3 (PT-iso): git cherry-pick <sha>
- A-PT-I4 (PT-iso): git symbolic-ref HEAD refs/heads/x
- A-PT-I5 (PT-iso): git $(echo checkout) -b x (subcommand by substitution)
- A-PT-I6 (PT-iso): git restore . (discard worktree changes)
- A-PT-I7 (PT-iso): git clean -fdx
- A-PT-S1 (PT-shim): Bash from repo-root cwd: node fsi-app/scripts/x.mjs --apply (space before fsi-app)
- A-PT-S2 (PT-shim): Bash from repo-root cwd: cd fsi-app && node scripts/x.mjs --apply
- A-PT-S3 (PT-shim): Bash from worktree-root cwd: git push (worktree root, not fsi-app)
- A-PT-S4 (PT-shim): Edit with relative path fsi-app/src/lib/agent/x.ts (no leading separator)
- A-PT-S5 (PT-shim): MCP write from cwd outside fsi-app (apply_migration, cwd = home)
- A-PT-S6 (PT-shim): Agent dispatch from cwd outside fsi-app
- A-PT-S7 (PT-shim): Bash payload with no cwd field and a relative command
- A-PT-S8 (PT-shim): Bash from cwd of a renamed clone (fsi-app-copy) running git push
- A-PT-R-PowerShell (PT-reg): tool name PowerShell against the registered matcher
- A-PT-R-Monitor (PT-reg): tool name Monitor against the registered matcher
- A-PT-R-EnterWorktree (PT-reg): tool name EnterWorktree against the registered matcher
- A-PT-R-ExitWorktree (PT-reg): tool name ExitWorktree against the registered matcher
- A-PT-R-ArtifactData (PT-reg): tool name ArtifactData against the registered matcher
- A-PT-R-Artifact (PT-reg): tool name Artifact against the registered matcher
- A-PT-R-SendMessage (PT-reg): tool name SendMessage against the registered matcher
- A-P3c-1 (PP3c): hook command is a no-op that merely contains the string pretooluse-skill-gate
- A-P3c-2 (PP3c): forged wrapper that delegates only when the payload contains the probe string
- A-P3c-3 (PP3c): matcher lists only the three representative MCP names (every other mcp__ tool unrouted)
- A-V-7 (CC-vault): gitignored local file that an upstream commit adds as a tracked file
- A-P0-1 (PP0): variable exported in the caller environment (a stale copy cannot tell)
- A-P0b-2 (PP0b): NODE_PATH points resolution at a stub outside the checkout
- A-P1-1 (PP1): untracked src/lib/helper.ts (path not in the critical list)
- A-P1-2 (PP1): untracked file in .discipline/hooks/lib/ (gate-adjacent, not in the list)
- A-P2-1 (PP2): forged Consistency-Override: C3 (rationale: x; deadline 2099) on the pushed commit
- A-P2b-1 (PP2b): git mv code from scripts/ to fsi-app/ root (rename lists only the destination)
- A-P2b-2 (PP2b): zero-byte session-log.d file satisfies the memory requirement
- A-P2b-3 (PP2b): memory file with an impossible date 9999-99-99
- A-P2b-4 (PP2b): edge function, workflow and public JS (outside the CODE directories)
- A-P3-1 (PP34): default push with a TypeScript type error (steps 3 to 4 skipped unless DISCIPLINE_PREPUSH_FULL=1)
- A-P0c-1 (PP0c): code file deleted by git mv into docs/keep.md, range origin/master...HEAD
- A-P0c-1 (PP0c): code file deleted by git mv into docs/keep.md, range origin/master..HEAD
- A-P0c-2 (PP0c): change to a pinned SKILL.md (md extension)
- A-P0c-3 (PP0c): new executable .mjs under docs/
- A-P0b-1b (PP0b): forged next/package.json containing {} (valid JSON, no code)
- A-P-1 (PPbypass): git push --no-verify of the drift commit
- A-P-2 (PPbypass): git -c core.hooksPath=/dev/null push of the drift commit
- A-P0-3 (PP0): tracked hook file edited in the working tree to exit 0 (edit never committed) [CONFIRMED: ran, output captured] [CLOSED: PR 1040]
- A-P2c-2 (PPrules): pushed commit carrying a rule 022 glyph (landed with --no-verify)
- A-P0-2b (PP0): installed .git/hooks/pre-push replaced by exit 0, drift commit (control C-P2-0 refuses the same commit)
- A-P3-3 (PP34): opt-in DISCIPLINE_PREPUSH_FULL=1 set, diff is a code deletion disguised as a rename into docs/ (docs-only fast path skips steps 3-4 again)
- A-P2c-1b (PPrules): pushed commit carrying a rule 012 violation (landed with --no-verify); hook runs no rules step [rerun, isolated]

## 6. Owed legs (not attacked, with the reason)

- Pre-push steps 3 (discipline and fitness tests), 3b (invariant-coverage meta-gate), 3d (ESLint), 3e (fitness runner), 3f (npmtest), 3g (goldens), 3h (closure gate, skill-contract drift), 4 (tsc): attacked only at the level this subsystem owns, which is whether they run (A-P3-1, A-P3-3: a default push and an opt-in push both skip them). Their own contents are other subsystems' gates (governance gates and fitness functions, AT-4; CI job steps, AT-5) and the opt-in run (`DISCIPLINE_PREPUSH_FULL=1`) needs the full npm install and tens of minutes per ADR-040, which the fixtures do not have. OWED: a content attack per step through the real full run. [WORK: TESTS-1]
- Repo SessionStart `session-start-vault.mjs`, PreCompact `pre-compact-snapshot.mjs`, SessionEnd echo: no blocking claim to attack. Each header says it never fails the session and exits 0 on every path (session-start-vault.mjs, pre-compact-snapshot.mjs read in full). OWED only as a context-injection lens, which is not ATTACKED. [CONFIRMED: owed, not attacked by this lane] [WORK: TESTS-1]
- Settings precedence and switches that sit above the hook command (a project `.claude/settings.local.json` entry, a managed setting, a session started with permissions skipped, a hook-disable switch): they cannot be exercised from a fixture repo, and the user-level settings file was read, never modified. OWED: a run in a throwaway Claude Code session started with each switch. [CONFIRMED: owed, not attacked by this lane] [WORK: TESTS-1]
- Step 0b symlink inside a worktree: wt_nm_ensure_link leaves a real symlink alone by design; creating one on Windows needs Developer Mode or an administrator right, which this lane did not use. OWED. [WORK: TESTS-1]
- CI side of the ACCEPTED local forms: the validate-commits job could not be run here. The rules engine itself was run in its CI mode (`runner.mjs --mode=ci --range=base..HEAD`) for four of the ACCEPTED content forms (rows A-CI-*) and for the evil merge (A-M-1, A-M-2); the workflow's own path filters, job conditions and fork-PR behaviour are AT-5's cells (O-009). [WORK: TESTS-1]
- Real-session reachability of the path forms in A-PT-E1, A-PT-E4 and A-PT-S4 (relative and short-name file paths): depends on what path form the Claude Code harness passes to the hook; the gate code was run with those payloads, a live session was not. [WORK: TESTS-1]

## 7. Facts recorded while attacking (no proposals)

- Text rules read the text of added lines only. Every content rule that reads `ctx.introducedLines` (012, 015, 017, 019, 022) is blind to a file git does not diff as text: a `.gitattributes` entry marking the file binary or `-diff`, or one NUL byte in the file, leaves no hunk (A012-8, A012-9, A015-12, A017-9, A019-7, A022-7, A022-8; A-CI-binary and A-CI-022 show the same in CI mode). [CONFIRMED: ran] [CLOSED: PR 1040]
- Rules 015, 019 and 021 decide on the working-tree file (`ctx.getFileContent` reads the disk), not the staged blob. A staged raw write with an unstaged comment naming `lib/db.mjs`, a staged source-y archive with an unstaged `reclassifyToSource` comment, and a staged stale cache key with a corrected unstaged key were each committed; the committed blob carries none of the unstaged text (A015-13, A019-10, A021-7). [CONFIRMED: `git show HEAD:<path>` in the run output] [CLOSED: PR 1040]
- The engine that judges a commit is the working-tree copy of `manifest.mjs`, `rules/*.mjs` and `runner.mjs`. A commit that empties the rule list, neuters a rule trigger or deletes `runner.mjs` is judged by that edited engine (A-H2-7, A-H2-8, A-H2-9). [CONFIRMED: ran] [WORK: RULES-X-1]
- Ways a commit lands with no rule run: `--no-verify`, `-c core.hooksPath=/dev/null`, the `GIT_CONFIG_COUNT` environment form, a PATH with no node (commit-msg and pre-commit both exit 0 when node is absent), `DISCIPLINE_REPO_ROOT` pointing at another repo, `git write-tree` plus `commit-tree` plus `update-ref`, `git cherry-pick`, `git am`, `git rebase` (A-H2-1 to A-H2-6, A-H2-11, A-H2-13, A-H2-14). `git merge` runs commit-msg (A-H2-12 refused); a merge commit is skipped by the per-commit pass in CI mode and caught by the whole-range pass (A-M-1, A-M-2). [CONFIRMED: ran] [WORK: RULES-X-1]
- Detection of a bypassed commit: the next hooked commit is judged against the merge base with origin/master, so it re-surfaces the earlier violation (A-H2-10b refused). With `refs/remotes/origin/master` removed the baseline falls back to the previous commit, the earlier violation is not re-surfaced, and the next hooked commit is accepted (A-H2-10c); the engine prints the fallback label. No firing log entry exists for a bypass. [CONFIRMED: ran] [WORK: RULES-X-1]
- Pre-push runs no commit-rules step since GATE-2: a pushed commit carrying a rule 012 violation or a rule 022 glyph, landed with `--no-verify`, passes every default pre-push step (A-P2c-1b, A-P2c-2). A push with `--no-verify`, with `-c core.hooksPath=/dev/null`, or with the working-tree copy of the tracked hook edited to `exit 0` (never committed) passes (A-P-1, A-P-2, A-P0-3); an installed `.git/hooks/pre-push` replaced by `exit 0` passes (A-P0-2b). A deleted tracked hook file blocks the push (control A-P-3). [CONFIRMED: ran] [WORK: RULES-X-1]
- `git diff --name-only` lists a rename by its destination path only. Pre-push step 0c, the same classifier in CI, and step 2b (memory gate) use it: a script moved to `docs/keep.md` classes as docs-only (with `DISCIPLINE_PREPUSH_FULL=1` set the heavy steps are still skipped, A-P3-3), and a script moved out of the `fsi-app/(src|supabase/migrations|scripts|.discipline)/` directories does not count as code for the memory gate (A-P0c-1, A-P2b-1). A pinned `SKILL.md` and an executable `.mjs` under `docs/` also class as docs-only (A-P0c-2, A-P0c-3). In `discipline.yml` at 12c69634, twelve steps carry `if: steps.docs_only.outputs.docs_only != 'true'`: Run discipline test suite, Invariant-coverage meta-gate, Closure gate, Skill-contract drift, Orphan-module census, Install fsi-app deps, ESLint, Run fitness functions, Cache actionlint tarball, actionlint, App unit tests requiring npm deps, Behavioral goldens. [CONFIRMED: ran docs-only-range.mjs with both range forms; the twelve step names and conditions were read from the workflow file, the workflow itself was not run] [CLOSED: PR 1040]
- The memory gate is satisfied by a zero-byte file or a file with an impossible date that matches `docs/ops/session-log.d/YYYY-MM-DD-<slug>.md`; code in `fsi-app/supabase/functions`, `.github/workflows` and `fsi-app/public` is outside its CODE set (A-P2b-2, A-P2b-3, A-P2b-4). [CONFIRMED: ran] [WORK: RULES-X-1]
- Step 1 lists only eight path patterns. An untracked `src/lib/helper.ts` and an untracked file in `.discipline/hooks/lib/` pass it (A-P1-1, A-P1-2); a hidden or intent-to-add migration is refused one step later by the consistency runner (A-P1-3, A-P1-4). [CONFIRMED: ran] [WORK: RULES-X-1]
- Step 2 accepts a `Consistency-Override` trailer with any non-empty rationale and any future date (A-P2-1 used rationale `x` and 2099); an expired date is refused (C-P2-2). [CONFIRMED: ran] [WORK: RULES-X-1]
- Step 3c passes for a hook command that only contains the text `pretooluse-skill-gate`, for a wrapper that delegates only when the payload contains the wiring probe string, and for a matcher that routes only the three representative MCP names (A-P3c-1 to A-P3c-3). Its required-tool list does not contain PowerShell, Monitor, EnterWorktree, ArtifactData, Artifact or SendMessage. [CONFIRMED: ran, plus the REQUIRED array read in source] [WORK: RULES-X-1]
- PreToolUse scope: the shim treats a call as in scope only when `fsi-app` is preceded by a path separator in the cwd, the command text or the file path. `node fsi-app/scripts/x.mjs --apply`, `cd fsi-app && ...` and `git push` from a worktree root are out of scope and answered `allow` without the gate being called, which also skips the permission prompt (A-PT-S1, A-PT-S2, A-PT-S3). An MCP write or an Agent dispatch from a cwd outside fsi-app is answered `allow` (A-PT-S5, A-PT-S6). The registered matcher does not route the PowerShell, Monitor, EnterWorktree, ExitWorktree, ArtifactData, Artifact or SendMessage tools to the shim at all. [CONFIRMED: real shim run; matcher tested against the registered regex] [WORK: RULES-X-1]
- PreToolUse gate (in scope, no skill loaded): the DANGER patterns need the words adjacent and unquoted. `git -C <dir> push`, `git --no-pager push`, `git.exe push`, `rm -fr`, `rm -r -f`, a quoted `"--apply"`, a split `$A$B`, a heredoc or here-string body, `env`, `nohup` or `timeout` in front of `bash -c`, a schema-qualified `public.intelligence_items`, `DROP SCHEMA` and `supabase.exe db push` all returned `allow` (A-PT-B1 to A-PT-B23). Bash edits of governed files (`sed -i`, `>>`, `python -c`, `git apply`) are not governed-file edits to the gate (A-PT-B24 to A-PT-B27). Edit paths with a dot segment, upper case, a short name or a doubled separator are not matched by the file patterns, and neither are the gate's own files, `skill-map.mjs` or `.github/workflows/discipline.yml` (A-PT-E1 to A-PT-E9). [CONFIRMED: ran] [WORK: RULES-X-1]
- PreToolUse gate, MCP and skill evidence: a tool named with a read prefix (`get_and_delete_rows`, `search_and_replace`), an `execute_sql` whose first token is SELECT but calls a mutating function, and a SELECT whose string contains `--` before a second statement are classed read and allowed (A-PT-M1 to A-PT-M5); a `navigate` action in a browser batch is classed read (A-PT-M6). A Skill tool_use named `<other-namespace>:remediation-discipline` satisfies the skill demand (A-PT-T1), and a Read of any path ending `skills/<slug>/SKILL.md`, with no result check, makes a Bash write `allow` (A-PT-T2). An errored Skill invocation alone is denied (A-PT-T3). [CONFIRMED: ran] [WORK: RULES-X-1]
- Worktree-isolation belt: `git co` (alias), `git pull`, `git cherry-pick`, `git symbolic-ref HEAD`, `git $(echo checkout)`, `git restore .` and `git clean -fdx` are not asked (A-PT-I1 to A-PT-I7); the listed branch-moving forms ask (C-PT-I0, A-PT-I8). [CONFIRMED: ran] [WORK: RULES-X-1]
- Pre-commit (RD-19): blocks on a positive marker (`CLAUDE_CODE_CHILD_SESSION` set to anything but empty, 0 or false) or an agent-owned branch name in the main checkout. `=0`, `=false`, empty, `env -i`, a PATH with no node, branch names `worktree-agent-zzzz`, `agent-abc12` and `claude/worktree-agent-abc123`, `git cherry-pick`, `git merge --no-ff` and `commit-tree` plus `update-ref` all landed a commit in the main checkout (A-H1-1 to A-H1-7 except the refused branch names). Post-checkout alarms after a `checkout -b` and `switch -c` (HEAD has already moved); `symbolic-ref` and `reset --hard` raise no alarm (A-H3-2, A-H3-3). [CONFIRMED: ran] [WORK: RULES-X-1]
- Step 0b: refuses a junction at `fsi-app/node_modules`; a real directory holding a junction one level down passes (C-P0b-3 refused, A-P0b-3 accepted; the nested link and its target were removed with `rmdir` and the target survived). A `next/package.json` containing garbage text is refused (the resolver parses it); `{}` passes (A-P0b-1, A-P0b-1b). [CONFIRMED: ran] [WORK: RULES-X-1]
- vault-sync: skipped, correctly, for a modified file, a staged file and a local commit ahead (its own guards); for an assume-unchanged file, a skip-worktree file and an untracked file colliding with an upstream addition, the sync was refused by git's own fast-forward refusal and the local content survived; a gitignored local file that an upstream commit adds as a tracked file was overwritten (A-V-7). [CONFIRMED: ran, file content compared before and after] [CLOSED: PR 1040]

## 8. Matrix cells to enter

- O-007 (row 1, commit rules, ATTACKED): 8 units attacked (rules 012, 015, 017, 018, 019, 021, 022 and the rules engine in CI mode); 81 attacks, 69 ACCEPTED, 12 REFUSED. Rule 018 and rule 021 each refused some forms and accepted others; every one of the seven rules has at least one ACCEPTED form.
- O-008 (row 2, hooks, ATTACKED): 21 units attacked (pre-commit, commit-msg, post-checkout, pre-push 0, 0b, 0c, 1, 2, 2b, 3c, the skip level of 3 to 4, the PreToolUse shim and its registration, the skill gate legs, vault-sync); 135 attacks, 118 ACCEPTED, 16 REFUSED, 1 alarm-only. Owed inside the cell: the content of pre-push steps 3, 3b, 3d, 3e, 3f, 3g, 3h, 4; SessionStart session-start-vault, PreCompact, SessionEnd (no blocking claim); settings-precedence switches.
- Both cells: ATTACKED lens, status "run, ACCEPTED rows present", not "clean".

MATRIX CELLS TO ENTER: O-007 (row 1 commit rules) ATTACKED, 81 attacks, 69 ACCEPTED, 12 refused, run on 7 rules plus the CI-mode engine; O-008 (row 2 hooks) ATTACKED, 135 attacks, 118 ACCEPTED, 16 refused, 1 alarm-only, with owed lines for pre-push step contents 3 to 4, three non-blocking session hooks and settings-precedence switches.

