## Skill

remediation-discipline

## Change

No edit to any SKILL.md in this range. Lane gates1-evidence adds one `GOVERNING SKILL: remediation-discipline`
citation, in the header of `fsi-app/scripts/verify/loop-fired-evidence-audit.mjs`. I read
`fsi-app/.claude/skills/remediation-discipline/SKILL.md` in full for this lane and the citation stands because the
skill governs that file: the audit is the attack proof for the committed loop firing evidence that F50 now accepts.
The sections that apply are Section 4 category 46 (a loop's hops are checked as data, and an edge, a family and a
fired-from-upstream proof are three separate facts, so "fired" must be shown by evidence that can be checked against
the real record), Section 4 category 31 (a harness's own run history is a class fix target, and a summary is never
a substitute for the full record, here the `harness_runs` rows), and Section 3 (recurrence and shared-codepath
signals, which is why the firing evidence has one definition in `loop-manifest.mjs` instead of per-gate copies).
The audit also applies the "guard proven by attack, not presence" standard that Section 4 cites for its gates: a
forged, stale or edited entry must fail.

## Citing files reviewed

`fsi-app/scripts/verify/loop-fired-evidence-audit.mjs` (new, carries the citation). No other citing file of this
skill was added, removed or moved in this range.
