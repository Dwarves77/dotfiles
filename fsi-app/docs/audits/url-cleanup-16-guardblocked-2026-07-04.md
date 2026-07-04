# URL-cleanup residual — 16 guard-blocked rows (audit record, 2026-07-04)

Operator ruling 2026-07-04, item 1: the `#43` provenance-binding guard STANDS. No cred unbind, no bypass
path for the 16 non-customer-visible rows. This is the recorded honest state.

## The 16 (all `unverified`, all outside the customer-visible + paid sets)

The URL-normalization 1c cleanup de-polluted 186 quarantined + 41 verified `content_md` rows. The residual
is **16 items, all `provenance_status = unverified`**, whose `content_md` updates were REFUSED by the `#43`
provenance-binding guard (the reconciler credential is not bound to these pre-existing items — the guard
working as designed; unverified items sit outside the reconciled set).

Item keys: b8b6fde3, 478ee79c, us-epa-clean-ports-program-port-emissions-standards, imo-2023-revised-ghg-strategy,
661a3f9e (guidance), 8c47cbb2, d3e36935 (guidance), f249c2bc, c41f4c7d, e227e2c4, 09bdd3a0, ab92d0c4,
8767e010 (framework), e17717c9, 33ca228c, 4c26f34b.

## Ruling 1b — overlap with the 66-item paid set + self-clean

- **Overlap with the 66-item paid set (quarantined non-HOLD): 0.** All 16 are `unverified`; the paid set is
  `quarantined`. An item has one status, so no item is in both. The paid pass never touches these 16.
- **Does slot-forcing rewrite `content_md` or only tag?** Ground-only slot-forcing = **TAG-ONLY**: it writes
  `section_claim_provenance` claims (fact/GAP with slot_key); it does NOT rewrite `content_md`. Only a
  **generation** pass (full re-synthesis → `sectionBrief`, which re-inserts `content_md` through the 1a
  `stripUrlMarkers` write-site fix) rewrites and self-cleans `content_md`.
- **Consequence:** even inside the paid set, a GROUND-ONLY-routed item whose `content_md` were polluted would
  stay polluted through the pass (tag-only). But the paid set's `content_md` was already cleaned in the 1c
  quarantined pass, so there is no in-paid-set pollution to self-clean. The 16 unverified are the only
  remaining polluted rows and are outside the pass entirely.

## Post-pass residual

**16 polluted `content_md` rows, all `unverified` (NOT customer-visible — the provenance gate renders only
`verified`).** No broken customer links. Corpus-polluted = 16, not 0, and the guard is the reason. Revisit
with a guard-sanctioned path ONLY if this becomes material (e.g. one of the 16 is later promoted toward
`verified`); until then this is the recorded honest state per the ruling.
