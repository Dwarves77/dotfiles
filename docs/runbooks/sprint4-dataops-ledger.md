# Sprint 4 — Data-Operations Ledger (already-executed; do NOT re-run)

**Why this file exists.** The `sprint4/fetch-canonicalization` branch holds two kinds of change
mixed together: **code** (apply-on-merge, normal PR+CI) and **already-executed data operations**
(durable corpus mutations that ran once against the **shared** Supabase project — dev and prod are
the same database). A re-run of any script below **double-applies against production**. This ledger
is the audit record; the `scripts/_dataops/interlock.mjs` guard is its enforcement arm — every script
listed here imports it and refuses to run unless `CONFIRM_RERUN=<name>` is set.

**Gating rule (precondition for integration):** the code half does NOT merge until every data-op
script here is guarded or quarantined from auto-execution (CI / tests / build). Status: **guarded**
(interlock applied) as of 2026-06-01.

---

## Bucket 2 — Already-executed DURABLE mutations (record; do not re-run)

| # | Script | Commit | Effect (already applied) | Idempotent? | Reversal |
|---|--------|--------|--------------------------|-------------|----------|
| 1 | `recovery-readmit.mjs` | `513262d` | INSERT 90 systematic recoveries into `provisional_sources` (pending_review) | Yes — dedup guard skips rows already in `sources`/`provisional_sources` | Delete the 90 provisional rows by their URL set |
| 2 | `phase2-build-binding.mjs` | `61f86cd` | Applied migration **118** (provenance-flip binding DDL) + created non-owner `reconciler` login role | Yes — `IF NOT EXISTS`/`CREATE OR REPLACE`; **re-ALTERs the reconciler password** on each run | `DROP ROLE reconciler` + revert 118 objects |
| 3 | `phase2-reconcile.mjs` | `0571c11` | Flipped ~600 active `unverified` `intelligence_items` to their terminal `provenance_status` (through the bound reconciler trigger) | Yes — already-terminal rows are no longer `unverified`, trigger re-derives to the same value | Reverse-flip script; values are trigger-derived (deterministic), so clear + re-derive |
| 4 | `recheck-fabrication-16.mjs` | `b973fcc` | Resolved 5 timeout-false `integrity_flags` (`b-audit-2026-05-29`) open→resolved; annotated 11 unadjudicable | Yes — already-resolved rows unchanged | Set the 5 flags back to `open` |
| 5 | `reclassify-portals-content-gate.mjs` | `e4f801d` | Archived 210 root-URL `intelligence_items` (`is_archived=true`, portal/error-page artifact); 21 kept; **source rows untouched** | Yes — already-archived rows unchanged | Un-archive (the **#5B** restore — operator-locked to regenerate-through-the-gate, NOT a blind `is_archived` flip) |

## Bucket 3 — The DANGEROUS MIDDLE: verification harnesses that LOOK like test code but write to prod

These self-clean (insert N sentinel rows, then delete the same N) so they leave no durable corruption,
**but they connect to the shared prod DB and need `.env.local`**. They are bespoke one-shot verification
instruments, slated for **RETIREMENT** in favour of standing CI tests (the bug-class detector + the
`*.selftest.mjs` suites). Guarded by the interlock until retired.

| # | Script | Commit | Writes (self-cleaned) |
|---|--------|--------|------------------------|
| 6 | `d1interp-stored-state-verify.mjs` | `f84ee2d` | 1 sentinel `source_verifications` row, deleted |
| 7 | `checksrc-consumer-verify.mjs` | `55536c9` | sentinel `sources`/events rows, deleted |
| 8 | `d1methodswap-verify.mjs` | `8cecfd6` | 1 sentinel `source_verifications` row, deleted |
| 9 | `entitygate-stored-verify.mjs` | `569e7f7` | sentinel `sources`/`intelligence_items` rows, deleted |

## Bucket 1 — PURE CODE (mergeable via PR; NOT in this ledger)

D3 layer, `reachability.mjs` SSOT, `entity-gate.mjs`, `first-fetch-classify.ts`, `canonical-fetch.mjs`,
the route fixes (`check-sources`, `bulk-import`), the CI YAML fix, and all `*.selftest.mjs` /
`scripts/lib/*` probes (read-only / pure). These apply on merge and carry no prod side-effect.

---

## Auto-execution audit (2026-06-01)

`package.json` exposes no test/seed runner that globs `scripts/**` (only `perf:bundles` →
`measure-bundles.mjs`, read-only). No CI workflow or test file references any script above. So **nothing
auto-runs them today** — the live hazard is a manual re-run or a *future* `scripts/**` glob. The interlock
closes both.

## Migration inventory follow-up

The discipline pre-push hook flagged migrations **117** (`117_provenance_gate_customer_rpcs.sql`, prior
session) and **118** (`118_provenance_flip_binding.sql`, this branch) as missing from
`docs/inventories/migrations.md`. Add both before the code half merges to master.
