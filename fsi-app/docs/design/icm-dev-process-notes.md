# ICM → Caro's Ledge dev-process notes

Source paper: Van Clief & McDermott, "Interpretable Context Methodology," arXiv:2603.16021.
Integrated 2026-06-23. **Dev-process only — see the boundary.** The canonical doctrine lives in
`fsi-app/.claude/CLAUDE.md` → "Development-process discipline — Interpretable Context Methodology";
this file is the fuller mapping + the design-only item (#5).

## The boundary (why most of the paper does NOT apply here)

ICM describes a DEVELOPMENT methodology for SEQUENTIAL, HUMAN-REVIEWED-AT-EVERY-STAGE workflows. That
matches how we DEVELOP Caro's Ledge (operator + Claude + Claude Code relay, staged review, edit-source).
It does NOT match how Caro's Ledge RUNS: the runtime is AUTONOMOUS BY DESIGN — Layer B/C enforcement,
audit gates, fail-closed grounding — built specifically so a human is NOT the final correctness catch.
ICM's core premise (human-in-the-loop at every stage) is the OPPOSITE of the runtime goal. So the paper
sharpens the DEV PROCESS; the product stays autonomous. Any "improvement" that would make the running
product need a human it was built not to need is the boundary being crossed — reject it.

Not adopted as product re-architecture: the paper's folder-as-orchestration / filesystem-orchestration
is a dev-workflow pattern; our dev workflow (CLAUDE.md + skills + committed artifacts + relay) already
embodies it, and the product has a real pipeline with enforcement. No migration.

## Adopted (landed in CLAUDE.md doctrine)

1. **Reference-vs-working-artifact diagnostic** (paper's Layer 3 reference vs Layer 4 working artifact) —
   when an output is wrong, classify first: reference problem (skill/prompt underspecified → cure in the
   skill) vs working-artifact problem (input incomplete/mis-delivered → cure in the pipeline). The
   truncation defect was working-artifact; the producer-status overstep + missing-2038-ban were reference.

2. **Edit the source, not the output** (section 6.3) — editing output patches the binary; editing the
   source fixes the compiler. A recurring output correction is a backlog of source-level fixes. Wired to
   retrieval-before-generation / RD-8 and to the autonomy goal (improves with use vs needs the operator
   forever).

3. **Scope-down vs full-delivery** (the "lost in the middle" point, Liu et al.) — scope context per stage
   WHERE relevance is pre-identifiable (dev/code/skills). DOMAIN EXCEPTION: regulatory grounding —
   relevance is NOT pre-identifiable, so the truncation fix delivers the FULL document + coverage-forcing,
   the deliberate opposite of scope-down. Standing guard against re-introducing scoping caps on
   regulatory grounding.

4. **Observability-by-default / glass-box** (validation, no change) — committed migrations, PRs, the
   disposition ledger, integrity_flags, prove-on-one artifacts are interpretable-by-construction. Sound.

## #5 — Source-level traceability / semantic debugging (DESIGN-ONLY, scale-gated, NOT built)

The paper (section 6.2) distinguishes OBSERVABILITY (you can read the output) from TRACEABILITY (you can
trace a wrong phrase back to the instruction/source that caused it). We have observability (committed
artifacts) and FACT→source traceability (`section_claim_provenance` ties each FACT claim to its
`source_span` + `source_id` + `source_tier_at_grounding`). The GAP is output-quality→instruction
traceability: when a brief's FRAMING is wrong (not a fact, the treatment), tracing it back to the prompt
discipline / skill section that produced it is manual.

Cheap-if-built sketch (do NOT build at 2-person scale; recorded so it isn't re-derived later): the
grounding ledger already stores per-claim provenance; a lightweight addition could stamp, per claim or
per section, which governing discipline applied (e.g. a `governed_by` tag: `part-d:qualification-capture`,
`skill:env-policy#legal-line`, `format:regulatory_fact_document#S4`). That would let the recurring-edit
diagnosis (#2) answer "which source-level instruction governs this framing?" mechanically instead of by
re-reading the skill. Value scales with corpus size and number of authors; at current scale the manual
trace is cheaper than the tagging machinery. **Revisit when:** a second content author joins, OR the
recurring-edit backlog (#2) grows past hand-tracking, OR a framing defect class recurs across formats and
its governing instruction is non-obvious. Until then: future direction, not work.
