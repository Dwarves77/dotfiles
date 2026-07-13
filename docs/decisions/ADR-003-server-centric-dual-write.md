---
id: ADR-003
title: Server-centric dual-write for tier fields
status: accepted
date: 2026-05-20
scope:
  - "fsi-app/src/components/"
  - "fsi-app/src/app/api/admin/canonical-sources/decide/route.ts"
  - "fsi-app/src/app/api/admin/sources/promote/route.ts"
  - "fsi-app/src/stores/"
  - "fsi-app/src/hooks/"
supersedes: null
related:
  - ADR-002
---

## Context

Per ADR-002, sources have `base_tier` and `effective_tier` columns. When a client surface (CanonicalSourceReview, ProvisionalReviewCard) writes a new source via an admin route, both columns must be populated per the Day 1 invariant (both equal at insert time). Multiple shapes are possible: client writes both fields explicitly; client writes neither and server derives; client writes a single semantically-named field and server dual-writes.

Phase 1.5 closure initially preserved the legacy `body.tier = tier` pattern via documentation comments. F8 fitness function later codified the architectural decision mechanically; the bundled Sprint Architecture refactor renamed to `body.assignedTier`.

## Decision

Client surfaces send the operator-confirmed tier value via a semantically-named field (`body.assignedTier`). Server route handlers receive it and dual-write to both `base_tier` and `effective_tier` columns per the Day 1 invariant. The client never references the schema-shaped column names (`base_tier`, `effective_tier`, or the legacy `tier`).

Rationale:

- Clients shouldn't know about internal schema details. The split is implementation; the operator-chosen value is the semantic.
- Schema evolution is server-side concern. Future changes to how `effective_tier` is derived (e.g., new Q-series additions) don't require client updates.
- Audit log payloads preserve the resolved value (`tier: body.assignedTier ?? body.tier`) as a payload field, not a column reference.

## Consequences

- F8 fitness function mechanically enforces this decision: any client-side file under `fsi-app/src/components/`, `fsi-app/src/app/**/*.tsx`, `fsi-app/src/stores/`, or `fsi-app/src/hooks/` writing a `body.tier|base_tier|effective_tier` assignment fails the check.
- Server handlers accept both `body.assignedTier` and legacy `body.tier` during the F8 rollout window (transitional fallback). Type definitions declare both as optional.
- Client surfaces that introduce new tier-writing paths must use a semantically-named field; F8 catches direct schema-shaped writes at commit time.

## Alternatives Considered

- **Client writes body.tier (legacy)**: rejected. Was the Phase 1.5 initial pattern; preserved only via documentation; no mechanical enforcement. F8 codifies the rejection.
- **Client writes body.base_tier + body.effective_tier explicitly**: rejected. Leaks the schema split to clients; couples client and server schema evolution; doubles client code for what is one semantic decision.
- **Client writes body.assignedTier (chosen)**: explicit semantic name, no schema leak, F8-enforceable.

## References

- ADR-002 (tier model split that motivates the dual-write)
- F8 fitness function: `fsi-app/.discipline/fitness/functions/F8-client-server-tier-boundary.mjs`
- Sprint Architecture commit 2494a74 (F8 + bundled refactor)
- OBS-62 (Phase 1.5 architectural-decision-in-docstring gap; closed)
- remediation-discipline Signal 5

## Related

- [ADR-002-tier-model](./ADR-002-tier-model.md) — explicit related; ADR-003 dual-writes the base_tier/effective_tier columns this ADR creates
- [ADR-005-discipline-enforcement-layered-architecture](./ADR-005-discipline-enforcement-layered-architecture.md) — F8 client-server tier boundary is a Layer-2 fitness function catalogued in ADR-005's discipline architecture
- [discipline](../inventories/discipline.md) — F8 fitness function that enforces this decision is tracked in the discipline inventory
- [W1A-dual-write-audit](../audits/W1A-dual-write-audit.md) — shared dual-write subject; audit of the dual-write write-path this ADR governs
