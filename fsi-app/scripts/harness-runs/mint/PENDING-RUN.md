# Pending run — mint

F28's staleness-coupling rule (rule (c), `.discipline/fitness/functions/F28-harness-run-integrity.mjs`)
fires when a family's governing files re-hash to something no valid artifact on record carries. This
marker is the honest acknowledgment that rule anticipates — written in the exact format
`parsePendingRunHash` reads (`harness_version at write time: `sha256:...``). The previous mint marker was
discharged by mint-run-029 (train 37, R-D ratification); this is a fresh one for a single change.

**What changed:** lane DEAD-EXEC (2026-09-04), executing disposition-register row-adjacent cleanup
(`docs/audits/wiring-audit-2026-09-04/`, `docs/plans/unwired-disposition-2026-08-31.md`) plus this repo's
own build-plan instruction to remove the Gate-A single-source collapse's now-pointless indirection layer.
`scripts/mint/lib/gate-a-scan.mjs` and `scripts/mint/lib/gate-a-match.mjs` — pure `export * from
"../../../src/lib/agent/gate-a-{scan,match}.mjs"` re-export shims added by the Gate-A single-source
collapse (the Gate-A single-source collapse, 2026-09-03; see the discharged marker history in git) — were DELETED outright: nothing needed the indirection any more.
Their one production importer, `scripts/mint/validate-mint-payload.mjs` (`scanBrief`), and their one test
importer, `src/lib/intake/record-facts.npmtest.mjs` (`extractFactualTokens`, `containsToken`), now both
import `src/lib/agent/gate-a-scan.mjs` / `gate-a-match.mjs` directly — the exact same two files F28's
`GOVERNING_FILES.mint` already named, so the SET of files this family hashes is
unchanged in substance; only the two now-redundant shim paths were removed from the list (12 → 10 entries
now:
`scripts/mint/MINT-RUNBOOK.md`, `scripts/mint/validate-mint-payload.mjs`, `scripts/mint/payload-schema.json`,
`scripts/mint/item-type-required-slots.json`, `src/lib/agent/gate-a-scan.mjs`, `src/lib/agent/gate-a-match.mjs`,
`scripts/mint/lib/canonicalize-citation-url.mjs`, `src/lib/intake/record-facts.mjs` — 8 files). `governing-files.mjs`
(THE single source `scripts/harness-runs/governing-files.mjs`, Wave GOV-SINGLE) had its own `GOVERNING_FILES.mint`
array edited to drop the two shim entries; `scripts/harness-runs/CONVENTION.md`'s `mint` table row and
`scripts/mint/MINT-RUNBOOK.md`'s "Keeping the kit in sync" section were both updated to match (no more
RE-EXPORT framing — direct import, shims gone). `payload-schema.json`, `item-type-required-slots.json`, and
`scripts/mint/lib/canonicalize-citation-url.mjs` are UNCHANGED by this lane.

Because `governing-files.mjs` is itself one of `meta-harness`'s own `GOVERNING_FILES` entries, this same
edit also moves the `meta-harness` family's own `harness_version` — see
`scripts/harness-runs/meta-harness/PENDING-RUN.md`, re-pinned the same commit this file lands in.

**RE-PINNED (lane MINT-FLYWHEEL, 2026-09-06):** a second governing-file change landed before the run above
discharged the DEAD-EXEC marker, per this file's own closing sentence ("re-pinned to a new hash... if a
governing file changes again before that run lands"). `scripts/mint/MINT-RUNBOOK.md` (one of the 8 files
`GOVERNING_FILES.mint` names, unchanged since DEAD-EXEC) gained: (1) a rewritten §8/§9 "propagation
outbox" paragraph correcting a build-plan hypothesis — REFUTED [CONFIRMED, 2026-09-06]: migration 284/
285/286's `propagation_outbox_trg` attaches only to `emission_factors`/`market_series`/
`regional_data_facts`/`derived_values`/`statutory_computations`/`estimated_values`, never
`intelligence_items` — a mint emits NO `propagation_events` row; and (2) documentation of the new
`obligations_derived` §9 field (below). `scripts/mint/apply-mint-batch.mjs` and
`scripts/turns/run-population-flywheel.mjs` were also edited this same lane (adding
`obligations_derived` to the outcomes write, and correcting apply-mint-batch.mjs's own stale header/
proposer-note claim that flywheel connection is "a separate, later, post-apply pass" — it is now a
mandatory same-job step, per `.github/workflows/population-turn.yml`'s existing lane-TANDEM/TANDEM-2
wiring) — neither file is in `GOVERNING_FILES.mint`, so neither changes the hash on its own; only the
MINT-RUNBOOK.md edit does.

