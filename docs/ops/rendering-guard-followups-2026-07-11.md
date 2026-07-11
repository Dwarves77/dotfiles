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

Operator fix-direction (2026-07-11): **a guard that tests a facsimile certifies the facsimile.** So the
direction is not "tolerate the +11px" — it is **bundle the real font and render the real component**, and
make the HARD assertions structural (pixels informational).

- [ ] **NA-0 — hard assertions are STRUCTURAL, pixel deltas informational.** Cross-OS text measurement
  always carries a small tolerance band, so the guard's pass/fail must key on structural truths
  (`scrollWidth <= clientWidth`, no placeholder literal rendered, no hydration error) — NOT on absolute
  pixel widths. Report pixel deltas as information. This makes 3-consecutive-greens achievable WITHOUT
  loosening what actually matters (the RED cases still overflow structurally by 600–1200px). Landed as the
  SF-10 assertion-class residual.
- [ ] **NA-1 — bundle the real font.** Embed Plus Jakarta Sans (the production font) into the fixture
  environment (base64 `@font-face`) so text metrics are the PRODUCTION metrics on every OS — not a
  fallback. Removes the font-fallback variance at its root rather than papering it with a tolerance.
- [ ] **NA-2 — render the REAL component, not an approximation.** Replace the flex `timeline-labels`
  facsimile with the actual absolute-positioned-on-%-track `InteractiveTimeline` layout (ideally by
  rendering the real `.tsx` in the browser fixture), so the guard measures what production renders. A
  facsimile-based guard certifies the facsimile, not the product.
- [ ] **NA-3 — real-strip verification @380px** under the bundled production font — folds into NA-1/NA-2
  once the real component + real font render together; the full-page E2E under auth+live-data remains the
  named not-yet-built extension.
- [ ] **NA-4 — earn required status.** After NA-0/NA-1/NA-2 land and the job is green, watch for 3
  consecutive green runs on master, then add `rendering-guard` to branch-protection required checks.

Owner: orchestrator (folds into the layout/chrome lane, after the disposition engine per the standing
sequence). Related: [[ADR-012-intake-cadence-and-launch-exit-test]] (the launch exit test's
"overflow/hydration guard green including mobile tiers" clause depends on NA-1..NA-3 closing).
