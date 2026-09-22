# Lane W10-ActionCard-b, amendment 1 (coordinator, 2026-09-22): resume, the record-grade ItemGroup gap is in scope, finish items 7 to 9

Continues `brief-w10-actioncard-b.md`. The lane's first two agents ended before a commit; the worktree `wt-l34-detail-admin-primitives` holds their uncommitted modifications and a partial `docs/ops/session-log.d/2026-09-22-w10-actioncard-b.md`. This amendment is the coordinator's dispatch, in the brief channel, not a mid-task injection.

1. **In scope, by this amendment:** the record-grade regulation path (`RecordGradeSections` / `RecordFactCard` inside `RegulationDetailSurface.tsx`, this lane's own write-set file) must render its fact cards inside `ItemGroup` (`[data-part="item-group"]`), exactly as the brief-grade path does after FactCard-d. Reference record: `/regulations/f8268063…` showed 4 cards and no ItemGroup. The lane log says this was fixed and a fixture added; verify it in the diff and by the guard's smoke fixture; if it is not, do it now. The earlier "declined" paragraph in the log stays as history with a one-line note pointing here.
2. **Item 7:** the presence report table (part, route, file, line) for ActionCard, Timeline, SectionIndex and the record-grade ItemGroup is missing from the log. Write it.
3. **Item 8:** the acceptance list measured by the real guard locally at 1440 and 375; quote the measured numbers in the log. The lane log promises "results below" and has none.
4. **Item 9:** the SELECT finding (no live row carries a "Transition deadline" milestone; the worked example is the lane A fixture) stands as the answer. Keep it.
5. Gates as the brief says, guard PASS twice, then ONE commit of the lane's tracked changes (never `git add -A`; stage each file by name), the PR body to the scratchpad, ONE report.
