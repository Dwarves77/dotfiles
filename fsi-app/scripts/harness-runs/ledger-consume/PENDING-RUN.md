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

**harness_version at write time:** `sha256:14a162a7a2ca487d`

**The planned run that supersedes this marker:** the next `ledger-consume-run-NNN.json` (the next
ledger-consume dispatch after this lane merges; the last artifact on record is `ledger-consume-run-007`
at `sha256:4ec177b09e05e669`). Per F28's reverse-audit this file is deleted the moment an artifact
carrying the hash above lands, or re-pinned if a governing file changes again before that run.
