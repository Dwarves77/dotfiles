# Handoff 2026-09-06 — Caro's Ledge UI system

Design package for the site-wide UI overhaul. Produced by Claude Design from
`docs/design/audit-2026-09-06/` (README, CONTACT-SHEET, ASSESSMENT parts A–E, tokens.txt).

| File | What it is |
|---|---|
| `README.md` | The spec. System definition, frame rules, component definitions, per-screen table, design tokens, codebase constraints. Read this first and in full. |
| `screens/` | 20 full-height PNG renders — `00-system-sheet` plus artboards 1–17 and the two open option turns. The reference for what to build. |
| `Caros Ledge UI System.dc.html` | The canvas the renders came from. Open in a browser to inspect exact geometry, hover states and spacing. Prototype only. |
| `support.js` | Runtime for opening the canvas locally. Not for production. |

## Rules for lanes working from this package

1. **Build the shared parts first, from `screens/00-system-sheet.png` and the README's
   component section. Then assemble pages from those parts.** Do not migrate one page at a
   time onto new values — that is the documented cause of the last two drifts
   (ASSESSMENT §15).
2. **The images are the specification for layout and geometry.** Where the README's prose and
   an image disagree, the image wins; report the conflict rather than guessing.
3. **Copy is not specified by this package** unless the README says so. Keep the app's
   current approved wording inside the specified layout. Artboard 16 (auth) copy is
   explicitly placeholder.
4. **The nav footer has no section heading.** Two unlabelled rows below a divider: Account
   (workspace name right-aligned) and Admin (OWNER badge). "Operator" in the README names the
   group, not a rendered label.
5. **Desktop only in this package.** 1440px frame, nav 252px, content 778px, rail 300px.
   Mobile 390 and tablet 1024 artboards are not in this bundle.
6. **Do not read** `docs/design/redesign/` or `design_handoff_2026-04/DESIGN_SYSTEM.md`. Both
   are superseded; the first instructs agents that "the mock wins" and it does not.
7. Features present in the app but absent from these 17 artboards have been triaged by
   Claude Design (overlay, secondary page in the same frame, section inside an existing
   detail architecture, or fold into an existing component). Ask before building or removing
   any of them from a page.

## Open decisions

- Artboard 19 — the masthead line: four candidates, currently rendering the band-proportion
  gradient rule. Confirm before build.
- Artboard 18 — section treatment on the page: four candidates, one to be applied everywhere.
  **CLOSED by Claude Design rulings 5.1/5.2 (operator, 2026-09-07):** SectionRule (3px, full card
  width, top edge, no radius, `linear-gradient(90deg,#5A5552,#5A5552 22%,rgba(90,85,82,.18))`) is
  the answer everywhere except the three BandGradientRule homes (sidebar nav cap, mobile drawer,
  TopBar mobile bar). Sitewide rollout is IN PROGRESS, not complete — see GAP G1 below.

## Open items (NOT YET DONE)

- **Rendering-guard 375px exemptions, addendum item 8 (lane uiactions, 2026-09-07).** Per operator
  ruling, six dated per-page rendering-guard exemptions were added at
  `fsi-app/.discipline/rendering/exemptions-375.mjs`, covering the five list pages the ruling names
  (`regulations-list`, `market-list`, `research-list`, `operations-list`, `watchlist`) plus `map`
  (coordinator-extended, operator confirmation pending — the ruling itself names only the five list
  pages). All six are dated 2026-09-07 and expire at train wave 58, or sooner the moment a real
  mobile-390 fixture exists and 375px coverage is actually implemented for that page — whichever
  comes first. This is a per-page, dated exemption, never a global 375px relaxation, and no CSS
  changed. Full detail in `DEVIATION-LOG.md`'s corresponding row. Still open: (1) operator
  confirmation that `/map`'s inclusion is correct; (2) the exemptions themselves lapse at wave58 and
  will need either real mobile-390 fixtures/implementation by then, or a re-ruling to extend them.
