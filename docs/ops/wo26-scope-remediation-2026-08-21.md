# WO-26 — Scope remediation run record (2026-08-21)

Executes ADR-020 (sustainability-first vertical scope) and Correction C11 against the live 910-item
corpus, then re-runs the flywheel (ADR-019 weighting) over the survivors. $0, session-executor,
multi-agent Sonnet shards + Fable coordinator. Full item-by-item disposition is in the companion
`../archive/wo26/wo26-disposition-table.md` (item lists in `../archive/wo26/disposition-lists.md`);
this doc is the execution record.

## Method

1. Rule-015 snapshot of every to-be-archived row's current state, taken *before* any write — the undo
   artifact for the whole batch.
2. Archive via checksummed batched UPDATEs (`is_archived=true`), Sonnet executor shards, count+md5
   gates per batch.
3. Flywheel re-run over the surviving sustainability corpus: edges re-discovered under ADR-019
   inverse-frequency weighting, themes re-clustered, digest-verified DB write.
4. Verification: live digest compared byte-for-byte against the offline replay's predicted digest.

Classification method itself: rules + per-item judgment, two clean false-positive sweeps (zero
sustainability-worded titles stranded in OUT; tag-less IN items read as legitimate on individual
review). The method was validated against the pre-August corpus (the platform's original, undrifted
scope), which split 251 IN / 3 OUT by the same rules — confirming the classifier isn't the thing that
drifted; the August backfill's intake path was.

## Disposition summary (910 live items)

| Bucket | Count | Disposition |
|---|---|---|
| IN — sustainability scope (base) | 357 | stays live |
| IN — attention items ruled IN (2022/89 port-reception waste; vehicle-tax reduced-rate pair) | 3 | stays live |
| OPS_CONTEXT — freight-operations context, kept by operator class ruling | 13 | stays live |
| **Live total** | **373** | |
| OUT — customs/transport-admin law (base) | 526 | archived, reversible |
| OUT — attention items ruled OUT (Shift2Rail, European Year of Rail, expert-group decision, UN/ECE Reg 100 + 110, cargo-shipping trade-defence decision, rail TSI derogation) | 7 | archived, reversible |
| JUNK — irrelevant feed captures | 4 | archived, reversible |
| **Archive total** | **537** | |

10 items required individual attention beyond the rule set; 3 of those (Implementing Reg 2022/89,
Decision 167/2006, Implementing Decision 2023/2697) had truncated or ambiguous titles and were verified
against their parent instrument before ruling — 2022/89 resolved to port-reception waste rules (IN);
167/2006 resolved to a cargo-shipping trade-defence decision (OUT); 2023/2697 resolved to a rail TSI
derogation (OUT). The full 10-item table with per-item leans is in
`../archive/wo26/wo26-disposition-table.md`.

Nothing above is a delete. Every archived row is a single reversible `is_archived` flip; the
pre-archive snapshot (`archive-prior-snapshot.json`, **md5 `3bbf6132`**) is the undo artifact for the
whole 537-item batch.

## Flywheel re-run (post-archive corpus)

| Metric | Before | After |
|---|---|---|
| Engine corpus (verified) | 806 | **276** (209 tagged) |
| REF_FREQ | 9 | **10** |
| `provenance_discovery` edges | 4,064 | **1,954** (1,746 transported, 208 no-op, 2,249 stale deleted — includes the D2 replay row) |
| Themes | 39 | **9** |

All 9 surviving themes are sustainability/ops, with the generic-hub problem ADR-019 targeted gone
entirely from this smaller, cleaner base: maritime decarbonisation 68, climate-risk disclosure 57, US
regional operations 33, SAF aviation 22, ISCC 6, road charging 5, combined transport 4, ship-source
pollution 2, border fuel duty 2.

## Verification

- Live `pd` digest: **`4af6b8aa`, byte-level MATCH** against the offline replay's predicted digest
  (dedup-by-id applied after a boundary-reuse slip in the replay harness — noted, not hidden).
- `pd` = 1,954, `manual` = 51, `entity_extraction` = 10, `connection_themes` = 9 — foreign-origin edge
  counts (manual, entity_extraction) untouched by the archive or the re-run.
- Ledger row `d7741530` closed `ok`.

## Deviations

**D2 (diagnosed, corrected in-run).** One stale WO-8-era upsert was REPLAYED into the DB by the
transport layer after its own delete had already run — proved by its old idf score (`0.54618`), which
only the pre-ADR-019 flat-weight scheme could have produced. The digest gate caught the mismatch; a
targeted delete removed the replayed row; the post-fix digest matched clean. Durable lesson: at-least-once
transport delivery means a batch's row *count* can be correct while its *content* silently regresses to
a stale prior state — end-state digests are mandatory, per-batch counts are not sufficient on their own.

**D3 (caught pre-execution).** The first delete-batch generation referenced a nonexistent `.id` field on
the edge rows, which would have produced `'None'` literals in the delete predicate — a defect that would
have deleted nothing or deleted wrong rows, silently. The executor agent's STOP discipline caught this
before any delete executed; the batch was regenerated keyed on `(source, target)` pairs instead, and ran
clean.

## Undo path

- Archive batch: `archive-prior-snapshot.json`, md5 `3bbf6132` — one UPDATE (`is_archived=false`) per
  row reverses any individual archive decision; the snapshot is the full-batch undo record.
- Flywheel write: ledger row `d7741530`, live digest `4af6b8aa` — the verified end state this run
  produced, checkable against any future digest to detect drift.

## Residuals

- **Stale `coverage_gap` integrity flags from the old (39-theme, 806-item) theme world** are not
  cleaned up by this run. They reflect a corpus and theme set that no longer exist in that shape;
  reflection against the new 9-theme world is deferred to the next `analyze-corpus` pass, not
  back-filled here.
- **Sources registry untouched.** This run reclassified and archived `intelligence_items` and rebuilt
  the connection graph over the survivors; it made no write to the sources registry.
- **WO-8's (ADR-019) targets are re-based by this corpus change, not re-ratified.** The largest theme is
  now maritime decarbonisation at 68 members — **32.5% of the 209 tagged items** — against ADR-019's
  original `<25%` target, which was measured on the 726-tagged corpus. 9 themes clear ADR-019's `≥10
  themes` floor only barely below it (9, not 10), and both figures are a mechanical consequence of the
  corpus shrinking under archival, not a re-run of ADR-019's own comparative measurement on the new
  base. Re-ratifying (or re-tuning) the targets against the sustainability-only corpus is owed as its
  own operator-ruled item — this run does not do it, per ADR-020's consequences section.
