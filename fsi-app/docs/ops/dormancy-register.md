# Dormancy register

Every mechanism that exists but does not run, classified by the **conduction test** (a path counts as WIRED
only if traced end-to-end to a live invoker AND its gate conditions permit execution in the current system
state). Three verdicts only: **WORKING** (proven) · **DORMANT-PROVEN-WAKEABLE** (a green wake-proof exists) ·
**DEAD-OR-UNVERIFIED** (delete via gate, or fix, or an explicit retained-for-flip entry with owner + date).
The scrape hold is **not** an excuse category. Seeded 2026-07-12 (intake-correctness Step 3.3); the full
conduction census + wake-proofs + the audit-method coverage-gap note land in Step 4b.

---

## R-1 — drain-first-fetch (Path A source-monitoring intake) — RETIRED

**Verdict: DELETED (dead-path-with-a-heartbeat).** Ruling 2026-07-12 (Option A with migration).

- **What it was:** `POST /api/worker/drain-first-fetch` + `seedStubIntelligenceItem`, invoked by the hourly
  `source-monitoring.yml` cron (a **second job**, `needs: check-sources`, `if: always()`). It drained
  `pending_first_fetch`, Haiku-classified each source, seeded a stub, and minted via `mintIntelligenceItem`.
- **Why retired:** the cron fired hourly into a gated no-op (scrape hold / cadence-off) — a dead path with a
  heartbeat by the conduction test. Path A minted directly pre-gate (the 38 pre-gate polluters) and is
  superseded by the machine cycle (`runIntakeCycle` → `applyStagedUpdate` → mint).
- **Deleted:** the route file (which held `seedStubIntelligenceItem` — no other production consumer; the
  leakage test only *mirrors* its seedRow shape, now marked historical) + the `drain-first-fetch` cron job in
  `.github/workflows/source-monitoring.yml` (no hourly 404 left behind). Via gate + log (this entry).
- **Seed-parity (D5) DISSOLVED:** one seed constructor remains — the seed assembled at `applyStagedUpdate →
  mintIntelligenceItem`. `mint-item.ts` header updated.
- **Reversible:** git history (route + cron job) restores it if the ruling is revisited.

## R-2 — pending_first_fetch (the retired queue's data) — RETAINED-FOR-FLIP

**Verdict: DORMANT, retained-for-flip.** Owner: Jason. Reader pending: the cadence-flip wiring unit (R-3).

- **36 rows preserved** (not dropped), carrying `source_id` linkage → **re-homed to Unit 1's candidate
  population** (Unit 1 builds `runIntakeCycle` candidates from them: congruence → entity-gate → dedup [fixed
  matcher] → mint or machine-reject-with-reason). No row silently dropped; this entry is the log.
- **Writer still live:** the mig-065 `enqueue_pending_first_fetch` trigger still enqueues on new eligible
  sources — new rows join Unit-1's population. F14 passes (the SQL trigger reference counts), so this is a
  deliberate retained-for-flip, not a silent write-orphan.
- **The 9 `sources.auto_run_enabled=true` flags are preserved** on the source rows (cadence-flip routing data).
  With drain gone the flag drives nothing until the flip unit exists — enablement fact kept, effect inert.
- **review-by:** cadence-flip wiring unit (R-3).

## R-3 — cadence-flip wiring unit — STANDING FUTURE WORK (named + owned)

Path A's designed replacement, not implied. When Jason flips the scrape cadence on:

- `check-sources` chains into `runIntakeCycle` as a **deliberately-added THIRD named F16 caller** (alongside
  `manual-intake-run` + `unit3-remediation`) — its own red-then-green + a **wake-proof required before the
  flip** (`dormant-means-proven-wakeable`). Not before.
- Drains R-2's `pending_first_fetch` population (the 36 re-homed rows + any the trigger has since enqueued)
  through the machine path.
- **Pulled into this unit's scope (Step-3.4 census finding):** `content-change.mjs` hardcodes
  `change_detected: false` on every `monitoring_queue` row, so the `reconcile` consumer never has anything to
  act on — the cadence flip is meaningless if change detection reports nothing changed by construction. This
  gets FIXED when this unit builds; the wake condition includes real change detection.
- Owner: Jason (flip is his control). review-by: cadence-flip unit build.

## R-4 — monitoring_queue reconcile path — DORMANT (input hardcoded false)

**Verdict: DORMANT (dead-because-input-hardcoded).** Not a write-orphan (produced by `check-sources`, consumed
by the `reconcile` worker), but `content-change.mjs` hardcodes `change_detected: false`, so the reconcile
consumer never fires. Folded into R-3's scope (fixed when the cadence-flip unit builds). Full classification +
wake-proof in Step 4b.

---

### Audit-method coverage gap (for the Step-4b coverage-gap note)

The earlier "wiring truth" enumeration classified drain-first-fetch as **orphaned** because it traced code
callers only and **missed the second cron job in `source-monitoring.yml`**. Correction: the census's
conduction tracing MUST include **workflow files** (`.github/workflows/*.yml`), not just code callers — a cron
job is a live invoker. This blind spot is carried into the Step-4b coverage-gap note as specified.
