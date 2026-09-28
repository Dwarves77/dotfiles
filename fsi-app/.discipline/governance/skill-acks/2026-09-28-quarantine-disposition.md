## Skill

remediation-discipline

## Change

This range does not change `fsi-app/.claude/skills/remediation-discipline/SKILL.md`. It adds two new
`GOVERNING SKILL` citations of it in new files:

- `fsi-app/scripts/lib/quarantine-dwell.mjs` (the DWELL/ENQUEUE/deferral-validity classification,
  extracted verbatim from `scripts/verify/quarantine-disposition-audit.mjs`'s existing pre-range
  citation of the same skill, Section 2.1)
- `fsi-app/scripts/plan-quarantine-disposition.mjs` (the new per-item disposition planner, citing
  Section 2.1 and Section 2.2 for the disposition and deferral vocabulary it implements)

`fsi-app/scripts/verify/quarantine-disposition-audit.mjs`'s own pre-existing `GOVERNING SKILLS:
remediation-discipline (Section 2/4 ...)` citation line is unchanged verbatim by this range (the
surrounding header comment was edited to mention the new planner, but that specific citation line was
preserved as-is, not moved).

## Citing files reviewed

Both new citing files were read against Section 2.1 (Quarantine Is an Open Investigation,
research-or-erase: the disposition vocabulary is recovered / archived / registered / erased, or a valid
time-bounded deferral) and Section 2.2 (Deferred vs Undispositioned: a deferral is
dispositioning-as-BLOCKED, never silencing, and must satisfy `scripts/lib/deferral.mjs`'s
`isValidDeferral`) before being written. `plan-quarantine-disposition.mjs`'s five reason-class deferral
templates were each verified against `isValidDeferral` by
`plan-quarantine-disposition.test.mjs`'s own test suite, not merely asserted. No existing category, rule
or threshold in `remediation-discipline` changed.
