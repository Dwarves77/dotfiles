# Shared-dataset write-ownership register

This is the write-ownership register for datasets shared across the two systems the operator has ruled
own all site data going forward — the ingestion **HARNESS** (`scripts/mint/**`, `scripts/forward-events/**`,
`scripts/harness-runs/**` conventions) and the corpus **FLYWHEEL** (`src/lib/connections/**`,
`scripts/connections/**`) — plus every era script from the `scripts/_archive/**` sunset pass
(`.discipline/shared-writer-registry.test.mjs`, `scripts/_archive/README.md`) that a KEEP verdict left
writing one of these tables.

Built entirely from reading code (`grep`/`Read`, no assumptions) as of 2026-09-01, on top of the sunset
lane's evidence-gated archive pass. Every claim below cites the file(s) it was read from. Anything not
directly confirmed in code is marked **TO-VERIFY**.

This document and `.discipline/shared-writer-registry.test.mjs` share one source of truth: the fenced
`json` block below (`SHARED_WRITER_ALLOWLIST`) is parsed verbatim by that test. Edit the block to change
who may write a shared table; the test enforces it on every future PR.

## How to read this

- **Partitions** — the dimension (if any) that splits a table into independently-owned slices (an
  `origin` column, a `created_by` namespace, a dedupe key) so two writers can coexist without stepping on
  each other's rows.
- **Authorized writer(s)** — the verified file(s) that perform the write, one row per writer, cited to the
  line(s) read.
- **Replace policy** — append-only, guarded upsert, guarded per-row update, full-table replace-with-snapshot,
  or delete (and under what gate).
- **Pre-registered (parallel lane)** — writers the operator has stated will land on a sibling branch and
  must be allowlisted now so the merged tree stays green. Marked explicitly; not yet present in this
  worktree at time of audit.

---

## Machine-readable allowlist (source of truth for the test)

```json
{
  "version": 1,
  "generated": "2026-09-01",
  "sharedTables": {
    "intelligence_items": [
      "src/lib/intake/mint-item.ts",
      "src/lib/intake/apply-staged-update.ts",
      "src/lib/agent/canonical-pipeline.ts",
      "src/workflows/generate-brief.ts",
      "scripts/lib/db.mjs",
      "scripts/_wave-alpha/backfill-canonical-keys.mjs",
      "scripts/_reground/free-pass-run.mjs",
      "scripts/_reground/id-stamp.mjs",
      "scripts/_reground/tombstone-delete.mjs",
      "scripts/remediation/acquire-primaries-batch.mjs",
      "src/app/api/admin/canonical-sources/bulk-approve/route.ts",
      "src/app/api/admin/canonical-sources/decide/route.ts",
      "src/app/api/admin/integrity-flags/[id]/resolve/route.ts",
      "src/app/api/admin/triage/pending-jurisdiction-review/route.ts",
      "scripts/mint/run-mint-batch.mjs",
      "scripts/connections/apply-tags.mjs",
      "scripts/mint/stamp-wo26-archive-reason.mjs",
      "scripts/mint/apply-mint-batch.mjs"
      "scripts/entities/backfill-entities.mjs"
    ],
    "item_cross_references": [
      "src/lib/intake/mint-item.ts",
      "src/lib/entities/link-items.ts",
      "src/lib/agent/canonical-pipeline.ts",
      "src/lib/connections/write-edges.mjs",
      "scripts/connections/backfill-edges.mjs",
      "scripts/entities/backfill-lineage-edges.mjs",
      "scripts/connections/discover-for-items.mjs"
    ],
    "connection_themes": [
      "scripts/connections/analyze-corpus.mjs"
    ],
    "connection_theme_runs": [
      "scripts/connections/analyze-corpus.mjs"
    ],
    "integrity_flags": [
      "src/lib/intake/mint-item.ts",
      "src/lib/intake/flywheel-defect.ts",
      "src/lib/entities/link-items.ts",
      "src/lib/agent/canonical-pipeline.ts",
      "src/workflows/generate-brief.ts",
      "src/lib/d3/hooks.mjs",
      "src/lib/notifications/seed-fallback-flag.ts",
      "src/lib/sources/seek-more.mjs",
      "src/lib/sources/verify-item.mjs",
      "scripts/audit-skill-conformance.mjs",
      "scripts/entities/backfill-lineage-edges.mjs",
      "scripts/remediation/acquire-primaries-batch.mjs",
      "scripts/remediation/refetch-capped-worklist.mjs",
      "scripts/verify/run-data-audit-lane.mjs",
      "scripts/verify/surface-visibility-audit.mjs",
      "src/app/api/admin/integrity-flags/route.ts",
      "src/app/api/admin/sources/bulk-import/route.ts",
      "scripts/connections/analyze-corpus.mjs",
      "scripts/connections/ratify-flag-to-census.mjs",
      "supabase/functions/capture-worker/index.ts",
      "scripts/connections/propose-tags.mjs"
    ],
    "census_worklist": [
      "src/lib/intake/census-writer.mjs",
      "scripts/connections/ratify-flag-to-census.mjs",
      "scripts/mint/apply-mint-batch.mjs"
    ],
    "item_forward_events": [
      "scripts/forward-events/run-extraction.mjs",
      "scripts/turns/apply-extraction-output.mjs",
      "src/lib/intake/mint-item.ts",
      "src/lib/intake/apply-staged-update.ts"
    ],
    "theme_briefs": [
      "src/lib/research/theme-brief.mjs",
      "scripts/connections/generate-theme-brief.mjs"
    ],
    "section_claim_provenance": [
      "src/lib/agent/ledger-apply.mjs",
      "src/lib/agent/canonical-pipeline.ts",
      "src/workflows/generate-brief.ts",
      "scripts/_reground/free-pass-run.mjs",
      "scripts/_reground/restore-overclear.mjs",
      "scripts/mint/apply-mint-batch.mjs"
    ],
    "corpus_turn_requests": [
      "src/app/api/admin/corpus-turn-requests/route.ts",
      "scripts/turns/consume-turn-requests.mjs"
    ],
    "monitoring_queue": [
      "src/app/api/worker/check-sources/route.ts",
      "src/lib/sources/reconcile.ts"
    ],
    "intelligence_changes": [
      "src/lib/sources/reconcile.ts"
    ],
    "staged_updates": [
      "src/app/api/community/posts/[id]/promote/route.ts",
      "src/app/api/admin/scan/route.ts",
      "src/lib/intake/run-intake-cycle.ts",
      "src/lib/sources/change-sweep.mjs"
    ]
  }
}
```

