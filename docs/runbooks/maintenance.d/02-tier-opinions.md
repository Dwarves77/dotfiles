## 2. `tier-opinions`

**RUNNABLE as of Lane ATTACH-SOURCES (2026-09-05), W3.3.** Previously (Lane MAINT, 2026-09-02) this
step reported a "NOT RUNNABLE" finding: the only upstream that fed `source_tier_opinions` was the LLM
brief-generation agent's own "New Sources Identified" table (`registerCitedSources` in
`fsi-app/src/lib/sources/source-growth.ts`, stamped `opinion_source: "haiku_brief_classifier"` via
`recordTierOpinion` in `fsi-app/src/lib/sources/tier-opinion-writer.ts`) - out of scope for a $0,
no-LLM MAINT runtime. **That finding still stands for that upstream** - it has not changed and this
step still never touches it. What changed: a genuinely deterministic, $0, no-LLM SECOND upstream
already existed elsewhere in this repo with no writer wired to it - the SC-13 class table
(`classTierForHost` in `fsi-app/src/lib/sources/host-authority.ts`) that `heal-provenance.mjs`'s STEP
SOURCE and `institution-canonicalize.mjs`'s Part C already use.

**Purpose**: `fsi-app/scripts/maintenance/tier-opinions.mjs` scans every `sources` row, resolves
`host = hostOf(url)`, then `classTier = classTierForHost(host)`. A host the class table does not
recognize (`classTier === null`) is skipped - SC-13's own no-guess posture, unchanged. A host it DOES
recognize, whose class tier disagrees with the row's current `base_tier`, is recorded as one
`source_tier_opinions` row (`opinion_source: "host_class_table"`, migration 309) via `recordTierOpinion`
- the SAME single writer function `source-growth.ts` already calls, extended with an optional
`opinionSource` parameter (default unchanged: `"haiku_brief_classifier"`). **This step never writes
`sources.base_tier` itself** - an opinion is a non-authoritative estimate (migration 091's own design);
raising a `base_tier` stays `institution-canonicalize.mjs` Part C's separate, ADR-002-gated path.

**Migration required before the first apply dispatch**: `fsi-app/supabase/migrations/
309_source_tier_opinions_host_class_table.sql` extends the `opinion_source` CHECK constraint (091) to
allow `'host_class_table'`. Apply it before dispatching `tier-opinions --mode apply` - every insert
otherwise fails the CHECK and `recordTierOpinion`'s own catch-and-swallow contract (never throws) means
the run reports `applied: 0`, every `read_back.results[].ok === false`, `exitCode: 1`, rather than an
exception - read the artifact's `read_back.results[].error` to confirm the CHECK-violation message if
this happens.

**Ruling**: none - a class-table disagreement opinion is never a `base_tier` write, so it carries no
ADR-002 gate; no `--arg` token is required.

**Idempotency**: NOT idempotent in the "zero new rows on a re-dispatch" sense (unlike
`attach-found-sources`) - by design. Migration 091's Q3 aggregator
(`get_tier_opinion_disagreements(window_days)`) counts REPEAT opinions across a 90-day window; the SAME
disagreement this step still finds on a later dispatch is real, additional evidence the mismatch
persists, never a duplicate to suppress. `source_tier_opinions` is append-only - no dedup-before-insert
guards this step's writes (see `docs/inventories/shared-dataset-ownership.md`'s `source_tier_opinions`
section for the full reasoning). No standing schedule exists (operator ruling: no crons) - dispatch
cadence is whatever the operator/coordinator chooses by hand.

**Dispatch**: no `arg`. `mode=dry` returns `counts.plan` (`[{source_id, url, host, current_tier,
class_tier}]`) with zero writes. `mode=apply` writes one opinion per plan row and returns
`read_back.opinions_written` / `opinions_attempted` / `results` (`{source_id, host, class_tier, ok,
error}` per attempted row).

**Artifact / read back**: confirm against
`SELECT opinion_source, count(*) FROM source_tier_opinions GROUP BY 1` (expect `host_class_table` rows
to appear after the first apply) and `SELECT * FROM get_tier_opinion_disagreements(90)` (migration 091)
for anything now crossing the 5-opinions-in-90-days admin-review threshold.

---

