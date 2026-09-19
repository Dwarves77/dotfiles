# Pending run: ledger-consume

F28's staleness-coupling rule (rule (c), `.discipline/fitness/functions/F28-harness-run-integrity.mjs`)
fires when a family's governing files re-hash to something no valid artifact on record carries. This
marker is the honest acknowledgment that rule anticipates, written in the exact format
`parsePendingRunHash` reads (`harness_version at write time: sha256:...`).

**What changed:** lane FINISHMIG (2026-09-11, W9 brief-chain build plan task 5.3, landing PR #370's
consumer) changed `src/lib/intake/portal-harvest.ts`, one of the three `ledger-consume` governing files
(`scripts/harness-runs/governing-files.mjs`). The census-exclusion read now calls the server-side
`next_uncensused_portal_candidates` RPC first (the RPC migration 256 already houses live) and falls back
to the client-side path only on a not-found error; the client-side `NOT IN` list overflowed the PostgREST
query at about 435 dispositioned rows per source. The other two governing files
(`scripts/turns/run-ledger-consume.mjs`, `src/lib/llm/first-fetch-classify.ts`) are untouched. Pinned by
`src/lib/intake/portal-harvest.npmtest.mjs` (25 goldens, including the RPC argument shape and the
keyset threading).

**harness_version at the previous pin's write time (superseded below, see Re-pin 2):** `sha256:14a162a7a2ca487d`

**The planned run that supersedes this marker:** the next `ledger-consume-run-NNN.json` (the next
ledger-consume dispatch after this lane merges; the last artifact on record is `ledger-consume-run-007`
at `sha256:4ec177b09e05e669`). Per F28's reverse-audit this file is deleted the moment an artifact
carrying the hash above lands, or re-pinned if a governing file changes again before that run.

## Re-pin 2 (coordinator, 2026-09-13, at push after rebase: lane/w9-l17-candidate-drain-2026-09-13)

**What changed.** The recorded hash `sha256:14a162a7a2ca487d` no longer matched the live governing files of this family (`scripts/turns/run-ledger-consume.mjs`, `src/lib/intake/portal-harvest.ts`, `src/lib/llm/first-fetch-classify.ts`) on the tree this push carries. Governing files changed on this branch: `scripts/turns/run-ledger-consume.mjs`, `src/lib/intake/portal-harvest.ts`. No run of this family landed in between; the marker is re-pinned so F28 measures the tree the run will actually execute on.

**harness_version at write time (superseded below, see Re-pin 3):** `sha256:4d8565eef0d1909e` (recomputed via `hashHarnessVersion` against `GOVERNING_FILES['ledger-consume']`, unreordered).

**The planned run that supersedes this marker.** Unchanged in kind from the previous pin; that run's artifact records whatever the tree is when it lands, and this file is deleted or re-pinned per F28's reverse-audit.

## Re-pin 3 (lane T2, 2026-09-19, env-file loader move)

**What changed.** The recorded hash `sha256:4d8565eef0d1909e` no longer matched the live governing files of this family (`scripts/turns/run-ledger-consume.mjs`, `src/lib/intake/portal-harvest.ts`, `src/lib/llm/first-fetch-classify.ts`) on the tree this push carries. Governing files changed on this branch: `scripts/turns/run-ledger-consume.mjs` (moved onto the one guarded env-file loader, `fsi-app/scripts/lib/env-file.mjs`; no behaviour change for a real run). No run of this family landed in between; the marker is re-pinned so F28 measures the tree the run will actually execute on. Finished by hand under the old convention (plan section 6.8, cause B; lane N3 removes the stored-hash-pin problem this re-pin works around), not a fix.

**harness_version at write time:** `sha256:08e0a400e1b00965` (recomputed via `hashHarnessVersion` against `GOVERNING_FILES['ledger-consume']`, unreordered; supersedes `sha256:4d8565eef0d1909e`).

**The planned run that supersedes this marker.** Unchanged in kind from the previous pin; that run's artifact records whatever the tree is when it lands, and this file is deleted or re-pinned per F28's reverse-audit.
