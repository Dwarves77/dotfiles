# 2026-10-11 CLEAN-3b: residue after the cut

Lane EXEC-9 item 5, branch coord/clean3b-residue from origin/master f906b2102 (CLEAN-3 squash).

## Accomplished

- CLAUDE.md: loading-priority item 6 rewritten to its surviving fact (read ux-laws.md and design-principles.md before .tsx/.css under fsi-app/src; 375 px, law-2 target floor) plus the deleted-enforcer sentence; rule 14, rule 15 (both bullets) enforcement sentences replaced by the brief's deleted-enforcer sentence; the `.worktrees/` row of "What lives where" dropped (path does not exist; every other row's path exists, checked with `[ -e ]`). No other CLAUDE.md change.
- fsi-app/.gitignore: removed the four blocks naming fsi-app/.discipline/governance/* and fsi-app/.discipline/out/ (no such paths exist; .discipline/ now holds only rendering/live, 8 files).
- .gitignore: removed the three lines naming .discipline/rendering/audit, .discipline/governance/coverage-report.json, .discipline/rendering/layout-guard (paths absent). The harness-runs lines stay: fsi-app/scripts/harness-runs exists.
- fsi-app/scripts/turns/emit-corpus-turn-artifact.mjs deleted (git rm). Grep (`grep -rn <basename>` over fsi-app .github docs .claude CLAUDE.md, mjs/yml/json/md/sh/ts/tsx): hits outside docs are only comments in scripts/lib/loop-run-id.mjs and scripts/lib/run-artifact.mjs; not in corpus-turn/family.json governing_files (which lists consume-turn-requests.mjs and export-corpus-for-extraction.mjs); no workflow remains that runs it (.github/workflows holds ci.yml and live-smoke.yml only).

## Kept, with the grep that kept them

- emit-live-smoke-artifact.mjs: .github/workflows/live-smoke.yml:150 runs it, and live-smoke/family.json lists it.
- emit-brief-export-artifact.mjs, emit-downstream-chain-artifact.mjs, emit-gate-a-rescan-artifact.mjs, emit-source-resolution-artifact.mjs: each is a governing_files entry of its family.json (harness-runs/brief-export, downstream-chain, gate-a-rescan, source-resolution); CLEAN-3's log records that hashHarnessVersion throws on a missing governing file, so deleting one would break the family. emit-source-resolution-artifact.mjs also imports readStepSummary from emit-downstream-chain-artifact.mjs.
- .gitattributes line 39 (`fsi-app/.discipline/** text eol=lf`): the brief named it for removal, but its own rule keeps a line that still matches a path, and fsi-app/.discipline/rendering/live holds 8 tracked files. Kept; no .gitattributes edit.

## Read and reused

| file | lines | read calls |
|---|---|---|
| CLAUDE.md | 116 | 1 |
| .gitattributes | 48 | 1 |
| .gitignore | 92 | 1 |
| fsi-app/.gitignore | 66 | 1 |
| docs/design/ux-laws.md | 128 | 1 |
| docs/design/design-principles.md | 131 | 1 |
| fsi-app/scripts/turns/emit-corpus-turn-artifact.mjs (deleted) | 232 | 3 (sed ranges 1-60, 60-140, 140-232) |

Reused: the brief's deleted-enforcer sentence verbatim; docs/plans/rebuild/protected-properties.md (PROP-025, PROP-073 for the UX checks) as the pointer target; CLEAN-3's log for the governing-files fact.

## NOT done

- docs/design/ux-laws.md (lines 6, 115-128) and docs/design/design-principles.md (lines 7, 127-129) still name deleted F35, the rendering guard, `docs/dispatches/lane-common-contract.md` and `/root/work/lane-briefs`; outside this lane's write set. [WORK: owed]
- CLAUDE.md rule 16 names docs/plans/finish-plan-2026-09-02.md and the Self-annealing protocol names docs/tech-debt-log.md; neither file exists; the brief allows no other CLAUDE.md change. [WORK: owed]
- Comments in scripts/lib/loop-run-id.mjs (lines 16, 79) and scripts/lib/run-artifact.mjs (line 572) still name the deleted emit-corpus-turn-artifact.mjs; outside the write set. [WORK: owed]
- Root .gitignore lines 88-90 (scripts/_worklists) and the lines for scripts/_snapshots, _plans, _diag, supabase/seed/apply-*.mjs name absent paths but not .discipline or harness-runs; outside the brief's scope. [NOT-WORK: scope statement; the brief limits (b) to .discipline and harness-runs paths]

## Verification

- Local tier per EXEC-9, run in the worktree after `npm ci`: `npm run lint -- --max-warnings=0` exit 0; `npm run typecheck` exit 0.
