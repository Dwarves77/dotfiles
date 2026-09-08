# Site-wide layout guard — first full run (2026-09-08)

GENERATED FILE. Regenerated in full by `node fsi-app/.discipline/rendering/layout-guard/run-layout-guard.mjs`
(`npm run audit:layout`). Do not hand-edit: change the rule or the allowlist and rerun.

- Routes: 18 (17 artboards; /login and /signup share artboard 16)
- Widths: 1440, 1024
- Measurements taken: 36
- Findings: 783

`[CONFIRMED]`: every row below is a measurement taken this run in a real chromium against the
real `src/components/**` modules, not a source read. The rules are the operator's L1-L12
(SITE-WIDE LAYOUT GUARD, 2026-09-08), verbatim where they are mechanical and with the decision
stated in `rules.mjs` where his text needed one.

## By rule

| Rule | Provenance | Findings | Routes |
|---|---|---|---|
| L1 | new | 16 | /regulations/[slug]@1440, /market/[slug]@1440, /research/[slug]@1440, /operations/[slug]@1440, /community@1440, /community@1024, /admin@1440, /admin@1024, +1 more |
| L2 | extended (assertions.mjs detectBoundsViolations: row/cell containment → every layout-box pair) | 85 | /admin@1024, /settings@1440, /settings@1024 |
| L3 | already covered (audit/overflow-sweep.mjs, ux-assert detectClippedOverflow) + new card-vs-column clause | 0 | — |
| L4 | new | 1 | /admin@1024 |
| L5 | new | 0 | — |
| L6 | new | 124 | /regulations@1440, /regulations@1024, /regulations/[slug]@1440, /regulations/[slug]@1024, /market@1440, /market@1024, /market/[slug]@1440, /market/[slug]@1024, +14 more |
| L7 | new | 222 | /regulations/[slug]@1440, /regulations/[slug]@1024, /market@1440, /market@1024, /market/[slug]@1440, /market/[slug]@1024, /research@1440, /research@1024, +22 more |
| L8 | new (rendered text, not source text) | 0 | — |
| L9 | extended (ux-assert detectSmallTargets is the law-2 mobile floor; L9 is the site-wide floor, reusing boxGap) | 241 | /regulations@1440, /regulations@1024, /regulations/[slug]@1440, /regulations/[slug]@1024, /market@1440, /market@1024, /market/[slug]@1440, /market/[slug]@1024, +26 more |
| L10 | new | 94 | /@1440, /@1024, /regulations@1440, /regulations@1024, /regulations/[slug]@1440, /regulations/[slug]@1024, /market@1440, /market@1024, +22 more |
| L11 | already covered (ux-assert detectClippedText, lane opsclip) — called, not restated | 0 | — |
| L12 | new | 0 | — |

## By route

