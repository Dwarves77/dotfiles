---
id: ADR-009
title: ADR system architecture (meta)
status: deprecated
date: 2026-05-20
scope:
  - "docs/decisions/"
  - "fsi-app/.discipline/lib/adr-loader.mjs"
  - "fsi-app/.discipline/dispatch/audit.mjs"
supersedes: null
related:
  - ADR-005
---

## Postscript (2026-05-21): deprecated

The 13th binding rule this ADR documented (`fsi-app/.discipline/rules/013-adr-cross-reference.mjs`) was deleted in the 2026-05-21 engine slim refactor (per ADR-005 postscript B). The mechanical ADR-Reference / ADR-Override trailer requirement is no longer enforced. The ADR storage convention itself (YAML frontmatter at `docs/decisions/ADR-NNN-*.md` with id, title, status, date, scope, supersedes, related) survives as documentation discipline; the ADR loader at `fsi-app/.discipline/lib/adr-loader.mjs` is retained as a parsing helper. The audit script at `fsi-app/.discipline/dispatch/audit.mjs` retains its trailer-parsing logic for historical commits but new commits no longer carry ADR-Reference trailers. ADR retained for historical context; status changed from `accepted` to `deprecated`.

## Context

Per the operator's three-line vision (ADR-005), "decisions aren't discussed; they're programmatically protected" requires a system where past architectural decisions create gates against future contradictory work. Sprint Foundation handles attestation; Sprint Architecture handles application enforcement; the ADR system handles decision protection.

The mechanism: each decision becomes an ADR file with explicit scope (file globs); a binding rule cross-references the commit's touched files against accepted ADRs and requires the commit message to reference each intersecting ADR.

## Decision

**Storage**: ADRs at `docs/decisions/ADR-NNN-kebab-case-topic.md`. YAML frontmatter required:
- `id`: ADR-NNN (3-digit zero-padded)
- `title`: human-readable
- `status`: proposed | accepted | deprecated | superseded
- `date`: YYYY-MM-DD
- `scope`: list of glob patterns (file paths that trigger ADR-reference requirement)
- `supersedes`: null or ADR-NNN (when replacing a prior decision)
- `related`: list of related ADR-NNN ids

**Body sections** per Nygard template: Context, Decision, Consequences, Alternatives Considered. References section optional but encouraged.

**Cross-reference mechanism**: 13th binding rule (`fsi-app/.discipline/rules/013-adr-cross-reference.mjs`) at commit-time:
1. Load all accepted ADRs via `adr-loader.mjs`
2. Identify ADRs whose `scope` globs match files staged in the commit
3. Require commit message body to contain `ADR-Reference: ADR-NNN` trailer for each intersecting ADR
4. Override mechanism: `ADR-Override: ADR-NNN (rationale: <text>)` trailer signals explicit contradiction; passes the gate but is logged for future operator review
5. Hard-fail if intersecting ADRs not referenced

**Audit integration**: `dispatch/audit.mjs` extended to surface `ADR-Reference:` and `ADR-Override:` lines per dispatch UUID.

**Status lifecycle**: `proposed` (operator decision pending) → `accepted` (binding) → `deprecated` (still relevant for historical commits but no new work) → `superseded` (replaced by a specific newer ADR; the supersedes field links forward).

## Consequences

- The 13th binding rule lands with this dispatch + tests + skill amendment (sprint-followups-discipline gains a 13th named rule documenting the ADR-cross-reference discipline).
- Future architectural decisions land as new ADRs. The first instance of a decision is itself the moment the ADR is created.
- ADR maintenance burden: each decision requires a file; each substantial commit touching ADR-scoped files requires reference attestation. Mitigated by the override mechanism (rare cases) and by the scope field being explicit (no fuzzy matching).
- ADR retroactive coverage: this dispatch creates the initial 9 ADRs (ADR-001 through ADR-009) covering the load-bearing decisions made before the system existed. Future decisions get ADRs at creation time.

## Alternatives Considered

- **Skip ADR system; codify decisions in skills**: rejected. Skills are platform-wide policy documents with mandatory load patterns; ADRs are point-in-time decisions with potential to be superseded. Conflating them weakens both shapes.
- **Free-form decisions doc (single decisions.md file)**: rejected. Doesn't support per-decision scope tracking; impossible to mechanically cross-reference; turns into a wall of unparseable text over time.
- **ADRs without scope field; reference-required for ALL commits**: rejected. Too much friction; most commits don't intersect any decision. The scope field IS the mechanism that makes ADRs cheap to live with.
- **ADRs in a separate repo**: rejected. Coupling to the codebase is the point; the cross-reference rule needs to see both.
- **ADRs without override mechanism (always strict)**: rejected. Architectural decisions sometimes need to be contradicted for valid reasons (urgent fix, new information surfaced); override + rationale is the honest path. Audit catches override drift.

## References

- ADR-005 (the layered architecture; this ADR is Layer 3)
- 13th binding rule: `fsi-app/.discipline/rules/013-adr-cross-reference.mjs`
- ADR loader: `fsi-app/.discipline/lib/adr-loader.mjs`
- sprint-followups-discipline SKILL.md (gains 13th named rule documenting the ADR-cross-reference discipline)
- docs/inventories/decisions.md (the inventory of ADRs maintained per rule 11)
