# Rendering guard (SF-10) — day-one followups

Registered 2026-07-11 when the `rendering-guard` browser leg (PR #273) went RED on its first CI run.
This is the guard's **first catch** — recorded here, red-then-green proof comes free.

## Classification of the first CI failure

**Category (a) REAL MEASUREMENT — not infra.** Playwright + chromium installed and ran; the fixtures
are static/committed (no live-DB dependency, correct for the secret-less lane); the browser rendered
and measured `timeline-capped@380 [L-1]: timeline-labels +11px` horizontal overflow. It passed locally
(Windows chromium) and failed in CI (Linux chromium).

**Root cause: fixture fidelity + cross-OS font non-determinism — NOT a confirmed production defect.**
1. The `timeline-labels` GREEN fixture reproduces the real `InteractiveTimeline` label row
   (`src/components/regulations/RegulationDetailSurface.tsx` `InteractiveTimeline`, ~L897) as a
   `display:flex; justify-content:space-between` row of min-content year buttons. The **real** strip
   uses **absolute-positioned** nodes/labels on a percentage track (margin 40px) — a different overflow
   mechanism. The flex approximation flow-overflows in a way the real absolute layout does not.
2. The fixture declares `--font-sans:'Plus Jakarta Sans', system-ui, sans-serif` but does **not** bundle
   the web font, so each OS renders the fallback. Linux CI's fallback digit glyphs are ~11px wider than
   Windows' across the 8 year-labels at 380px → tips into overflow in CI, fits on Windows. A build gate
   that depends on the runner's font stack is non-deterministic — disqualifying until fixed.

The RED reconstructions overflow by 600–1200px (nowrap URL +1175, uncapped strip +657), so the
detection discrimination is intact; the +11px sits 50–100× below any real defect — it is font-metric
noise on an approximated layout, not a product overflow.

## Policy applied (operator, 2026-07-11)

The `rendering-guard` job is set **`continue-on-error: true`** (always-on, NON-BLOCKING — the
data-audit-lane / SOFT pattern). It does **not** enter the required-check set until **3 consecutive
green runs on master** post-merge. The pure detector core (`assertions.test.mjs`, 8/8) remains a
REQUIRED gate in the `Discipline engine unit tests` job, so the detection logic gates today; only the
supplementary real-browser layer is non-blocking while it stabilizes.

## Next actions (owned, not parked)

- [ ] **NA-1 — deterministic fixture font.** Bundle a fixed font (or a metric-locked stack that is
  identical on Windows + Linux CI) into the fixtures so `scrollWidth` is reproducible cross-OS. Removes
  the font-fallback variance that made the gate non-deterministic.
- [ ] **NA-2 — fidelity: reproduce the real timeline layout.** Rebuild the `timeline-labels` fixture to
  the real absolute-positioned-on-%-track mechanism (labels absolute, don't flow-overflow the card), so
  it measures what production actually renders; the RED case overflows via the uncapped node run, matching
  the actual L-1 defect it protects against.
- [ ] **NA-3 — real-strip verification @380px.** Confirm the live `InteractiveTimeline` at 380px under the
  **production** Plus Jakarta Sans (not a fallback) does not visually overflow the card — route to the
  named live-data mobile E2E extension the guard already flagged as not-yet-built.
- [ ] **NA-4 — earn required status.** After NA-1/NA-2 land and the job is green, watch for 3 consecutive
  green runs on master, then add `rendering-guard` to branch-protection required checks.

Owner: orchestrator (folds into the layout/chrome lane, after the disposition engine per the standing
sequence). Related: [[ADR-012-intake-cadence-and-launch-exit-test]] (the launch exit test's
"overflow/hydration guard green including mobile tiers" clause depends on NA-1..NA-3 closing).
