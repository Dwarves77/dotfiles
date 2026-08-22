# U6 — Theme briefs + L4 run record (2026-08-21)

Flywheel unit U6: generate a grounded narrative brief for every live connection theme, store it
server-side with a staleness contract, and re-run the L4 signal analysis over the post-purge graph.
$0, session-executor, Sonnet draft shards + Fable coordinator review. Runs against the post-WO-26
9-theme world (see `wo26-scope-remediation-2026-08-21.md`), not the retired 39-theme one.

## Storage and staleness contract (migration 266, applied live)

`theme_briefs`: `theme_id` PK → `connection_themes.id`, `member_hash`, `member_count`, `title`,
`brief_md`, `generated_at`, `generated_by` (default `'session-executor'`). RLS enabled, no policies
(service-role only). The staleness contract: `member_hash` = md5 of the theme's sorted `member_ids`
joined with no separator, computed at generation time. The admin themes route recomputes the live
hash per theme; mismatch renders a STALE badge instead of silently serving a brief about a membership
that no longer exists. Orphaned briefs (theme deleted) are hidden by the join. The hash rule lives in
exactly one home — `src/lib/connections/brief-staleness.mjs` (`computeMemberHash`/`isBriefStale`) —
imported by the route, unit-tested, per F25.

## Method — pilot-first, then shards

1. Two pilot briefs were drafted first and operator-approved as the template (structure: what binds
   the theme / the structure inside it / coverage shape stated honestly / grounding statement).
2. The remaining briefs were drafted by two Sonnet agents from per-theme input files
   (`member_hash`, members with titles/tags, pivots, edge-basis sample — data the graph actually
   holds), split by size; the coordinator wrote the largest (maritime decarbonisation, 68 members)
   and reviewed every agent draft against its input file before any write.
3. Every brief asserts only graph-held connections; each closes with its membership snapshot hash so
   the text itself records what it was written against.

Final set: 9 briefs, member counts 68/57/33/22/6/5/4/2/2, `brief_md` 970–5,156 chars.

## Write discipline — transcription-invariant, checksummed

Each brief was written by a single-statement UPSERT whose payload is a JSON literal, with the
statement returning both the row count and `md5(payload)` computed **by Postgres over what it
actually received**, checked against the locally computed md5 of the on-disk payload. Two rules made
this deterministic:

- **Transcription-invariant SQL**: payloads generated with `ensure_ascii=False`, so files carry
  literal UTF-8 glyphs (·, —), never `\uXXXX` escapes. An escaped and an unescaped payload are
  different bytes with different md5s even when Postgres would store the same string — the checksum
  must be computed over one canonical byte form.
- **Per-brief statements, not batches**: a 22KB multi-brief batch exceeded agent transcription
  fidelity twice (two different corruptions, both caught by the md5 self-check before landing).
  Batches were regenerated one brief per statement; every statement then matched exactly.

The md5 gate caught three defects in total during this run — the two agent transcription corruptions
and one coordinator-side escape-vs-glyph mismatch — and zero bad bytes reached the table.

Final verification (live join against `connection_themes`): 9 rows, every row `hash_fresh=true`,
`generated_by='session-executor'`, `md_len` 970–5,156.

## L4 re-run (post-purge graph: 1,954 `provenance_discovery` edges, 276-item corpus)

Pure local analysis, scripts unchanged from the pre-purge pass except input paths; no DB writes, no
LLM calls, no spend. All 5 pre-purge candidates re-measured:

| # | Candidate | Post-purge verdict |
|---|---|---|
| 1 | 0.30-floor threshold note | **SURVIVES — proposed.** 178 edges (9.1%) score in [0.30, 0.31), down from 14.5%; same mechanism (single low-idf shared_scenario tag at exactly 0.3·idf), smaller share |
| 2 | dangerous-goods 4-tag vocabulary merge | **DISSOLVED.** Road/rail/inland-waterway variants: 0 items, 0 edges in the live corpus; max pairwise recurrence now 2 item-pairs (was 89–144) — the purge retired the evidence |
| 3 | customs-declaration export/import vocabulary merge | **DISSOLVED.** Tags still exist (4 and 16 items) but co-occurrence collapsed 117 → 1 distinct item-pair |
| 4 | `shared_compliance_object` re-weight | **insufficient_evidence.** Cross-type gap narrowed 25.3 → 10.2pts on a 10x-smaller carrying sample (126 vs 1,342 edges) |
| 5 | `same_instrument` dormant-signal note | **SURVIVES unchanged.** 0 of 1,954 edges; 118/276 items carry a key, none shared |

No candidate weakens the grounding guarantee (every edge still requires ≥1 basis entry) and none adds
spend. All 5 verdicts are queued in `integrity_flags` (source `l4-analysis-u6`) for operator
ratification — nothing is applied to the scorer without a ruling.

## Gates and undo

- Code gates in the landing worktree: suite 1416/1416, `tsc` clean, fitness 21/0.
- Brief writes are UPSERTs keyed on `theme_id`: re-running any statement is idempotent, and a brief
  is replaced wholesale, never patched — the undo for a bad brief is regenerate-and-rewrite, with
  the staleness contract guarding reads in the meantime.
- Run artifacts (per-theme inputs, per-brief SQL with expected md5s, L4 scripts and JSON outputs)
  retained in the session workspace and reproducible from the live tables plus this record.
