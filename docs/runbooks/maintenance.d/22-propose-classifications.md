## 22. `propose-classifications`

**Documentation gap closed, Lane W71-WIRE, 2026-09-05** (plan section W7.1; F25 allowlist entry removed - the
script had only its own `.test.mjs` as an importer, no workflow reference). Written from
`scripts/classification/propose-classifications.mjs`'s own header.

**Purpose**: Phase 2/3 of the 5-axis source-classification framework
(`docs/plans/source-classification-framework-2026-05-10.md`). Computes three finding subtypes -
`--classify` (Axis 3/4/5 field gaps per source), `--drift` (a source's observed item-category
distribution deviating from its registered `expected_output`), `--anomalies` (an item classified into a
category its source's distribution says is improbable) - and writes each as an `integrity_flags` row
(namespace `AXIS_NAMESPACE`) for operator ratification. No mode flag runs all three (the default).

**What it does NOT do**: never writes `sources` or `intelligence_items` directly - every finding is a
flag proposal only. Applying a ratified finding is `apply-classifications.mjs`'s job (already wired as
this runbook's own `apply-classifications` step, section 17 above), not this script's.

**Upstream**: `src/lib/classification/classify-source.mjs` (`proposeSourceAxisClassification`),
`src/lib/classification/routing.mjs` (`detectDrift`/`isAnomalousCategory`), `planReflect` imported
unmodified from `scripts/connections/propose-tags.mjs` (the shared dedup-before-insert/resolve-if-stale
plan - never a second implementation).

**Ruling**: none by token - Phase 2/3 findings-visibility is the framework's own design; auto-adoption of
the RESULTING flags is `apply-classifications.mjs`'s separate, already-ruled-on mechanism (section 17).

**Dispatch**: no `arg`. This step calls the script's own CLI directly (`--execute` is that script's own
apply flag; there is no `cli.mjs` wrapper for a pure propose pass). `mode=dry` computes fresh
classify/drift/anomaly findings and reports the plan (new/stale/unchanged per subtype), writing nothing.
`mode=apply` adds `--execute`: writes new `integrity_flags` rows via `guardedInsertMany` and resolves
stale ones via `guardedUpdate` (rule 015).

**Artifact / read back**: this step's own console output (no `cli.mjs`/`summary.json` - see Dispatch).
Confirm against `SELECT created_by, status, count(*) FROM integrity_flags WHERE created_by LIKE 'axis:%'
GROUP BY 1, 2` (the exact `AXIS_NAMESPACE`-prefixed `created_by` values are `flags.mjs`'s
`SOURCE_CLASSIFICATION_SUBTYPE`/`SOURCE_DRIFT_SUBTYPE`/`ITEM_ANOMALY_SUBTYPE`).

---

