---
id: ADR-033
title: Community has regional rooms and global conversations
status: accepted
date: 2026-09-20
scope:
  - "fsi-app/src/app/api/community/"
  - "fsi-app/src/app/community/"
  - "docs/plans/complete-system-build-plan-2026-09-04.md (section 6.6)"
supersedes: []
related:
  - "docs/design/handoff-2026-09-07/README.md (artboard 12, Community)"
  - "docs/ops/session-log.md (2026-09-20 coordinator entry)"
---

# ADR-033: regional rooms and global conversations

## Context

Lane M9c (2026-09-18) stopped on audit finding 9: vertical groups are GLOBAL by design, no workspace-level region field exists (`profiles.region` is a per-user array; `organizations` carries no region), and plan 6.6 left the question to the operator: is a second, region-scoped room type wanted?

## Decision

Operator, 2026-09-20, verbatim: "we need regional rooms and global conversations."

Two room types. The existing global vertical rooms stay global: nothing is rebound or removed. A region-scoped room type is added beside them (artboard 12 draws the room tiles: Global, EU, US, UK, APAC, LATAM, MEAF).

## Open, and not blocking

What makes a member belong to a region (the per-user `profiles.region` array, or a new field on the organization) and which region list governs (artboard 12's seven, or the platform's jurisdictions). Asked of the operator on 2026-09-20; the operator then ranked the data-layer tools first ("I'm less worried with community page than making sure the tools for the data layer is done now"), so the rooms lane is parked, unbriefed, with no migration id assigned. A schema change is expected; the coordinator assigns the id when the lane is briefed.

## Consequences

Plan 6.6's line changes from "Decide whether" to decided. No machine lane and no part of proof run 6.2 depends on this.