Note (added by lane EV, 2026-09-01): `corpus_turn_requests` (migration 277) is a NEW shared dataset — a
10th, alongside `section_claim_provenance` above. Its actual FIRST writer is the migration's own
`enqueue_corpus_turn_request()` trigger function (SQL, `supabase/migrations/277_corpus_turn_requests.sql`)
— not listed in the JSON block above because it is SQL, not a `scripts/`/`src/` file the scanner test
walks (`SCAN_EXTS` is `.mjs/.js/.ts/.tsx/.cjs`), so it cannot appear there by construction, exactly the
same reason no other table's DB-level trigger (e.g. `set_provenance_status`, migration 115/209) appears
in this JSON block either — the scanner's scope is application-code writers, and a trigger is schema, not
application code. The two entries actually listed are the ones the scanner CAN and does see:
`src/app/api/admin/corpus-turn-requests/route.ts` (the admin route's manual/backfill INSERT) and
`scripts/turns/consume-turn-requests.mjs` (the consumer's `guardedUpdate` stamping `consumed_at`/
`consumed_by`). See the dataset's own detail section below for the full writer/reader picture including
the trigger.

Note (resolved at merge, 2026-09-01): the writers this register originally pre-registered from the
parallel lane (`discover-for-items.mjs`, `generate-theme-brief.mjs`, `ratify-flag-to-census.mjs`,
`run-mint-batch.mjs`, `run-extraction.mjs`) are now present in this tree. `src/lib/connections/write-edges.mjs`
landed snapshot-guarded (prior-state JSONL capture before any edge REFRESH, R1 operator ruling); same
file, same entry, no second entry needed. `scripts/forward-events/load-forward-events.mjs` (a name from
PROTOCOL.md) was never created and is not allowlisted; `run-extraction.mjs` plus the intake writers are
the writers of record (see the `item_forward_events` section below).

---

## Dataset-by-dataset detail

### `intelligence_items`

No single partition column; ownership is by **operation type** (create / staged-update-apply /
narrow-touch-for-recompute / tombstone-delete), not a data column.

| Writer | Operation | Evidence |
|---|---|---|
| `src/lib/intake/mint-item.ts` | INSERT at mint time | `.from("intelligence_items")` insert, line 163 (seed) / 237 (final row) |
| `src/lib/intake/apply-staged-update.ts` | UPDATE — admin-approved `update_item` / `status_change` / `archive_item` actions | lines 102, 113, 146 (`.update(...)`) |
| `scripts/_reground/free-pass-run.mjs` (KEEP) | UPDATE — touches `updated_at` only, to fire the `set_provenance_status` trigger's recompute after a claim re-attribution | line 107, `guardedUpdate("intelligence_items", ..., { updated_at: ... })` |
| `scripts/_reground/id-stamp.mjs` (KEEP) | UPDATE — stamps `instrument_identifier` on a verified promotion | line 64, `guardedUpdate("intelligence_items", ..., { instrument_identifier: PROPOSED_ID })` |
| `scripts/_reground/tombstone-delete.mjs` (KEEP) | DELETE — the **one** sanctioned disposition-delete vehicle; writes `disposition_ledger` FIRST, fail-closed (`guardedDelete` only reached after the tombstone commits) | line 106, `guardedDelete("intelligence_items", [it.id], ...)`; invariant enforced at `.discipline/governance/invariants.mjs:812` |
| `scripts/mint/run-mint-batch.mjs` | **Pre-registered (parallel lane)** — expected mint-batch runner | not yet present |
| `scripts/connections/apply-tags.mjs` | UPDATE — merges an operator-ratified `derive-tags.mjs` tag proposal onto `operational_scenario_tags`/`compliance_object_tags`/`topic_tags` (never removes an existing tag, never overwrites a non-empty array — only appends absent tags, capped at `derive-tags.mjs`'s `FIELD_CAPS`) via `guardedUpdate`, only for a flag resolved with `resolution_note` containing `ratify:tags` (lane TAG, 2026-09-01 — closes the August-census-wave empty-tag gap so `discover.mjs` can score edges for these items) | `guardedUpdate("intelligence_items", (qb) => qb.eq("id", id), patch, ...)` in `deps.updateItem` |
| `scripts/mint/stamp-wo26-archive-reason.mjs` (Lane POP, 2026-09-01) | UPDATE — `archive_reason` only, on the 491 WO-26 rows Addendum 28 archived without stamping one | `guardedUpdate("intelligence_items", applyMatch, { archive_reason: ... }, { cite, select })`, `--dry` by default |
| `scripts/mint/apply-mint-batch.mjs` (Lane POP, 2026-09-02) | INSERT at coordinator-apply time — the population-turn's write path for a `--census-rows --grade record` mint batch, `mintIntelligenceItem()`'s `MintPlan` has no field for a payload's sections/claims/search_results so this script writes directly in `canonical-pipeline.ts`'s own table order instead | `buildIntelligenceItemRow` + `ctx.db.guardedInsert("intelligence_items", ...)`, `--dry` by default |
| `scripts/entities/backfill-entities.mjs` (Lane DP-SPINE, 2026-09-02) | UPDATE — `instrument_entity_id` only, per row whose `canonical_instrument_key` resolves to an instrument entity (migration 283's progressive-re-keying FK; ADR-024) | `guardedUpdate("intelligence_items", (qb) => qb.eq("id", u.id), { instrument_entity_id: ... }, { cite, select })` in `runInstrument()`; `--dry` by default. This script's OTHER writes (`entities`, `entity_identifiers`, `entity_refs` inserts via `guardedInsertMany`, and a parallel `sources.organisation_entity_id` update) are on tables `docs/inventories/shared-dataset-ownership.md`'s registry does not track — `entities`/`entity_identifiers`/`entity_refs` are new migration-282/283 tables outside the harness/flywheel dataset set this doc scopes to, and `sources` is explicitly named out-of-scope by `.discipline/shared-writer-registry.test.mjs`'s own header ("a write to an unrelated, non-shared table (e.g. agent_runs, **sources**, holdings_quality) is out of this registry's scope by design"). Named here for completeness, not because the registry requires it. |

Replace policy: guarded per-row UPDATE/INSERT (never a bulk replace); DELETE is single-purpose and
gated behind a tombstone write (see `tombstone-delete.mjs` above) — this is a **guarded delete**, not a
snapshot-replace.

### `item_cross_references`

**Partitioned by `origin`** (unique on `(source_item_id, target_item_id)` — one row per ordered pair,
shared across all origins; a writer must never clobber another origin's row). Documented explicitly in
`src/lib/connections/write-edges.mjs:10-19`.

| Origin | Writer(s) | Evidence |
|---|---|---|
| `entity_extraction` | `src/lib/intake/mint-item.ts` (dedup:linked edge at mint) | lines 252-260, `.upsert(..., relationship: "related", origin: "entity_extraction")` |
| `entity_extraction` | `src/lib/entities/link-items.ts` (entity linker) | header: "writes ONLY item_cross_references + integrity_flags"; line 55 `.upsert(...)` |
| `agent_semantic` | `src/lib/agent/canonical-pipeline.ts` | line 921, `.upsert(edges, ...)` with `origin: "agent_semantic"` (line 920) |
| `provenance_discovery` | `src/lib/connections/write-edges.mjs` (`writeDiscoveredEdges` — the **single write home** for this origin, by its own header) | lines 46-69 |
| `provenance_discovery` (caller) | `scripts/connections/backfill-edges.mjs` — cold-start/repair orchestrator, delegates the actual write to `write-edges.mjs` | header comment: "the delegated writer touches ONLY item_cross_references" |
| `provenance_discovery` (caller) | `src/lib/intake/mint-item.ts` — U4 incremental discovery at mint time, reuses `discover.mjs` + `write-edges.mjs`, bounded to 12 edges/mint | lines 267-282 |
| — | `scripts/connections/discover-for-items.mjs` | **Pre-registered (parallel lane)** — not yet present |

Replace policy: **origin-owned upsert**, never a delete; `write-edges.mjs` reads existing rows once per
call and skips any pair owned by a foreign origin (lines 60-66) — this is the mechanism that makes
multiple writers safe on one table.

### `connection_themes`

No partition — single writer, **full-table replace-with-snapshot** every run.

| Writer | Evidence |
|---|---|
| `scripts/connections/analyze-corpus.mjs` | lines 108-115: reads every existing theme id, `guardedDelete`s all of them, then `guardedInsertMany`s the freshly clustered set. Comment at line 13: "every run REPLACES its full contents (guardedDelete-all + guardedInsertMany), never appends." |

### `connection_theme_runs`

Append-only run log — one row opened `'running'` at the start of an `analyze-corpus.mjs` pass, closed to
`'ok'` or `'error'` at the end.

| Writer | Evidence |
|---|---|
| `scripts/connections/analyze-corpus.mjs` | `guardedInsert` (line 91) opens the run; `guardedUpdate` (lines 157, 182) closes it |

### `integrity_flags`

**Partitioned by `created_by` namespace.** Each producer is scoped to dedup/resolve only its own
namespace — explicit in `analyze-corpus.mjs`'s `GAP_NAMESPACE` comment (line 46) and mirrored by every
other producer below.

| `created_by` | Producer | Resolver | Evidence |
|---|---|---|---|
| `intake-seek-study` | `src/lib/intake/mint-item.ts` (research_finding minted on a news/press source) | **OPEN — no automated resolver found.** Only the generic manual admin endpoint `src/app/api/admin/integrity-flags/[id]/resolve/route.ts` resolves it (human-in-the-loop). | mint-item.ts lines 318-327 |
| `intake-relevance` | `src/lib/intake/mint-item.ts` (low freight-sustainability relevance at intake, fail-open by design) | **OPEN — same as above**; comment names an intended "disposition FLAG RESOLVER (Unit 2)" that does not exist as a script anywhere in the repo at time of audit. | mint-item.ts lines 336-350 |
| `flywheel-defect:discovery` / `:forward-events` / `:stale-events` | `src/lib/intake/flywheel-defect.ts` (`recordFlywheelDefect`, rule 16(d) — moved 2026-09-01 from a private export in mint-item.ts so mint-item.ts and apply-staged-update.ts share ONE writer shape) | **OPEN — no automated resolver found**, same posture as `intake-seek-study`/`intake-relevance` above; resolved today only via the generic manual admin endpoint. | flywheel-defect.ts; called from mint-item.ts (mint time) and apply-staged-update.ts (`update_item`, substantive updates only) |
| `flywheel-gap:jurisdiction_span_gap` / `:surface_gap` / `:pivot_operations_gap` | `scripts/connections/analyze-corpus.mjs` | **Self-resolving** — the same script closes any of its own open flags whose gap no longer reproduces on the latest pass (lines 143-152, `guardedUpdate(..., status: "resolved", resolved_by: "analyze-corpus.mjs")`). Not an open leak. | analyze-corpus.mjs lines 118-152 |
| (entity-link candidate/lineage-gap namespace, exact value set by `entity-resolve.mjs`) | `src/lib/entities/link-items.ts` | **TO-VERIFY** — idempotent one-open-flag-per-namespace-per-item guard exists (lines 59-64), but no resolver was located for this namespace in the time available. | link-items.ts lines 58-64 |
| (ratified-to-census namespace) | `scripts/connections/ratify-flag-to-census.mjs` | **Pre-registered (parallel lane)** — its own name implies it is itself a *resolver* for some existing flag category, converting a flag into a `census_worklist` entry. **TO-VERIFY at merge** which `created_by` namespace(s) it consumes, and whether it closes the two OPEN leaks above. | not yet present |
| `capture-worker` (fixed literal, `created_by: "capture-worker"`) | `supabase/functions/capture-worker/index.ts` (Edge Function — the ADR-016 storage-ceiling truncation guard, filed only after a capture lands) | **OPEN — no automated resolver found**, same posture as `intake-seek-study`/`intake-relevance` above; resolved today only via the generic manual admin endpoint. Found 2026-09-01 when the writer-registry test's scan roots were widened to include `supabase/functions/**` (this table was previously invisible to the registry on the Edge Function side). | index.ts lines 554-567, `category: "coverage_gap"` |
| `flywheel-tag:empty-signature` | `scripts/connections/propose-tags.mjs` (lane TAG, 2026-09-01 — reflects a `derive-tags.mjs` tag-proposal finding, one row per item whose `operational_scenario_tags`/`compliance_object_tags`/`topic_tags` are all empty, so `discover.mjs` can never score it an edge) | **Self-resolving, same convention as `flywheel-gap:*`** — a full `--untagged` run closes any of its own open flags whose item no longer reproduces (now tagged, or fell out of the corpus); a narrow `--ids`/`--since` run resolves ONLY flags inside its own selection (see `planReflect`'s `scopeSubjectRefs`, a deliberate narrowing of the `analyze-corpus.mjs` convention this file's own header names). Also consumed downstream: `scripts/connections/apply-tags.mjs` READS (never writes) this namespace's rows once an operator resolves one with `resolution_note` containing `ratify:tags`, applying the row's `PROPOSALS_JSON` to `intelligence_items` — see that table's writer entry above. | propose-tags.mjs (`planReflect`, `buildFlagRow`); apply-tags.mjs (`evaluateApplication`) |

Replace policy: append (`guardedInsertMany`/`.insert`) + namespace-scoped `guardedUpdate` to
`status='resolved'`. A producer must never touch another namespace's open rows — enforced by convention
(the `created_by`-scoped read-before-write pattern above), not by a DB constraint; **TO-VERIFY** whether
any DB-level guard backs this beyond the RLS note in migration 203's sibling comment.

### `census_worklist`

Upsert on unique `(source_id, document_url)`, with an **identity-preservation** rule: `(lane, created_by)`
is immutable after first insert (migration 221 trigger) — a re-walk by a different lane/session over an
already-discovered URL must pass the *original* discoverer's identity through unchanged, or the trigger
raises. Documented and implemented in `src/lib/intake/census-writer.mjs:98-165`.

| Writer | Evidence |
|---|---|
| `src/lib/intake/census-writer.mjs` (`writeCensusRows`) | lines 136-165, upsert under a per-source `withLease` mutation lease |
| `scripts/connections/ratify-flag-to-census.mjs` | **Pre-registered (parallel lane)** — not yet present; **TO-VERIFY** how it satisfies the identity-preservation rule above (does it look up existing `(lane, created_by)` the way `writeCensusRows` does, or does it mint a fresh worklist identity for a ratified flag?) |
| `scripts/mint/apply-mint-batch.mjs` (Lane POP, 2026-09-02) | UPDATE — `enumeration_status = 'reconciled'` only, on the one row a successfully-minted payload traces back to via its `row_id` (a `not_applied_*` payload's row is left untouched — see `mint-run-006.json`'s own precedent) | `ctx.db.guardedUpdate("census_worklist", (qb) => qb.eq("id", rowId), { enumeration_status: "reconciled" }, ...)` |

### `item_forward_events`

Migration 274/275. Dedupe key (as fixed by 275, after 274's first key silently dropped 54% of the first
real run — see migration 275's header): `(intelligence_item_id, event_date, event_kind,
md5(obligation_text), coalesce(source_claim_id, source_section_id))`.

**Writers (resolved at merge, 2026-09-01; `apply-staged-update.ts` added 2026-09-01, lane FIX).** The
extractor (`src/lib/forward-events/extract-forward-events.mjs`, moved from `scripts/forward-events/` for
src-layer reuse) is confirmed **pure** — it computes event objects, no DB call. The read-back-and-extract
sequence itself (section_claim_provenance + intelligence_item_sections → extractForwardEvents) is also
factored to ONE place, `src/lib/forward-events/read-and-extract.mjs`, shared by both src/ writers below so
neither hand-copies the read. Three write paths exist:
1. `src/lib/intake/mint-item.ts` — writes extracted events at mint time (contract rule 16(b)); plain
   insert is safe there because the item is newly minted, and failures are recorded as
   `flywheel-defect:` integrity flags per rule 16(d).
2. `src/lib/intake/apply-staged-update.ts` (`update_item`, SUBSTANTIVE updates only) — re-extracts on every
   substantive `update_item` (contract rule 16, "on every mint or substantive update"); unlike mint-item.ts
   the target item may already carry rows, so this path writes idempotently against the 275 dedupe key at
   the application layer (PostgREST's upsert `onConflict` cannot target the 275 index, which is
   expression-based) rather than a plain insert, and never deletes — an existing row whose supporting
   claim/section is gone is flagged `flywheel-defect:stale-events` instead.
3. Batch/backfill runs: `scripts/forward-events/run-extraction.mjs` emits apply-ready rows and always
   records a harness run artifact; the coordinator applies the rows via the guarded path against the
   275 dedupe key. `load-forward-events.mjs` (named in PROTOCOL.md) was never created; the runner
   supersedes that name and PROTOCOL.md's reference is historical.
The recorded 901-event first run (`forward-events-run-001.json`) predates the runner and was applied by
the coordinator directly; all future loads go through path 1, 2, or 3.

| Writer | Evidence |
|---|---|
| `scripts/forward-events/run-extraction.mjs` | **Pre-registered (parallel lane, per task brief)** |
| `scripts/forward-events/load-forward-events.mjs` | **Pre-registered** — the name `scripts/harness-runs/forward-events/PROTOCOL.md` actually specifies for "the coordinator-run loader" |

Replace policy: append/upsert on the dedupe key above; migration 275's own header states the design intent
explicitly — never silently drop a genuinely-distinct obligation by collapsing on too coarse a key.

### `theme_briefs`

Migration 266. **Two writers found, one current and one pre-registered — supersession TO-VERIFY.**

| Writer | Status | Evidence |
|---|---|---|
| `src/lib/research/theme-brief.mjs` | **Current, live** — referenced from `src/app/api/admin/themes/route.ts`, `src/app/research/[slug]/page.tsx`, `src/components/research/ResearchFindingDetailSurface.tsx`, `src/lib/agent/canonical-pipeline.ts`, `src/lib/connections/brief-candidates.mjs`/`brief-staleness.mjs` | `grep -rln theme_briefs` across `src/` |
| `scripts/connections/generate-theme-brief.mjs` | **Pre-registered (parallel lane)** | not yet present |

**TO-VERIFY**: whether `generate-theme-brief.mjs` is meant to replace `src/lib/research/theme-brief.mjs`'s
write path outright (in which case this document should be updated post-merge to drop the superseded
entry) or the two are meant to coexist on a partition not yet visible from this worktree (e.g. one writes
research-triggered briefs, the other flywheel-clustered-theme briefs). Flagging rather than guessing.

### `section_claim_provenance` — a 9th shared dataset found by evidence, not on the operator's seed list

Not in the operator's named shared-dataset list, but it meets the operator's own stated criterion — "any
table you find that both an era script and harness/flywheel path write" — so it is registered here rather
than silently left out.

| Writer | Evidence |
|---|---|
| `src/lib/agent/ledger-apply.mjs` — the canonical claim-ledger write path (insert / update / delete + a parallel `claim_versions` append), reached through `canonical-pipeline.ts`'s `applyLedgerDiff` during every mint/ground pass | lines 120, 132, 140, 162, 164 |
| `scripts/_reground/free-pass-run.mjs` (KEEP) | UPDATE — re-attributes a FACT claim to a floor-qualifying capture, line 102 |
| `scripts/_reground/restore-overclear.mjs` (KEEP) | INSERT — restores a claim erroneously versioned out by the 2026-07-16 over-clear incident, line 41 |
| `scripts/mint/apply-mint-batch.mjs` (Lane POP, 2026-09-02) | INSERT — one row per `payload.claims[]` entry, in `canonical-pipeline.ts`'s own insert order (not through `ledger-apply.mjs`, which mediates a claim *diff* against an already-minted item's existing ledger; this is the coordinator-apply step for a fresh `--census-rows --grade record` mint batch, the same raw-guarded-write shape mint-run-005/006's own coordinator-apply pass used by hand) | `buildClaimRows` + `ctx.db.guardedInsertMany("section_claim_provenance", ...)` |

Replace policy: guarded insert/update/delete, with every change mirrored into the append-only
`claim_versions` ledger by `ledger-apply.mjs` (lines 132, 162) — `claim_versions` itself is in
`scripts/lib/db.mjs`'s `DELETE_PROTECTED_TABLES` (never hard-deletable), which is what makes every
`section_claim_provenance` mutation reversible.

### `corpus_turn_requests` — a 10th shared dataset, added by lane EV (2026-09-01), migration 277

The queue that closes the "what needs a flywheel turn" gap: every producer that changes
`intelligence_items.provenance_status` / `is_archived` / one of the three tag columns OUTSIDE the in-app
rule-16 chokepoints (`mint-item.ts`, `apply-staged-update.ts`) previously left no record that a turn
(connection discovery + forward-event extraction) was ever needed. One open row per item
(`consumed_at IS NULL`), enforced by a partial-unique index on `intelligence_item_id`.

| Writer | Kind | Evidence |
|---|---|---|
| `supabase/migrations/277_corpus_turn_requests.sql` (`enqueue_corpus_turn_request()` trigger function) | **DB trigger — the primary/mechanical writer.** `AFTER INSERT OR UPDATE OF (provenance_status, is_archived, operational_scenario_tags, compliance_object_tags, topic_tags) ON intelligence_items`; INSERTs `reason ∈ {inserted, verified, unarchived, updated, tags_applied}`. NOT in the JSON allowlist block above — it is SQL, outside the scanner's `scripts/`/`src/` scan scope, same reason `set_provenance_status` (migration 115/209) is absent from every other table's entry in this document. | migration 277's own `CREATE TRIGGER enqueue_corpus_turn_request_trg` |
| `src/app/api/admin/corpus-turn-requests/route.ts` | POST — operator-triggered `reason='manual'` INSERT, one item (`{itemId}`) or a live-corpus backfill (`{all:true}`, skipping items that already carry an open request) | `.from("corpus_turn_requests").insert(...)`, both the single-item and chunked-backfill call sites |
| `scripts/turns/consume-turn-requests.mjs` | `--mark-consumed --by <label>` — `guardedUpdate` stamps `consumed_at`/`consumed_by` on exactly the open rows the same run read | `guardedUpdate("corpus_turn_requests", ...)` |

Readers: `src/app/api/admin/corpus-turn-requests/route.ts` (GET — open requests + last-consumed
timestamp, for the admin `CorpusTurnPanel`), `scripts/turns/consume-turn-requests.mjs` (`readAll`, the
producer side of the hand-off to `discover-for-items.mjs --ids`), and — going forward — the corpus-turn
GitHub Actions workflow a sibling lane (RT) owns, which is expected to invoke
`consume-turn-requests.mjs` itself rather than read the table directly.

Replace policy: append-only from the trigger and the manual-request route (INSERT only, `manual` is the
only reason value the trigger itself never writes); `consumed_at`/`consumed_by` is the only ever-mutated
pair, written once per row by the consumer script (never by the trigger, never by the route). No DELETE
path exists anywhere in this wave (rows are retired by being marked consumed, not removed); `ON DELETE
CASCADE` from `intelligence_items` is the only way a row disappears (the item itself was deleted).
### `monitoring_queue`, `intelligence_changes`, `staged_updates` — three tables registered by lane CD (change-detection chain repair, 2026-09-01)

Not part of the original operator-named harness/flywheel seed list, but the chain these three tables form
(detection → queue → reconcile → intelligence_changes → analysis-review) gained real new writers this lane
— `staged_updates` in particular gains its first-ever `update_item` writer — so they are registered here
on the doc's own stated criterion (a table more than one live path writes) rather than left silently out.

**Runtime, added 2026-09-02 (lane CD, change-detection runtime):** `fsi-app/scripts/turns/
run-change-detection.mjs` is the new GitHub Actions-driven caller of `runReconcilePass` and
`drainChangeSweepUpdates` below (via jiti — see that script's own header) — it is NOT a new writer of any
table itself (every `.from(...)` call it makes is a plain `.select()`, verified by grep: zero
`.insert(`/`.update(`/`.upsert(`/`.delete(` in the file), so no new allowlist entry is added for it. It is
the first thing in the repo that runs the detect → reconcile → drain chain end to end outside of a live
HTTP request to `check-sources`/`reconcile`; the writers of record for `monitoring_queue`,
`intelligence_changes`, and `staged_updates` remain exactly the files listed in each table's section below.

#### `monitoring_queue`

No partition — one row per (source, check), written by two collaborators in the SAME chain, never in
conflict because each owns a disjoint column set.

| Writer | Operation | Evidence |
|---|---|---|
| `src/app/api/worker/check-sources/route.ts` | INSERT — one row per source checked, `change_detected` computed from `content-change.mjs`'s fingerprint compare (migration 161's `sources.last_content_hash`) | `assessAndUpdateSource`, `.from("monitoring_queue").insert({...})` |
| `src/lib/sources/reconcile.ts` | UPDATE — stamps `reconciled_at` on the SAME row once its change has been recorded, so re-runs are idempotent (migration 124) | `runReconcilePass`, `.from("monitoring_queue").update({ reconciled_at: ... })` |

Replace policy: append-only INSERT + one idempotency-stamp UPDATE per row (`reconciled_at`, migration
124's own claim query: `change_detected = true AND reconciled_at IS NULL`) — never a delete, never a
second UPDATE of an already-reconciled row.

#### `intelligence_changes`

No partition — append-only change log, one writer file with two entry points (a full field-diff and a
lightweight "source changed" trigger), both reached only from the reconcile pass.

| Writer | Evidence |
|---|---|
| `src/lib/sources/reconcile.ts` (`recordItemChange` — full field-diff; `recordSourceChangeTrigger` — lightweight trigger, no content diff needed) | Both called from `runReconcilePass`, itself called from `/api/worker/reconcile` (manual re-drive, worker-secret gated) and, as of this lane, in-process from `/api/worker/check-sources` after every scan batch |

Replace policy: append-only INSERT, never update or delete — an item's change history accumulates one row
per detected change.

RLS note (verified, not assumed — this lane's own migration 279): this table had **RLS DISABLED** with no
policy in any migration prior to 279 — worse than "no customer SELECT policy," it was the same
anon-writable-residue shape migration 230 fixed for 8 other tables. Migration 279 enables RLS with a public
SELECT policy mirroring migration 103 (customer reads of a live item's change history); no INSERT/UPDATE
policy is added since both current writers already write service-role (bypasses RLS by default).

#### `staged_updates`

No partition — ownership is by `update_type` (the migration-004 CHECK: `new_item`, `update_item`,
`status_change`, `new_source`, `source_conflict`, `archive_item`), each type owned by a disjoint writer set.
**Approve/reject is RETIRED** (`src/app/admin/page.tsx` / `AdminDashboard.tsx`'s own comment: "the
machine gates ARE the approval... the staged-updates surface is VISIBILITY-ONLY — there is no human
approve/reject") — every writer below either self-materializes (`run-intake-cycle.ts`) or stages a row for
VISIBILITY with no live consumer that applies it.

| Writer | `update_type` | Evidence |
|---|---|---|
| `src/lib/intake/run-intake-cycle.ts` | `new_item` (INSERT), then self-updates `status`/`materialized_at` (UPDATE x2) after machine-gated apply (no human step) | lines ~328 (insert), ~351/365 (update) |
| `src/lib/intake/run-intake-cycle.ts` (`drainChangeSweepUpdates`) | **NEW, lane INTAKE (2026-09-01)** — `update_item` (UPDATE only, `status`/`materialized_at`/`reviewer_notes`) — the consumer for change-sweep's bridge rows below. Selects pending rows whose `reason` carries `CHANGE_SWEEP_STAGED_MARKER` (`change-sweep.mjs`'s own exported marker — a hand-staged/other-origin `update_item` row is never selected), applies each through the SAME `applyStagedUpdate` chokepoint the row above uses, then calls `verifyItem` (the $0 snapshot-first entry, `src/lib/sources/verify-item.mjs`) EXPLICITLY, bounded by `UPDATE_DRAIN_LIMIT` | `drainChangeSweepUpdates`, called from `runIntakeCycle` every apply-mode invocation |
| `src/app/api/community/posts/[id]/promote/route.ts` | `new_item` (INSERT) — a promoted community post, staged for admin review | line 315; comment there ("the admin queue materializes it on approval") is **STALE** against the retirement above — no live materializer reads a pending `new_item` row from this path today |
| `src/app/api/admin/scan/route.ts` | `new_item` (INSERT) — an admin-triggered Sonnet scan's findings, staged for visibility-only review | line 418 |
| `src/lib/sources/change-sweep.mjs` (`bridgeChangedSourceToStagedUpdates`) | `update_item`, the type's first production writer (lane CD, 2026-09-01). `proposed_changes` is always `{}` (no autonomous rewrite of item content — an explicit operator constraint); the amendment-diff summary (or a fingerprint-changed fallback note when fewer than two `raw_fetches` captures exist to diff) rides in `reason`, prefixed with the exported `CHANGE_SWEEP_STAGED_MARKER` — the identifying marker `run-intake-cycle.ts`'s drain matches on | called from `src/lib/sources/reconcile.ts`'s `runReconcilePass`, once per changed source's live items |

**Resolved, lane INTAKE (2026-09-01)** (was the doc's own "Open finding" here, and open item 6 in "Open
leaks summary" below — both superseded by this note): change-sweep's bridge rows are no longer a dead end.
`run-intake-cycle.ts` now drains them every apply-mode invocation via `drainChangeSweepUpdates` — apply
through the same `applyStagedUpdate` chokepoint, then an EXPLICIT `verifyItem` re-verify call (never folded
into `apply-staged-update.ts` itself — that file's `NON_SUBSTANTIVE_UPDATE_FIELDS` boundary stays
content-shaped, per the file's own forbidden-to-edit status for this lane; see `run-intake-cycle.ts`'s
`drainChangeSweepUpdates` doc comment for the full reasoning). **Still genuinely open, narrower than
before**: a hand-staged or otherwise-originated `update_item` row — one without the change-sweep marker —
still has no live consumer; the drain is deliberately scoped to the change-detection chain, not a general
`update_item` auto-applier, so such a row still sits `status='pending'` indefinitely.

Replace policy: append-only INSERT per staged proposal (three of the writers above: `run-intake-cycle.ts`
for `new_item`, `.../promote/route.ts`, `.../scan/route.ts`, `change-sweep.mjs` for `update_item`);
`status`/`materialized_at`/`materialization_error`/`reviewer_notes` UPDATE is scoped to rows the SAME
apply-mode `runIntakeCycle` invocation is actively dispositioning — for `new_item` that is always a row it
just inserted in the same pass; for `update_item` it is a row a DIFFERENT writer (`change-sweep.mjs`)
staged earlier, selected only by the `pending` + change-sweep-marker filter — no writer ever updates a row
outside that filter, and a row processed once (status flipped off `pending`) is never re-selected.

---

## KEEP-verdict scripts that write a shared dataset (task-1 cross-reference)

Every KEEP script from the sunset pass that touches one of the tables above is already listed in its
table's section (with a `(KEEP)` marker and its own evidence line); this is the flat summary the task
asked for:

| Script | KEEP reason (from `scripts/_archive/README.md` / task-1 evidence gate) | Table(s) written |
|---|---|---|
| `scripts/_wave-alpha/backfill-canonical-keys.mjs` | Pinned in `.discipline/governance/skill-contract-map.mjs` `PINNED_MANIFEST` (exact-path citing file for `remediation-discipline` + `environmental-policy-and-innovation`); moving it reds `skill-drift-gate.test.mjs`. | `intelligence_items` (`guardedUpdate`, confirmed by the writer-registry scanner — corrected from an earlier manual-read miss) |
| `scripts/_reground/executor-ground.mjs` | "The ONE authorized new mint-path" — cited by `.discipline/governance/doctrine-register.mjs`, `invariants.mjs`, and `scripts/verify/cc-executor-submit.golden.mjs`; drives writes through `canonical-pipeline.ts`, not directly. | none directly (delegates to the live pipeline) |
| `scripts/_reground/free-pass-run.mjs` | Part of the still-cited `_reground` operational toolkit; referenced by live `scripts/remediation/acquire-primaries-batch.mjs`. | `intelligence_items`, `section_claim_provenance` |
| `scripts/_reground/id-stamp.mjs` | Same toolkit; active session-log workflow entries reference it directly by name. | `intelligence_items` |
| `scripts/_reground/lease.mjs` | Same toolkit; `id-stamp.mjs` and `tombstone-delete.mjs` require its lease to already be held. | none (lease-only, no shared-table write) |
| `scripts/_reground/restore-overclear.mjs` | `.discipline/governance/doctrine-register.mjs` cites it directly as the incident-remediation tool that restored 48 over-cleared claims. | `section_claim_provenance`, `claim_versions` (not shared-listed) |
| `scripts/_reground/target-match-probe.mjs` | `.discipline/governance/doctrine-register.mjs` + `invariants.mjs` cite it as the real-data proof for the live `target-match.golden.mjs` gate. | none (read-only probe) |
| `scripts/_reground/tombstone-delete.mjs` | `scripts/verify/disposition-content-gate.golden.mjs:21` hard-codes `resolve(ROOT, "scripts/_reground/tombstone-delete.mjs")` and reads its source; moving it breaks that golden test outright. | `intelligence_items` (delete), `disposition_ledger` (not shared-listed) |
| `scripts/run-4c-relabel.mjs` | Self-described "standing dispatch step 3"; paired applier `scripts/apply-4c-plan.mjs` remains live. | none directly (emits a plan only; `apply-4c-plan.mjs` writes `intelligence_item_sections`, not a shared-8 table) |
| `scripts/regen-quarantined.mjs` | `.discipline/governance/invariants.mjs:575` names it the resolver a live, enforced invariant ("Quarantine is an open investigation, never terminal") must drive to zero. | `intelligence_items` (indirectly, via the `validate_item_provenance` RPC under `--apply`; not a direct table literal) |
| `scripts/funded-pass.mjs` | Imports the live `scripts/lib/funded-pass-core.mjs`; described in present tense in `docs/design/monthly-budget-design.md`. | none of the shared-8 directly (`agent_runs`, `integrity_flags` read-only in the excerpt seen) |
| `scripts/canonical-pipeline-proof.mjs` | Generic diagnostic for the still-live `src/lib/agent/canonical-pipeline.ts`; no completed-evidence, references live pipeline code. | none directly (drives the live pipeline's own writes) |
| `scripts/holdings-audit.mjs` | No completed-evidence found for the 2026-07-14 dispatch it names (idempotent-once guard makes this ambiguous, not disprovable). **TO-VERIFY**: query `holdings_quality` row count to settle whether this has already run. | `holdings_quality` (not shared-listed — no harness/flywheel path writes it) |
| `scripts/lib/block1-reaudit.mjs` | Listed in `.discipline/fitness/functions/F25-module-liveness.mjs`'s immutable `LEGACY_ALLOWLIST`; moving it reds F25's "file no longer exists" check. | none of the shared-8 (writes `section_claim_provenance`, `agent_run_searches` per `docs/audits/connection-completeness-2026-06-03.md`) |
| `scripts/lib/funded-release-plan.mjs` | Same F25 allowlist mechanism. | TO-VERIFY (not read in depth; no direct evidence of a shared-8 write found) |
| `scripts/lib/inconclusive-probe.mjs` | Imported by `scripts/lib/inconclusive-report.mjs` and `inconclusive-probe.selftest.mjs`, the latter run via `.discipline/run-test-suite.sh`'s directory glob. | none (read-only probe library) |
| `scripts/lib/liveness-reconstruction.mjs` | Same F25 allowlist mechanism. | none (read-only reconstruction proof) |
| `scripts/lib/verify-reconstruction.mjs` | Same F25 allowlist mechanism. | writes `section_claim_provenance`, `agent_run_searches` per the same audit doc (already listed above) |
| `scripts/lib/exclusion-audit.mjs` | Imported by its own selftest, `exclusion-audit-reconstruction.mjs`, `bootstrap-test1.mjs`, and `scripts/lib/block1-reaudit.mjs`. | none (read-only registry cross-product) |
| `scripts/lib/decision-anchors.mjs` | Imported by `scripts/lib/decision-log-audit.mjs` and its own selftest, run via `.discipline/run-test-suite.sh`'s glob. | none (pure decision-anchor evaluator) |
| `scripts/lib/liveness.mjs` | Imported by `scripts/lib/liveness-reconstruction.mjs` (itself KEEP) and its own selftest — both would break if this moved. | none (pure heartbeat-verdict library) |
| `scripts/lib/urgency.mjs` | Same F25 allowlist mechanism; additionally cited by `code_location` in the assumption-register fixture `scripts/gen/fixtures/assumption-register/wo20-catalogued-assumptions-2026-08-30.json`. | none directly found (referenced by migration 271's comment, not a call site) |

**Superseded 2026-09-01 (lane hyg, F25 module-liveness archival — task 6; see `scripts/_archive/README.md`'s
own ledger section for the full evidence and `.discipline/fitness/functions/F25-module-liveness.mjs` for
the current allowlist).** The "moving it reds F25" premise in the `block1-reaudit.mjs` /
`funded-release-plan.mjs` / `liveness-reconstruction.mjs` / `verify-reconstruction.mjs` /
`scripts/lib/urgency.mjs` rows above was true only while those files remained tracked at their original
path AND named in F25's `LEGACY_ALLOWLIST` — F25's check is "does the allowlisted path still exist",
not "must this file never move." All five were confirmed to have zero non-test importers (F25's own
`buildImportGraph`, re-verified after each move) and are now `git mv`'d to `scripts/_archive/lib/`, with
their `LEGACY_ALLOWLIST` entries removed rather than updated to a new path — the shared-writer-registry
scanner already excludes `_archive/` by directory name, so this table's writer claims for those five are
now moot (archived code runs nothing, and this doc's own guidance is "if it doesn't run, it doesn't
write"). The `inconclusive-probe.mjs` / `exclusion-audit.mjs` / `decision-anchors.mjs` / `liveness.mjs`
rows are **not** superseded the same way: these four modules are still in place (not archived — three
have their `*.selftest.mjs` hard-named in `.github/workflows/discipline.yml`'s npm-deps step, which this
lane's write set forbids editing; the fourth, `liveness.mjs`, was left alongside them for symmetry), but
their stated importer (`inconclusive-report.mjs`, `exclusion-audit-reconstruction.mjs`/
`block1-reaudit.mjs`/`bootstrap-test1.mjs`, `decision-log-audit.mjs`, `liveness-reconstruction.mjs`
respectively) is now archived, so each is import-orphaned as of this pass and now carries its own
reason-bearing `LEGACY_ALLOWLIST` entry in F25 instead — see that file for the current, accurate state.

---

## Additional current writers found by running the scanner against this tree

The prose sections above were written from a manual code read; `.discipline/shared-writer-registry.test.mjs`
was then run against the real tree, and its heuristic scan surfaced real writers the manual read missed
(plus two confirmed false positives it also caught, fixed in the scanner itself — see the file's comment
on `.golden.mjs` exclusion and the `scripts/lib/db.mjs` docstring-vs-real-call distinction). All are
verified genuine (spot-read, not just trusted from the regex) and are in the JSON allowlist above; this
section is the missing prose for them, grouped by table, so the doc stays honest about how it was checked
rather than presenting the allowlist as more manually-audited than it is.

- **`intelligence_items`** — `scripts/lib/db.mjs` (the shared guarded-write library itself: `archiveRows("intelligence_items", ...)` inside `reclassifyToSource`, line 395); `src/lib/agent/canonical-pipeline.ts` and `src/workflows/generate-brief.ts` (the live mint/ground pipeline and its workflow entry point); `scripts/remediation/acquire-primaries-batch.mjs` (live remediation batch tool, operator dispatch 2026-07-16, not evaluated by this lane's task-1 seed list — **TO-VERIFY** in a future sunset pass); `src/app/api/admin/canonical-sources/{bulk-approve,decide}/route.ts` and `src/app/api/admin/integrity-flags/[id]/resolve/route.ts` and `src/app/api/admin/triage/pending-jurisdiction-review/route.ts` (live admin UI/API routes — human-approved writes).
- **`item_cross_references`** — `scripts/entities/backfill-lineage-edges.mjs` (WO-28 Phase D lineage-edge backfill; its own header notes it feeds a capability "never connected to a producer that runs unmetered" — **TO-VERIFY**, out of this lane's task-1 seed list, flagged for a future sunset evaluation, not archived here).
- **`integrity_flags`** — `src/lib/agent/canonical-pipeline.ts`, `src/workflows/generate-brief.ts` (live pipeline); `src/lib/d3/hooks.mjs` (the D3 investigation framework's "route a finding to the durable queue" hook) — its former real-infrastructure reconstruction proof, `src/lib/d3/hooks-reconstruction.mjs`, was ARCHIVED 2026-09-01 (lane hyg, F25 module-liveness sunset: zero production importer; `git mv`'d to `src/_archive/lib/d3/hooks-reconstruction.mjs`, content untouched, see `scripts/_archive/README.md`) and removed from the allowlist above accordingly — it no longer runs, so it no longer writes anything; `src/lib/notifications/seed-fallback-flag.ts`; `src/lib/sources/verify-item.mjs` (the RD-24 "ONE verify-item entry" `regen-quarantined.mjs` calls); `src/lib/sources/seek-more.mjs` (a real write site, though **note**: `.discipline/fitness/functions/F25-module-liveness.mjs`'s own header names this exact module as "fully built, unit-tested, ZERO live callers, dormant" — registered because the write call is real code in the tree, not because it is known to run); `scripts/audit-skill-conformance.mjs`, `scripts/entities/backfill-lineage-edges.mjs`, `scripts/remediation/{acquire-primaries-batch,refetch-capped-worklist}.mjs`, `scripts/verify/{run-data-audit-lane,surface-visibility-audit}.mjs` (live standing audit/remediation scripts, outside this lane's task-1 seed list); `src/app/api/admin/integrity-flags/route.ts`, `src/app/api/admin/sources/bulk-import/route.ts` (live admin routes).
- **`section_claim_provenance`** — `src/lib/agent/canonical-pipeline.ts`, `src/workflows/generate-brief.ts` (both call through to `ledger-apply.mjs`'s writes, and/or write directly at the workflow layer — **TO-VERIFY** the exact call shape if this is ever load-bearing to a future refactor).

None of these change any KEEP/ARCHIVE verdict from the sunset pass — they are all either already-covered
harness/flywheel/pipeline paths, or standing operational scripts outside the task-1 seed list that this
lane was not asked to evaluate. They are recorded here so the writer-registry test is accurate against the
real tree rather than only against the subset this document's author happened to read by hand first.

## Non-registry tables named for completeness

These tables are outside the harness/flywheel dataset set this document scopes to (see header above), so
they are not added to the enforced `SHARED_WRITER_ALLOWLIST` JSON block or to
`.discipline/shared-writer-registry.test.mjs`'s coverage — named here only so the write surface is
documented somewhere, following the same disposition already established for
`entities`/`entity_identifiers`/`entity_refs` at the `scripts/entities/backfill-entities.mjs` row above
(line 180) and for `pending_first_fetch`/`agent_runs`/`agent_run_searches` in the Open leaks summary's
item 6 below. Added by Lane DP-ENGINE, 2026-09-02.

- **`propagation_events`** (migration 284) — written by migration 284's `emit_propagation_event()` trigger
  (fires on `derived_values`/`statutory_computations`/`estimated_values` INSERT/UPDATE, the outbox
  producer) and by `fsi-app/src/lib/propagation/drain.ts`'s own `UPDATE ... SET drained_at = now()` after a
  drain pass processes a batch (marking events consumed; drain never deletes outbox rows).
- **`derived_values`** and **`derivation_edges`** (migration 285) — written together, atomically, by
  migration 285's `register_derived_value(...)` SQL RPC, called from
  `fsi-app/src/lib/propagation/register-derivation.ts`'s `registerDerivedValue()`. **UPDATE, Lane DP-SURF,
  2026-09-02: `drain.ts`'s recompute pass is no longer the only caller.**
  `fsi-app/scripts/propagation/seed-derived-values.mjs` (`--apply`) is a SECOND sanctioned caller — the
  initial-closure seed for the two methods this lane registers
  (`fsi-app/src/lib/propagation/methods/{carbon-intensity,automate-vs-hire}.ts`, method ids
  `carbon_intensity_tkm@1.0.0` / `automate_vs_hire@1.0.0`): a value has to exist once, from SOME caller,
  before `drain.ts`'s recompute pass (which only ever supersedes an EXISTING row) has anything to work
  from. Both callers go through the SAME `registerDerivedValue()` → `register_derived_value(...)` RPC, so
  the atomicity/acyclic-by-construction guarantees migration 285's own header states are identical either
  way — this is a second caller of the one write path, not a second write path.
- **`statutory_computations`** and **`estimated_values`** (migration 286) — **UPDATE, Lane DP-SURF,
  2026-09-02: `estimated_values` is no longer reserved/unpopulated.**
  `fsi-app/scripts/propagation/seed-derived-values.mjs` (`--apply`) is its first production writer — a
  direct `.from("estimated_values").upsert(...)` per region carrying both a `labor_markets` and an
  `operational_cost` regional_data_facts fact with a resolvable entity_id, paired with the SAME run's
  `automate_vs_hire` `derived_values` row (NPV, the propagated headline metric) so the two never drift out
  of sync (`fsi-app/src/lib/propagation/methods/automate-vs-hire.ts`'s own header explains the
  point/low/high-on-NPV-plus-`distribution`-jsonb split this upsert follows).
  **SECOND UPDATE, same lane, same day, coordinator follow-up task 2:** migration 286 was itself amended
  — `entity_id` is no longer either table's PRIMARY KEY (spec 08 §4's own literal DDL permitted at most
  one row per entity ever, which is what left this seed writing zero rows even once a region had both
  facts; see the migration's own header and the ADR-024 dated amendment for the full account). Each table
  now has its own surrogate PK (`computation_id`/`estimate_id`) plus a `scenario_key` column, and the
  upsert's conflict target moved to `onConflict: "entity_id,model_id,model_version,scenario_key"`
  accordingly. The "resolvable entity_id" a matched region needs is ALSO no longer merely READ-if-present:
  `seed-derived-values.mjs`'s `resolveRegionEntityId` now resolves a region's jurisdiction entity through
  `entity_refs` (`ref_table='regions'`, `role='jurisdiction'`) and MINTS one on demand when absent (reusing
  `scripts/entities/backfill-entities.mjs`'s own exported `planJurisdictionEntities`/`planJurisdictionRefs`
  through the guarded write path) — so this lane's write set now DOES include a narrow, on-demand slice of
  entity minting, where the original text above said it did not. This is a per-(entity, model, version,
  scenario) upsert, never an insert-only append — a re-run of the seed for the SAME region/scenario
  replaces that one row, which is the correct semantics for "the current estimate," not a history log
  (unlike `derived_values`, which is append-only/versioned via `supersedes`).
  `statutory_computations` remains genuinely reserved: no production writer lands in this lane (this
  lane's write set built `fsi-app/src/lib/statutory/fueleu-annex-iv.mjs`'s formula and `types.ts`'s
  Layer-2 type barrier, but no page/route that calls `computeStatutory()` against a real obligation and
  persists the result — see this lane's final report for why, and
  `fsi-app/.discipline/fitness/functions/F25-module-liveness.mjs`'s `StatutoryFigure.tsx` allowlist entry
  for the matching "published, no consumer yet" disposition on the render side).
- **`regional_data_facts`** (migration 106) — **NEW entry, Lane DP-SURF, 2026-09-02, coordinator follow-up
  task 3.** Three writers, all through the same shared envelope orchestrator
  (`fsi-app/scripts/producers/regional/run-envelope-producer.mjs` — `toCandidateRows` /
  `latestPerNaturalKey` / guarded upsert keyed on `(region_code, dimension, fact_label)`), each owning a
  disjoint `(region_code, dimension)` slice so none can collide:
  - `fsi-app/scripts/producers/regional/bls-oews-producer.mjs` — `region_code='US'`,
    `dimension='labor_markets'` (BLS OEWS is a US-only survey). **UPDATE, same lane, same day, THIRD
    coordinator follow-up ("BLS OEWS wage fact is hourly (H_MEAN), matching what automate-vs-hire
    reads"):** now writes TWO facts per occupation, not one — the pre-existing annual median wage
    (`unit:'USD/year'`, BLS datatype 13) AND a new hourly median wage (`unit:'USD/hour'`, BLS datatype
    08, confirmed this session — see `bls-oews-parser.mjs`'s header for the confirmation trail). Both
    stay, so the annual row still backs whatever already reads a `labor_markets` row without caring about
    its unit (the `/operations` matrix coverage view, region-grid fact counts); the wage input to
    `automate_vs_hire` (both `automate-vs-hire.ts`'s `findHourlyWageFact` and
    `seed-derived-values.mjs`'s own independent wage selection) now REQUIRES the hourly-unit fact and
    refuses with a named, counted reason (`skippedNoHourlyWage`) when only the annual one resolves — never
    divides the annual figure by 2080 to manufacture one. See `src/lib/operations/automate-vs-hire.mjs`'s
    `isHourlyWageUnit` for the shared predicate both callers use.
  - `fsi-app/scripts/producers/regional/eurostat-nrg-pc-205-producer.mjs` — `region_code='EU'`,
    `dimension='operational_cost'` (Eurostat electricity-price semester series, one query, one geo).
  - `fsi-app/scripts/producers/regional/eurostat-lc-lci-lev-producer.mjs` — `region_code='EU'`,
    `dimension='labor_markets'`, **added this commit**. Closes the BLS/Eurostat disjointness the coordinator
    named (US wages via BLS, EU energy via Eurostat, so no region had ever carried both a `labor_markets`
    AND an `operational_cost` fact — `automate_vs_hire`'s propagation method and this lane's own
    `seed-derived-values.mjs` automate-vs-hire path had zero regions to compute for by construction). Unlike
    its two siblings, `lc_lci_lev` publishes no EU-wide aggregate for this measure (confirmed by live fetch
    this session — see the producer's and parser's own file headers for the two independent negative
    findings), so this producer fetches each of the `EU` region's six constituent member states
    (`DE`/`NL`/`BE`/`FR`/`IT`/`ES`, migration 106's `regions.iso_codes` for code=`'EU'`) separately and
    writes ONE `labor_markets` fact for `'EU'` as a documented simple mean
    (`derivation:'calculated'`/`origin_class:'derived'`, not `'observed'`/`'official'` — this number is our
    own computation over six of Eurostat's published figures, not one Eurostat published itself;
    `n_observations` records how many countries actually contributed). Three gates, one more than its two
    siblings' two-gate baseline (source-level `ENABLED`, a dedicated runtime kill switch
    `REGIONAL_PRODUCER_EUROSTAT_LC_LCI_LEV_ENABLED` default-off, `--apply`) — see the producer's own header
    for why a computed aggregate gets the same three-gate posture as
    `scripts/producers/market/ecb-fx-producer.mjs`. `.github/workflows/producers.yml` is deliberately NOT
    edited by this lane (out of this lane's write set; the coordinator adds the CI step) — until that env
    var is set, `--apply` refuses everywhere including CI, fail-closed. NAMED, NOT FIXED: the symmetric US
    half of the disjointness (an EU-shaped energy/operational-cost fact for the `US` region) remains open —
    out of this task's scope. NAMED AND FIXED (same day, third coordinator follow-up): the
    `bls-oews-producer.mjs` annual/hourly wage-unit mismatch flagged when this task-3 entry was first
    written — see the `bls-oews-producer.mjs` bullet above for the fix.
- **`sensitive_field_policy`** and **`aggregate_query_log`** (migration 287) — `sensitive_field_policy` is
  operator-maintained reference data (no application writer in this lane, seeded by the migration itself);
  `aggregate_query_log` is written exclusively by migration 287's `publish_aggregate()` SECURITY DEFINER
  function, the sole sanctioned path to the small-cell-suppressed aggregate view (see migration 287's
  self-check and `docs/inventories/migrations.md`'s row 287 for the k-anonymity threshold and
  refusal-not-raise design).

Named here for completeness, not because the registry requires it — mirroring the disposition already
established at line 180 for the migration-282/283 entity tables.

## Open leaks summary

1. **`integrity_flags` / `created_by ∈ {intake-seek-study, intake-relevance}`** — producer
   `src/lib/intake/mint-item.ts`, **no automated resolver**. Only the generic manual admin-resolve API
   route closes these today. If `scripts/connections/ratify-flag-to-census.mjs` (pre-registered, parallel
   lane) is meant to close this gap, that should be confirmed and this document updated at merge.
2. **`integrity_flags` / entity-link candidate namespace** (producer `src/lib/entities/link-items.ts`) —
   resolver **TO-VERIFY**, not located in the time available.
3. **`item_forward_events`** — the loader that performed the recorded 901-event run
   (`scripts/harness-runs/forward-events/forward-events-run-001.json`) is not present in this worktree
   under either of the two candidate names (`load-forward-events.mjs` per PROTOCOL.md,
   `run-extraction.mjs` per this task's brief). Both names are pre-registered so neither breaks the
   writer-registry test; the actual file needs to land and this note needs to be resolved.
4. **`theme_briefs`** — two writers, no documented supersession decision found between the current
   `src/lib/research/theme-brief.mjs` and the pre-registered `scripts/connections/generate-theme-brief.mjs`.
5. **`scripts/holdings-audit.mjs` / `holdings_quality`** — not a shared-8 table (no harness/flywheel writer
   found), kept out of the allowlist above on that basis, but flagged here because the KEEP verdict itself
   rests on an unconfirmed completion state (see the KEEP table above).
6. **`supabase/functions/capture-worker/index.ts` / `pending_first_fetch`, `agent_runs`,
   `agent_run_searches`** — found 2026-09-01 reading the Edge Function directly (SCAN SCOPE widened to
   `supabase/functions/**`, matching the same-day fix to `.discipline/governance/producer-consumer-orphan.mjs`
   / F14). All three are single-writer (capture-worker is the only writer found for each — `.update(...)`
   on `pending_first_fetch` at lines 290/472/572/589/603; `.insert(...)` on `agent_runs` at lines 516/597
   and on `agent_run_searches` at line 530) and none is a harness/flywheel-shared (shared-8) table, so —
   same basis as `holdings_quality` above — they are recorded here rather than added to the enforced JSON
   allowlist. `pending_first_fetch`'s writer isn't only capture-worker's own code: migration 065's
   `enqueue_pending_first_fetch()` trigger also `INSERT INTO pending_first_fetch` on `sources`
   insert/update — a DB-level writer outside this doc's code-writer scope, noted for completeness.
   **CORRECTION to this lane's own brief**: the brief additionally named `sources` and `intelligence_items`
   as tables to register for capture-worker — reading the Edge Function shows both are READ there
   (`.from("sources").select(...)` line 266-267; `.from("intelligence_items").select(...)` line 276-277),
   never written, so neither belongs in a write-ownership register entry for this file.
6. **`staged_updates` / `update_type = 'update_item'`** — **RESOLVED, lane INTAKE (2026-09-01)**: lane CD
   added this type's first-ever production writer (`change-sweep.mjs`'s `bridgeChangedSourceToStagedUpdates`,
   called from `reconcile.ts`), but nothing consumed the rows it staged. `run-intake-cycle.ts` now does —
   `drainChangeSweepUpdates`, run from inside every apply-mode `runIntakeCycle` invocation — for rows
   carrying the change-sweep marker specifically. See the `staged_updates` section above for the full
   writer/consumer detail and the narrower gap that remains (a marker-less `update_item` row still has no
   consumer).

The five items above remain genuinely open, not resolved by this document — they are recorded so the next
lane (or the merge) has a named list instead of a silent gap. Item 6's original gap is closed as of the
note in that item.
