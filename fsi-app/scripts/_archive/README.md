# Archived scripts — tombstone ledger

This directory holds era/campaign scripts that once wrote one of the shared
datasets now owned by the ingestion HARNESS (`scripts/mint/**`,
`scripts/forward-events/**`, `scripts/harness-runs/**` conventions) and the
corpus FLYWHEEL (`src/lib/connections/**`, `scripts/connections/**`). Each
was moved here — content untouched, directory structure preserved — only
after clearing the evidence gate:

1. **Zero live inbound references** — a whole-repo grep (including
   `.discipline/`, `run-test-suite.sh`, `package.json`, `.github/`, `docs/`,
   every other script, and `src/`) found no import, `require`, hard-coded
   path, governance-manifest pin, golden-test fixture, or CI/test-suite
   wiring that depends on the script still living at its original path.
   Stale prose mentions in comments/docs (which point at the old path
   descriptively, not structurally) do not block archival — the same
   residue is left behind by every entry below.
2. **Superseded or completed** — the script's header names a one-time
   campaign/dispatch that has run its course, and its dataset write is now
   owned by a harness or flywheel path (or the campaign's narrow scope was
   simply finished and nothing since depends on re-running it).

Any script with a live reference, any doubt about its completion, or any
sign it is a *standing* operational tool rather than a one-time campaign
was left in place — see `docs/inventories/shared-dataset-ownership.md` for
the KEEP register and reasoning.

Moved with `git mv`; nothing inside any archived file was edited.

## Ledger

