# Browser-Verification Checklist — Jason's single end-of-program session

**What this is.** One accumulating list of the last-mile visual/browser checks that need a real
authenticated session in a browser. Per the 2026-07-08 dispatch (Option B): these do **not** block
any merge and are **not** surfaced per-feature. Each landed feature is merged on **backend-verified
proof** (route exists, authed write persists, server read-back returns the value); this file records
the one browser confirmation that still wants a human eye, to be run in a single pass once the build
is complete.

**How to read it.** Each item states: the feature + PR, the backend proof already standing, and the
one thing to look at in the browser. `Functional` = backend-proven, browser just confirms wiring.
`Visual` = needs Jason's design judgment, no backend proxy. The list grows as features land.

---

## Regulations surface

### 1. Dismissed-item recovery drawer (PR #260) — `Functional`
- **Backend proof:** `restoreDismissed(id)` → `persistOverride({dismissedAt:null},"POST")`; PPWR
  un-dismissed and read-back confirmed (`dismissed_at` null; `visible_in_regulations=true`).
  `DismissedStash` mounted in `RegulationsLedger.tsx`.
- **Browser check:** On `/regulations`, dismiss any regulation from its detail view → it leaves the
  active ledger and appears in the **Dismissed** drawer with a "↺ Restore" control → click Restore →
  it returns to the active ledger. (PPWR itself should already be visible in the active ledger.)

### 2. Surface-routing guard (PR #261) — `Functional`
- **Backend proof:** `canonicalDomainOverride` at the mint chokepoint (5 unit tests green);
  `surface-visibility-audit` invariant live. PPWR on domain 1; the 5 re-routed market signals now
  on domain 4.
- **Browser check:** PPWR ("EU PPWR 2025/40") renders on `/regulations`. The 5 re-routed signals —
  Maritime Singapore Blueprint, Singapore Green Finance (MAS + MPA), California CSFAP, California
  RPS CP4 — now render on `/market` (Market Intel), **not** `/regulations`.

### 3. Reclassified-to-source cleanup (2026-07-08 disposition) — `Functional`
- **Backend proof:** 28 institution/portal items archived (`reclassified_to_source`), read-back
  confirmed; their `active` source rows retained. Snapshot + reversal recorded.
- **Browser check:** These institutional shells no longer appear as **items** on any surface — e.g.
  "World Bank Transport", "IPCC Climate Reports", "IEA Policies & Measures", "UK DEFRA", "GEF" are
  gone from the listings — while the same institutions remain monitored **sources** in
  `/admin → Source Health`.

## Cross-surface

### 4. NotesField happy-path — `Functional`
- **Backend proof:** per-item note write via `persistOverride` (notes column) with server read-back.
- **Browser check:** open an item, add a note, reload the page → the note persists; run the note
  template E2E once in-session.

### 5. Redesign templates T01–T11 — `Visual`
- **Backend proof:** all 11 template components exist, are mounted on their surfaces, and the
  production build is green (recon: `docs/audits/redesign-completeness-2026-07-08.md`).
- **Browser check:** walk each surface and confirm the rebuilt template renders as intended
  (masthead, card heads, brief-section typography per the design system — Anton scoped to
  masthead/`.card-head h3`/`.brief-section h3` only). Any drift → DESIGN-DEVIATIONS fix-forward,
  not a blocker.

---

## Related
- [[flip-readiness-2026-07-08]] — the cadence switch (ready on Jason's word; not on this list, not a task)
- [[deletion-reclassification-log]] — the 28-item reclassify audit trail behind check #3
- [[redesign-completeness-2026-07-08]] — the recon behind check #5