**Prior recorded hash (superseded below, DATECHAIN 2026-09-11 — kept only as history, not re-parsed as
the current marker):** `sha256:96b9cc82d6505b7d` (recomputed live the MINT-FLYWHEEL lane, `node -e`
against `governing-files.mjs`'s own `GOVERNING_FILES.mint` array and `run-artifact.mjs`'s
`hashHarnessVersion` — the same 8 files DEAD-EXEC's marker names, unreordered; only MINT-RUNBOOK.md's
content moved, so this superseded `sha256:79d41d6130773f0a` outright, not additively).

**The planned run that supersedes THIS marker:** the next `population-turn` dispatch under this landed
code — its artifact's own recorded `harness_version` should read the hash above. No mint-kit VALIDATION
behavior changed (this lane touched documentation and outcome-metric plumbing, not `validate-mint-payload.mjs`,
`payload-schema.json`, `item-type-required-slots.json`, `gate-a-scan.mjs`/`gate-a-match.mjs`,
`canonicalize-citation-url.mjs`, or `record-facts.mjs`), so no behavioral defect is expected to surface,
only the marker's discharge. Per F28's reverse-audit, this marker is deleted the moment a run artifact
lands with `harness_version` matching the hash above (or re-pinned again, per rule (c), if a governing
file changes again before that run lands).

**RE-PINNED (lane DATECHAIN, 2026-09-11):** `src/lib/intake/record-facts.mjs` (one of the 8 files
`GOVERNING_FILES.mint` names) gained `STUB_BRIEF_MARKER`, an exported constant naming the exact stub-brief
opening string `buildRecordFullBrief` writes — extracted so `scripts/verify/population-report.mjs`'s new
"brief coverage" store entry (docs/ops/runbooks/date-chain-2026-09-11.md) checks the same literal
`buildRecordFullBrief` writes, rather than a second hand-typed copy of the string. `buildRecordFullBrief`'s
own OUTPUT is byte-for-byte unchanged (the constant's value is the identical string that was previously
inlined) — no mint-kit VALIDATION behavior changed by this edit either, same as MINT-FLYWHEEL above.

**harness_version at write time (superseded below, see task 0.3b):** `sha256:eb6c6027081dcd54` (recomputed
this lane, `node -e` against `governing-files.mjs`'s own `GOVERNING_FILES.mint` array and
`run-artifact.mjs`'s `hashHarnessVersion`, the same 8 files, unreordered; supersedes
`sha256:96b9cc82d6505b7d` outright).

**RE-PINNED (task 0.3b, 2026-09-11, lane hashsep):** `scripts/mint/validate-mint-payload.mjs` (one of the
8 files `GOVERNING_FILES.mint` names) had its CLI main guard swapped from the broken hand-built
`file://` + `process.argv[1]` comparison idiom (never true on Windows) to `isMainModule(import.meta.url)`
(`scripts/lib/is-main.mjs`), plus the one new import line that requires. A mechanical, behavior-preserving
edit only: the guard still calls `main()` under the identical condition, now correctly on every platform
instead of only on POSIX; no mint-kit VALIDATION behavior changed. This moves the file's bytes and
therefore the family's hash again.

**harness_version at write time (superseded below, task 3.5):** `sha256:0cc65f2728f2af1a` (recomputed
task 0.3b, `node -e` against `governing-files.mjs`'s own `GOVERNING_FILES.mint` array and
`run-artifact.mjs`'s `hashHarnessVersion`, the same 8 files, unreordered; supersedes
`sha256:eb6c6027081dcd54` outright).

**RE-PINNED (task 3.5, W9 brief-chain plan Part 3, 2026-09-11, lane part3):** `scripts/mint/MINT-RUNBOOK.md`
(one of the 8 files `GOVERNING_FILES.mint` names) section 8 gained a fourth numbered step, "Brief queuing"
(task 3.5, "every new item is queued for a brief automatically"): documents `run-population-flywheel.mjs`'s
own new step 12, `brief-export` (that file is NOT itself in `GOVERNING_FILES.mint`, so its own edit does
not move this hash on its own; only the MINT-RUNBOOK.md documentation edit does). No mint-kit VALIDATION
behavior changed (`validate-mint-payload.mjs`, `payload-schema.json`, `item-type-required-slots.json`,
`gate-a-scan.mjs`/`gate-a-match.mjs`, `canonicalize-citation-url.mjs`, `record-facts.mjs` are all
untouched by this lane).

**harness_version at write time:** `sha256:213617fb97ab8dc4` (recomputed this lane, `node -e` against
`governing-files.mjs`'s own `GOVERNING_FILES.mint` array and `run-artifact.mjs`'s `hashHarnessVersion`,
the same 8 files, unreordered; supersedes `sha256:0cc65f2728f2af1a` outright).
