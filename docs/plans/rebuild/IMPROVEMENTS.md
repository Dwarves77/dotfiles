# Improvements found during the build (for the operator's discussion)

Operator, 2026-10-15: "if during the build you find something that can be done better in ANY way let's discuss it."
Every lane reports an IMPROVEMENTS block; Fable collects them here with a recommendation. Status: PROPOSED (waiting
for the operator), BUILT-IN (inside a slice's budget, no design or interface change; reported, not held), DECLINED
(operator), ACCEPTED (operator; assigned to a slice).

| id | from | what | why better | cost | recommendation | status |
|---|---|---|---|---|---|---|
| IMP-001 | P2-00 | Pin Node 24 in .nvmrc | local Node 22 differs from CI and already broke the test script once | 1 line | BUILT-IN by P2-01 | BUILT-IN |
| IMP-002 | P2-00 | Seeded-violation fixtures run in CI (each property check proven to fail on a planted violation in every run) | rule 15: a guard is proven by attack, not once by hand | ~60 lines | ACCEPT: assign to the schema forward-migration slice (P2-S1) | PROPOSED |
| IMP-003 | P2-00 | The remaining schema.md property checks (SET NULL onto NOT NULL, missing-relation bodies, initplan wraps, default privileges) | pins four known baseline defects the registers confirmed | ~80 lines plus waivers | ACCEPT: P2-S1, waived at baseline then turned strict by its migrations | PROPOSED |
| IMP-004 | P2-00 | Slice id on each waiver | waivers are ownerless today | 2 lines | BUILT-IN by P2-S1 | BUILT-IN |
| IMP-005 | P2-00 | Pin postgres:15.14 in ci.yml | the service image floats across minors | 1 line | BUILT-IN by P2-01 | BUILT-IN |
| IMP-006 | P2-00 | Name ban from a hashed token list (several variants), not one token | one hashed token misses variants | trivial | BUILT-IN by P2-01 (Fable supplies the hashes, never the names) | BUILT-IN |
| IMP-007 | P2-00 | Reconcile the agent plan's schema path (supabase/schema.sql is the path used) | two docs disagreed | doc edit | BUILT-IN (this PR) | BUILT-IN |
