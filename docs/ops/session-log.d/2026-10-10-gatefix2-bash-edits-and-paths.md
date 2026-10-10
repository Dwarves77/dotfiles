# 2026-10-10, lane GATE-FIX-2 (gatefix2-bash-edits-and-paths): shell edits of governed files, backslash argv paths, Consistency-Override validity

## Accomplished

- `fsi-app/.discipline/governance/pretooluse-skill-gate.mjs`: new `bashEditTargets` / `bashGovernedEdits` read the command's own argv for the paths it writes (redirect `>` `>>` `>|` targets, `sed -i` and `perl -i` files, `tee`, `cp` / `mv` / `install` destinations and `mv` sources, `git apply` and `patch` of a patch that names the file, PowerShell writers, string literals of an inline `python -c` / `node -e` / heredoc write) and resolve each through `governedPath` + `skillsForFile`, the Edit and Write route's own resolver. The Bash branch of `evaluateCore` demands the governing skill through the existing `gateWrite` (tags `bash-edit-governed-skillmissing` deny, `bash-edit-governed-ok` allow), then still runs the danger check. `sed` without `-i` reads and is not a write.
- Same file, `scanArgv`: a backslash no longer swallows the next character. A Windows path now stays one token (`C:\work\repo` becomes `C:/work/repo`); a backslash before a shell-special character escapes it (literal, never an operator); a line continuation is a space. `git -C C:\work\repo merge origin/master` now reads `merge` and asks (worktree-isolation belt).
- `fsi-app/.discipline/governance/pretooluse-scope.mjs`: `commandDirsHoldFsiApp` makes a `git -C <dir>` / `cd <dir>` / `pushd <dir>` target (backslashes included, relative to the cwd) that holds `fsi-app` put the call in scope from a cwd outside the repo.
- `fsi-app/.discipline/consistency/override-check.mjs`: a `Consistency-Override` is valid only when the rationale is a sentence (3 words, 20 characters) that names the invariant (the check id, or a distinctive word of the check's manifest name via `invariantTerms`) and the deadline is today to 30 days out (`MAX_DEADLINE_DAYS`). `because` with a 2030 date and `x` with 2099 are refused.
- Tests: `pretooluse-skill-gate.test.mjs` (+70 cases: write forms deny with no skill and allow with it, quiet forms, same resolver as Edit, relative cwd, backslash branch moves, scope) and `override-check.test.mjs` (+10 cases; three existing fixtures updated to a valid rationale and a deadline inside 30 days).

## Read and reused

- Read: CLAUDE.md, COMMON, batch2 GATE-FIX-2 section, the `[WORK: GATE-FIX-2]` rows with 10 lines of context, the gate (`scanArgv`, `gitInvocations`, `isolationAsk`, `evaluateCore`, `gateWrite`), `pretooluse-scope.mjs`, `skill-map.mjs` (`skillsForFile`, `canonPath`), `override-check.mjs`, the consistency manifest.
- Reused, not built: `gateWrite` (the Edit route's deny and allow), `governedPath` and `skillsForFile`, `scanArgv` / `interpreterPayloads` / `unwrap` / `gitInvocations`, the consistency manifest for the invariant names, the existing `x7Tree` fixture.

## Confirmed

- Red against origin/master code (probe importing the unmodified files): `sed -i` on a governed file with no skill loaded returned `allow`; `echo x >> <governed>` returned `allow`; `argvOnly` of a backslash-path `git -C` merge command split the path and dropped letters (`C: sers ...`) and `isolationAsk` returned false; `parseValidOverrides` accepted `because` with 2030-01-01 as valid for C3. Green on this branch: `sed -i` denied (`sed` without `-i` allowed), the same command keeps the path in one token (`C:/work/repo`) and asks, `because` with 2030 is refused.
- `node --test` on `pretooluse-skill-gate.test.mjs` and `override-check.test.mjs`: all pass except `rule 13: the gate stays under 300 ms on the real tree`, a load dependent cold-scan timing assertion that already failed locally on unmodified master (`2026-10-09-rulesx2-register-residue.md`); CI decides.

## Decisions

- "Names the invariant" is mechanical: the check id as a whole token, or a stem of a distinctive word in the check's manifest name (C3 migrations, C4 worktrees, C5 program, anchors). Another check's word does not cover this check.
- Unresolvable paths (`$VAR`, command substitution) are skipped; a glob is read as a name with `x` in its place, so a governed directory pattern still matches.

## NOT done

- Three rows tagged GATE-FIX-2 are outside this lane's write set and were not touched (NEEDS WRITE-SET EXPANSION): `2026-10-03-l13.md:203` (add `LabourChain.tsx` to F35 `ROW_COMPONENTS`), `2026-10-08-audwire1-orphan-audit.md:27` (`scanUiSelects` / `parseSelectList` in `scripts/verify/lib/ui-orphan-scan.mjs` drop `alias:column`), `2026-10-08-gate8-fitness-honest-forms.md:44` (the accepted fitness-function forms, each a function on the shared lexer). [WORK: owed]
- A script FILE that writes a governed path (`python x.py`, `bash x.sh`) stays outside the skill gate (ADR-046 addendum; `scriptFileRun` counts it as a firing note). [NOT-WORK: ADR-046 addendum, script files are an intent form]
- The advertised override text in `fsi-app/.discipline/hooks/pre-push`, `fsi-app/.discipline/consistency/README.md` and the `sprint-followups-discipline` SKILL still says "non-empty rationale, future deadline"; the enforced rule is now stricter. Those files are outside this write set. [WORK: owed]
- PowerShell writers are read by the same argv scan (`Set-Content`, `Add-Content`, `Out-File`, `Copy-Item`, `Move-Item`, `New-Item`), but the matcher in the user-level hook settings that routes PowerShell to the gate is out of repo. [NOT-WORK: out-of-repo boundary, see OUT-OF-REPO-BOUNDARY.md]

## Open items

- None beyond the NOT done lines above.
