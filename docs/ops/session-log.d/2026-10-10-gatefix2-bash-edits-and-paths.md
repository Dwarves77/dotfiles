# 2026-10-10, lane GATE-FIX-2 (gatefix2-bash-edits-and-paths): shell edits of governed files, backslash argv paths, Consistency-Override validity

## Accomplished

- `fsi-app/.discipline/governance/pretooluse-skill-gate.mjs`: new `bashEditTargets` / `bashGovernedEdits` read the command's own argv for the paths it writes (redirect `>` `>>` `>|` targets, `sed -i` and `perl -i` files, `tee`, `cp` / `mv` / `install` destinations and `mv` sources, `git apply` and `patch` of a patch that names the file, PowerShell writers, string literals of an inline `python -c` / `node -e` / heredoc write) and resolve each through `governedPath` + `skillsForFile`, the Edit and Write route's own resolver. The Bash branch of `evaluateCore` demands the governing skill through the existing `gateWrite` (tags `bash-edit-governed-skillmissing` deny, `bash-edit-governed-ok` allow), then still runs the danger check. `sed` without `-i` reads and is not a write.
- Same file, `scanArgv`: a backslash no longer swallows the next character. A Windows path now stays one token (`C:\work\repo` becomes `C:/work/repo`); a backslash before a shell-special character escapes it (literal, never an operator); a line continuation is a space. `git -C C:\work\repo merge origin/master` now reads `merge` and asks (worktree-isolation belt).
- `fsi-app/.discipline/governance/pretooluse-scope.mjs`: `commandDirsHoldFsiApp` makes a `git -C <dir>` / `cd <dir>` / `pushd <dir>` target (backslashes included, relative to the cwd) that holds `fsi-app` put the call in scope from a cwd outside the repo.
- `fsi-app/.discipline/consistency/override-check.mjs`: a `Consistency-Override` is valid only when the rationale is a sentence (3 words, 20 characters) that names the invariant (the check id, or a distinctive word of the check's manifest name via `invariantTerms`) and the deadline is today to 30 days out (`MAX_DEADLINE_DAYS`). `because` with a 2030 date and `x` with 2099 are refused.
- Tests: `pretooluse-skill-gate.test.mjs` (+70 cases: write forms deny with no skill and allow with it, quiet forms, same resolver as Edit, relative cwd, backslash branch moves, scope) and `override-check.test.mjs` (+10 cases; three existing fixtures updated to a valid rationale and a deadline inside 30 days).

- `fsi-app/.discipline/skill-slim.test.mjs` (write-set expansion GRANTED by the coordinator, limited to this entry): `ACKNOWLEDGED_LINE_CHANGES["sprint-followups-discipline"]` records the two pre-split lines (Override, Worked example) verbatim from 023d47588 after the advertised override text was corrected. CI run 38098634772 CONSERVATION failed on exactly those 2 lines; locally red (1 fail) without the entry, green (15 pass, 0 fail) with it.

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

- l13:203: `LabourChain.tsx` added to F35 `ROW_COMPONENTS` (coordinator grant); `labour-chain-smoke.mjs` already mounts it and its title is the shared SectionHeading (delegated `data-guard-title`); `F35-row-ux-coverage.test.mjs` passes. [CLOSED: PR 1096]
- audwire1:27: `parseSelectList` now returns `alias` (the prop the component reads) beside `column`; `scanUiSelects` carries it; the register row `prop` is the alias. A `col::text` cast is no longer read as an alias separator (the old split on any colon read it as the column `text`). Tests in `ui-orphan-scan.test.mjs` and `ui-orphan-audit.test.mjs`. [CLOSED: PR 1096]
- gate8:44 is about 110 accepted attack ids over about 35 functions (F6 to F68, closure, memory, invariant coverage, C-checks), each one function on the shared lexer with its own attack; not built in this lane. Quoted row: "Not in the brief's BUILD list, still ACCEPTED, mechanical on the shared lexer (the work is one function each): F6 B3-02; F10 B3-06; F11 B3-08, B3-10; ... invariant coverage B7-18, B9-02 to B9-05; skill contract map B7-24 to B7-26; C3 B7-32, B7-33; execution wiring B7-22". [WORK: GATE-FIX-3]
- The advertised override text is corrected in `hooks/pre-push`, `consistency/README.md`, `sprint-followups-discipline/SKILL.md` and its `engine-state-and-secrets-consistency.md` reference. [CLOSED: PR 1096]
- A script FILE that writes a governed path (`python x.py`, `bash x.sh`) stays outside the skill gate (ADR-046 addendum; `scriptFileRun` counts it as a firing note). [NOT-WORK: ADR-046 addendum, script files are an intent form]
- PowerShell writers are read by the same argv scan (`Set-Content`, `Add-Content`, `Out-File`, `Copy-Item`, `Move-Item`, `New-Item`), but the matcher in the user-level hook settings that routes PowerShell to the gate is out of repo. [NOT-WORK: out-of-repo boundary, see OUT-OF-REPO-BOUNDARY.md]

## Open items

- None beyond the NOT done lines above. [NOT-WORK: no open item; the line states that the NOT done list above is complete]
