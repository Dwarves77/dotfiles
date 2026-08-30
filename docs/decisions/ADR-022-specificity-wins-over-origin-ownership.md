---
id: ADR-022
title: Specificity wins — origin ownership protects the specific edge, it does not protect the generic one
status: accepted
date: 2026-08-30
scope: fsi-app connection graph — the origin-ownership rule in write-edges.mjs, the lineage upgrade path in lineage-backfill.mjs, and every future writer of item_cross_references
supersedes: nothing; this NAMES a rule that was already implied by write-edges.mjs's own header and was being applied backwards in one code path
related: ADR-018 (both-directions-at-rest, canonicalize at reader), ADR-021 (connection classes — identity is not grouping), migration 004 (the relationship CHECK), migration 252 (basis + score + provenance_discovery origin), WO-28 phase D
---

# ADR-022 — Specificity wins over origin ownership

## Context

`item_cross_references` is unique on `(source_item_id, target_item_id)`: ONE row per ordered pair,
shared across all four origins (`provenance_discovery`, `entity_extraction`, `agent_semantic`, and
manual). Because four writers share one row, `write-edges.mjs` carries an **origin-ownership** rule:
a writer upserts only pairs that are ABSENT or ALREADY ITS OWN, and skips pairs another origin
created. That rule exists for a stated reason, in the file's own header:

> an entity_extraction 'references' edge and an agent_semantic edge each carry a more specific
> relationship than a discovery 'related' edge, and a blind upsert (the original backfill's bug)
> would overwrite them.

So the rule's PURPOSE is to stop a **generic** edge from destroying a **specific** one. Origin is the
proxy it uses; specificity is the thing it protects.

WO-28 phase D exposed the proxy failing in the direction it was never meant to block. The $0 lineage
backfill classifies real relationships out of section text — `amends`, `implements`, `depends_on`,
`derogates_under` — which are strictly more specific than `related`. Six pairs it had typed were
already occupied by `provenance_discovery` rows carrying the generic `relationship: 'related'`.
Applied literally, origin ownership skipped all six: the **generic incumbent blocked the specific
newcomer**, which is the exact inversion of the rule's own justification. A rule that protects
specificity was being used to protect whichever writer happened to arrive first.

## Decision

**Specificity wins. Origin ownership is subordinate to it, not the other way round.**

1. **The ordering is on relationships, not on writers.** `related` is the generic floor. The typed
   lineage relationships (`implements`, `amends`, `depends_on`, `derogates_under`) and any other
   CHECK-legal value that names an actual semantic tie are more specific than `related`. A writer
   that can prove a more specific relationship may claim a pair that currently holds a less specific
   one, whatever origin owns it.

2. **The claim is ADDITIVE, never destructive.** When a specific writer upgrades a generic incumbent
   it MUST: keep the existing `origin`, keep the existing `score`, keep the existing `basis` entries
   and APPEND its own, and change ONLY `relationship`. Nothing that was true before the upgrade stops
   being recorded after it. The row gains information; it never loses any. This is what makes the
   rule safe to state in general terms — an upgrade cannot destroy evidence, so it cannot be the
   blind-upsert bug wearing a new name.

3. **Downgrades are still forbidden, and that is the whole of the original rule that survives.** A
   generic writer may never overwrite a specific relationship. `related` never replaces `amends`.
   This is the case origin ownership was actually written to catch, and it remains absolute.

4. **Equal specificity keeps origin ownership unchanged.** Two writers with equally specific
   relationships fall back to the existing rule: absent-or-already-ours, skip foreign, count the
   skips. Specificity breaks ties in one direction only; it does not license writers to fight.

5. **Skips stay counted and reported.** Whatever is skipped — foreign and equally specific, or
   foreign and MORE specific than what the current writer holds — is counted and surfaced by the
   caller, never silently dropped. A rule that hides its own refusals is how the original defect
   stayed invisible for as long as it did.

## Consequences

- The six blocked pairs upgraded cleanly, and WO-28 phase D produced **11 typed edges** (5 `amends`,
  5 `implements`, 1 `depends_on`) where the graph had 0. The card renders labels it already knew how
  to draw.
- `lineage-backfill.mjs`'s pure `partitionLineageWrites` is the reference implementation of this ADR:
  it returns `inserts` / `upgrades` / `skippedForeign` / `unchanged` as four separate outcomes, and
  its `upgrades` patch touches `relationship` and appends `basis`, nothing else.
- Any future writer of `item_cross_references` inherits this rule and must implement all five clauses,
  in particular clause 2 — an "upgrade" that replaces basis rather than appending to it is a
  violation of this ADR even though it moves in the permitted direction.
- **Recorded and NOT resolved here:** the relationship vocabulary has no explicit stored ordering.
  Today the generic/specific split is `related` versus everything else, which is enough for every
  case that exists and is honest about being a two-tier rule rather than a full lattice. If a third
  tier ever becomes real — one typed relationship strictly subsuming another — that ordering needs
  its own home next to the CHECK in migration 004, defined once, not inferred at each call site. It
  is deliberately not invented in advance.

## Alternatives rejected

- **Leave origin ownership literal and let lineage skip the six pairs.** Rejected: it preserves a
  rule's letter while defeating its stated purpose, and it silently caps the lineage feed at whatever
  discovery has not already touched — a ceiling nobody chose and nobody could see.
- **Let the lineage writer take the whole row (origin, score, basis).** Rejected: that IS the blind
  upsert the original header warns about. The discovery basis and score are true and independently
  earned; an upgrade has no business erasing them.
- **Give lineage its own table or its own row per relationship type.** Rejected: it breaks the
  one-row-per-ordered-pair invariant that every reader (and ADR-018's collapse-at-read) depends on,
  and it would put two answers to "how are these two items related" in two places — the
  detect_intersections shape this program has already retired once.
