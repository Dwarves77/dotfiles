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
