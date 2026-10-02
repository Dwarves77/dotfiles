## Skill

remediation-discipline

## Change

No content in `fsi-app/.claude/skills/remediation-discipline/SKILL.md` changed in this range. What
changed is a citing file's own header wording: `fsi-app/scripts/verify/pagination-order-key-audit.test.mjs`
(lane MAINTENANCE-HARNESS, 2026-09-28) had its own top-of-file citation line reworded from
`SKILL: remediation-discipline (class over instance).` to `GOVERNING SKILL:\nremediation-discipline
(class over instance).`, matching the `GOVERNING SKILL(S)` phrasing `db.mjs`'s own write-guard
convention already uses. The range detector treats this as a citation ADDED (the older `SKILL:` wording
does not match the `GOVERNING SKILL(S)` pattern `extractCitedSlugs` scans for), so this range needs its
own ack even though the doctrine text this file cites is unchanged: the file's readAll() class fix
(closing the same three-incidents-one-cause defect class remediation-discipline's own class-vs-instance
criteria already govern -- signal 2, infrastructure-wide invariant a shared primitive must absorb, and
signal 4, the reinventing-the-wheel risk of a fourth call site rediscovering the same bug by hand) is
the reason the citation is there at all; the wording change is cosmetic (matching this repo's own
established `GOVERNING SKILL` phrasing), not a re-scoping of what the file cites or why.

## Citing files reviewed

`fsi-app/scripts/verify/pagination-order-key-audit.test.mjs` -- the only file in this range whose
`remediation-discipline` citation moved (`SKILL:` -> `GOVERNING SKILL:`). `fsi-app/scripts/lib/db.mjs`
already carried its own `remediation-discipline`/`GOVERNING SKILL` references unchanged across this
range (confirmed identical on both sides of the merge-base) and needed no ack.
