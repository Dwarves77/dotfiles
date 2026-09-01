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
      "scripts/mint/run-mint-batch.mjs"
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
      "src/lib/entities/link-items.ts",
      "src/lib/agent/canonical-pipeline.ts",
      "src/workflows/generate-brief.ts",
      "src/lib/d3/hooks.mjs",
      "src/lib/d3/hooks-reconstruction.mjs",
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
      "scripts/connections/ratify-flag-to-census.mjs"
    ],
    "census_worklist": [
      "src/lib/intake/census-writer.mjs",
      "scripts/connections/ratify-flag-to-census.mjs"
    ],
    "item_forward_events": [
      "scripts/forward-events/run-extraction.mjs",
      "scripts/forward-events/load-forward-events.mjs"
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
      "scripts/_reground/restore-overclear.mjs"
    ]
  }
}
```

Notes on entries above that are **not yet present in this worktree** (pre-registered per the operator's
instruction so the parallel lane's merge doesn't red the writer-registry test):
`scripts/connections/discover-for-items.mjs`, `scripts/connections/generate-theme-brief.mjs`,
`scripts/connections/ratify-flag-to-census.mjs`, `scripts/mint/run-mint-batch.mjs`,
`scripts/forward-events/run-extraction.mjs`. `src/lib/connections/write-edges.mjs` already exists in this
worktree (direct `sb.from(...).upsert(...)`, see below); the parallel lane's version is described as
"snapshot-guarded" — TO-VERIFY whether that changes the write call shape enough to need a second entry
after merge. `scripts/forward-events/load-forward-events.mjs` is listed alongside the task-specified
`run-extraction.mjs` because `scripts/harness-runs/forward-events/PROTOCOL.md` names the former as the
actual intended loader (see the `item_forward_events` section below) — TO-VERIFY which name survives.

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
| `flywheel-gap:jurisdiction_span_gap` / `:surface_gap` / `:pivot_operations_gap` | `scripts/connections/analyze-corpus.mjs` | **Self-resolving** — the same script closes any of its own open flags whose gap no longer reproduces on the latest pass (lines 143-152, `guardedUpdate(..., status: "resolved", resolved_by: "analyze-corpus.mjs")`). Not an open leak. | analyze-corpus.mjs lines 118-152 |
| (entity-link candidate/lineage-gap namespace, exact value set by `entity-resolve.mjs`) | `src/lib/entities/link-items.ts` | **TO-VERIFY** — idempotent one-open-flag-per-namespace-per-item guard exists (lines 59-64), but no resolver was located for this namespace in the time available. | link-items.ts lines 58-64 |
| (ratified-to-census namespace) | `scripts/connections/ratify-flag-to-census.mjs` | **Pre-registered (parallel lane)** — its own name implies it is itself a *resolver* for some existing flag category, converting a flag into a `census_worklist` entry. **TO-VERIFY at merge** which `created_by` namespace(s) it consumes, and whether it closes the two OPEN leaks above. | not yet present |

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

### `item_forward_events`

Migration 274/275. Dedupe key (as fixed by 275, after 274's first key silently dropped 54% of the first
real run — see migration 275's header): `(intelligence_item_id, event_date, event_kind,
md5(obligation_text), coalesce(source_claim_id, source_section_id))`.

**Current writer: TO-VERIFY.** `scripts/forward-events/extract-forward-events.mjs` (FE-1) is confirmed
**pure** — it computes event objects but contains no `.from(`/`.insert(`/DB call of any kind (grepped the
full 712-line file). `scripts/harness-runs/forward-events/PROTOCOL.md` (staged for a coordinator to place)
names the actual loader as `scripts/forward-events/load-forward-events.mjs`, and states this repo's own
`forward-events-run-001.json` — which records a completed run — should land "together with (or immediately
ahead of)" that protocol file. At time of audit `load-forward-events.mjs` is **not present** in this
worktree, yet `scripts/harness-runs/forward-events/forward-events-run-001.json` exists and the commit log
(`git log --oneline`, this branch's parent history) shows "Forward-events harness: extractor,
item_forward_events (274+275), family registration, first run (901 events)" already landed on a prior
commit. **Open question for the merge**: reconcile whether the loader is named `load-forward-events.mjs`
(per PROTOCOL.md) or `run-extraction.mjs` (per this task's brief) — both names are pre-registered in the
allowlist above so neither naming breaks the test.

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

Replace policy: guarded insert/update/delete, with every change mirrored into the append-only
`claim_versions` ledger by `ledger-apply.mjs` (lines 132, 162) — `claim_versions` itself is in
`scripts/lib/db.mjs`'s `DELETE_PROTECTED_TABLES` (never hard-deletable), which is what makes every
`section_claim_provenance` mutation reversible.

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
- **`integrity_flags`** — `src/lib/agent/canonical-pipeline.ts`, `src/workflows/generate-brief.ts` (live pipeline); `src/lib/d3/hooks.mjs` (the D3 investigation framework's "route a finding to the durable queue" hook) and `src/lib/d3/hooks-reconstruction.mjs` (its real-infrastructure reconstruction proof — writes and cleans up a SENTINEL-marked row); `src/lib/notifications/seed-fallback-flag.ts`; `src/lib/sources/verify-item.mjs` (the RD-24 "ONE verify-item entry" `regen-quarantined.mjs` calls); `src/lib/sources/seek-more.mjs` (a real write site, though **note**: `.discipline/fitness/functions/F25-module-liveness.mjs`'s own header names this exact module as "fully built, unit-tested, ZERO live callers, dormant" — registered because the write call is real code in the tree, not because it is known to run); `scripts/audit-skill-conformance.mjs`, `scripts/entities/backfill-lineage-edges.mjs`, `scripts/remediation/{acquire-primaries-batch,refetch-capped-worklist}.mjs`, `scripts/verify/{run-data-audit-lane,surface-visibility-audit}.mjs` (live standing audit/remediation scripts, outside this lane's task-1 seed list); `src/app/api/admin/integrity-flags/route.ts`, `src/app/api/admin/sources/bulk-import/route.ts` (live admin routes).
- **`section_claim_provenance`** — `src/lib/agent/canonical-pipeline.ts`, `src/workflows/generate-brief.ts` (both call through to `ledger-apply.mjs`'s writes, and/or write directly at the workflow layer — **TO-VERIFY** the exact call shape if this is ever load-bearing to a future refactor).

None of these change any KEEP/ARCHIVE verdict from the sunset pass — they are all either already-covered
harness/flywheel/pipeline paths, or standing operational scripts outside the task-1 seed list that this
lane was not asked to evaluate. They are recorded here so the writer-registry test is accurate against the
real tree rather than only against the subset this document's author happened to read by hand first.

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

All five are genuine open items, not resolved by this document — they are recorded so the next lane (or
the merge) has a named list instead of a silent gap.