| Route | Width | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | L10 | L11 | L12 | total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/` | 1440 | · | · | · | · | · | · | · | · | · | 1 | · | · | 1 |
| `/` | 1024 | · | · | · | · | · | · | · | · | · | 1 | · | · | 1 |
| `/regulations` | 1440 | · | · | · | · | · | 4 | · | · | 6 | 4 | · | · | 14 |
| `/regulations` | 1024 | · | · | · | · | · | 4 | · | · | 6 | 4 | · | · | 14 |
| `/regulations/[slug]` | 1440 | 2 | · | · | · | · | 12 | 6 | · | 1 | 5 | · | · | 26 |
| `/regulations/[slug]` | 1024 | · | · | · | · | · | 12 | 6 | · | 1 | 5 | · | · | 24 |
| `/market` | 1440 | · | · | · | · | · | 4 | 6 | · | 6 | 5 | · | · | 21 |
| `/market` | 1024 | · | · | · | · | · | 4 | 6 | · | 6 | 5 | · | · | 21 |
| `/market/[slug]` | 1440 | 2 | · | · | · | · | 12 | 6 | · | 1 | 6 | · | · | 27 |
| `/market/[slug]` | 1024 | · | · | · | · | · | 12 | 6 | · | 1 | 6 | · | · | 25 |
| `/research` | 1440 | · | · | · | · | · | 3 | 8 | · | 4 | 4 | · | · | 19 |
| `/research` | 1024 | · | · | · | · | · | 3 | 8 | · | 4 | 4 | · | · | 19 |
| `/research/[slug]` | 1440 | 2 | · | · | · | · | 6 | 2 | · | 1 | 5 | · | · | 16 |
| `/research/[slug]` | 1024 | · | · | · | · | · | 6 | 2 | · | 1 | 5 | · | · | 14 |
| `/operations` | 1440 | · | · | · | · | · | 4 | 34 | · | 22 | 3 | · | · | 63 |
| `/operations` | 1024 | · | · | · | · | · | 4 | 34 | · | 22 | 3 | · | · | 63 |
| `/operations/[slug]` | 1440 | 2 | · | · | · | · | 6 | 2 | · | 4 | 7 | · | · | 21 |
| `/operations/[slug]` | 1024 | · | · | · | · | · | 6 | 2 | · | 4 | 7 | · | · | 19 |
| `/map` | 1440 | · | · | · | · | · | · | 8 | · | 11 | 1 | · | · | 20 |
| `/map` | 1024 | · | · | · | · | · | · | 8 | · | 11 | 1 | · | · | 20 |
| `/watchlist` | 1440 | · | · | · | · | · | 4 | · | · | 2 | 2 | · | · | 8 |
| `/watchlist` | 1024 | · | · | · | · | · | 4 | · | · | 2 | 2 | · | · | 8 |
| `/community` | 1440 | 1 | · | · | · | · | 6 | 8 | · | 8 | 1 | · | · | 24 |
| `/community` | 1024 | 1 | · | · | · | · | 6 | 8 | · | 8 | 1 | · | · | 24 |
| `/admin` | 1440 | 3 | · | · | · | · | · | 15 | · | 1 | 1 | · | · | 20 |
| `/admin` | 1024 | 2 | 3 | · | 1 | · | · | 15 | · | 4 | 1 | · | · | 26 |
| `/profile` | 1440 | · | · | · | · | · | 1 | 4 | · | 3 | 1 | · | · | 9 |
| `/profile` | 1024 | · | · | · | · | · | 1 | 4 | · | 4 | 1 | · | · | 10 |
| `/settings` | 1440 | 1 | 35 | · | · | · | · | 8 | · | 36 | 1 | · | · | 81 |
| `/settings` | 1024 | · | 47 | · | · | · | · | 8 | · | 51 | 1 | · | · | 107 |
| `/login` | 1440 | · | · | · | · | · | · | 1 | · | 2 | · | · | · | 3 |
| `/login` | 1024 | · | · | · | · | · | · | 1 | · | 2 | · | · | · | 3 |
| `/signup` | 1440 | · | · | · | · | · | · | 1 | · | 1 | · | · | · | 2 |
| `/signup` | 1024 | · | · | · | · | · | · | 1 | · | 1 | · | · | · | 2 |
| `/onboarding` | 1440 | · | · | · | · | · | · | 2 | · | 2 | · | · | · | 4 |
| `/onboarding` | 1024 | · | · | · | · | · | · | 2 | · | 2 | · | · | · | 4 |

## Routing: who owns each group of findings

The shared parts this lane owns are FIXED (see the lane report and DEVIATION-LOG.md). Everything
below belongs to a part another lane is actively rewriting; naming the owner here is what lets the
coordinator route it instead of two lanes editing one file.

| Rule / route | Owning part | Note |
|---|---|---|
| `L1@/admin` | the admin frame (AdminDashboard.tsx `admin-t08-grid`) | the operator's own root cause, 2026-09-08: gap 24 not 28, no frame padding, and an explicit width:768px on the content column. Do NOT fix here — the admin frame is being rewritten. |
| `L1@/regulations/[slug]` | the detail shell (DetailShell.tsx `.cl-detail-layout`) | gap 24 not 28 and no frame padding, on all four detail routes. Adopt <PageFrame/>. |
| `L1@/market/[slug]` | the detail shell (DetailShell.tsx `.cl-detail-layout`) | same frame, same finding. |
| `L1@/research/[slug]` | the detail shell (DetailShell.tsx `.cl-detail-layout`) | same frame, same finding. |
| `L1@/operations/[slug]` | the detail shell (DetailShell.tsx `.cl-detail-layout`) | same frame, same finding. |
| `L1@/community` | CommunityRooms.tsx `.cl-community-grid` | no frame padding at all. Adopt <PageFrame/>. |
| `L1@/settings` | SettingsPage.tsx `.cl-settings-columns` | padding 18px 40px 0 against artboard p15's 18px 40px 40px. NOT fixed here: the page splits its frame into two stacked regions and the second carries the bottom padding, so the correct value is a composition question for the settings lane, not a one-number edit. |
| `L2@/admin` | the admin frame (AdminDashboard.tsx) | overlapping action buttons at 1024, downstream of the same unconstrained content column. |
| `L2@/settings` | SettingsPage.tsx | a wrapped chip row overlapping the Save control. |
| `L4@/admin` | the admin frame (AdminDashboard.tsx) | the operator's T1-T8 strip: 387px of content past the right edge of a horizontal scroller that is not a table card. His ruling 3 removes the strip entirely. |
| `L6` | the surface that draws the card | a card missing part of its chrome. Every one is a card drawn locally rather than mounted from components/ui/Card.tsx; adopting the shared Card is the fix and it is one import per site. The detail sections (DetailShell.tsx) are the largest group. |
| `L7` | the component that draws the display type | Anton outside the operator's six. The six are declared by the shared components that draw them (data-guard-display); a part that is legitimately one of the six adds the attribute, a part that is not stops using Anton. DetailShell's section h2 (a card title) and the market figures (a headline figure) are the two largest groups. |
| `L9` | the control's own component | targets under the 44/28 floor. The shared parts in this lane's reach are fixed (CardFoot, StateNote, DashboardRailCard); the rest are filter chips, list-surface controls and detail links owned by the lanes rewriting them. |
| `L10` | the surface that renders the card | a card the artboard does not draw. Either remove it, or the operator rules it in and it takes a dated deviation entry (route, card, reason, expiry) in manifests.mjs. |

## Findings

### L1 — 16 finding(s)

| Route | Width | Element | Measured |
|---|---|---|---|
| `/regulations/[slug]` | 1440 | div.cl-detail-layout[@media (max-width: 1280px) { .] | column-gap 24px, expected 28px |
| `/regulations/[slug]` | 1440 | div.cl-detail-layout[@media (max-width: 1280px) { .] | padding 0px 0px 0px, expected 20px 40px 40px |
| `/market/[slug]` | 1440 | div.cl-detail-layout[@media (max-width: 1280px) { .] | column-gap 24px, expected 28px |
| `/market/[slug]` | 1440 | div.cl-detail-layout[@media (max-width: 1280px) { .] | padding 0px 0px 0px, expected 20px 40px 40px |
| `/research/[slug]` | 1440 | div.cl-detail-layout[@media (max-width: 1280px) { .] | column-gap 24px, expected 28px |
| `/research/[slug]` | 1440 | div.cl-detail-layout[@media (max-width: 1280px) { .] | padding 0px 0px 0px, expected 20px 40px 40px |
| `/operations/[slug]` | 1440 | div.cl-detail-layout[@media (max-width: 1280px) { .] | column-gap 24px, expected 28px |
| `/operations/[slug]` | 1440 | div.cl-detail-layout[@media (max-width: 1280px) { .] | padding 0px 0px 0px, expected 20px 40px 40px |
| `/community` | 1440 | div.cl-community-grid[@media (max-width: 1100px) { .] | padding 0px 0px 0px, expected 20px 40px 40px |
| `/community` | 1024 | page frame | no grid container found inside <main> |
| `/admin` | 1440 | div.admin-t08-grid[Workspaces1Organizations, memb] | column-gap 24px, expected 28px |
| `/admin` | 1440 | div.admin-t08-grid[Workspaces1Organizations, memb] | padding 0px 0px 0px, expected 20px 40px 40px |
| `/admin` | 1440 | div[Workspaces1Organizations, memb] | width: 768px |
| `/admin` | 1024 | div.admin-t08-grid[Workspaces1Organizations, memb] | grid-template-columns: 352px 300px (2 tracks) |
| `/admin` | 1024 | div[Workspaces1Organizations, memb] | width: 352px |
| `/settings` | 1440 | div.cl-settings-columns[@media (max-width: 1100px){ .c] | padding 18px 40px 0px, expected 18px 40px 40px |

### L2 — 85 finding(s)

| Route | Width | Element | Measured |
|---|---|---|---|
| `/admin` | 1024 | button[Approve] × a[Account] | overlap 48.5×14px (a at 701,995.3 89×44; b at 701,995.4 48.5×14) |
| `/admin` | 1024 | button[Approve] × button[Refresh] | overlap 84.5×17.9px (a at 701,995.3 89×44; b at 701,1021.4 84.5×44) |
| `/admin` | 1024 | button[Approve] × button[Refresh] | overlap 84.5×21.6px (a at 701,1043.8 89×44; b at 701,1021.4 84.5×44) |
| `/settings` | 1440 | button[Canada] × button[Save schedule] | overlap 16.4×24.3px (a at 1231.8,693.2 70×28.5; b at 1117,673.4 131.3×44) |
| `/settings` | 1440 | button[Italy] × a[Saved searches · 0] | overlap 51.7×11.8px (a at 1117,900.2 51.7×28.5; b at 1117,916.9 266×24) |
| `/settings` | 1440 | button[Spain] × a[Saved searches · 0] | overlap 58.8×11.8px (a at 1174.7,900.2 58.8×28.5; b at 1117,916.9 266×24) |
| `/settings` | 1440 | button[Poland] × a[Saved searches · 0] | overlap 66.5×11.8px (a at 1239.5,900.2 66.5×28.5; b at 1117,916.9 266×24) |
| `/settings` | 1440 | button[Ireland] × a[Saved searches · 0] | overlap 67.9×11.8px (a at 1312.1,900.2 67.9×28.5; b at 1117,916.9 266×24) |
| `/settings` | 1440 | button[Greece] × a[Saved searches · 0] | overlap 67.4×6.3px (a at 1117,934.7 67.4×28.5; b at 1117,916.9 266×24) |
| `/settings` | 1440 | button[Greece] × a[Data summary] | overlap 67.4×16.3px (a at 1117,934.7 67.4×28.5; b at 1117,946.9 266×24) |
| `/settings` | 1440 | button[Portugal] × a[Saved searches · 0] | overlap 77.2×6.3px (a at 1190.4,934.7 77.2×28.5; b at 1117,916.9 266×24) |
| `/settings` | 1440 | button[Portugal] × a[Data summary] | overlap 77.2×16.3px (a at 1190.4,934.7 77.2×28.5; b at 1117,946.9 266×24) |
| `/settings` | 1440 | button[Romania] × a[Saved searches · 0] | overlap 77.9×6.3px (a at 1273.6,934.7 77.9×28.5; b at 1117,916.9 266×24) |
| `/settings` | 1440 | button[Romania] × a[Data summary] | overlap 77.9×16.3px (a at 1273.6,934.7 77.9×28.5; b at 1117,946.9 266×24) |
| `/settings` | 1440 | button[United Kingdom] × a[Archive] | overlap 123.9×20.8px (a at 1117,969.2 123.9×28.5; b at 1117,976.9 266×24) |
| `/settings` | 1440 | button[Nordic] × a[Archive] | overlap 64.4×20.8px (a at 1246.9,969.2 64.4×28.5; b at 1117,976.9 266×24) |
| `/settings` | 1440 | button[Morocco] × section[Saved searchesNamed filter com] | overlap 76.1×28.5px (a at 1117,1486.7 76.1×28.5; b at 308,1478.7 1092×220.5) |
| `/settings` | 1440 | button[Tunisia] × section[Saved searchesNamed filter com] | overlap 67.5×28.5px (a at 1199.1,1486.7 67.5×28.5; b at 308,1478.7 1092×220.5) |
| `/settings` | 1440 | button[Algeria] × section[Saved searchesNamed filter com] | overlap 68.3×28.5px (a at 1272.6,1486.7 68.3×28.5; b at 308,1478.7 1092×220.5) |
| `/settings` | 1440 | button[North Africa (other)] × section[Saved searchesNamed filter com] | overlap 147×28.5px (a at 1117,1521.2 147×28.5; b at 308,1478.7 1092×220.5) |
| `/settings` | 1440 | button[South Africa] × section[Saved searchesNamed filter com] | overlap 100.7×28.5px (a at 1270,1521.2 100.7×28.5; b at 308,1478.7 1092×220.5) |
| `/settings` | 1440 | button[Nigeria] × section[Saved searchesNamed filter com] | overlap 68.9×28.5px (a at 1117,1555.7 68.9×28.5; b at 308,1478.7 1092×220.5) |
| `/settings` | 1440 | button[Kenya] × section[Saved searchesNamed filter com] | overlap 62.2×28.5px (a at 1191.9,1555.7 62.2×28.5; b at 308,1478.7 1092×220.5) |
| `/settings` | 1440 | button[Ethiopia] × section[Saved searchesNamed filter com] | overlap 75×28.5px (a at 1260.2,1555.7 75×28.5; b at 308,1478.7 1092×220.5) |
| `/settings` | 1440 | button[Ghana] × section[Saved searchesNamed filter com] | overlap 63.5×28.5px (a at 1117,1590.2 63.5×28.5; b at 308,1478.7 1092×220.5) |
| `/settings` | 1440 | button[Tanzania] × section[Saved searchesNamed filter com] | overlap 78.2×28.5px (a at 1186.5,1590.2 78.2×28.5; b at 308,1478.7 1092×220.5) |
| `/settings` | 1440 | button[West Africa (other)] × section[Saved searchesNamed filter com] | overlap 142.7×28.5px (a at 1117,1624.7 142.7×28.5; b at 308,1478.7 1092×220.5) |
| `/settings` | 1440 | button[East Africa (other)] × section[Saved searchesNamed filter com] | overlap 138.4×28.5px (a at 1117,1659.2 138.4×28.5; b at 308,1478.7 1092×220.5) |
| `/settings` | 1440 | button[Central Africa] × section[Saved searchesNamed filter com] | overlap 109.5×28.5px (a at 1261.4,1659.2 109.5×28.5; b at 308,1478.7 1092×220.5) |
| `/settings` | 1440 | button[Southern Africa (other)] × section[Saved searchesNamed filter com] | overlap 168.8×5.5px (a at 1117,1693.7 168.8×28.5; b at 308,1478.7 1092×220.5) |
| `/settings` | 1440 | button[Russia] × section[Saved searchesNamed filter com] | overlap 64.6×5.5px (a at 1291.8,1693.7 64.6×28.5; b at 308,1478.7 1092×220.5) |
| `/settings` | 1440 | button[CIS (other)] × section[Data summary0Active0Archived0J] | overlap 91.5×28.5px (a at 1117,1728.2 91.5×28.5; b at 308,1723.2 1092×178.5) |
| `/settings` | 1440 | button[Kazakhstan] × section[Data summary0Active0Archived0J] | overlap 96×28.5px (a at 1214.5,1728.2 96×28.5; b at 308,1723.2 1092×178.5) |
| `/settings` | 1440 | button[Global] × section[Data summary0Active0Archived0J] | overlap 63.4×28.5px (a at 1316.5,1728.2 63.4×28.5; b at 308,1723.2 1092×178.5) |
| `/settings` | 1440 | button[IMO] × section[Data summary0Active0Archived0J] | overlap 48.4×28.5px (a at 1117,1762.7 48.4×28.5; b at 308,1723.2 1092×178.5) |
| `/settings` | 1440 | button[ICAO] × section[Data summary0Active0Archived0J] | overlap 54×28.5px (a at 1171.4,1762.7 54×28.5; b at 308,1723.2 1092×178.5) |
| `/settings` | 1440 | button[WTO] × section[Data summary0Active0Archived0J] | overlap 53×28.5px (a at 1231.4,1762.7 53×28.5; b at 308,1723.2 1092×178.5) |
| `/settings` | 1440 | button[United Nations] × section[Data summary0Active0Archived0J] | overlap 116.6×28.5px (a at 1117,1797.2 116.6×28.5; b at 308,1723.2 1092×178.5) |
| `/settings` | 1024 | button[Canada] × button[Save schedule] | overlap 16.4×24.3px (a at 439.8,1907.2 70×28.5; b at 325,1887.4 131.3×44) |
| `/settings` | 1024 | button[Pakistan] × a[Saved searches · 0] | overlap 77.3×13.3px (a at 325,2079.7 77.3×28.5; b at 325,2094.9 642×24) |
| `/settings` | 1024 | button[Sri Lanka] × a[Saved searches · 0] | overlap 82×13.3px (a at 408.3,2079.7 82×28.5; b at 325,2094.9 642×24) |
| `/settings` | 1024 | button[Singapore] × a[Saved searches · 0] | overlap 87.1×13.3px (a at 496.3,2079.7 87.1×28.5; b at 325,2094.9 642×24) |
| `/settings` | 1024 | button[Malaysia] × a[Saved searches · 0] | overlap 78.1×13.3px (a at 589.4,2079.7 78.1×28.5; b at 325,2094.9 642×24) |
| `/settings` | 1024 | button[Indonesia] × a[Saved searches · 0] | overlap 84.4×13.3px (a at 673.6,2079.7 84.4×28.5; b at 325,2094.9 642×24) |
| `/settings` | 1024 | button[Thailand] × a[Saved searches · 0] | overlap 77.4×13.3px (a at 764,2079.7 77.4×28.5; b at 325,2094.9 642×24) |
| `/settings` | 1024 | button[Vietnam] × a[Saved searches · 0] | overlap 75.5×13.3px (a at 847.4,2079.7 75.5×28.5; b at 325,2094.9 642×24) |
| `/settings` | 1024 | button[Philippines] × a[Saved searches · 0] | overlap 92.6×4.8px (a at 325,2114.2 92.6×28.5; b at 325,2094.9 642×24) |
| `/settings` | 1024 | button[Philippines] × a[Data summary] | overlap 92.6×17.8px (a at 325,2114.2 92.6×28.5; b at 325,2124.9 642×24) |
| `/settings` | 1024 | button[ASEAN (other)] × a[Saved searches · 0] | overlap 113.1×4.8px (a at 423.6,2114.2 113.1×28.5; b at 325,2094.9 642×24) |
| `/settings` | 1024 | button[ASEAN (other)] × a[Data summary] | overlap 113.1×17.8px (a at 423.6,2114.2 113.1×28.5; b at 325,2124.9 642×24) |
| `/settings` | 1024 | button[Asia (other)] × a[Saved searches · 0] | overlap 97.7×4.8px (a at 542.7,2114.2 97.7×28.5; b at 325,2094.9 642×24) |
| `/settings` | 1024 | button[Asia (other)] × a[Data summary] | overlap 97.7×17.8px (a at 542.7,2114.2 97.7×28.5; b at 325,2124.9 642×24) |
| `/settings` | 1024 | button[Australia] × a[Saved searches · 0] | overlap 80×4.8px (a at 646.3,2114.2 80×28.5; b at 325,2094.9 642×24) |
| `/settings` | 1024 | button[Australia] × a[Data summary] | overlap 80×17.8px (a at 646.3,2114.2 80×28.5; b at 325,2124.9 642×24) |
| `/settings` | 1024 | button[New Zealand] × a[Saved searches · 0] | overlap 104.4×4.8px (a at 732.3,2114.2 104.4×28.5; b at 325,2094.9 642×24) |
| `/settings` | 1024 | button[New Zealand] × a[Data summary] | overlap 104.4×17.8px (a at 732.3,2114.2 104.4×28.5; b at 325,2124.9 642×24) |
| `/settings` | 1024 | button[Pacific Islands] × a[Saved searches · 0] | overlap 112.1×4.8px (a at 842.7,2114.2 112.1×28.5; b at 325,2094.9 642×24) |
| `/settings` | 1024 | button[Pacific Islands] × a[Data summary] | overlap 112.1×17.8px (a at 842.7,2114.2 112.1×28.5; b at 325,2124.9 642×24) |
| `/settings` | 1024 | button[UAE] × a[Archive] | overlap 48.6×22.3px (a at 325,2148.7 48.6×28.5; b at 325,2154.9 642×24) |
| `/settings` | 1024 | button[Saudi Arabia] × a[Archive] | overlap 103.1×22.3px (a at 379.6,2148.7 103.1×28.5; b at 325,2154.9 642×24) |
| … | | 25 further findings, in results.json | |

### L4 — 1 finding(s)

| Route | Width | Element | Measured |
|---|---|---|---|
| `/admin` | 1024 | div[Sources views] | 387px of content past the right edge of a horizontal scroller that is not a table card (scrollWidth 737, clientWidth 350) |

### L6 — 124 finding(s)

| Route | Width | Element | Measured |
|---|---|---|---|
| `/regulations` | 1440 | div[Immediate≤ 90 daysshowing 5 of] "IMMEDIATE" | 3px top rule (measured none) |
| `/regulations` | 1440 | div[Action≤ 6 monthsshowing 5 of 9] "ACTION" | 3px top rule (measured none) |
| `/regulations` | 1440 | div[Monitor6–12 monthsshowing 4 of] "MONITOR" | 3px top rule (measured none) |
| `/regulations` | 1440 | div[Awarenessbackgroundshowing 2 o] "AWARENESS" | 3px top rule (measured none) |
| `/regulations` | 1024 | div[Immediate≤ 90 daysshowing 5 of] "IMMEDIATE" | 3px top rule (measured none) |
| `/regulations` | 1024 | div[Action≤ 6 monthsshowing 5 of 9] "ACTION" | 3px top rule (measured none) |
| `/regulations` | 1024 | div[Monitor6–12 monthsshowing 4 of] "MONITOR" | 3px top rule (measured none) |
| `/regulations` | 1024 | div[Awarenessbackgroundshowing 2 o] "AWARENESS" | 3px top rule (measured none) |
| `/regulations/[slug]` | 1440 | header[EU Emissions Trading System (ETS) extension to maritime transport] "IMMEDIATE" | top rule background rgba(0, 0, 0, 0) |
| `/regulations/[slug]` | 1440 | div[Timeline3 milestones @media (m] "TIMELINE" | top rule background rgba(0, 0, 0, 0) |
| `/regulations/[slug]` | 1440 | section#summary[SummaryGenerated · 30-second r] "SUMMARY" | top rule background rgba(0, 0, 0, 0) |
| `/regulations/[slug]` | 1440 | section#sec-3[Obligations — issues requiring] "OBLIGATIONS — ISSUES REQUIRING ACTION" | top rule background rgba(0, 0, 0, 0) |
| `/regulations/[slug]` | 1440 | section#sec-4[Compliance chainA long-form pa] "COMPLIANCE CHAIN" | top rule background rgba(0, 0, 0, 0) |
| `/regulations/[slug]` | 1440 | section#sec-8[Substantive requirementsA long] "SUBSTANTIVE REQUIREMENTS" | top rule background rgba(0, 0, 0, 0) |
| `/regulations/[slug]` | 1440 | section#penalties[PenaltiesFrom the regulatory b] "PENALTIES" | top rule background rgba(0, 0, 0, 0) |
| `/regulations/[slug]` | 1440 | section#sources[Sources1 · tier = provenance, ] "SOURCES" | top rule background rgba(0, 0, 0, 0) |
| `/regulations/[slug]` | 1440 | div[Owner & teamAssigneeUnassigned] "OWNER & TEAM" | 3px top rule (measured none) |
| `/regulations/[slug]` | 1440 | div[In this listnot in primary sou] "IN THIS LIST" | top rule background rgba(0, 0, 0, 0) |
| `/regulations/[slug]` | 1440 | div[Connections0No connections on ] "CONNECTIONS" | 3px top rule (measured none) |
| `/regulations/[slug]` | 1440 | div[Affected lanesModesOCEANJurisd] "AFFECTED LANES" | 3px top rule (measured none) |
| `/regulations/[slug]` | 1024 | header[EU Emissions Trading System (ETS) extension to maritime transport] "IMMEDIATE" | top rule background rgba(0, 0, 0, 0) |
| `/regulations/[slug]` | 1024 | div[Timeline3 milestones @media (m] "TIMELINE" | top rule background rgba(0, 0, 0, 0) |
| `/regulations/[slug]` | 1024 | section#summary[SummaryGenerated · 30-second r] "SUMMARY" | top rule background rgba(0, 0, 0, 0) |
| `/regulations/[slug]` | 1024 | section#sec-3[Obligations — issues requiring] "OBLIGATIONS — ISSUES REQUIRING ACTION" | top rule background rgba(0, 0, 0, 0) |
| `/regulations/[slug]` | 1024 | section#sec-4[Compliance chainA long-form pa] "COMPLIANCE CHAIN" | top rule background rgba(0, 0, 0, 0) |
| `/regulations/[slug]` | 1024 | section#sec-8[Substantive requirementsA long] "SUBSTANTIVE REQUIREMENTS" | top rule background rgba(0, 0, 0, 0) |
| `/regulations/[slug]` | 1024 | section#penalties[PenaltiesFrom the regulatory b] "PENALTIES" | top rule background rgba(0, 0, 0, 0) |
| `/regulations/[slug]` | 1024 | section#sources[Sources1 · tier = provenance, ] "SOURCES" | top rule background rgba(0, 0, 0, 0) |
| `/regulations/[slug]` | 1024 | div[Owner & teamAssigneeUnassigned] "OWNER & TEAM" | 3px top rule (measured none) |
| `/regulations/[slug]` | 1024 | div[In this listnot in primary sou] "IN THIS LIST" | top rule background rgba(0, 0, 0, 0) |
| `/regulations/[slug]` | 1024 | div[Connections0No connections on ] "CONNECTIONS" | 3px top rule (measured none) |
| `/regulations/[slug]` | 1024 | div[Affected lanesModesOCEANJurisd] "AFFECTED LANES" | 3px top rule (measured none) |
| `/market` | 1440 | div[Immediate≤ 90 daysshowing 5 of] "IMMEDIATE" | 3px top rule (measured none) |
| `/market` | 1440 | div[Action≤ 6 monthsshowing 5 of 6] "ACTION" | 3px top rule (measured none) |
| `/market` | 1440 | div[Monitor6–12 monthsshowing 4 of] "MONITOR" | 3px top rule (measured none) |
| `/market` | 1440 | div[Awarenessbackgroundshowing 2 o] "AWARENESS" | 3px top rule (measured none) |
| `/market` | 1024 | div[Immediate≤ 90 daysshowing 5 of] "IMMEDIATE" | 3px top rule (measured none) |
| `/market` | 1024 | div[Action≤ 6 monthsshowing 5 of 6] "ACTION" | 3px top rule (measured none) |
| `/market` | 1024 | div[Monitor6–12 monthsshowing 4 of] "MONITOR" | 3px top rule (measured none) |
| `/market` | 1024 | div[Awarenessbackgroundshowing 2 o] "AWARENESS" | 3px top rule (measured none) |
| `/market/[slug]` | 1440 | header[Packaging material input costs] "ACTION" | top rule background rgba(0, 0, 0, 0) |
| `/market/[slug]` | 1440 | div[Timeline3 milestones @media (m] "TIMELINE" | top rule background rgba(0, 0, 0, 0) |
| `/market/[slug]` | 1440 | section#summary[SummaryGenerated · 30-second r] "SUMMARY" | top rule background rgba(0, 0, 0, 0) |
| `/market/[slug]` | 1440 | section#drivers[Drivers & trajectory4 forces ·] "DRIVERS & TRAJECTORY" | top rule background rgba(0, 0, 0, 0) |
| `/market/[slug]` | 1440 | section#cost[Cost impact by modeAir · Ocean] "COST IMPACT BY MODE" | top rule background rgba(0, 0, 0, 0) |
| `/market/[slug]` | 1440 | section#donow[Do nowThe actions the workspac] "DO NOW" | top rule background rgba(0, 0, 0, 0) |
| `/market/[slug]` | 1440 | section#talking[Client talking pointsWhat the ] "CLIENT TALKING POINTS" | top rule background rgba(0, 0, 0, 0) |
| `/market/[slug]` | 1440 | section#sources[Sources1 · tier = provenance, ] "SOURCES" | top rule background rgba(0, 0, 0, 0) |
| `/market/[slug]` | 1440 | div[Your notes · visible to worksp] "YOUR NOTES · visible to workspace" | 3px top rule (measured none) |
| `/market/[slug]` | 1440 | div[In this listnot in primary sou] "IN THIS LIST" | top rule background rgba(0, 0, 0, 0) |
| `/market/[slug]` | 1440 | div[Affected lanesModesOCEANAffect] "AFFECTED LANES" | 3px top rule (measured none) |
| `/market/[slug]` | 1440 | div[Connections0No connections on ] "CONNECTIONS" | 3px top rule (measured none) |
| `/market/[slug]` | 1024 | header[Packaging material input costs] "ACTION" | top rule background rgba(0, 0, 0, 0) |
| `/market/[slug]` | 1024 | div[Timeline3 milestones @media (m] "TIMELINE" | top rule background rgba(0, 0, 0, 0) |
| `/market/[slug]` | 1024 | section#summary[SummaryGenerated · 30-second r] "SUMMARY" | top rule background rgba(0, 0, 0, 0) |
| `/market/[slug]` | 1024 | section#drivers[Drivers & trajectory4 forces ·] "DRIVERS & TRAJECTORY" | top rule background rgba(0, 0, 0, 0) |
| `/market/[slug]` | 1024 | section#cost[Cost impact by modeAir · Ocean] "COST IMPACT BY MODE" | top rule background rgba(0, 0, 0, 0) |
| `/market/[slug]` | 1024 | section#donow[Do nowThe actions the workspac] "DO NOW" | top rule background rgba(0, 0, 0, 0) |
| `/market/[slug]` | 1024 | section#talking[Client talking pointsWhat the ] "CLIENT TALKING POINTS" | top rule background rgba(0, 0, 0, 0) |
| `/market/[slug]` | 1024 | section#sources[Sources1 · tier = provenance, ] "SOURCES" | top rule background rgba(0, 0, 0, 0) |
| … | | 64 further findings, in results.json | |

### L7 — 222 finding(s)

| Route | Width | Element | Measured |
|---|---|---|---|
| `/regulations/[slug]` | 1440 | h2[Summary] | font-family resolves to Anton on "SUMMARY" |
| `/regulations/[slug]` | 1440 | h2[Obligations — issues requiring] | font-family resolves to Anton on "OBLIGATIONS — ISSUES REQUIRING ACTION" |
| `/regulations/[slug]` | 1440 | h2[Compliance chain] | font-family resolves to Anton on "COMPLIANCE CHAIN" |
| `/regulations/[slug]` | 1440 | h2[Substantive requirements] | font-family resolves to Anton on "SUBSTANTIVE REQUIREMENTS" |
| `/regulations/[slug]` | 1440 | h2[Penalties] | font-family resolves to Anton on "PENALTIES" |
| `/regulations/[slug]` | 1440 | h2[Sources] | font-family resolves to Anton on "SOURCES" |
| `/regulations/[slug]` | 1024 | h2[Summary] | font-family resolves to Anton on "SUMMARY" |
| `/regulations/[slug]` | 1024 | h2[Obligations — issues requiring] | font-family resolves to Anton on "OBLIGATIONS — ISSUES REQUIRING ACTION" |
| `/regulations/[slug]` | 1024 | h2[Compliance chain] | font-family resolves to Anton on "COMPLIANCE CHAIN" |
| `/regulations/[slug]` | 1024 | h2[Substantive requirements] | font-family resolves to Anton on "SUBSTANTIVE REQUIREMENTS" |
| `/regulations/[slug]` | 1024 | h2[Penalties] | font-family resolves to Anton on "PENALTIES" |
| `/regulations/[slug]` | 1024 | h2[Sources] | font-family resolves to Anton on "SOURCES" |
| `/market` | 1440 | h2[Headline series] | font-family resolves to Anton on "HEADLINE SERIES" |
| `/market` | 1440 | span[€1,217/1000L] | font-family resolves to Anton on "€1,217/1000L" |
| `/market` | 1440 | span[€1,014/1000L] | font-family resolves to Anton on "€1,014/1000L" |
| `/market` | 1440 | span[€535/t] | font-family resolves to Anton on "€535/t" |
| `/market` | 1440 | span[€646/t] | font-family resolves to Anton on "€646/t" |
| `/market` | 1440 | span[$1.16] | font-family resolves to Anton on "$1.16" |
| `/market` | 1024 | h2[Headline series] | font-family resolves to Anton on "HEADLINE SERIES" |
| `/market` | 1024 | span[€1,217/1000L] | font-family resolves to Anton on "€1,217/1000L" |
| `/market` | 1024 | span[€1,014/1000L] | font-family resolves to Anton on "€1,014/1000L" |
| `/market` | 1024 | span[€535/t] | font-family resolves to Anton on "€535/t" |
| `/market` | 1024 | span[€646/t] | font-family resolves to Anton on "€646/t" |
| `/market` | 1024 | span[$1.16] | font-family resolves to Anton on "$1.16" |
| `/market/[slug]` | 1440 | h2[Summary] | font-family resolves to Anton on "SUMMARY" |
| `/market/[slug]` | 1440 | h2[Drivers & trajectory] | font-family resolves to Anton on "DRIVERS & TRAJECTORY" |
| `/market/[slug]` | 1440 | h2[Cost impact by mode] | font-family resolves to Anton on "COST IMPACT BY MODE" |
| `/market/[slug]` | 1440 | h2[Do now] | font-family resolves to Anton on "DO NOW" |
| `/market/[slug]` | 1440 | h2[Client talking points] | font-family resolves to Anton on "CLIENT TALKING POINTS" |
| `/market/[slug]` | 1440 | h2[Sources] | font-family resolves to Anton on "SOURCES" |
| `/market/[slug]` | 1024 | h2[Summary] | font-family resolves to Anton on "SUMMARY" |
| `/market/[slug]` | 1024 | h2[Drivers & trajectory] | font-family resolves to Anton on "DRIVERS & TRAJECTORY" |
| `/market/[slug]` | 1024 | h2[Cost impact by mode] | font-family resolves to Anton on "COST IMPACT BY MODE" |
| `/market/[slug]` | 1024 | h2[Do now] | font-family resolves to Anton on "DO NOW" |
| `/market/[slug]` | 1024 | h2[Client talking points] | font-family resolves to Anton on "CLIENT TALKING POINTS" |
| `/market/[slug]` | 1024 | h2[Sources] | font-family resolves to Anton on "SOURCES" |
| `/research` | 1440 | span[5] | font-family resolves to Anton on "5" |
| `/research` | 1440 | span[5] | font-family resolves to Anton on "5" |
| `/research` | 1440 | span[5] | font-family resolves to Anton on "5" |
| `/research` | 1440 | span[5] | font-family resolves to Anton on "5" |
| `/research` | 1440 | span[18] | font-family resolves to Anton on "18" |
| `/research` | 1440 | span[14] | font-family resolves to Anton on "14" |
| `/research` | 1440 | span[11] | font-family resolves to Anton on "11" |
| `/research` | 1440 | span[3] | font-family resolves to Anton on "3" |
| `/research` | 1024 | span[5] | font-family resolves to Anton on "5" |
| `/research` | 1024 | span[5] | font-family resolves to Anton on "5" |
| `/research` | 1024 | span[5] | font-family resolves to Anton on "5" |
| `/research` | 1024 | span[5] | font-family resolves to Anton on "5" |
| `/research` | 1024 | span[18] | font-family resolves to Anton on "18" |
| `/research` | 1024 | span[14] | font-family resolves to Anton on "14" |
| `/research` | 1024 | span[11] | font-family resolves to Anton on "11" |
| `/research` | 1024 | span[3] | font-family resolves to Anton on "3" |
| `/research/[slug]` | 1440 | h2[Summary] | font-family resolves to Anton on "SUMMARY" |
| `/research/[slug]` | 1440 | h2[Sources] | font-family resolves to Anton on "SOURCES" |
| `/research/[slug]` | 1024 | h2[Summary] | font-family resolves to Anton on "SUMMARY" |
| `/research/[slug]` | 1024 | h2[Sources] | font-family resolves to Anton on "SOURCES" |
| `/operations` | 1440 | h2[Regions side by side] | font-family resolves to Anton on "REGIONS SIDE BY SIDE" |
| `/operations` | 1440 | div[5] | font-family resolves to Anton on "5" |
| `/operations` | 1440 | div[5] | font-family resolves to Anton on "5" |
| `/operations` | 1440 | div[5] | font-family resolves to Anton on "5" |
| … | | 162 further findings, in results.json | |

### L9 — 241 finding(s)

| Route | Width | Element | Measured |
|---|---|---|---|
| `/regulations` | 1440 | button[Show as one list] | 114.9×24px (long 114.9 < 44 or short 24 < 28) |
| `/regulations` | 1440 | button[A-Z] | 43×28px (long 43 < 44 or short 28 < 28) |
| `/regulations` | 1440 | button[All 9 immediate →] | 120.4×26px (long 120.4 < 44 or short 26 < 28) |
| `/regulations` | 1440 | button[All 9 action →] | 90.3×26px (long 90.3 < 44 or short 26 < 28) |
| `/regulations` | 1440 | button[Clear] | 32.2×24px (long 32.2 < 44 or short 24 < 28) |
| `/regulations` | 1440 | a[Calendar →] | 68.3×24px (long 68.3 < 44 or short 24 < 28) |
| `/regulations` | 1024 | button[Show as one list] | 114.9×24px (long 114.9 < 44 or short 24 < 28) |
| `/regulations` | 1024 | button[A-Z] | 43×28px (long 43 < 44 or short 28 < 28) |
| `/regulations` | 1024 | button[All 9 immediate →] | 120.4×26px (long 120.4 < 44 or short 26 < 28) |
| `/regulations` | 1024 | button[All 9 action →] | 90.3×26px (long 90.3 < 44 or short 26 < 28) |
| `/regulations` | 1024 | button[Clear] | 32.2×24px (long 32.2 < 44 or short 24 < 28) |
| `/regulations` | 1024 | a[Calendar →] | 68.3×24px (long 68.3 < 44 or short 24 < 28) |
| `/regulations/[slug]` | 1440 | a[Back to list] | 69.5×24px (long 69.5 < 44 or short 24 < 28) |
| `/regulations/[slug]` | 1024 | a[Back to list] | 69.5×24px (long 69.5 < 44 or short 24 < 28) |
| `/market` | 1440 | a[Series board →] | 116.8×12px (long 116.8 < 44 or short 12 < 28) |
| `/market` | 1440 | button[Show as one list] | 114.9×24px (long 114.9 < 44 or short 24 < 28) |
| `/market` | 1440 | button[A-Z] | 43×28px (long 43 < 44 or short 28 < 28) |
| `/market` | 1440 | button[All 8 immediate →] | 120.4×26px (long 120.4 < 44 or short 26 < 28) |
| `/market` | 1440 | button[All 6 action →] | 90.3×26px (long 90.3 < 44 or short 26 < 28) |
| `/market` | 1440 | button[Clear] | 32.2×24px (long 32.2 < 44 or short 24 < 28) |
| `/market` | 1024 | a[Series board →] | 116.8×12px (long 116.8 < 44 or short 12 < 28) |
| `/market` | 1024 | button[Show as one list] | 114.9×24px (long 114.9 < 44 or short 24 < 28) |
| `/market` | 1024 | button[A-Z] | 43×28px (long 43 < 44 or short 28 < 28) |
| `/market` | 1024 | button[All 8 immediate →] | 120.4×26px (long 120.4 < 44 or short 26 < 28) |
| `/market` | 1024 | button[All 6 action →] | 90.3×26px (long 90.3 < 44 or short 26 < 28) |
| `/market` | 1024 | button[Clear] | 32.2×24px (long 32.2 < 44 or short 24 < 28) |
| `/market/[slug]` | 1440 | a[Back to list] | 69.5×24px (long 69.5 < 44 or short 24 < 28) |
| `/market/[slug]` | 1024 | a[Back to list] | 69.5×24px (long 69.5 < 44 or short 24 < 28) |
| `/research` | 1440 | button[7d] | 37×28px (long 37 < 44 or short 28 < 28) |
| `/research` | 1440 | button[All] | 37.5×28px (long 37.5 < 44 or short 28 < 28) |
| `/research` | 1440 | button[All 12 awareness →] | 129.1×26px (long 129.1 < 44 or short 26 < 28) |
| `/research` | 1440 | button[Clear] | 32.2×24px (long 32.2 < 44 or short 24 < 28) |
| `/research` | 1024 | button[7d] | 37×28px (long 37 < 44 or short 28 < 28) |
| `/research` | 1024 | button[All] | 37.5×28px (long 37.5 < 44 or short 28 < 28) |
| `/research` | 1024 | button[All 12 awareness →] | 129.1×26px (long 129.1 < 44 or short 26 < 28) |
| `/research` | 1024 | button[Clear] | 32.2×24px (long 32.2 < 44 or short 24 < 28) |
| `/research/[slug]` | 1440 | a[Back to list] | 69.5×24px (long 69.5 < 44 or short 24 < 28) |
| `/research/[slug]` | 1024 | a[Back to list] | 69.5×24px (long 69.5 < 44 or short 24 < 28) |
| `/operations` | 1440 | a[Talent.com / Glassdoor UK] | 144×24px (long 144 < 44 or short 24 < 28) |
| `/operations` | 1440 | a[BLS OEWS 53-1047] | 107.1×24px (long 107.1 < 44 or short 24 < 28) |
| `/operations` | 1440 | a[Eurostat lc_lci_lev] | 98.1×24px (long 98.1 < 44 or short 24 < 28) |
| `/operations` | 1440 | a[Hays GCC Salary Guide] | 128.5×24px (long 128.5 < 44 or short 24 < 28) |
| `/operations` | 1440 | a[Indeed HK] | 56.7×24px (long 56.7 < 44 or short 24 < 28) |
| `/operations` | 1440 | a[Talent.com / Glassdoor UK] | 144×24px (long 144 < 44 or short 24 < 28) |
| `/operations` | 1440 | a[BLS OEWS 53-1047] | 107.1×24px (long 107.1 < 44 or short 24 < 28) |
| `/operations` | 1440 | a[Eurostat lc_lci_lev] | 98.1×24px (long 98.1 < 44 or short 24 < 28) |
| `/operations` | 1440 | a[Hays GCC Salary Guide] | 128.5×24px (long 128.5 < 44 or short 24 < 28) |
| `/operations` | 1440 | a[Indeed HK] | 56.7×24px (long 56.7 < 44 or short 24 < 28) |
| `/operations` | 1440 | a[Talent.com / Glassdoor UK] | 144×24px (long 144 < 44 or short 24 < 28) |
| `/operations` | 1440 | a[BLS OEWS 53-1047] | 107.1×24px (long 107.1 < 44 or short 24 < 28) |
| `/operations` | 1440 | a[Eurostat lc_lci_lev] | 98.1×24px (long 98.1 < 44 or short 24 < 28) |
| `/operations` | 1440 | a[Hays GCC Salary Guide] | 128.5×24px (long 128.5 < 44 or short 24 < 28) |
| `/operations` | 1440 | a[Indeed HK] | 56.7×24px (long 56.7 < 44 or short 24 < 28) |
| `/operations` | 1440 | button[EU] | 34.4×24px (long 34.4 < 44 or short 24 < 28) |
| `/operations` | 1440 | button[US] | 34.4×24px (long 34.4 < 44 or short 24 < 28) |
| `/operations` | 1440 | button[ASIA] | 45.6×24px (long 45.6 < 44 or short 24 < 28) |
| `/operations` | 1440 | button[UK] | 34.7×24px (long 34.7 < 44 or short 24 < 28) |
| `/operations` | 1440 | button[UAE] | 42.6×24px (long 42.6 < 44 or short 24 < 28) |
| `/operations` | 1440 | button[All 19 awareness →] | 129.1×26px (long 129.1 < 44 or short 26 < 28) |
| `/operations` | 1440 | button[Clear] | 32.2×24px (long 32.2 < 44 or short 24 < 28) |
| … | | 181 further findings, in results.json | |

### L10 — 94 finding(s)

| Route | Width | Element | Measured |
|---|---|---|---|
| `/` | 1440 | / | manifest cards not rendered: VOL IV |
| `/` | 1024 | / | manifest cards not rendered: VOL IV |
| `/regulations` | 1440 | card "IMMEDIATE" | not in the manifest for /regulations (p2); manifest holds 4 cards |
| `/regulations` | 1440 | card "ACTION" | not in the manifest for /regulations (p2); manifest holds 4 cards |
| `/regulations` | 1440 | card "MONITOR" | not in the manifest for /regulations (p2); manifest holds 4 cards |
| `/regulations` | 1440 | card "AWARENESS" | not in the manifest for /regulations (p2); manifest holds 4 cards |
| `/regulations` | 1024 | card "IMMEDIATE" | not in the manifest for /regulations (p2); manifest holds 4 cards |
| `/regulations` | 1024 | card "ACTION" | not in the manifest for /regulations (p2); manifest holds 4 cards |
| `/regulations` | 1024 | card "MONITOR" | not in the manifest for /regulations (p2); manifest holds 4 cards |
| `/regulations` | 1024 | card "AWARENESS" | not in the manifest for /regulations (p2); manifest holds 4 cards |
| `/regulations/[slug]` | 1440 | card "VOL IV" | not in the manifest for /regulations/[slug] (p3); manifest holds 14 cards |
| `/regulations/[slug]` | 1440 | card "IMMEDIATE" | not in the manifest for /regulations/[slug] (p3); manifest holds 14 cards |
| `/regulations/[slug]` | 1440 | card "EXPOSURE" | not in the manifest for /regulations/[slug] (p3); manifest holds 14 cards |
| `/regulations/[slug]` | 1440 | card "AFFECTED LANES" | not in the manifest for /regulations/[slug] (p3); manifest holds 14 cards |
| `/regulations/[slug]` | 1440 | /regulations/[slug] | manifest cards not rendered: EU EMISSIONS TRADING SYSTEM ETS EXTENSION TO MARITIME TRANSPORT, ACTION, SUMMARY, OBLIGATIONS, PENALT |
| `/regulations/[slug]` | 1024 | card "VOL IV" | not in the manifest for /regulations/[slug] (p3); manifest holds 14 cards |
| `/regulations/[slug]` | 1024 | card "IMMEDIATE" | not in the manifest for /regulations/[slug] (p3); manifest holds 14 cards |
| `/regulations/[slug]` | 1024 | card "EXPOSURE" | not in the manifest for /regulations/[slug] (p3); manifest holds 14 cards |
| `/regulations/[slug]` | 1024 | card "AFFECTED LANES" | not in the manifest for /regulations/[slug] (p3); manifest holds 14 cards |
| `/regulations/[slug]` | 1024 | /regulations/[slug] | manifest cards not rendered: EU EMISSIONS TRADING SYSTEM ETS EXTENSION TO MARITIME TRANSPORT, ACTION, SUMMARY, OBLIGATIONS, PENALT |
| `/market` | 1440 | card "IMMEDIATE" | not in the manifest for /market (p4); manifest holds 6 cards |
| `/market` | 1440 | card "ACTION" | not in the manifest for /market (p4); manifest holds 6 cards |
| `/market` | 1440 | card "MONITOR" | not in the manifest for /market (p4); manifest holds 6 cards |
| `/market` | 1440 | card "AWARENESS" | not in the manifest for /market (p4); manifest holds 6 cards |
| `/market` | 1440 | card "SOURCES TRACKED" | not in the manifest for /market (p4); manifest holds 6 cards |
| `/market` | 1024 | card "IMMEDIATE" | not in the manifest for /market (p4); manifest holds 6 cards |
| `/market` | 1024 | card "ACTION" | not in the manifest for /market (p4); manifest holds 6 cards |
| `/market` | 1024 | card "MONITOR" | not in the manifest for /market (p4); manifest holds 6 cards |
| `/market` | 1024 | card "AWARENESS" | not in the manifest for /market (p4); manifest holds 6 cards |
| `/market` | 1024 | card "SOURCES TRACKED" | not in the manifest for /market (p4); manifest holds 6 cards |
| `/market/[slug]` | 1440 | card "VOL IV" | not in the manifest for /market/[slug] (p5); manifest holds 12 cards |
| `/market/[slug]` | 1440 | card "EXPOSURE" | not in the manifest for /market/[slug] (p5); manifest holds 12 cards |
| `/market/[slug]` | 1440 | card "TIMELINE" | not in the manifest for /market/[slug] (p5); manifest holds 12 cards |
| `/market/[slug]` | 1440 | card "AFFECTED LANES" | not in the manifest for /market/[slug] (p5); manifest holds 12 cards |
| `/market/[slug]` | 1440 | card "CONNECTIONS" | not in the manifest for /market/[slug] (p5); manifest holds 12 cards |
| `/market/[slug]` | 1440 | /market/[slug] | manifest cards not rendered: PACKAGING MATERIAL INPUT COSTS, SUMMARY, DRIVERS & TRAJECTORY, COST IMPACT BY MODE, DO NOW, RELEVANCE |
| `/market/[slug]` | 1024 | card "VOL IV" | not in the manifest for /market/[slug] (p5); manifest holds 12 cards |
| `/market/[slug]` | 1024 | card "EXPOSURE" | not in the manifest for /market/[slug] (p5); manifest holds 12 cards |
| `/market/[slug]` | 1024 | card "TIMELINE" | not in the manifest for /market/[slug] (p5); manifest holds 12 cards |
| `/market/[slug]` | 1024 | card "AFFECTED LANES" | not in the manifest for /market/[slug] (p5); manifest holds 12 cards |
| `/market/[slug]` | 1024 | card "CONNECTIONS" | not in the manifest for /market/[slug] (p5); manifest holds 12 cards |
| `/market/[slug]` | 1024 | /market/[slug] | manifest cards not rendered: PACKAGING MATERIAL INPUT COSTS, SUMMARY, DRIVERS & TRAJECTORY, COST IMPACT BY MODE, DO NOW, RELEVANCE |
| `/research` | 1440 | card "ACTION" | not in the manifest for /research (p6); manifest holds 8 cards |
| `/research` | 1440 | card "MONITOR" | not in the manifest for /research (p6); manifest holds 8 cards |
| `/research` | 1440 | card "AWARENESS" | not in the manifest for /research (p6); manifest holds 8 cards |
| `/research` | 1440 | /research | manifest cards not rendered: FUELS & SAF, LAST MILE ELECTRIFICATION, DISCLOSURE REGIMES, NOTHING IN THE LAST DAYS |
| `/research` | 1024 | card "ACTION" | not in the manifest for /research (p6); manifest holds 8 cards |
| `/research` | 1024 | card "MONITOR" | not in the manifest for /research (p6); manifest holds 8 cards |
| `/research` | 1024 | card "AWARENESS" | not in the manifest for /research (p6); manifest holds 8 cards |
| `/research` | 1024 | /research | manifest cards not rendered: FUELS & SAF, LAST MILE ELECTRIFICATION, DISCLOSURE REGIMES, NOTHING IN THE LAST DAYS |
| `/research/[slug]` | 1440 | card "VOL IV" | not in the manifest for /research/[slug] (p7); manifest holds 10 cards |
| `/research/[slug]` | 1440 | card "EXPOSURE" | not in the manifest for /research/[slug] (p7); manifest holds 10 cards |
| `/research/[slug]` | 1440 | card "TIMELINE" | not in the manifest for /research/[slug] (p7); manifest holds 10 cards |
| `/research/[slug]` | 1440 | card "IN THIS LIST" | not in the manifest for /research/[slug] (p7); manifest holds 10 cards |
| `/research/[slug]` | 1440 | /research/[slug] | manifest cards not rendered: MISSION INNOVATION SHIPPING MISSION NET ZERO INDUSTRIES AWARD AND MI GLOBAL COLLABORATION FRAMEWORK,  |
| `/research/[slug]` | 1024 | card "VOL IV" | not in the manifest for /research/[slug] (p7); manifest holds 10 cards |
| `/research/[slug]` | 1024 | card "EXPOSURE" | not in the manifest for /research/[slug] (p7); manifest holds 10 cards |
| `/research/[slug]` | 1024 | card "TIMELINE" | not in the manifest for /research/[slug] (p7); manifest holds 10 cards |
| `/research/[slug]` | 1024 | card "IN THIS LIST" | not in the manifest for /research/[slug] (p7); manifest holds 10 cards |
| `/research/[slug]` | 1024 | /research/[slug] | manifest cards not rendered: MISSION INNOVATION SHIPPING MISSION NET ZERO INDUSTRIES AWARD AND MI GLOBAL COLLABORATION FRAMEWORK,  |
| … | | 34 further findings, in results.json | |

## Harness errors

None. Every route mounted and measured.
