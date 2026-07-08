# Cadence / Loop Flip — Readiness Statement (2026-07-08)

> **STANDING SWITCHES — not tasks, not blockers, not "awaiting" items (dispatch 2026-07-08, Correction 2).**
> Three items are ready-when-Jason-wants and must never appear on a TODO / close-out / status board:
> **Cadence/loop** — ready to flip on Jason's word, post-build, no work outstanding (technical
> precondition satisfied). **Batch-1** — go-line ready; quote on request. **Budget** — number set on
> request ($50/mo recommended). Nothing in the build is gated on any of the three.

This statement records that the technical precondition is met; it does not flip anything and does not
represent pending work. The flip itself is Jason's switch to throw on his own schedule.

## The three preconditions

| # | Precondition | Status | Evidence |
|---|--------------|--------|----------|
| i | **Intake gate LIVE** | ✅ **SATISFIED** | #208 reland (mint-item.ts single chokepoint, both mint paths) + migration 146 APPLIED + F13 bypass-proof green + ACTIVE_PHASE flipped to `phase-intake-gate` via #218 (C5 3/0). |
| ii | **Jason's explicit word** | 🎚️ switch (ready) | Operator-only; not a task. Nothing technical blocks it. |
| iii | **Jason's sequence — after the site update** | 🎚️ switch (ready; build done) | The site update = the redesign. Recon 2026-07-08 (see `docs/audits/redesign-completeness-2026-07-08.md`): **all 11 templates rebuilt + live on master** (02 #205, 01/03/05/06/07/09 #215, 04/08/11 #219, 10 #223, 11 sign-off #227). No template build remains. What's left is Jason's visual review; any drift lands in DESIGN-DEVIATIONS as fix-forward, none blocks the flip. |

**Bottom line:** precondition (i) is met and proven. The only remaining distance is (ii) + (iii) —
both operator go-lines. When Jason gives the word and confirms the site is where he wants it, the
flip has no technical blocker.

## What the flip turns on (all built, dormant, waiting only on the flip)

- **change → regenerate**: check-sources fingerprints changes (P2-6, mig 161); the regenerate
  consumer is wired behind the loop gate.
- **candidate classify → stage**: portal deep-link discovery fills `portal_link_candidates` (P2-5,
  mig 162); the classify→stage consumer rides the flip.
- **approve → generate**: staged-update approval mints + generates (dormant behind `isGloballyPaused`
  since #237).
- **scrape cadence**: the check-sources worker runs on scheduled days once cadence ≠ 'off'.

All of the above are gated by BOTH `global_processing_paused` / `scrape_cadence='off'` AND the
worker-auth + scrape-window gates. Zero live effect until Jason flips.

## What still holds regardless of the flip (doctrine)

- Zero mints of NEW intake until cadence (regeneration of existing items is fine — intake gate live).
- Scrape hold LIVE (zero fetches) until Jason's explicit scrape go-line.
- Batch-1 + budget: standing switches (see the box at top) — ready on Jason's word, never a blocker.
- Spend through the chokepoint, ticketed + ledgered; prompt-cache lands before paid backfills.
