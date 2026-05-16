---
name: operational-audit-dispatch-pattern
description: STUB. Read-only audit pattern using parallel agent dispatch + synthesis. Established 2026-05-15 in producing the v2 product audit. Use for any "investigate everything, don't triage" request.
---

# Operational: Audit Dispatch Pattern

## Purpose

When the operator requests an audit (system, schema, code, source classification, etc.), this skill encodes the proven pattern: parallel read-only agent dispatch across investigation areas, with synthesis into a single document.

## When to use

- Operator says "audit X" or "investigate everything about Y"
- Per operator memory: "Audits: investigate everything, dont triage"
- Pre-build phase: when planning major work, audit current state first

## When NOT to use

- For a single-targeted lookup (use Grep / Glob / Read directly)
- For a fix request (use the appropriate writer/classifier/extractor skill, not an audit)

## Pattern (proven 2026-05-15)

1. **Define seed investigation areas.** 5-8 distinct angles, each independent enough to run in parallel. Examples from the v2 product audit: data sufficiency per page, cross-reference integrity, source traceability, route alignment, AI writer quality, FSI Brief framework + integrity, lead time + vertical/mode priority, multi-tenant 3-layer model.

2. **For each area, write a self-contained brief.** The agent reading it has no context from this conversation. Include:
   - Project context (1-2 paragraphs)
   - The area's specific question
   - Methodology guidance (what to read, what to query, how to validate)
   - Output format (structure of the deliverable)
   - Constraints (read-only, no fixes, no migrations, no PRs, no downstream dispatches)
   - Halt conditions (when to surface vs proceed)

3. **Dispatch all agents in parallel** with `run_in_background: true`. They notify on completion.

4. **As each agent completes, give the operator a brief headline update** — one paragraph of the most operator-consequential finding. Do not synthesize until all complete.

5. **Synthesize into a single document.** Structure:
   - Executive verdict (one paragraph)
   - Per-area assessment
   - Structural failures (numbered: S1, S2, ...)
   - Symptomatic failures (table mapping symptoms to structural sources)
   - Specification (what must be true)
   - Reading order for fixes (priority by dependency)
   - Closing observation
   - Appendix: methodology

6. **Save to `dotfiles/docs/<topic>-audit-YYYY-MM-DD.md`.**

## Recent invocations (reference)

- 2026-05-15: v2 product audit (`docs/caros-ledge-product-audit-2026-05-15.md`) — 8 parallel agents, ~17 min wall clock, ~480 tool uses
- 2026-05-15: Schema audit (`docs/caros-ledge-supabase-schema-audit-2026-05-15.md`) — single deep agent, ~36 min wall clock, ~88 tool uses

## Inherits

- [[rule-no-speculation-as-fact]] (audits report findings; never speculate beyond evidence)
- [[rule-cross-reference-integrity]] (audit findings are grounded in concrete file:line, counts, sample text)

## Composition

Foundational pattern; not composed with other skills. Audit findings inform downstream work that uses other skills.

## Audit cross-reference

- This skill is the meta-pattern that produced the v2 audit + schema audit + this skill taxonomy