- **`/regulations/[slug]` and the other three `[slug]` detail routes cannot be screenshotted in this
  sandbox (lane uiactions, 2026-09-07, third confirmation).** No live/reachable Supabase project;
  `fetchIntelligenceItem` calls `notFound()` with no static-seed fallback for a single detail record,
  under every credential combination tried (placeholder anon key alone, and placeholder anon key +
  placeholder service-role key). Needs a follow-up run against a real/seeded Supabase project before
  any `[slug]` artboard comparison can be performed.
- **`ResearchFindingDetailSurface.tsx`'s `knownSections`-present branch has no attach point for the
  "Full brief" depth switch's revealed content** (lane uiactions, 2026-09-07) — see `DEVIATION-LOG.md`.
- **Mobile 390 and tablet 1024 artboards: not designed, and the files have not reached the repo or
  any connected folder yet.** Ruling R10's own queue is overlays, then mobile 390, then the
  community thread page, then the settings section index artboards. The operator has stated the
  mobile 390 artboards exist (`20-mobile-390.png` plus an updated HANDOFF/README) but they have not
  arrived in this repo or any connected folder as of this train. No responsive rules are invented in
  the meantime (R10); the rendering guard's six dated 375px exemptions above stand in until real
  artboards land. Mobile is deferred to train 56.
