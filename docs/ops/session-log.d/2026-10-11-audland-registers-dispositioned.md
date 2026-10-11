# 2026-10-11, lane AUD-LAND (audland-registers-dispositioned): the whole-build registers land in the vault, every row dispositioned

## Accomplished

1. **Landed** under `docs/audits/whole-build-audit-2026-10-11/`: README (the ruled fix-it-all plan, first line `Status: RULED 2026-10-11`) and the five registers (aud-sys-1, aud-sys-2a, aud-sys-2b, aud-sys-3, db-1). Plans to `docs/plans/whole-build-plan-2026-10-11.md` and `docs/plans/whole-build-agent-plan-2026-10-11.md`. Machine lists (owed-list, owed-2-resolved, c-list, e-list, absent-list) to `docs/archive/logs/whole-build-audit-2026-10-11/` (rule 5: not indexed, not gated). INDEX: one line per plan, one for the audit directory.
2. **Every table row of the five registers now ends in a `DISPOSITION` column** (a final column added to each register table, so the token is the last thing on the row): aud-sys-1 179 rows (NOT-WORK 119, WORK 58, CLOSED 2); aud-sys-2a 218 (CLOSED 205, WORK 13); aud-sys-2b 178 (CLOSED 65, WORK 76, NOT-WORK 37); aud-sys-3 121 (WORK 68, CLOSED 53); db-1 262 (NOT-WORK 226, WORK 36).
3. **The 29 flagged list lines** (19 rule-14 unlabeled, 29 rule-13 undispositioned) plus the session-log line `2026-10-11-reg1-one-registry.md:34` each carry a status token where they state a defect and exactly one disposition token. Six lines that are counts or method limits, not findings, are reworded to start `Count:` or `Limit:` (no status token, no longer list items): aud-sys-2a lines 61, 69, 82, 84; aud-sys-2b line 66; aud-sys-3 line 54. The 9 no-op migration lines and the policy/trigger caveat line of db-1 carry WORK tokens.
4. **66 dash and section-sign glyphs** replaced (aud-sys-2a 51, aud-sys-2b 11, aud-sys-3 4; the 21 in the archived absent-list too). Section sign became `S`, dash became a plain hyphen.
5. **Proof**: `node fsi-app/scripts/verify/audit-finding-status.mjs --strict` on the worktree: 0 unlabeled, 0 undispositioned, exit 0.

Checks before the final push, on the tree merged with origin/master 086724bfc: the strict audit-finding-status run (exit 0) and the fitness runner (44 functions checked, 0 violations).

## Read and reused

Read: the brief, COMMON.md, the failures list, `audit-finding-status.mjs` (the scanner: tables are not scanned, which is why the 865 undispositioned rows of the failures list were the two machine lists, now archived, plus 29 register lines), `fsi-app/.discipline/registry.mjs` (REGISTRY_ROWS ids, `carries`, RETIRED keys, imported, not parsed by hand), PIPE-1's file list (`git show --name-status 0b439ff0a`) for the eight deleted PR workflows, the master branch protection contexts (`gh api`, now `inputs, static, schema, app, master`). Reused: the registers' own evidence cells for status tokens; nothing built.

## Decisions

1. Rule matching used the registry text as well as the structured set, so a 2A/2B id present in `registry.mjs` anywhere (row id, `carries`, RETIRED, SUPPORT_FILES, LANE_WRITING_AUDITS) is CLOSED PR 1114, and an absent one is WORK reg1b-one-registry-spine.
2. A register-1 row naming `obligation_objects` in CAPABILITY or STATUS, or whose CODE cell begins with it, is CLOSED PR 1112 (R-02, SM-11i); F-02 and R-03 only mention it and keep their lane. C-04 and F-10 (publish_aggregate, antitrust gates) go to db2-schema-subtract ahead of their retired wording, because the retained DB function is the remaining work. Retired rows cite the ADR in the row (042, 043, 041) or the spec amendment date (M-03).
3. aud-sys-3 row FIXED BY "not fixed in PR 1054 (CLOSED unmerged); FLAG-1 re-landed as PR 1055 (merged...)" is CLOSED PR 1055, not WORK, because the row itself records the merged re-landing.
4. 2B workflow rows with push, workflow_run or dispatch triggers that remain after PR 1113 are NOT-WORK "dispatch-only runtime"; live-smoke (deployment_status) is NOT-WORK "post-deploy smoke". Git hook rows (pre-push steps, commit-msg and the other git hooks) are WORK hook1-three-steps; the three Claude Code session hook rows are NOT-WORK; the PreToolUse gate row is WORK skills1.
5. Lane ids `map1` and `skills1` are the plan's MAP-1 and SKILLS-1 in lower case; the brief named no id for them.
6. The db-1 view status READ (a reader exists) is treated as live. The register gives no SQL for the policy/trigger caveat, only the instruction to read `pg_policies` and `pg_trigger`; the line carries WORK exec5-tokens-pr.
7. aud-sys-1 row R-12 had an unescaped pipe inside a cell (`xlsx|pdf|csv`) that split the row into extra cells; escaped it so the table has one column count.

## NOT done

1. The 2B mutation-lease and funded-pass-lock golden line and the Table C row for funded-pass-lock-golden disagree about whether the live goldens run; the line is labeled HYPOTHESIS and left for the registry lane to re-check. [WORK: reg1b-one-registry-spine]
2. The "Five rows most worth attention" items 2 to 5 and the other bullets of the "no row in the system map" list were not flagged by the scanner and carry no token of their own; their rows carry one. [NOT-WORK: scanner scope is defect-shaped lines; the rows they summarise are dispositioned]
3. The `skills1` and `map1` lane ids are not yet briefs. [WORK: coordinator]

## Open items

1. The coordinator confirms or renames `map1` and `skills1` when those lanes are briefed. [WORK: coordinator]
