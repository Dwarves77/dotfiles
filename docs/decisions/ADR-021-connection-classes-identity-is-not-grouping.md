---
id: ADR-021
title: Connection classes — identity is not grouping; the dead same_instrument signal is removed
status: accepted
date: 2026-08-29
scope: fsi-app connection graph — discover.mjs signal set, item_cross_references relationship typing, the L4 near-floor question, and the connection layer's read paths
supersedes: the same_instrument signal (discover.mjs, weight 0.9) and the L4 flags connections-scorer/threshold-floor-0.30 and connections-scorer/same-instrument-dormant (both resolved with in-place corrections)
related: ADR-018 (directionality), ADR-019 (idf weighting), ADR-020 (vertical scope), migration 200 (canonical key + twin-defect guard), docs/plans/connection-redesign-and-build-scope-2026-08-29.md (the governing scope), WO-27/WO-28/WO-29
---

# ADR-021 — Connection classes: identity is not grouping

## Context

The connection layer scored five "shared provenance" signals, the strongest being `same_instrument`
(0.9) on equal `canonical_instrument_key`. A full read + live measurement (2026-08-29) proved that
signal DEAD BY CONSTRUCTION, not dormant: migration 200's partial unique index
`uq_intelligence_items_canonical_key_verified_live` (plus invariant EP-11) forbids two verified,
non-archived items sharing a key — and verified+non-archived is exactly the corpus both discovery
callers load. 0 of 1,863 live edges ever carried the signal. The column means instrument IDENTITY
(the PPWR twin-defect guard, which stays); the scorer treated it as GROUPING. One column cannot do
both jobs, and identity — a guard against a real customer-visible defect — wins.

The same read resolved the L4 near-floor question honestly: the 160 edges at exactly 0.3000 are not
noise from a "low-idf tag" (refuted — measured idf = 1.000, full weight) but correct
instrument-FAMILY clusters (member-state fuel-excise derogations, RED II scheme recognitions) that
carry one basis entry because family/lineage is unmodeled, not because they are weak.

## Decision

1. **Three connection classes, named:** AFFINITY (tag co-occurrence, the ADR-019 scorer —
   unchanged), FAMILY (siblings under one enabling instrument — today legitimately served by shared
   scenario tags at the floor), LINEAGE (child act → parent act — WO-28: typed
   `implements`/`amends`/`depends_on` edges from title-reference data already held, plus a
   coverage-gap feed for parent acts absent from the corpus).
2. **`same_instrument` is deleted from the scorer** (WO-27), with a comment naming the index that
   makes it impossible, and its impossible-input test deleted with it. Provably a no-op: the signal
   was on zero edges.
3. **Anti-scope, binding:** the 0.30 floor stays; ADR-019 idf stays; ADR-018
   both-directions-at-rest stays; migration 200's index and EP-11 stay. A stored family key is
   REJECTED for now (only 9 lineage pairs resolve in-corpus); revisit trigger: resolved lineage
   pairs > ~50 → ADR + comparative replay (the ADR-019 method), never a direct scorer edit.

## Consequences

- The strongest-signal comment lore ("same-instrument dominates") is corrected wherever it was
  restated (pair-view.mjs bands note, IntersectionDetectionView header).
- The dead `fetchXrefPairs` → `verification.ts` read chain (fetched on three hot pages, consumed by
  nothing) is deleted in the same WO — the F25 allowlist already held it as awaiting a dead-code
  ruling; this ADR is that ruling's record.
- `mint-item.ts`'s dedup-linked edge wrote `relationship:'references'`, a value the live CHECK
  forbids, error-swallowed — every such edge write silently failed. Fix rides WO-28 with a
  CHECK-legal value and a guard test.
