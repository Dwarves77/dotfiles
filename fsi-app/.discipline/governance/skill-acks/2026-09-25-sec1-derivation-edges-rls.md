## Skill

remediation-discipline

## Change

`fsi-app/.claude/skills/remediation-discipline/SKILL.md` itself is unchanged. This range ADDS a new
`GOVERNING SKILL(S):` citation of it, at `fsi-app/scripts/verify/derivation-edges-rls-adversarial-audit.mjs`
line 2 (`GOVERNING SKILL: remediation-discipline (rule 15, a guard is proven by attack, not presence)`).
The file is the SEC-1 fix lane's adversarial RLS proof for `public.derivation_edges`, modeled on
`prov-guard-adversarial-audit.mjs` per rule 15: as anon and authenticated, inside a rolled-back
transaction, it attempts INSERT/UPDATE/DELETE/SELECT and asserts denial, and asserts service_role
still reads its own fixture row. This is a straightforward instance of rule 15's own template pattern,
not a new interpretation of the skill; the citation is accurate.

## Citing files reviewed

Per skill-contract-map.mjs's convention (citing files = files matching a `GOVERNING SKILL(S):` marker
for this skill under CITATION_SCAN_ROOTS, `fsi-app/src` and `fsi-app/scripts`):
`git grep -rln "GOVERNING SKILL" -- fsi-app/src fsi-app/scripts | xargs grep -l "remediation-discipline"`
from the worktree root names the pre-existing citers plus this range's new one:

`fsi-app/scripts/verify/prov-guard-adversarial-audit.mjs` (the rule-15 template this file is modeled
on), `fsi-app/scripts/verify/spec09-org-rls-adversarial-audit.mjs` (the role-impersonation pattern this
file's `SET LOCAL ROLE anon`/`authenticated` probes reuse), and the new file,
`fsi-app/scripts/verify/derivation-edges-rls-adversarial-audit.mjs`.

The two pre-existing citers are unchanged in this range. Both already cite remediation-discipline for
the identical rule-15 "attack, not presence" posture this new file applies to a different table
(`derivation_edges` instead of `intelligence_items.provenance_status` / spec09's org-scoped tables);
no conflict, no reinterpretation of the skill's framing.
