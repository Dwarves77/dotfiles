## Change

Lane NO-TYPED-INPUT, 2026-10-03 (ADR-043): two `producers` governing files changed.
`scripts/producers/regional/run-envelope-producer.mjs` no longer authors derivation edges after its write (the
region-grain `authorAutomateVsHireForRegions` hook and its counts were removed with the retired method); the
guarded write of `regional_data_facts` rows is unchanged. `scripts/producers/market/author-market-series-delta.mjs`
had comment-only edits (a reference to the removed helper was reworded); no logic changed.

## Planned run

No run is owed. The write path of every producer is unchanged, and the removed hook had no live effect on the
facts themselves. Delete this file whenever the next real `producers` run lands.
