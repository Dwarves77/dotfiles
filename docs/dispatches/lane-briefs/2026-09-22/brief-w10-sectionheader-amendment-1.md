# Lane W10-SectionHeader, Amendment 1 (coordinator, 2026-09-22): item 1 is already done. Read after `brief-w10-sectionheader.md`; this file wins.

Build item 1 (every fact card inside ItemGroup on both grades) was closed by lane W10-ActionCard-b, merged as PR #784 (`b8068ea5`): its commit "record-grade fact cards now render inside ItemGroup" [CONFIRMED on GitHub]. Do NOT redo it. Instead, VERIFY it: the test the brief describes (mount each detail surface's record-grade and full-brief fixtures; every `[data-part="fact-card"]` has an `[data-part="item-group"]` ancestor) is added if it does not exist yet, and must pass; if it fails anywhere, fix at the cause and say where.

FactCard-e (#782) froze the panel-21c records to the fixtures folder; reuse that file for your fixtures, never a second copy.

Everything else in the brief stands: SectionHeader part, fixtures from frozen real records, the guard PASS twice, gates. The real Rendering guard and the npm suites both run in the locked gate now; the live-database golden is isolated per run (G4, #783). Commit trailer for new commits: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