| Archived path | Era / campaign | Superseded-by / completed-evidence | Inbound refs at archive time |
|---|---|---|---|
| `scripts/_archive/_diag/probe-live-checks.mjs` | Pre-migration-200 diagnostic: one-shot `pg_constraint` dump to settle the live CHECK-constraint allowed-value sets for the "B-fix" (2026-06-07 dated header). | Completed: read-only, single-use diagnostic dump: the settled constraint sets it existed to produce are now baked into the schema/migrations that followed. Only a historical comment mention remains (`src/lib/agent/metadata-vocab.ts:14`). | 0 |
| `scripts/_archive/backfill-item-timelines.mjs` | §14 TIMELINE BACKFILL (Phase-3b, DATE-AND-DEDUP-AUDIT DD-01/DD-02): one-time mechanical re-harvest of `item_timelines` from already-stored briefs, for the historical corpus. | Completed one-time backfill; the forward half (every future item) is wired into the live canonical-pipeline `sectionBrief` step, not this script. Only a historical comment mention remains (`src/lib/agent/timeline-harvest.mjs:13`). | 0 |
| `scripts/_archive/phase-5-backfill.mjs` | Sprint 1 Phase 5: one-time, manual, operator-at-the-keyboard `jurisdictions`/`jurisdiction_iso` backfill + RC-9 dedup transactions (2026-05-18 operator decisions Q1-Q8). | Completed one-time migration-adjacent data step; superseded by the trigger-backed `jurisdiction_iso` invariant it installed. Only a historical doc mention remains (sprint-followups-discipline SKILL.md). | 0 |
| `scripts/_archive/phase2-build-binding.mjs` | Phase 2 #43 binding BUILD step: one-time DDL applying migration 118 + activating the scoped `reconciler` role (2026-06-01, commit 61f86cd). | Completed one-time build step (idempotent DDL, already applied); the FLIP path it built for is `phase2-reconcile.mjs` (also archived), and the binding it created is now just schema. Only a historical comment mention remains (`scripts/verify/prov-guard-adversarial-audit.mjs`). | 0 |
| `scripts/_archive/phase2-reconcile.mjs` | Phase 2 provenance reconciliation FLIP, run once through the bound `reconciler` credential (2026-06-01, commit 0571c11) to flip ~600 unverified `intelligence_items` to terminal `provenance_status`. | Completed one-time flip (idempotent guard: already-flipped rows are skipped); superseded by the standing `set_provenance_status` trigger that now derives status on every touch. No references found anywhere in the repo. | 0 |
| `scripts/_archive/phase2-verify-binding.mjs` | Phase 2 #43 binding VERIFY-BY-CONSTRUCTION (3-layer probe) that had to pass *before* `phase2-reconcile.mjs` was allowed to run. | Completed one-time pre-flight gate for a flip that has already run and been reconciled. Only a governance coverage-report catalog entry remains (not an enforcement wire). | 0 |
| `scripts/_archive/sprint3-corpus-reclassify-audit.mjs` | Sprint 3 CORPUS-RECLASSIFY-SOURCES: read-only investigation surfacing `intelligence_items` rows that are really source-portal pages, output committed as `docs/audits/sprint3-corpus-reclassify-audit-2026-05-27.json`. | Completed, read-only, single-dated audit; its output document is the durable artifact. Referenced only in that audit's own doc and a code comment (`src/app/api/admin/scan/route.ts`) describing the pattern it detected, not depending on the script. | 0 |
| `scripts/_archive/tmp/phase-5-rollback.mjs` | Phase 5 turn-2 UPSERT rollback tool, scoped to one specific incident window (`TURN_2_START = 2026-05-18T16:22:31Z`). | Completed, incident-scoped, single-use rollback; the Phase 5 backfill it would roll back is itself archived. Only historical doc mentions remain (`docs/audits/connection-completeness-2026-06-03.md`, listing it as a reader of two now-retired `_pre_phase5` snapshot tables). | 0 |
| `scripts/_archive/_wave-alpha/backfill-themes.mjs` | Wave-α C3 THEME BACKFILL: one-time, narrowly-scoped (author's own read-corpus estimate: ~2 rows) deterministic backfill of `intelligence_items.theme` from banked `theme_candidate` values, authored for the orchestrator to run once. | Completed/superseded: not cited in the skill-contract-map governance manifest (no `GOVERNING SKILL` marker), not wired into any test/CI/invariant; `intelligence_items.theme` is now populated at mint time by the live pipeline (`src/lib/intake/*`, `src/lib/agent/canonical-pipeline.ts`) going forward, so there is nothing left needing a historical-catchup pass. Only a historical comment mention remains (`src/lib/agent/metadata-vocab.ts:80`). | 0 |

Every other candidate on the seed list was evaluated and **Kept in place** —
see `docs/inventories/shared-dataset-ownership.md` for the full KEEP
register with per-script evidence (governance-manifest pins, golden-test
hard-coded paths, live imports, standing-operational framing, etc.).

---

## Ledger — F25 module-liveness archival (2026-09-01, lane hyg, task 6)

A second, separate evidence gate from the one above: these are not shared-dataset writers, they are
`.discipline/fitness/functions/F25-module-liveness.mjs`'s `LEGACY_ALLOWLIST` "proven, never consumed"
class — modules with **zero production importer** (proven mechanically with F25's own `buildImportGraph`,
re-run after every move to confirm the next entry's importer set was genuinely empty, not assumed) that
had sat in `LEGACY_ALLOWLIST` awaiting the operator's wire-or-remove call. This pass removes them:
`git mv`'d into `scripts/_archive/lib/` (scripts/lib originals) or `src/_archive/lib/` (src/lib
originals, mirroring their original subpath — `src/_archive/lib/d3/`, `src/_archive/lib/dashboard/`,
`src/_archive/lib/agent/`), content untouched, colocated `*.selftest.mjs`/`*.test.mjs` proofs moved with
their module. `src/_archive/` did not exist before this pass; `tsconfig.json`'s `exclude` and
F25's own scope filter (`!f.includes('/_archive/')`) were updated in the same commit so a module landing
there stops being a live typecheck/liveness surface, matching how `scripts/_archive/` already behaved.

| Archived path | Why it was in LEGACY_ALLOWLIST | Verified importer count after move |
|---|---|---|
| `scripts/_archive/lib/block1-reaudit.mjs` | scripts/lib "proven, never consumed" — no production importer, no selftest of its own. | 0 |
| `scripts/_archive/lib/bootstrap-test1.mjs` | Same class. | 0 |
| `scripts/_archive/lib/decision-log-audit.mjs` | Same class. | 0 |
| `scripts/_archive/lib/drift-check-reconstruction.mjs` | Same class. | 0 |
| `scripts/_archive/lib/error-drop-probe.mjs` + `.selftest.mjs` | Same class; had its own selftest (moved with it). | 0 |
| `scripts/_archive/lib/exclusion-audit-reconstruction.mjs` | Same class. | 0 |
| `scripts/_archive/lib/fetch-quality.mjs` | Same class — distinct from the still-live `src/lib/sources/fetch-quality.ts`, confirmed by reading both. | 0 |
| `scripts/_archive/lib/funded-release-plan.mjs` + `.test.mjs` | Same class; had its own test (moved with it). | 0 |
| `scripts/_archive/lib/inconclusive-report.mjs` | Same class. | 0 |
| `scripts/_archive/lib/liveness-reconstruction.mjs` | Same class. | 0 |
| `scripts/_archive/lib/net-agent.mjs` | Same class. | 0 |
| `scripts/_archive/lib/surface-registry-reconstruction.mjs` | Same class. | 0 |
| `scripts/_archive/lib/type-consumer-probe.mjs` + `.selftest.mjs` | Same class; had its own selftest (moved with it). | 0 |
| `scripts/_archive/lib/urgency.mjs` | Same class — the many string-match hits on the word "urgency" elsewhere in the repo (`urgency_tier`, `urgency_score`, …) are unrelated data-column names, not importers of this file; confirmed via the import graph, not grep. | 0 |
| `scripts/_archive/lib/verify-reconstruction.mjs` | Same class. | 0 |
| `src/_archive/lib/d3/hooks-reconstruction.mjs` | src/lib "no importer, no proof" — audit reconstruction of the d3 hooks behaviour, never imported by product code. | 0 |
| `src/_archive/lib/dashboard/credibility.ts` | Same class — dashboard credibility helper with no importer. | 0 |
| `src/_archive/lib/dashboard/critical-items.ts` | Same class. | 0 |
| `src/_archive/lib/agent/extract-research-sections.ts` | Same class — its only importer was itself on the 2026-08-11 dead-code manifest. | 0 |

**Not archived despite becoming newly import-orphaned by the moves above** (found running F25's
`buildImportGraph` again after the move, not assumed): `scripts/lib/decision-anchors.mjs`,
`scripts/lib/exclusion-audit.mjs`, and `scripts/lib/inconclusive-probe.mjs` lost their sole production
importer (`decision-log-audit.mjs`, `exclusion-audit-reconstruction.mjs`/`block1-reaudit.mjs`/
`bootstrap-test1.mjs`, and `inconclusive-report.mjs` respectively — all archived above), but each has a
`*.selftest.mjs` hard-named by exact path in `.github/workflows/discipline.yml`'s "App unit tests
requiring npm deps" step; moving the module would leave that CI step pointing at a path that no longer
exists, and this lane's write set forbids editing `.github/**`. `scripts/lib/liveness.mjs` lost its sole
importer (`liveness-reconstruction.mjs`, archived above) too and carries no such CI pin, but is left in
place alongside its three CI-pinned siblings rather than archived alone. All four now carry their own
reason-bearing `LEGACY_ALLOWLIST` entries in F25 instead, naming this exact chain and the CI-pin blocker
— see that file. `scripts/lib/verify.mjs`, `drift-check.mjs`, `surface-registry.mjs`, and
`fetch-negative-probe.mjs` (also read by this cluster) were checked the same way and are UNAFFECTED —
each still has a real, non-archived importer.
