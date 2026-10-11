# Whole-build consolidation plan, 2026-10-11 (proposed; awaiting operator ruling)

Evidence: the four whole-build audit registers (aud-sys-1 traceability, 2A/2B enforcement, 3 failure ledger), landing in
docs/audits/whole-build-audit-2026-10-11/. Operator statement: "We built a system piecemeal and it's all scrambled
together"; "too many gates with info passing through systems that don't really work."

Verdict: the product core (~1,400 src files, 350 migrations) is wrapped in an enforcement and memory layer larger than
itself (51 fitness, 158 invariants, 96 verify scripts, 35 workflows, 29 hook steps, 100 audits, 319 session logs) that
partly checks itself and partly does not run (43 data audits behind a disabled workflow, 2 goldens never run with
credentials, chain proof 0 for 9, security checks not required to merge). 0 of 121 red runs in three days were product
defects. Every harness run on record is dry: the runtime half of the product is unproven by construction.
Sound and kept: facts in the database with provenance guards; disjoint lane write sets; execution over existence; the
local stack as oracle; the specs.

Principle: subtract. Nothing new lands without retiring something. Order: A, B, then C and D in parallel, E, F.

A. FREEZE (now). No new rule, fitness function, invariant, workflow or hook step unless it replaces one. Batch 3 stays
   unlaunched. The executor finishes the in-flight five (GATE-PUSH-1b, 1100 + 384/385, 1108, chain proof fire 10,
   SMOKE-5) and stops.
B. ONE PIPELINE (first: it is the money). One PR workflow, five jobs, all required: static (lint, tsc, unit tests);
   schema (migrations + RLS matrix on one stack; only when migrations change); app (build + rendering guard + route
   attacks in one browser session; only when src changes); docs gate (tokens); one post-merge smoke. Dispatch-only
   runtimes stay as dispatch. Everything else deleted. One scope mechanism (job-inputs) replaces four. Targets: code PR
   < 12 min, docs PR < 3, master push < 2.
C. ONE ENFORCEMENT REGISTRY. Fitness + invariants + verify + goldens -> one registry, one runner, one row per property
   (register 2A's overlap groups are the merge list). Duplicates and dead rows deleted. A survivor shows a truthful
   failure or an attack that bites, or it goes. data-audit lane: re-enabled on a schedule or its 43 audits deleted.
   Hook -> three steps (no secrets/untracked critical files; lint on changed files; unit tests on changed files).
   Target: 305 checks -> < 150, all executing.
D. PRODUCT HALF-SLICES (from register 1). obligation_objects: writer or drop. publish_aggregate: caller or drop.
   ADR-041 boundary: one check. 16 ABSENT capabilities: each ruled BUILD or DROP against its spec. Per-surface
   acceptance criteria -> one small test table each (replaces the 14-row placeholder).
D2. EVERY OWED FINDING CLOSED (operator 2026-10-11: "We HAVE to fix everything now"). The OWED-LIST register
   (every `[WORK:` row with its lane/PR state, every deferral-shaped `[NOT-WORK:` row, every unverified
   `[HYPOTHESIS` in audits since 2026-09-01) is the backlog. Each row is assigned to a named lane in waves 2 to 3 or
   REFUTED in place with evidence; the gate changes so that `[WORK: owed]` with no lane id fails, `[NOT-WORK:` with a
   deferral word fails, and a `[WORK: <lane>]` whose lane log does not exist after 7 days fails (register 3's
   "class prevented = NONE" rows are in this backlog too).
E. THIN THE MEMORY. Audits older than audit-consolidated-2026-09-30 archived (unindexed, unloaded). Rule corpus ->
   CLAUDE.md + one lane contract. System map regenerated from register 1; the only map.
F. STAGE 9: real runs. The only proof of the runtime half; the product.

Cost: 2 to 3 weeks of lanes, mostly deletion; CI minutes fall after B. Phase B's brief goes to the operator before launch.
