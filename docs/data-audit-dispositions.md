# Data-audit lane dispositions

Dated waivers for the Layer C block-next-run gate (`integrity_flags` `data-audit-lane` block). A waiver is
protocol-sanctioned by `preflightStep` / `hasValidWaiver`: it does NOT silence a guard, it defers a
**scoped, tracked** fix with an expiry. Time alone never clears red — only a fix (lane → green) or an
explicit non-expired dated waiver here + on the flag's `recommended_actions`.

---

## 2026-07-14 — block `cfb1799a-9177-40ea-b269-a28a6f4cbe2a` (WAIVER until 2026-07-28)

**Failing checks:** one-tier-per-host, claims-tier, ledger-onepass.

**Branch (operator HALT taxonomy 2026-07-14): (b) — pre-existing red. NOT (a) sanctioned-path defect, NOT
(c) transitional noise.** Proven, not asserted:

- **Not (a) — the RE-SYNTH pass caused NONE of it.** The pass ran ~06:20–07:00 UTC; the lane block was
  created 08:16 UTC (settled state). Diagnostic queries:
  - claims-tier: **264 mismatches, 0 extracted in my run window, 0 on any of my 8 RE-SYNTH items** (oldest
    2026-06-05, newest 2026-07-11 — 3 days before the flight). My re-ground stamped its new claims
    *consistently* (0 of them are in the mismatch set — the Step-1 rails stamp correctly).
  - one-tier-per-host: the two violating hosts (`joc.com` T5×3 + `tpm.joc.com` T7; `thomsonreuters.com` /
    `regintel-content.thomsonreuters.com` T5+T7) are **all rows created 2026-04-05 … 2026-06-05**. The
    flight added none — it is a subdomain-vs-domain tier split from June.
  - ledger-onepass: the "stamp drift" half is the **same pre-existing 264**; the `verified-despite-below-floor`
    half is **c4 (ISO 14083 standard), not in my worklist** — a T6 FACT on a verified standard.
- **Not (c) — not mid-run noise.** The lane sampled at 08:16, ~1h after my writes were quiescent; the
  offending rows are days-old data, not a write/read-back race. A re-run would remain RED (the data is there).
- **Root cause (who tripped it):** the **2026-07-13 124-host tier-correction batch** (a prior session)
  corrected source `base_tier`s to their ruled class tiers (news→T7, analysis→T6), which **surfaced** the
  pre-existing old guessed-T5 claim stamps as `stored (5) ≠ source-derived (7/6)`. The debt (the guessed-T5
  stamps + the June host split + c4's sub-floor FACT) predates that correction. **No rule was superseded** —
  each check is valid; this is genuine data debt, not a stale audit premise.

**Why a waiver, not a mid-flight fix:** the fix mutates VERIFIED items and cascades — re-stamping the 264
FACTs to their source-derived tier makes them below-floor → re-quarantine; c4 needs a floor-review/relabel;
the host split needs canonicalization that itself perturbs claims-tier. That is the **reattribution-relabel +
tier-canonicalization unit** (already parked as its own verified unit — [reattribution-worklist-2026-07-14](./ops/reattribution-worklist-2026-07-14.md)),
never a blind mid-flight mass mutation. Resuming ACQUIRE 17 does NOT compound this debt: it writes new claims
stamped correctly (proven above) and touches none of the 264 / c4 / the split hosts.

**Owed fix (clears the waiver):** the tier-canonicalization + reattribution-relabel unit — canonicalize
`joc.com` / `thomsonreuters.com` to one news tier (T7); re-attribute or relabel the 264 stored≠derived FACTs
(re-home to a floor-qualifying primary, else FACT→ANALYSIS), letting the re-quarantine cascade fall; floor-review
c4. Sized post-flight at close.

**Expiry:** 2026-07-28. If not fixed by then, the block re-blocks generation (time never clears red).
