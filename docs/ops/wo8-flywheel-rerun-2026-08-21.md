# WO-8 — Flywheel replay + write rerun (2026-08-21)

## Phase 3 — offline replay `[CONFIRMED]` ($0, SELECT-only inputs)

Snapshots taken before any write:

| Snapshot | Rows | File | md5 |
|---|---|---|---|
| Corpus (verified non-archived items) | 806 | `corpus.json` | `503303d61f85209a0a26b54fdbd1f041` |
| Edges | 1,826 = 1,765 provenance_discovery + 51 manual + 10 entity_extraction | `edges-prior.json` | `f1bb433d53cacd44bdf3f1a4cb798fdb` |
| Themes | 4 | `themes-prior.json` | `901a5e99e64b0f8a1a562a15b427c69e` |

Pipeline run with the repo's own modules (`discover.mjs` with ADR-019 weighting, `cluster.mjs`), never
reimplemented. `REF_FREQ=9`, 94 distinct tags.

### Variant comparison

| Variant | Edges / write-set | Themes | Largest theme | % of 726 | Hub check |
|---|---|---|---|---|---|
| flat | 5,767 edges | 36 | 140 | 19.3% | FAIL (generic OECD ITF pivot) |
| linear-log (**ADOPTED**) | 4,064 write-set | 39 | 77 | 10.6% | PASS |
| power(-2/3) | 3,831 edges | 38 | 96 | 13.2% | pass, inferior to linear-log |

Power variant computed through the shipped implementation via an exact frequency transform (verified
to 1e-12 at 13 probe frequencies) — no second scoring implementation existed.

## Phase 4 — write `[CONFIRMED]` ($0 session-executor MCP, multi-agent)

Multi-agent: Fable coordinator + 6 Sonnet executor shards + closeout agent, one writer per system.

- 81 upsert batches / 4,025 rows (39 byte-identical no-ops skipped from transport).
- 593 stale `provenance_discovery` rows deleted.
- `connection_themes` replaced 4 -> 39.
- `connection_theme_runs` row `7afa4960-ff0d-4cbd-8c7f-9ab760eae447` closed `ok`
  (`gaps_flagged=0` = gap reflection deliberately deferred, named residual).

### Deviation D1 `[CONFIRMED]`

Shard 3's first transmission of batch 29 dropped 3 of 50 payload rows (`written:47`); the count gate
stopped it. Coordinator re-applied the batch verbatim from disk (`written:50`). Batches 30-80 and theme
inserts then ran with server-side payload-md5 self-verification, all matched.

**Durable lesson:** agent-transmitted statements must return a server-computed checksum of what the
server received.

## Verification table `[CONFIRMED]`

| Check | Result |
|---|---|
| provenance_discovery count | 4,064 |
| manual count | 51 |
| entity_extraction count | 10 |
| themes count | 39 |
| Live pd digest | `7609ed99a0f51a2d5214959e352724be` (sorted source\|target\|score(3dp), 4,064 rows) — matches predicted, byte-level |
| Largest theme | 77 = 10.6% of 726 |
| Top-3 theme sizes | 77 / 53 / 48 |

Targets: largest theme <25% — PASS. >=10 themes — PASS. Zero generic hubs — PASS (all 39 pivots are
specific instruments).

## Undo path

Restore `provenance_discovery` rows from `edges-prior.json` and `connection_themes` from
`themes-prior.json` (md5s above). The snapshots are the rollback.
