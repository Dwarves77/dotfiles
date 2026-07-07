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

## Context

docs/ accumulated 169 loose top-level files mixing decision-grade documents with machine evidence (execute logs, runlogs, raw JSON). Root CLAUDE.md was the frozen June build prompt, duplicated by CLAUDE_CODE_PROMPT.md; the session-start command booted every session on a stale spec, and done.md appended session logs to a section that did not exist. Memory did not compound.

## Decision

1. **Taxonomy is binding.** Loose docs land in their class folder, never at docs/ top level: `audits/` (audits, investigations, verifications), `plans/` (specs, prework, proposals, frameworks), `runbooks/` (procedures, playbooks), `ops/` (followups, session-log.md), `decisions/` (ADRs), `inventories/`, `design/`, sprint folders. Superseded working notes go to `archive/`; machine evidence to `archive/logs/` or gitignored scratch (`fsi-app/scripts/tmp/`, `_snapshots/`, `_plans/`).
2. **INDEX.md is the map.** One line per living doc, added in the same commit that adds the doc. `archive/` is not indexed.
3. **Root CLAUDE.md is the operating manual** (constitution): directory map, loading priority, standing rules, self-annealing protocol. Session state never lands in it; session logs go to `docs/ops/session-log.md`.
4. **Two-repo memory architecture.** This repo holds Caro's Ledge project memory only. Cross-project and personal memory live in the private brain vault repo. Regulatory facts live in Supabase; docs cite record IDs and migration numbers, never restate published facts.
5. **docs/ is an Obsidian vault.** Filenames are [[wikilink]] targets: renames require link updates; `.obsidian/` is gitignored UI state.

## Consequences

- The 2026-07-07 triage (164 tracked moves) established the layout; 6 gitignored files at docs/ top level move manually on the main checkout.
- Historical prose references to old `docs/<file>` paths inside archived documents are left stale intentionally; INDEX + wikilinks are the discoverability mechanism.
- `.claude/commands/start.md` and `done.md` boot from and close into this structure.

## Alternatives Considered

- **Single brain repo holding everything (projects + personal)**: rejected. Wrong access boundary; product repo has agents, CI, and collaborator-visible history.
- **Leave docs/ flat**: rejected. 169-file top level is unloadable as context and unreadable as memory.
- **Index inside each folder only**: rejected. Agents need one entry point (Layer 1 routing); per-folder indexes remain optional local routing.
