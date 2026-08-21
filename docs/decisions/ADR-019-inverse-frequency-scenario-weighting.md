---
id: ADR-019
title: Inverse-frequency scenario weighting for shared operational_scenario_tags
status: accepted
date: 2026-08-21
scope: fsi-app connection graph — discover.mjs scenario-tag contribution scoring, scripts/connections/backfill-edges.mjs, src/lib/intake/mint-item.ts (F25 module-liveness), provenance_discovery edges, theme clustering
supersedes: none
related: discover.mjs (computeTagFrequencies, new pure exported function), scripts/connections/backfill-edges.mjs (production caller), src/lib/intake/mint-item.ts (production caller, mint-time discovery)
---

# ADR-019 — Inverse-frequency scenario weighting (operator-ruled in session)

## Context

`discover.mjs` scored every shared `operational_scenario_tags` entry a flat 0.3 per tag, regardless
of how common the tag was across the corpus. Ubiquitous tags dominated: `emissions-reporting-Scope3`
alone was carried by 162 of 726 tagged items (22%). A tag that common contributes the same flat 0.3
to every pair that shares it, manufacturing a giant generic hub theme instead of a discovery signal.

At decision time the connection graph held 1,765 `provenance_discovery` edges, but they clustered into
only 4 themes, the largest carrying 93 members pivoted on generic framework documents rather than specific
instruments. The flat-weight scheme could not distinguish "these two items share a rare, specific
scenario" from "these two items both mention Scope 3 reporting, like most of the corpus."

## Decision

Per shared scenario tag, contribution is now `0.3 * idf(tag)` instead of a flat `0.3`, where:

```
idf(tag) = clamp(1 - 0.25 * log2(freq(tag) / REF_FREQ), 0.25, 1.0)
```

- `freq(tag)` = count of verified, non-archived corpus items carrying the tag, computed by a new pure
  exported function `computeTagFrequencies(corpus)` in `discover.mjs`, run over the corpus the caller
  already loads. No new query, no new data source.
- `REF_FREQ` = the median frequency among tags occurring `>= 2` times (even count: mean of the two
  middle values). Live values at decision time: `REF_FREQ = 9`, computed over 94 distinct tags.
- The curve is linear in log-frequency and hits two anchors exactly: a tag at the median frequency
  gets `idf = 1.0` (full weight); a tag at 8x the median gets the floor, `idf = 0.25`.

**Cap semantics changed alongside the weight.** `PER_TAG_CAP` (3) now keeps the 3 HIGHEST-weighted
shared tags per pair — sorted by weight descending, tag name ascending as a tiebreak — instead of the
first 3 encountered in overlap order. Under flat weighting, order-of-encounter and weight-order were
equivalent; under idf weighting they are not, so the cap had to become weight-aware to keep selecting
the most-informative shared tags.

**Backward compatibility is exact by construction.** When no `freqMap` is passed to the scoring path,
every idf factor defaults to `1.0`, reproducing byte-identical pre-ADR-019 scores — proven by test, not
just argued.

All other weights, the 0.3 base threshold, and the 12-edge-per-item limit are unchanged. The scoring
change is wired into both production callers: `scripts/connections/backfill-edges.mjs` and
`src/lib/intake/mint-item.ts` (satisfying F25 module-liveness — the function has real callers, not just
authored code).

## Formula correction (recorded honestly)

The originally planned form was:

```
idf(tag) = clamp(1 / (1 + log2(freq(tag) / REF_FREQ)), 0.25, 1.0)
```

This was verified against live data before any code was written for it, and the verification found a
real defect: the denominator `1 + log2(freq/REF_FREQ)` hits zero at `freq = REF_FREQ / 2` — a division-
by-zero pole — and the expression's sign inverts below that point. That inversion clamps tags RARER
than half the median to the 0.25 floor, the opposite of the form's own stated intent ("rarer-than-
median clamps at 1.0"). 23 of 79 frequency-eligible tags (29%) sat in the broken sub-half-median range,
and they were disproportionately WO-7's newly minted specialized tags — exactly the rare, specific
signal this ADR exists to reward, not suppress.

The adopted linear-in-log form hits the same two anchor points the original plan named — median maps
to 1.0, 8x median maps to 0.25 — with no pole and no sign inversion anywhere in the domain. The
operator authorized the correction in-session, 2026-08-21.

## Alternatives considered

Three variants were measured, not just argued, via an offline replay of the full discovery/clustering
pipeline (the repo's own `discover.mjs`/`cluster.mjs`) over an 806-item corpus snapshot:

1. **Flat weights (status quo).** 5,767 edges, 36 themes, largest theme 140 members (19.3% of the
   726-item enriched corpus). Hub check: **FAIL** — top pivot was the generic "OECD ITF Decarbonising
   Transport Initiative" document.
2. **Linear-log idf (ADOPTED).** 4,064-edge write-set, 39 themes, largest theme 77 members (10.6%).
   Hub check: **PASS** — every pivot item in the resulting themes was a specific instrument, not a
   generic framework.
3. **Power curve**, `idf = clamp((freq/REF_FREQ)^(-2/3), 0.25, 1.0)`, same two anchors, a steeper
   mid-band falloff, run through the shipped implementation via an exact frequency transform: 3,831
   edges, 38 themes, largest theme 96 members (13.2%). Passes the same targets but is worse than the
   adopted linear-log curve on both largest-theme share and theme count.

Three further alternatives were rejected on inspection, without a measured replay:

- **Raise the global 0.3 threshold.** Rejected — punishes all signals uniformly, not just the
  ubiquitous tags actually causing the hub problem.
- **Delete ubiquitous tags from the vocabulary.** Rejected — destroys real data; the ubiquity is a
  weighting problem, not a data-quality problem.
- **Document-level tf-idf over free text.** Rejected — would require a new pipeline; the scenario tags
  already encode the signal this would try to recover from text.

## Targets and outcome

Approved targets: largest theme under 25% of the 726-item enriched corpus, at least 10 themes, zero
generic-framework hubs. The adopted linear-log curve passes all three; the power-curve alternative also
passes the three targets but loses to linear-log on largest-theme share and theme count; flat weighting
fails the hub check outright.

**Live DB post-write, 2026-08-21:**

- `provenance_discovery` edges: 4,064 (was 1,765 — 2,892 added, 593 stale removed, 1,172 rescored).
- Themes: 39 (was 4); largest theme 77 members.
- Foreign-origin edges untouched: manual 51, entity_extraction 10.
- The live digest matches the replay's predicted digest byte-for-byte: md5
  `7609ed99a0f51a2d5214959e352724be` over sorted `source|target|score(3dp)` lines, 4,064 rows.

## Consequences

- idf factors are re-derived from the live corpus on every run (per-run recomputation) — there is no
  stored weights table to keep in sync.
- Scores in the stored basis now carry idf-scaled weights rather than flat contributions.
- A rarely-tagged corpus region automatically gains connective power as WO-7-style backfills densify
  its tags — no re-tune required when tag frequency shifts.
- The back-compat path (no `freqMap` passed) is preserved and tested: it reproduces pre-ADR-019 scores
  byte-for-byte.
- Tests extended with 5 ADR-019 groups: back-compat byte-identity, rarity monotonicity, clamp bounds at
  both ends, cap-keeps-highest (weight-desc, tag-name-asc tiebreak), and the `REF_FREQ` median rule
  including the even-count case.
- Full suite: 1,408/1,408 green. `tsc` clean. Fitness: 21/0.
