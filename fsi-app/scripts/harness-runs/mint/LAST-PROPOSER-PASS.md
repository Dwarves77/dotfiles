# Last proposer pass — mint

Per `PROPOSER-RUNBOOK.md` §2's attestation format. `mint` now has **four** artifacts (`mint-run-001` …
`mint-run-004`); F28's rule (d) requires this file to name the latest verbatim: **mint-run-004**.

**Artifacts read:** mint-run-001, mint-run-002, mint-run-003, mint-run-004.

**Full traces read:** `BATCH-001-REPORT-v2.md` §8 (the M2 full-text rebuild record, superseding §1-§5's
excerpt-era numbers), `HARDENED-VALIDATOR-REJECTIONS-mh3.md`, all six `payload-<celex>.json` and
`source-<celex>.txt` pairs as rebuilt by M2, `apply-snapshot-pre.json`, `gen-apply-sql.mjs` and the five
generated `apply-<celex>.sql` files, and the M3 apply lane's per-item verification rows (all under
`/root/work/mint/batch-001/`, every path in `mint-run-003.json`/`mint-run-004.json` `full_trace_refs`).

**Hypotheses (verified, with basis):**
1. `mint-run-003`'s claim that all six payloads pass the hardened validator was independently re-verified
   by the coordinator immediately before apply: a fresh `git worktree` at `origin/master` `9282aa3c`,
   `validate-mint-payload.mjs` run on all six — 6/6 `valid: true`, 0 failures, 0 Gate-A orphans (basis:
   ran it, 2026-09-01). The re-verification step exists because mint-run-003's own `defects_found`
   records a stale-local-checkout near-miss; running the validator from a pinned origin/master worktree
   is the cheap structural answer and should become standing coordinator practice.
2. `mint-run-004`'s central finding checks out mechanically: item identity in this database is
   **normalized `canonical_instrument_key`** (trigger `trg_set_canonical_instrument_key` strips the
   `CELEX:` prefix on INSERT; partial unique index `uq_intelligence_items_canonical_key_verified_live`
   enforces one verified live row per key), while every dedup check in the mint kit — MINT-RUNBOOK step 1's
   `WHERE source_url = ...`, the queue-level "111 already minted" count — is **URL-exact**. Two of six
   batch-001 rows (32019R1242, 32023R0956) were already covered by live verified items under different
   EUR-Lex URL variants (`/eli/reg/.../oj`, `/legal-content/EN/TXT?uri=` without the slash). Basis: ran
   the live queries; read the trigger and index definitions; the 23505 collision on the 32019R1242 apply
   is the direct experimental confirmation. The DO-block design contained the failure exactly as intended
   (atomic rollback, zero partial rows — verified by post-error count checks).
3. The apply path itself is proven: four items minted end-to-end through M0's write order
   (item → sections → search row → Gate-A pre-write → claims → citation), each flipping to `verified` on
   the final claim insert via `set_provenance_status` at trigger depth 2 — no direct `provenance_status`
   write anywhere, `guard_provenance_flip` untripped, zero residual open data-quality flags. Live-verify
   first-pass rate: 4/4. Basis: M3 lane verification rows + coordinator post-apply delta check
   (+4/+16/+23/+4/+4/+4, flags unchanged).

**Proposal (scoped for the next mint cycle — NOT implemented in this landing):**
1. **Canonical-key dedup, kit-wide.** Derive the CELEX/normalized key from each queue URL, compare
   against live `canonical_instrument_key` holders (verified+live at minimum; report archived/quarantined
   holders as context), and re-run this over the full remaining ~3,655-row would_mint queue BEFORE
   batch-002 lane dispatch. The 111 "already minted" figure is URL-exact and therefore a floor, not a
   count; expect it to rise. Also upgrade MINT-RUNBOOK step 1 from the `source_url` check to the
   canonical-key check.
2. **Census resolution mechanics into the runbook.** `census_worklist.resolved_into_id` is an
   intra-worklist self-FK (dedup chains), not an item pointer; the terminal state for a minted/covered row
   is `enumeration_status='reconciled'` with the item id recorded in `notes`. mint-run-004's
   `defects_found[1]` records the coordinator's own misread (caught by the FK, zero rows written); naming
   the mechanism in MINT-RUNBOOK's apply section closes the recurrence path.

**Family gates status:** this landing adds run artifacts and attestation files only (no governing-file
change — `harness_version` for both runs matches the current tree). Kit tests and the fitness suite run
in the landing train's CI as usual.
