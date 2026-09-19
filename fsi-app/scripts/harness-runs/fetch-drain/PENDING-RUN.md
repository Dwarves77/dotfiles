# Pending run: fetch-drain

F28's staleness-coupling rule (rule (c), `.discipline/fitness/functions/F28-harness-run-integrity.mjs`)
fires when a family's governing files re-hash to something no valid artifact on record carries. This
marker is the honest acknowledgment that rule anticipates, written in the exact format
`parsePendingRunHash` reads (`harness_version at write time: sha256:...`).

**What changed.** Lane T2 (2026-09-19, one guarded env-file loader) changed `scripts/turns/run-fetch-drain.mjs`,
one of the two `fetch-drain` governing files (`scripts/harness-runs/governing-files.mjs`): the script's own
bare `process.loadEnvFile` call moved onto the one home, `fsi-app/scripts/lib/env-file.mjs`'s
`loadLocalEnvFile()`. No behaviour change for a real run. The other governing file
(`supabase/functions/capture-worker/index.ts`) is untouched by this lane. The last artifact on record,
`fetch-drain-run-005`, recorded `sha256:3a30c353a421433a`, which no longer matches the current tree. No
run of this family landed in between; this marker names the change so F28 measures the tree the next run
will actually execute on. Finished by hand under the old convention (plan section 6.8, cause B; lane N3
removes the stored-hash-pin problem this marker works around), not a fix.

**harness_version at write time:** `sha256:194fa2407130070f` (recomputed via `hashHarnessVersion` against
`GOVERNING_FILES['fetch-drain']`, unreordered).

**The planned run that supersedes this marker:** the next `node scripts/turns/run-fetch-drain.mjs`
dispatch (dry or apply), landing `fetch-drain-run-006.json` under this hash. Per F28's reverse-audit this
file is deleted the moment that artifact lands, or re-pinned if a governing file changes again first.
