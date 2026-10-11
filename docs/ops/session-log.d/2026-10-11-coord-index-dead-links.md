# 2026-10-11, EXEC-8 (coord/index-dead-links): INDEX and fsi-app CLAUDE.md pointers to deleted files removed

CLEAN-1 (#1126) deleted the archive; four INDEX lines and one CLAUDE.md pointer named files that no longer exist on the tree. This coord PR removes exactly those pointers.

## Accomplished

1. `docs/INDEX.md`: checked every `](...)` target with `test -e`; four lines had a dead target. Deleted the three `ratifications/2026-09/` lines. The `whole-build-audit-2026-10-11` line keeps its living README link and loses only the trailing clause that linked `archive/logs/whole-build-audit-2026-10-11/owed-list-2026-10-11.md` (deleting the whole line would have un-indexed a living directory). Line 3 now reads "docs/archive/ holds only the 41 audit registers of 2026-10-11 (evidence out of the finding gate)."
2. `fsi-app/.claude/CLAUDE.md` line 8: the pointer to `docs/archive/CLAUDE-session-log-2026-04.md` (file gone) deleted.
3. Local tier before the push: fitness runner 0 violations; commit-time rules pass; `audit-finding-status.mjs --strict` exit 0.

## Decisions

- Coordinator instruction followed except item 1's whole-line deletion for the whole-build-audit line, replaced by removing only the dead clause. [NOT-WORK: reported to the coordinator in the EXEC-8 burst report]
