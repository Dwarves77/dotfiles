Close out the session:
1. Append a dated entry to docs/ops/session-log.md: accomplished, decisions, blockers, next steps.
2. Update docs/PROGRAM-BOARD.md: log what landed. Apply the EXECUTION-REPORT rule — every ruled thread either cites its execution report (PR / commit) or is flagged OPEN on the board. A confirmed ruling is an open thread until its execution report lands.
3. If an architectural decision was made, create docs/decisions/ADR-NNN-<topic>.md (frontmatter per ADR-009).
4. BORN-LINKED (ADR-010): any new living doc is created with BOTH a docs/INDEX.md line AND markdown relative links (`[text](../dir/file.md)`) to 2-5 related docs — never an orphan, never a wikilink. Real-doc cross-links are markdown relative links; conceptual anchors (rule-*, vocabulary-*) stay plain text, not `[[wikilinks]]`.
5. If something broke and was fixed, update the relevant runbook; if the approach changed, update the plan or skill file.
6. Update docs/tech-debt-log.md if debt was added or retired.
7. Commit the docs changes (a docs PR on protected master). Session memory is NOT durable until committed.
Do not write session logs into CLAUDE.md.
