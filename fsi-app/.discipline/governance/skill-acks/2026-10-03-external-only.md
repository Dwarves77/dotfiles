## Skill

caros-ledge-platform-intent

## Change

This range changes `fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md` (lane EXTERNAL-ONLY, ADR-042,
operator ruling 2026-10-03: the system takes external data and advises what it means; no customer data intake;
the Community benchmarks are removed). It adds a dated item 5 under "Operator-Stated Corrections" stating that
rule, naming what stays (the automate-versus-hire calculator, the workspace profile, watchlist, personal
archive and priority, tags and briefing schedule, and operator-dispatched external-source rows files) and what
is removed. The anchor phrase "Community is a CORE customer-facing surface" (invariant PI-3) and the
five-surface model are not changed.

## Citing files reviewed

No `GOVERNING SKILL(S):` citation of this skill was added, removed or moved in this range. One citing file was
edited for content only: `fsi-app/scripts/verify/spec09-org-rls-adversarial-audit.mjs` (retargeted from the
dropped `surcharge_audits` table to the surviving `auxiliary_energy_profiles` table; its citation line is
unchanged). The invariant files PI-1, PI-3 and PI-5 under `fsi-app/.discipline/governance/invariants.d/` assert
the five-surface model, Community as core and co-equal, and every decline naming the five contracts; none
asserts customer upload, an assumption register or a benchmark, and none is changed.
