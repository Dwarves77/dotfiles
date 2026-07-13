---
id: ADR-010
title: Docs taxonomy, INDEX discipline, and two-repo memory architecture
status: accepted
date: 2026-07-07
scope:
  - "docs/**"
  - "CLAUDE.md"
supersedes: null
related:
  - ADR-009
---

## Amendment (2026-07-13): linking convention is markdown relative links, superseding `[[wikilinks]]`

Operator ruling (Jason, 2026-07-13). Docs link with **standard markdown relative links** —
`[label](relative/path.md)`, resolved from the *linking file's own directory* — **not** Obsidian
`[[wikilinks]]`. Rationale: relative links render on GitHub and in any plain-markdown viewer and survive
outside the vault, whereas `[[wikilinks]]` resolve only inside Obsidian. This supersedes Decision point 5
below ("Filenames are `[[wikilink]]` targets") and the "INDEX + wikilinks" phrasing in Consequences; root
`CLAUDE.md`'s memory-conventions bullet and standing rule 8 (both still say `[[wikilinks]]`) are read under
this amendment until they are re-issued.

Mechanics and scope of the 2026-07-13 docs-graph backfill:

- Target is the doc's path relative to the linking file — e.g. from `docs/runbooks/` to a decision:
  `[ADR-002-tier-model](../decisions/ADR-002-tier-model.md)`; from `docs/INDEX.md`:
  `[ADR-002-tier-model](decisions/ADR-002-tier-model.md)`.
- 606 existing doc-to-doc wikilinks across 112 living docs were converted to relative links.
- `archive/` was intentionally left on its stale references (consistent with the Consequences note that
  archived prose is left stale). Skill-internal `[[concept]]` references with no doc target
  (`[[rule-*]]`, `[[vocabulary-*]]`, `[[reference-*]]`, etc.) were left untouched — they are not
  doc-graph edges and would resolve to nothing as relative links.
- Renames still require updating inbound links; only the link *syntax* changes, not the maintenance
  burden. A `[[wikilink]]` that survives in a living doc is now a lint smell, not the convention.

## Context

docs/ accumulated 169 loose top-level files mixing decision-grade documents with machine evidence (execute logs, runlogs, raw JSON). Root CLAUDE.md was the frozen June build prompt, duplicated by CLAUDE_CODE_PROMPT.md; the session-start command booted every session on a stale spec, and done.md appended session logs to a section that did not exist. Memory did not compound.

## Decision

1. **Taxonomy is binding.** Loose docs land in their class folder, never at docs/ top level: `audits/` (audits, investigations, verifications), `plans/` (specs, prework, proposals, frameworks), `runbooks/` (procedures, playbooks), `ops/` (followups, session-log.md), `decisions/` (ADRs), `inventories/`, `design/`, sprint folders. Superseded working notes go to `archive/`; machine evidence to `archive/logs/` or gitignored scratch (`fsi-app/scripts/tmp/`, `_snapshots/`, `_plans/`).
2. **INDEX.md is the map.** One line per living doc, added in the same commit that adds the doc. `archive/` is not indexed.
3. **Root CLAUDE.md is the operating manual** (constitution): directory map, loading priority, standing rules, self-annealing protocol. Session state never lands in it; session logs go to `docs/ops/session-log.md`.
4. **Two-repo memory architecture.** This repo holds Caro's Ledge project memory only. Cross-project and personal memory live in the private brain vault repo. Regulatory facts live in Supabase; docs cite record IDs and migration numbers, never restate published facts.
5. **docs/ is an Obsidian-readable vault.** Docs cross-link with markdown relative links (see the 2026-07-13 amendment above; originally `[[wikilink]]` targets); renames require updating inbound links; `.obsidian/` is gitignored UI state.

## Consequences

- The 2026-07-07 triage (164 tracked moves) established the layout; 6 gitignored files at docs/ top level move manually on the main checkout.
- Historical prose references to old `docs/<file>` paths inside archived documents are left stale intentionally; INDEX + inter-doc relative links are the discoverability mechanism (relative links per the 2026-07-13 amendment; originally wikilinks).
- `.claude/commands/start.md` and `done.md` boot from and close into this structure.

## Alternatives Considered

- **Single brain repo holding everything (projects + personal)**: rejected. Wrong access boundary; product repo has agents, CI, and collaborator-visible history.
- **Leave docs/ flat**: rejected. 169-file top level is unloadable as context and unreadable as memory.
- **Index inside each folder only**: rejected. Agents need one entry point (Layer 1 routing); per-folder indexes remain optional local routing.

## Related

- [ADR-009-adr-system-architecture](./ADR-009-adr-system-architecture.md) — explicit related; ADR-010 preserves the ADR-NNN frontmatter storage convention this ADR defines
- [ADR-005-discipline-enforcement-layered-architecture](./ADR-005-discipline-enforcement-layered-architecture.md) — shared docs/decisions/ + docs/inventories/ scope; Layer-4 consistency checks operate over the inventory taxonomy this ADR binds
