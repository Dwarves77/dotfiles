# Redesign Completeness Audit — 2026-07-08

**Trigger.** The build-to-completion dispatch assumed "redesign at 2 of 11 templates" and ordered a
continuous build of the remaining nine. Recon-first (reuse-before-construction) found that premise
stale: **all 11 templates are rebuilt and live on master.** No template build remains; this records
the evidence so the stale figure does not drive a wasteful blind rebuild.

## All 11 templates — REBUILT and mounted

| # | Template | Live component (mounted by route) | Landed via |
|---|----------|-----------------------------------|-----------|
| 01 | Dashboard | `home/HomeSurface.tsx` (via `app/page.tsx`) | #215 |
| 02 | Regulations index (archetype) | `regulations/RegulationsLedger.tsx` | #205 |
| 03 | Regulation detail (archetype) | `regulations/RegulationDetailSurface.tsx` (`[slug]/page.tsx:217`) | #215 (branch `ea214ff`) |
| 04 | Market Intel | `market/MarketIntelLedger.tsx` — real RPCs `get_market_intel_items` + `get_surface_counts` (migs 148/149) | #219 |
| 05 | Signal detail | `pages/MarketSignalDetailSurface.tsx` | #215 |
| 06 | Research | `research/ResearchLedger.tsx` | #215 |
| 07 | Operations | `operations/OperationsLedger.tsx` | #215 |
| 08 | Admin | `admin/AdminDashboard.tsx` + `admin/redesign/*` | #219 |
| 09 | Map | `map/MapPageView.tsx` (redesign chrome; real Leaflet basemap kept per §6.9) | #215 |
| 10 | Account | `pages/SettingsPage.tsx` (via `app/settings` + `/profile`) | #223 |
| 11 | Community | `community/CommunityRooms.tsx` | #219 (+#227 verifier sign-off, #209 schema-map) |

## T03 — the flagged "superseded-not-merged" gap is NOT a gap

`RegulationDetailSurface.tsx` is rebuilt to "Pages - 03 Regulation Detail.dc.html" (§6.2) and is the
component `app/regulations/[slug]/page.tsx` mounts. PR #204 closed-not-merged is a red herring: the
T03 work reached master via the integration path — feature branch `feat/redesign-t03-regulation-detail`
(rebuild commit `ea214ff`) merged into `redesign/integration`, shipped as **PR #215**. The detail
archetype is live and is explicitly reused by T05 (Signal detail) and the Research finding detail.

## Design system (shared, semantic-token-only)

- `src/app/theme.css` — semantic tokens + additive redesign blocks (T02 banded-ledger hues/tints/4px
  gradient strips, T03/T07/T11 token blocks, T02/T10 editorial dark variants).
- `src/app/globals.css` — unified card system (`.cl-card`/`.cl-stat-card`/`.cl-row-card`) + type scale.
- Archetypes: T02 banded ledger (reused by T04/T06); T03 detail scaffold (reused by T05/Research detail).

## Residual (fix-forward, not blocking)

- **DESIGN-DEVIATIONS.md is empty** — no logged pixel deviations from the eleven builds. Any visual
  drift Jason spots on review lands there as a proposal + a fix-forward PR (per the review-after-push
  model); none blocks the cadence flip.
- **Browser-only verification** (Jason's close-out list): NotesField happy-path + any per-template
  E2E that needs a real session. These are visual/session confirmations, not build work.

## Verdict

Redesign build is **COMPLETE (11/11)**. The "site update" the flip sequence waits on is done on the
build side; what remains is Jason's visual review + his go-lines. No template work is outstanding.
