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
| IMP-008 | P2-01 | Index and compare e-mail on lower(profiles.email) with eq | removes ILIKE scans and wildcard escaping in add-member | one forward migration | ACCEPT: P2-S2 (index) + the members handler | PROPOSED |
| IMP-009 | P2-01 | Store invitation tokens hashed, return the raw token once | a database read no longer yields usable invite links; `mine` returns raw tokens today | migration, rpc changes, invitee flow | ACCEPT: P2-S2 + P2-02b | PROPOSED |
| IMP-010 | P2-01 | Move the Supabase project to asymmetric JWT signing keys | getClaims verifies fully locally; symmetric keys fall back to a network call per request | dashboard setting, no code | ACCEPT: operator step at the cutover window | PROPOSED |
| IMP-011 | P2-01 | Shared rate limiter (Postgres counter) | the in-memory window is per instance; serverless is many instances | small table + 30 lines | ACCEPT: P2-S2 + core/http | PROPOSED |
| IMP-012 | P2-01 | Let a platform admin read GET /api/orgs/[org_id] | consistent with the member list, which admits them | one line | ACCEPT: P2-14 | PROPOSED |
| IMP-013 | P2-01 | route()/requireUser/dbError as the handler pattern for every slice; reuse tests/_support | uniform errors, 503 on failed reads, tests without production seams | none | BUILT-IN (WAVE-2-COMMON.md) | BUILT-IN |
| IMP-014 | P2-01 | Wire a free e-mail provider behind sendInvitationEmail | invitations rely on copy-link only | provider choice (operator), one secret | PROPOSED: the operator names the provider | PROPOSED |
| IMP-015 | P2-01 | Serve a small 503 page instead of redirecting to /login when the auth service is unreachable | signed-in users are not sent to a form during an outage | one page | ACCEPT: P2-09 shell | PROPOSED |
| IMP-016 | H-2 | A dedicated smoke account with no personal data for every parity capture | the baseline capture carried the operator's address and name token into a public tree (caught by tree-checks, sanitised by H-2) | operator creates the account, sets the two secrets | PROPOSED: operator action before the parity job runs on previews | PROPOSED |
| IMP-017 | H-2 | Baseline PNGs only for the four signed-out routes; JSON for every route | screenshots of signed-in pages show account details; the gate needs the JSON, pixels gate only signed-out routes | none | BUILT-IN (PR 3) | BUILT-IN |
