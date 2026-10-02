---
id: ADR-037
title: The 2026-09-18 parts brief supersedes the 2026-09-07 and 2026-09-09 UI rulings it conflicts with
status: accepted
date: 2026-10-01
scope:
  - "fsi-app/src/components/ui/SectionHeader.tsx"
  - "fsi-app/src/components/ui/CommandBar.tsx"
  - "src/app/api/search/route.ts"
  - "docs/design/parts-brief-2026-09-18.md"
  - "docs/design/parts-inventory.md"
supersedes: []
related:
  - "docs/design/parts-brief-2026-09-18.md"
  - "docs/design/parts-inventory.md"
  - "docs/audits/audit-consolidated-2026-09-30.md"
  - "docs/plans/remediation-plan-2026-09-30.md"
---

# ADR-037: The parts brief supersedes earlier UI rulings it conflicts with

## Context

Audit lane A8d (`docs-vs-reality-board-and-remainder-2026-09-30.md`, finding DES-3) found two unresolved,
dated ruling conflicts in `docs/design/parts-inventory.md`'s own "cases not drawn" section, neither
resolved by any later doc in the 2026-09-30 audit wave's read set:

1. **Whether a rule sits below an S-section title.** `SectionHeader.tsx:27-30` cites a CLOSED 2026-09-07
   ruling forbidding a rule below the S-section title. `docs/design/parts-brief-2026-09-18.md` section 2.3
   asks for exactly that rule. The code follows the 2026-09-07 ruling, not the 2026-09-18 brief's text.
2. **Whether the CommandBar Search\|Ask toggle is removed.** The toggle was itself a named, dated
   2026-09-09 operator ruling (the CMDSEARCH lane). The 2026-09-18 parts brief asks to remove it without
   mentioning it by name; removing the toggle also removes the UI path to `GET /api/search`, the capability
   the toggle exists to reach, and the parts brief states no disposition for that capability.

Twelve-plus days had elapsed between the parts brief and `parts-inventory.md`'s own documentation of both
conflicts (2026-09-18 to 2026-09-30+) with no resolving doc. Per CLAUDE.md standing rule 13 ("a flag is a
commitment"), both needed resolution, not another audit citation.

## Decision

The 2026-09-18 parts brief (`docs/design/parts-brief-2026-09-18.md`) supersedes the 2026-09-07 and
2026-09-09 rulings it conflicts with, as the newer, more specific, operator-reviewed source. Specifically:

1. **The rule below S-section titles stands.** The parts brief's section 2.3 instruction governs;
   `SectionHeader.tsx` (and any sibling S-section component) carries the rule line below the title, per
   the brief. The 2026-09-07 ruling is superseded for this specific case.
2. **The CommandBar Search\|Ask toggle is removed.** The 2026-09-18 parts brief's instruction governs. The
   `GET /api/search` capability the toggle existed to reach is **not** removed: it stays reachable from the
   single remaining CommandBar input (the brief removes a toggle UI element, not a capability; a single
   input that dispatches to search or to Ask based on its own content, or an equivalent single-input
   design, replaces the two-mode toggle). No backend route is deleted by this ruling.

## Consequences

- `docs/design/parts-inventory.md`'s "cases not drawn" items 2 and 3 are closed by this ADR, per rule 13's
  corollary (a flag that reaches a ruling is closed in place, not left open after the ruling lands). A
  follow-up doc edit should add a one-line closure note on `parts-inventory.md` pointing here.
- No code change is required by item 1 alone (`SectionHeader.tsx` already follows the governing ruling
  going forward; this ADR records which ruling that is, it does not newly change behavior there). Item 2
  requires the CommandBar Search\|Ask toggle UI to be removed and the single-input path to `GET /api/search`
  verified reachable, tracked under `docs/plans/remediation-plan-2026-09-30.md` Lane 19.
- This ADR does not re-open any other 2026-09-07 or 2026-09-09 ruling; only the two specific conflicts
  DES-3 named are resolved here. A future conflict between a dated ruling and a later brief is not
  pre-resolved by this ADR's precedent; each is its own decision, cited by its own ADR if it recurs.
