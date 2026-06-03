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
| 6 | `tier-reconcile.mjs` | (this commit) | Moved `base_tier` on **25 sources**: CAT1 = 11 genuine-news `trade_press` T5→T6 (Decision 2, A canonical); CAT2 = 14 clean Class-1 fixes (EcoVadis ×5 T5→T6, US EIA ×3 T1→T4, 3 trade-press T4→T6, J.P. Morgan T3→T6, China MEE + EC DG-Energy T3→T2). Per-row `UPDATE … WHERE base_tier=expectedOld` + read-back assert; all 25 verified. **Role-mislabels (Class 2) deliberately excluded.** | Yes — `WHERE base_tier=expectedOld` no-ops once moved; re-run dry-run shows 25 `[already]`, 0 drift | Per-row reverse move (new→old) by the same id set |
| 10 | `sourcefix-link-create.mjs --execute` | (this commit) | **Closed the no-source_id gap.** 28 active items had a `source_url` but no `source_id` FK (scan/seed minted them without enforcing source linkage). Linked all 28: **14 to existing registered sources** (exact/same-domain match: EUR-Lex, MPA Singapore, GOV.UK, Korea ME, Lloyd's Register, etc.) + **created 12 new source rows** (METI, MEE, MAS, MOCCAE, India PIB/Commerce, Australia Infra, Canada, UAE, SAFA, ScienceDirect, EcoEnclose — classified by domain: gov→T2 primary_legal_authority, SAFA→T4 industry_association, ScienceDirect→T5 academic, EcoEnclose→T6 vendor) and linked their 14 items. Per-row `UPDATE … WHERE source_id IS NULL` + read-back. After: 0 active items lack a source. New sources `auto_run_enabled=false` (cold-start; not auto-scanned until enabled). | Yes — `WHERE source_id IS NULL` no-ops once set | Null the 28 `source_id`s back + delete the 12 created sources by name/url. |
| 9 | `apply-121.mjs` | (this commit) | **Uniform promotion (human-in-the-loop removed).** Applied migration **121** (`validate_item_provenance`: collapse criterion-6 tier branch — a valid item → `verified` for ALL tiers; CRITICAL/HIGH no longer route to `pending_human_verify`; criteria 1-5 byte-identical to 119). Re-evaluated all 390 active items via the trigger touch: **26 `pending_human_verify` → `verified`**, 364 quarantined unchanged. Verified by read-back: 26/26 verified items re-validate (valid=true); 0 still `pending_human_verify`; all 5 known-stuck CRITICAL still quarantined (no leak). Removed the task-1.12 human-tick code (`verify-claim`/`pending-verification` routes, `VerificationQueue` UI + tab, `verify-token`, the `generate-brief` hook loop + 3 helpers). Enum value `pending_human_verify` LEFT in the type but unused (dropping it requires recreating the type + all deps — invasive/irreversible; inert unused). | Yes — re-touch re-derives the same value | Revert 121 (restore 119 criterion-6) + re-touch to re-derive; status is trigger-deterministic. The 26 verified are now customer-visible (gate=`verified`). |
| 11 | `wave2-reachability-restore.mjs --execute` | (this commit) | **Reversed wave2-cleanup-execute's reachability false-negatives.** `wave2-cleanup-execute.mjs` (`e4f801d`-era) Step 1 re-classified 12 stale `provisional_sources` via a FORBIDDEN plain-fetch reachability+content path (bot-UA HEAD; 403/429/5xx/timeout misread as "unreachable" → tier L → `status='rejected'`). That killed **4 LIVE national-gov sources** (METI JP transport-efficiency, MPA Singapore sustainability, UAE MoEI, Korea ME K-Taxonomy). Restored all 4 `rejected`→`pending_review` (cleared `reviewed_at`/`recommended_tier`, annotated notes), per-row `UPDATE … WHERE status='rejected'` + read-back assert; 4/4 verified. The 6 `confirmed` + 2 `needs_more_data` from the same run got benign verdicts on the same suspect path — left in place, re-verify naturally on next canonical pass. Proper Browserless re-verification of the 4 is OWED when quota is restored. | Yes — `WHERE status='rejected'` no-ops once flipped | Set the 4 ids back to `status='rejected'` (log lists them). |
| 8 | `block4-retroground-runner.mjs --execute` | (this commit) | **Block 4 retro-grounding (CRITICAL batch).** Populated the previously-empty per-claim substrate: **647 `section_claim_provenance` + 365 `agent_run_searches` rows** (were 0/0). Grounded **26 of 31 CRITICAL sectioned items** — each gets FACT claims with verbatim spans (span-check gated, tier-2), covering required slots + modal sections; `validate_item_provenance` → valid=true → trigger flips **quarantined → `pending_human_verify`**; stale data_quality flag resolved; read-back asserted per item. 5 not grounded: 4 with a persistent unlabeled-assertion (interpretive prose needing an ANALYSIS label or a real source — content fix, not runner), 1 (`eu-ets-extension`) has no `source_id`. Idempotent: skips items that already have claims. | Yes — skips grounded items on re-run | Delete `section_claim_provenance` + `agent_run_searches` rows WHERE intelligence_item_id IN (the 26) + re-touch to re-derive `quarantined` (trigger-deterministic). NOTE: items are at `pending_human_verify`, NOT customer-visible (gate=`verified`); the task-1.12 human-tick loop flips them to `verified`. |
| 7 | `apply-119.mjs` + `sprint4-provenance-reconcile.mjs --execute` | (this commit) | **Surface-honesty gate fix.** Applied migration **119** (`validate_item_provenance` FAIL-CLOSE: a 0-section item no longer vacuously passes criteria 2-5 — records `no_section_content` → quarantined). Then re-validated the corpus via the `set_provenance_status` trigger touch: **390 active items → `quarantined`, 0 verified, 0 pending** (was 207 verified / 55 pending / 128 quarantined). The prior 207 "verified" were ALL 0-section shells passing on the vacuous skip; nothing is genuinely grounded (`section_claim_provenance` + `agent_run_searches` are 0 rows corpus-wide — the Block-4 grounding pipeline is unbuilt). Read-back verified: stored dist = `{quarantined:390}`, `provenance_verified_at` cleared on all. | Yes — trigger no-ops when status already `quarantined`; re-touch re-derives the same value | Revert 119 (restore 114 fn body) + re-touch to re-derive; statuses are trigger-deterministic. **Note:** the customer RPCs (`get_workspace_intelligence_{slim,dashboard,listings}`, 071/073/077) do NOT gate on `provenance_status` — so this flip is admin-honest but NOT yet customer-effective (separate finding; gate-wiring is owed). |

## Bucket 3 — The DANGEROUS MIDDLE: verification harnesses that wrote to prod — RETIRED 2026-06-01

These were bespoke one-time instruments that connected to the shared prod DB (wrote + self-cleaned
sentinel rows) to assert the stored outcome of already-merged fixes. Their one-time job is complete
(the fixes are merged + four-part verified). They are now **DELETED** — replaced by standing fixture
tests that **cannot touch prod at all**:

| # | Retired harness | Fix it verified | Standing fixture replacement |
|---|-----------------|-----------------|------------------------------|
| 6 | `d1interp-stored-state-verify.mjs` | D1-interp reachability tier (`f84ee2d`) | `scripts/lib/reachability.selftest.mjs` (7/7) — decision logic |
| 7 | `checksrc-consumer-verify.mjs` | check-sources status (`55536c9`) | `reachability.selftest` (decision) + **owed**: an `assessAndUpdateSource` decision-fn fixture for full composition coverage |
| 8 | `d1methodswap-verify.mjs` | D1 method swap (`8cecfd6`) | `reachability.selftest` (decision) + **owed**: a `verifyCandidate` decision-fn fixture |
| 9 | `entitygate-stored-verify.mjs` | portal-as-item gate (`569e7f7`) | `scripts/lib/entity-gate.selftest.mjs` (11/11) — gate + isErrorBody decision |

**Pattern for the owed composition fixtures:** `src/lib/sources/fetch-now-decision.mjs` +
`scripts/lib/fetch-now-decision.selftest.mjs` (`d7fbe09`) — extract a route's decision into a pure fn
(no DB/HTTP/Date) and assert it in a fixture. Apply the same to `assessAndUpdateSource` and
`verifyCandidate` for check-sources / method-swap **composition** coverage (their decision LOGIC is
already covered by the SSOT selftests above; only the route-level composition is not yet fixtured). All
run in the CI HARD gate (`.github/workflows/bug-class-guard.yml`).

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