- **Community thread page: not designed** (R10's queue, third item, after overlays and mobile 390).
  No artboard exists yet; nothing has been built or removed for it.
- **Overlays: not designed** (R10's queue, first item). "Open decisions" above already names two of
  the underspecified pieces (masthead line, section treatment); overlays as a class (sign-out's
  home, popovers, modals) remain unspecified pending R10's own queue.
- **Onboarding's 4th "Briefing" step: no ruling yet** (addendum item 10, 2026-09-07). Left exactly
  as-is by lane uisettings2; not built, not removed. Stays open on the operator's own open-questions
  list (R7).
- **Settings section index (R9) was built ahead of R10's queue.** R9 (2026-09-07) ruled the five/six
  second-level Settings items become one `SectionIndex` row (built by lane uiadmin2, extended by
  lane uisettings2 for Notifications, addendum item 7), landed and live. R10, recorded the same
  date, separately lists "the settings section index artboards" as the LAST item in the
  not-yet-designed queue (after overlays, mobile 390, community thread). The two rulings are not
  contradictory on outcome (R9 specifies the shape in prose; R10 is about artboards not yet
  existing for it), but the section index is now built without ever having had its own artboard,
  flagged here for the operator to confirm the built shape matches what the eventual artboard will
  show, rather than silently trusting prose-only R9 forever.

- **GAP G1 (TRAIN-57, 2026-09-07): SectionRule sitewide rollout is PARTIAL, not complete.** Mounted
  this train: `DetailShell.tsx` (all 8 card sites: DetailHeader, DetailExposure, DetailTimeline,
  DetailSection, AtAGlanceCard, RailLegend, ImpactRailCard, InThisListStat), `Masthead.tsx` (closes
  ruling 5.2's explicit "masthead" mention, which the uxfix-system lane's own 5.2 audit had not
  caught), `ListSurfaceShell.tsx`'s `Card` (covers all four ledgers, with a `noRule` opt-out for the
  per-band card whose `BandSectionHeader` already carries a band-colour top accent), `AccountCard`
  (`AccountPrimitives.tsx`), `MapPageView.tsx`'s `Card`/`CardHead`, `WatchlistSurface.tsx`'s card.
  **NOT reached, still carrying a plain border-bottom or no rule at all:** admin cards
  (`admin/redesign/*`), the community table card (`CommunityRooms.tsx` and siblings), auth/onboarding
  panels. Locked by `fsi-app/src/components/ui/SectionRule.coverage.npmtest.mjs` (a positive
  allowlist of what this train touched, explicitly not a full repo walk). Full detail in
  `DEVIATION-LOG.md`'s "GAP G1 (TRAIN-57 dispatch)" entry. Needs a follow-up lane to finish the
  remaining surfaces.
- **GAP G2 (TRAIN-57, 2026-09-07): detail-page command bar restored, CLOSED.** uxfix-detail's
  deletion of the second ask box had left all four detail surfaces (regulations, market, research,
  operations) with no command bar at all. Fixed by mounting the shared `Masthead` (via a new
  `DetailMasthead` wrapper in `DetailShell.tsx`, carrying CommandBar + VOL line + breadcrumb) on all
  four `*DetailSurface.tsx` components, per artboard 03 and ruling R4; `DetailHeader` now renders
  only chips/tags/actions (title moved fully into the Masthead mount, confirmed against the artboard
  showing the title exactly once). Verified against `detail-surfaces-smoke.mjs` at 1440.
- **GAP G3 (TRAIN-57, 2026-09-07): Anton title letter-spacing unified to 0.04em, CLOSED.** Was
  0.04em only on `Masthead.tsx`; `DetailSection`, `DetailHeader`(pre-move), and dashboard's
  `SectionHeading` were at 0.02em. Also fixed `PageMasthead.tsx`, `WatchlistSurface.tsx`, and
  `MapPageView.tsx`'s `CardHead` to the same token. Locked by
  `fsi-app/src/components/ui/AntonTitleLetterSpacing.npmtest.mjs`.
- **GAP G4 (TRAIN-57, 2026-09-07): PPWR title (audit item 1.2) re-verified live, CONFIRMED.** A new
  Playwright script (`fsi-app/.discipline/rendering/verify-ppwr-title-style.mjs`, wired as
  `npm run verify:ppwr-title-style`) mounted the exact production title
  `EU Packaging and Packaging Waste Regulation (PPWR)` / slug `eu-ppwr-2025-40` and read
  `getComputedStyle` directly: `fontFamily: "Anton, system-ui, sans-serif"`,
  `textTransform: "uppercase"`, `letterSpacing: "1.12px"` at `fontSize: "28px"` (= 0.04em). PASS.
  See `DEVIATION-LOG.md`'s "GAP G4" entry for the full computed-style record.

- **`OrganizationsTable` has no artboard, train 58 (2026-09-07).** Mounted inside
  `AdminDashboard.tsx`'s Workspaces section (`src/components/admin/OrganizationsTable.tsx`); no
  artboard in this handoff shows the Workspaces section's expanded body, so per this train's own
  dispatch (step 2b: "no artboard shows it; leave it exactly as is... do not invent a spec") it was
  left untouched — no spec written, no geometry changed. Needs a Claude Design artboard for the
  Workspaces/Organizations table before any audit spec or fix lane can be dispatched against it.

## Regenerating the built screenshots

`docs/design/handoff-2026-09-06/built/*.png` are Playwright captures of the live surfaces, taken
for comparison against the design package. When one goes missing or stale (a page's own capture
lane could not produce it, or a component it mounts changed), regenerate it with:

```
NO_PROXY="$NO_PROXY,smoke-guard.internal" node fsi-app/.discipline/rendering/capture-detail-mobile-screenshots.mjs
```

(also wired as `npm run capture:detail-mobile-screenshots` from `fsi-app/`). It reuses the same
`RegulationDetailSurface` fixture mounts `detail-surfaces-smoke.mjs` exports for its own smoke run
(`REGULATION_ENTRY`/`REGULATION_STATES`/`ALIAS`) and the same Playwright chromium page every other
guard file uses, so a regenerated capture reflects the real component, not a hand-built stand-in.
It currently produces `built/m-detail-390.png` and `built/m-detail-375.png` (mobile 390/375
widths) and is the documented way to regenerate those two files; extend it with more `[width,
state]` pairs rather than writing a parallel one-off capture script. `NO_PROXY` must include
`smoke-guard.internal` or the page's in-process API stubbing cannot reach the guard harness (see
the `DEVIATION-LOG.md` entry directly above the F10 row). The script is reachable via
`fsi-app/package.json`'s `scripts` section, which F25 (module-liveness) reads as a dispatch root
(`findDispatchRoots` Source 2) — it needs no `LEGACY_ALLOWLIST` entry and carries none; confirmed
by a clean `node .discipline/fitness/runner.mjs` run (0 violations, F25 green) this train.
