# C7 Paid Recovery — Outcome (2026-07-11)

**Operator ruling (2026-07-11):** ceiling $25→$32; yield-gated; on a wall, root-cause before more spend.

## Proof-then-batch
- **Proof-of-one** (de2df788, Connecticut HDV, strongest-pool guidance): resynth cleared floors → **slot-wall** (4 missing_required_slot + 2 unlabeled). Did not flip. $0.60.
- **Proof-batch (8 strong-pool items)**: **RELEASE 1 / still-resolving 7.** $6.08.
  - ✅ 39b5dc20 (South Dakota DOT Carbon Reduction) → **VERIFIED**.
  - ✗ 6/8 **floor-wall**: g7, 3ae89ce6, o6, 40c05a1e, 55f90df0, green-building — resynth regenerated the brief, **slots satisfied (zero slot failures)**, but FACT claims still ground below the tier-2 floor (`fact_below_authority_floor` persists).
  - ✗ 1/8 **slot-wall**: eu-battery (2 missing_required_slot).

## Yield gate → path taken
**Yield 1/9 (~11%) on the STRONGEST pools.** Not "good yield" (ruling a). **HALT the paid batch** (ruling: "do not spend the remaining budget into a known-failing mechanism").

## Root cause (ruling mandate: determine slot-wall = pool-lack vs C1-gap)
**NOT a C1/C2 contract gap.** Evidence: 6 of 8 items show **only** floor failures with **zero** slot failures → A2's C1 slot enforcement is working (those briefs met their required slots). The 2 slot-wall items lack *specific* slot content in their pools. The dominant wall is **floor**, not slot.

**The wall is POOL-INSUFFICIENCY.** The audit's "COVERED" verdict measured tier≤2 *text volume* (≥10KB), NOT whether that text grounds the specific asserted FACTs at floor authority. A pool can carry 10KB+ of tier≤2 text yet not cover the facts the brief asserts → those claims ground to tier>2 corroborators → `fact_below_authority_floor`. The `[cited-host-gate] novel-host` rejections (e.g. sachverstaendigenrat-wirtschaft.de, a malformed gov.gov.uk) compound it: floor-authority citations to unregistered hosts are correctly gate-rejected (moat working), leaving the claim below floor.

**Recovery = batch-1 refetch** (fetch the actual enacted/regulator text covering the facts), gated behind the deliberate scrape hold. NOT zero-fetch-recoverable.

## Disposition
- **1 recovered** (39b5dc20 verified). verified+non-archived **174 → 175**.
- **8 tested failures + 36 untested COVERED items** → stay honest-quarantined with **intact RD-6 deferrals** (deferred_until 2026-10-31, resolution_event = batch-1 / hold-lift). Recovery is refetch, not resynth. The 8 tested items' briefs were regenerated (churn immaterial — quarantined = not customer-visible; batch-1 refetch regenerates anyway).
- **No C1/C2 fix owed** (contract works). The refined finding — COVERED-by-volume ≠ winnable-by-resynth, real zero-fetch yield ~11% — is recorded for the batch-1 dispatch (do NOT re-attempt zero-fetch resynth on this set; go straight to refetch).

## Ledger
C7 total spend **$6.68** (37 spend-call rows, all ticketed). Month total **$50.01 / $75** code ceiling. Dispatch spend $6.68 / **$32** ceiling. $25.32 headroom left **unspent** (ruling-compliant — not a target).
