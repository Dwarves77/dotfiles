# Lane W10-CommandBar, Amendment 3 (coordinator, 2026-09-21): CI Fitness failed on three npm tests. Read after the brief and Amendments 1 and 2; this file wins.

State: PR #769, `lane/w10-commandbar`, pushed sha `b7bcf93b` (the rebase of `6b4a6c45`), worktree `C:/Users/jason/dotfiles/.worktrees/wt-l34-detail-admin-primitives`. GitHub run 35636629376, job "Fitness functions", step "App unit tests requiring npm deps (*.npmtest.mjs)" FAILED on exactly three tests [CONFIRMED from the log]:

- `fsi-app/src/components/ui/ImpactMeter.npmtest.mjs:253`: "ListRow.tsx's column header no longer renders the retired qualifier (brief 2.16, acceptance: grep returns nothing)"
- `fsi-app/src/components/ui/ListRow.npmtest.mjs:167`: "B49: ListRowColumnHeader is 30px tall" (regex `className="cl-list-row-header"[\s\S]{0,120}height` no longer matches)
- `fsi-app/src/components/ui/ListRow.npmtest.mjs:214`: "the IMPACT column header reads 'Impact' alone, on cellStyle, no wrapping needed" (regex `<span style=\{cellStyle\}>Impact<\/span>` no longer matches)

Cause [CONFIRMED]: Amendment 2's slot fix added `data-part` and `data-part-slot` attributes to `ListRowColumnHeader`'s root and label spans; these three tests assert the component's SOURCE TEXT by regex, so added attributes broke the match. The header's behaviour is unchanged. The local locked push gate does not run `*.npmtest.mjs` (CI does); that gap is a separate lane (G2), not yours.

Do:
1. Read the three tests and the header in `ListRow.tsx`. Keep each test's INTENT and make it assert through the new markup: the retired qualifier is absent; the header is 30px tall; the Impact label is the single word on `cellStyle`. Prefer a regex that tolerates added attributes in any order (or a rendered assertion if the file already renders elsewhere); never weaken a test to a tautology, never delete one. If the 30px test fails because the height genuinely moved further than 120 characters from the class name, widen nothing blindly: assert the height on the same element.
2. Run EVERY npm suite, the way CI does (read the step's command in `.github/workflows/discipline.yml`, job "Fitness functions", and run that same command from `fsi-app`). It must be fully green. If `node_modules` is missing, `npm ci` in this worktree's `fsi-app` only.
3. FULL fitness runner (all functions) to 0 violations; restore `coverage-report.json` if dirtied; the locked push gate once as one background task (long silence is normal). Commit with the exact trailer. You do not push.

Standing lines all bind (no `git stash`, no `git add -A`, no `--no-verify`, no workaround, no dashes or section sign in new prose). First tool calls: Skill tool, `fsi-app:environmental-policy-and-innovation`, then `frontend-design`.

ONE final report, five lines maximum, sent once, no interim messages: commit sha; the npm suite totals (pass, fail) from the CI-parity command; fitness violations and push gate result; any STOP with its measurement.
