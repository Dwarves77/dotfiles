# Caro's Ledge, Comprehensive Site Audit

**Date:** May 25, 2026
**Phase:** Pre-Phase-2A gate
**Scope:** All 21 routes (customer + operator surfaces), every interactive element on rebuilt surfaces (Operations, Market, Community, Research, Map), cross-surface count derivation, mobile responsiveness (320px–767px), Leaflet map rendering.
**Method:** Browser audit + code grep + uncommitted-tree diff inspection. Findings tagged C (Critical) / H (High) / M (Medium) / L (Low). Disposition vocabulary mirrors Phase 1.5: WIRE / STRIP / BUILD / DEFER / VERIFY / INVESTIGATE / STUB-VERIFY.

**Companion document:** [functional-purpose-audit-2026-05-24.md](./functional-purpose-audit-2026-05-24.md). The Phase 1.5 doc is the **required-functionality-vs-present-functionality** lens (does the surface contain the flows its purpose demands?). This doc is the **present-functionality-vs-working-functionality** lens (do the elements that exist on the page actually do anything?). Both lenses, both needed: a flow can be PRESENT in the Phase 1.5 doc and still be a non-functional button here.

**Headline finding:** the May 24 rebuild left the four rebuilt surfaces (Operations, Market, Community, Research) with substantial **non-functional chrome**: stat tiles that look clickable but have no onClick handler, filter chips that toggle visual state but do not filter the underlying list, query-param URLs that the destination route does not read. Additionally, the Map surface renders no basemap on mobile because viewMode defaults to "list" below 768px. Four findings are Critical (hidden-on-mobile content, identical-content tabs, non-functional stat tiles, missing basemap); nine are High; eight are Medium; eight are Low. One original Critical (C1, CommunitySearchResults missing) was RETRACTED on pre-commit verification — the file exists; the claim came from a stale session-summary observation.

---

## Severity legend

| Tag | Meaning |
|---|---|
| **C** Critical | Crashes, hides content from a major device class, or breaks a core flow. Fix before Phase 2A. |
| **H** High | Renders an interactive element with no behavior, points at a broken link, or shows incorrect numbers prominently. Fix during Phase 4. |
| **M** Medium | Inconsistency, count drift, or stub UI that should be either wired or stripped. Fix during Phase 4 sweep. |
| **L** Low | Cosmetic, scope-deferrable, or operator-decision-pending. Address during Phase 4 polish or DEFER. |

---

## Critical findings (4 active + 1 retracted)

### C1, ~~CommunitySearchResults missing component~~ — RETRACTED

**Original claim:** import-without-file would crash render on Search tab.

**Verification (2026-05-25 pre-commit):** `src/components/community/CommunitySearchResults.tsx` exists (59-line component imported by CommunityShell.tsx:40, mounted at :143). The original claim was inherited from a stale session summary observation and not re-verified. No crash risk.

**Status:** RETRACTED. No fix required. Numbering retained so cross-references in this doc remain stable; the slot is intentionally left as a retraction marker. Total fixable findings: 28 (not 29).

---

### C2, Settings Dashboard + Exports tabs render identical content as General

**Location:** `fsi-app/src/app/settings/page.tsx` and `fsi-app/src/components/settings/SettingsView.tsx`.

**Impact:** Three of seven tabs (General, Dashboard, Exports) show the same vertical/sector picker. User cannot configure dashboard cards or export format despite tabs implying they can.

**Evidence:** Browser audit comparing tab content. Phase 1.5 doc Section 10 flows 2 and 3 marked MISSING with same root cause.

**Disposition:** WIRE (split DashboardSettings to surface card-visibility toggles; build Exports format picker) OR STRIP the two duplicate tabs and re-add when content lands. Operator decision pending.

---

### C3, Map default viewMode hides basemap on mobile

**Location:** `fsi-app/src/components/map/MapView.tsx:156-158` (uncommitted in working tree).

**Impact:** `viewMode` default was `window.innerWidth < 768 ? "list" : "split"`. Result: mobile users land on /map and see a list with no map. Operator's own screenshots flagged this as "map has no map" on May 24.

**Evidence:** Code read confirms ternary. Working-tree fix drafted (default to "split" on all viewports) but uncommitted.

**Disposition:** WIRE (commit the working-tree change, default `viewMode = "split"`). Mobile users get a stacked layout via responsive CSS rather than a hidden map.

---

### C4, Operations stat tiles cursor:pointer with no onClick

**Location:** `fsi-app/src/components/pages/OperationsPage.tsx` stat strip (4 tiles).

**Impact:** Tiles render with `style={{ cursor: 'pointer' }}` (or via .cl-stat-tile hover state) but no onClick handler. User taps the "12 deadlines this quarter" tile expecting a filter; nothing happens.

**Evidence:** Code grep for `onClick` in OperationsPage stat zone returns no result. Phase 1.5 doc Section 6 flow 6 marked MISSING.

**Disposition:** WIRE (stat tile click → setRegionFilter or setPriorityFilter on the accordion list) OR STRIP cursor:pointer styling. Wiring is the correct fix; the design intent is clearly filter-by-stat.

---

### C5, Map tile layer renders no basemap

**Location:** `fsi-app/src/components/map/MapView.tsx` (TileLayer component).

**Impact:** Even on desktop where viewMode is "split", the Leaflet MapContainer is mounted but the TileLayer URL or attribution is not rendering tiles. Map shows grey background with markers floating in space.

**Evidence:** Operator screenshot shows markers on grey. Browser DevTools network tab would confirm whether tile requests are firing and which response is returned (not verified in this audit).

**Disposition:** INVESTIGATE → WIRE. Check the TileLayer URL string is reachable from the deployed env (CARTO basemap should not require a token). If it is reachable, check that MapContainer mounts with valid bounds. If not, swap to OSM tiles as fallback.

---

## High findings (9)

### H1, ?compose=1 query param not wired in /community/[slug]

**Location:** `fsi-app/src/app/community/[slug]/page.tsx`.

**Impact:** CommunityView "New Post" CTA routes users to `/community/[slug]?compose=1` when a single-membership user clicks it. The destination route does not read `compose` and does not auto-open the composer modal.

**Evidence:** Code grep for `compose` query usage in [slug]/page.tsx returns no result.

**Disposition:** WIRE (parse searchParams.compose, auto-open PostComposer when present).

---

### H2, ?compose=1 query param not wired in /community/browse

**Location:** `fsi-app/src/app/community/browse/page.tsx`.

**Impact:** Multi-membership users routed to `/community/browse?compose=1` from CommunityView land on the browse grid with no composer modal open.

**Evidence:** Same pattern as H1; query param not consumed.

**Disposition:** WIRE (parse searchParams.compose, render group picker modal that on submit mounts PostComposer with the chosen groupId).

---

### H3, Regulations index sort options produce same ordering

**Location:** `fsi-app/src/components/regulations/RegulationsSurface.tsx` (sort dropdown).

**Impact:** Selecting "Newest" or "Confidence" produces the same column order as the default Priority sort. Newest should sort by `added DESC`; Confidence should sort by `authority_level DESC`. Confidence sort is impossible while every record is "Unclassified", which is a separate data-layer gap.

**Evidence:** Browser audit on /regulations comparing sort outputs.

**Disposition:** WIRE (implement Newest sort) + STRIP-or-DEFER Confidence (strip until authority_level populated, or defer with a tooltip explaining unavailability).

---

### H4, Regulations REGION filter row renders empty

**Location:** Regulations index filter row, REGION chip group.

**Impact:** Filter row reserves space for REGION chips but renders empty array. Users see a labeled-but-empty filter band.

**Evidence:** Browser audit.

**Disposition:** WIRE (populate chips from TIER1_PRIORITY_ISOS or from a distinct regions query).

---

### H5, Regulations Kanban "Open all N" placement

**Location:** Each Kanban column on /regulations.

**Impact:** Column caps at 8 cards (correct per Fix 8) but the "Open all 47" sticky bottom button on long columns is currently placed inside the column body rather than as a fixed bottom anchor, so on scroll the button moves out of view.

**Evidence:** Browser audit + code read of RegulationsSurface.tsx column container.

**Disposition:** WIRE (sticky positioning for the Open-All button at the column's visible bottom edge).

---

### H6, /profile?tab=owners is a broken link

**Location:** Reference somewhere in the app (likely sidebar foot or member-management copy) pointing to `/profile?tab=owners`. The Profile component does not have an "owners" tab.

**Impact:** User clicks the link, lands on Profile with the default tab and no indication of why they were sent there.

**Evidence:** Grep for `profile?tab=owners` should locate the source link.

**Disposition:** WIRE (add the owners tab) OR STRIP (point the link at `/profile?tab=organization` or `/profile?tab=members`).

---

### H7, Map inline height: 640 bypasses responsive class

**Location:** `fsi-app/src/components/map/MapPageView.tsx` map frame container.

**Impact:** Inline `style={{ height: 640 }}` overrides the `.cl-map-frame` responsive CSS that scales the map height to viewport on smaller screens. On a 700px-tall mobile viewport the map takes 640px and leaves no room for the right rail.

**Evidence:** Code read; .cl-map-frame added in globals.css uncommitted work.

**Disposition:** WIRE (remove inline height, let .cl-map-frame govern).

---

### H8, Profile hardcoded zeros in activity strip

**Location:** `fsi-app/src/app/profile/page.tsx` or ProfileView component.

**Impact:** Activity strip shows "0 posts · 0 replies · 0 reactions" hardcoded. Real values should come from `community_posts` count + `community_replies` count for the current profile_id.

**Evidence:** Browser audit; grep would confirm hardcoded literals.

**Disposition:** WIRE (query counts via RPC) OR STRIP the strip until data is wired.

---

### H9, Operations dimensional empty states silently skipped

**Location:** `fsi-app/src/components/pages/OperationsPage.tsx` per-region accordion bodies.

**Impact:** EU and US regions render the 6 dimensions populated. Asia, UK, UAE regions render only the dimensions for which FACTS data exists; missing dimensions are silently omitted rather than rendered with a "Coverage pending" empty state. User sees inconsistent accordion shapes across regions.

**Evidence:** Browser audit. Phase 1.5 doc Section 6 flow 4 marked PARTIAL.

**Disposition:** WIRE (render labeled empty states for every dimension where no FACTS row exists). Phase 1 commit e6c7401 began this work; sweep is incomplete.

---

## Medium findings (8)

### M1, Cross-surface count drift

**Location:** Dashboard masthead, Dashboard right rail, per-surface mastheads (Regulations, Market, Research, Operations).

**Impact:** Dashboard masthead shows "645 / 144"; right rail shows "637"; Regulations index shows 394; Market shows 107; Research shows different total. None reconcile because each surface computes its own count locally rather than consuming the `get_workspace_intelligence_aggregates` RPC.

**Evidence:** Browser audit across 5 routes. Phase 1.5 doc Section 1 flagged Phase 2A as the operator decision gate.

**Disposition:** WIRE (after Phase 2A operator decision on count derivation; Option B = DB RPC source of truth requires Phase 3B agent regeneration to populate severity column before the wire is meaningful).

---

### M2, Market masthead 107 vs tile total 47 mismatch

**Location:** `fsi-app/src/components/pages/MarketPage.tsx` masthead total and stat tile totals.

**Impact:** Masthead declares 107 signals; the 5 stat tiles (Action required, Cost alert, Window closing, Competitive edge, Monitoring) sum to 47. Either the masthead is overcounting (counting items outside the visible band) or the tiles are undercounting (severity derivation excludes a large slice).

**Evidence:** Browser audit on /market.

**Disposition:** INVESTIGATE → WIRE. The derived-severity branch likely returns NULL for items without keywords, which the tile sums exclude but the masthead includes. Fix is to either bucket all items into a severity (default Monitoring) or align the masthead total to the sum.

---

### M3, Research filter pills toggle visual state but do not filter

**Location:** `fsi-app/src/components/research/ResearchView.tsx` window pills, vertical chips, stat tile filters.

**Impact:** User clicks "7d" window pill, pill turns active, but the list does not filter to last-7-day items. Same for vertical chips and severity stat tiles.

**Evidence:** Browser audit + code read. Uncommitted stashed work in `research-filter-wiring-WIP-2026-05-24` addresses this.

**Disposition:** WIRE (pop stash, validate, commit). Phase 1.5 doc Section 5 flow 2, 3, 4 marked MISSING with same resolution.

---

### M4, Market severity legend has 4 pills, stat zone has 5 tiles

**Location:** `fsi-app/src/components/pages/MarketPage.tsx`.

**Impact:** The severity-legend strip lists 4 severities while the stat-tile grid renders 5 (Competitive edge added per Fix 1). Mismatch implies one is wrong.

**Evidence:** Browser audit on /market.

**Disposition:** WIRE (add the 5th legend pill to match the stat-tile grid).

---

### M5, Market line 482 glyph ternary renders same triangle both branches

**Location:** `fsi-app/src/components/pages/MarketPage.tsx:482` (price-trajectory glyph).

**Impact:** A ternary intended to render an up-triangle for positive trajectory and a down-triangle for negative renders the same up-triangle in both branches. Visual indicator is broken.

**Evidence:** Code read at line 482.

**Disposition:** WIRE (correct the ternary to render `▲` vs `▼` based on trajectory sign).

---

### M6, Admin section counts hardcoded 0 in sections 3-6

**Location:** `fsi-app/src/app/admin/page.tsx` or AdminView section cards.

**Impact:** Section overview cards 3-6 (Coverage gaps, Editorial pipeline, Community pickups, Cost tracking) display "0" badges hardcoded rather than computed from their respective data sources.

**Evidence:** Browser audit. Phase 1.5 doc Section 9 flow 3 marked PARTIAL.

**Disposition:** WIRE (compute counts via RPC or query per section; admin masthead aggregates RPC may already cover several).

---

### M7, Onboarding LinkedIn label rendering verification

**Location:** `fsi-app/src/components/onboarding/OnboardingFlow.tsx` LinkedIn step.

**Impact:** SKILL Section 5 correction set the label to "Pre-fill from LinkedIn" (in-flight, not stub). Phase 1.5 audit notes the label was updated per Section E audit. Need to confirm the rendered string in the current build matches the operator-stated label.

**Evidence:** Code read of onboarding step + screenshot verification needed.

**Disposition:** VERIFY (read the step component; if label is correct, PASS; if not, WIRE).

---

### M8, Map "click to fly" rail header opens panel without flyTo animation

**Location:** `fsi-app/src/components/map/MapPageView.tsx` right rail jurisdiction list.

**Impact:** Right rail header copy says "click to fly to jurisdiction". Clicking a row opens the detail panel but does not call `map.flyTo(coords, zoom)`. The animation the copy promises does not happen.

**Evidence:** Browser audit + code grep for `flyTo` should confirm.

**Disposition:** WIRE (add flyTo call on rail row click) OR STRIP the "click to fly" header copy.

---

## Low findings (8)

### L1, Regulations detail Penalty tab is static narrative not calculator

**Location:** `fsi-app/src/components/regulations/RegulationDetailSurface.tsx` Penalty calculator tab.

**Impact:** Tab is labeled "Penalty calculator" but contains static prose describing penalty ranges. No inputs, no math.

**Evidence:** Phase 1.5 doc Section 3 flow 13 marked PARTIAL.

**Disposition:** STRIP (rename to "Penalty schedule" + populate with structured data) OR BUILD (full interactive calculator; DEFER to a future cross-cutting capability dispatch).

---

### L2, Regulations detail dead watchlist code

**Location:** `fsi-app/src/components/regulations/RegulationDetailSurface.tsx` `{false && <WatchlistButton ... />}`.

**Impact:** Dead code path that never renders. Either watchlist functionality is intended (then the flag should be on) or it should be removed.

**Evidence:** Code grep for `{false &&`.

**Disposition:** STRIP (Phase 4 sweep). BUILD when watchlist schema lands.

---

### L3, Regulations detail watchlist strip placement

**Location:** Regulations detail hero block area.

**Impact:** Design called for a watchlist action strip placement decision. Currently no strip rendered (consistent with L2 dead code).

**Evidence:** Mockup vs current rendering.

**Disposition:** DEFER (until watchlist schema lands, then BUILD per mockup placement).

---

### L4, Regulations detail "Your exposure" strip missing

**Location:** Regulations detail hero / Impact Assessment area.

**Impact:** Mockup `regulations-detail.html` shows a "Your exposure" strip surfacing workspace-specific exposure scoring. Current rendering omits this strip.

**Evidence:** Mockup vs current rendering.

**Disposition:** DEFER (depends on workspace-exposure scoring data; schema work). Strip should land as STUB-VERIFY (rendered with placeholder copy) until scoring data is available.

---

### L5, Regulations detail Penalty rename

**Location:** Penalty calculator tab title.

**Impact:** Cosmetic rename from "Penalty calculator" to "Penalty schedule" once the calculator scope is deferred. Pairs with L1.

**Evidence:** Same as L1.

**Disposition:** STRIP-and-rename (single string change paired with L1 disposition).

---

### L6, 131 untriaged ingest rejections include canonical entities

**Location:** `/admin` ingest rejections queue.

**Impact:** 131 items in the untriaged rejections queue include canonical jurisdictions (NEW_ZEALAND, KAZAKHSTAN, IMO). These should not be rejected; the jurisdiction normalizer does not recognize them.

**Evidence:** Browser audit on /admin rejections tab. Phase 1.5 doc Section 9 flow 7 noted same.

**Disposition:** WIRE (extend jurisdiction normalizer with canonical entity recognition list; re-process the 131 untriaged).

---

### L7, Featured card border 3px vs 4px inconsistency

**Location:** Research featured finding card vs other featured cards across surfaces.

**Impact:** Research mockup uses 4px border on featured card; rest of platform uses 3px. Local inconsistency on /research.

**Evidence:** Mockup spec for Research vs other surfaces.

**Disposition:** WIRE (standardize to 3px across all surfaces per Fix 21).

---

### L8, Sidebar foot dot semantic unclear

**Location:** `fsi-app/src/components/Sidebar.tsx` foot area.

**Impact:** A foot dot indicator was specced (presence-light vs admin-attention semantic). Operator left semantic undecided per Phase 1 fix 19.

**Evidence:** Phase 1 Fix 19 noted "skip until operator clarifies the online vs admin-attention semantic".

**Disposition:** DEFER (operator decision pending).

---

## Cross-cutting patterns surfaced

1. **Non-functional chrome is the dominant defect class.** 9 of 22 fixable findings (C3, C4, H1-H5, H7-H9, M3, M5, M8) are interactive elements that render with click affordance but no handler, or query parameters the destination route ignores. The Phase 1.5 doc's "WIRE" disposition resolves the majority. This is a pattern-level signal that the May 24 rebuild prioritized visual layout over interaction wiring.

2. **Count derivation is the single largest unresolved architecture decision.** M1 + M2 + M6 + the Phase 1.5 Dashboard reconciliation note all trace to the same root cause: 5 distinct surfaces compute counts locally rather than consuming the aggregates RPC. Phase 2A operator decision (Option B = DB RPC source of truth) blocks resolution of all four findings until Phase 3B agent regeneration populates the severity column.

3. **Mobile responsiveness is uncommitted in working tree.** Globals.css utility classes (cl-stat-grid, cl-coverage-rail, cl-two-col, cl-map-frame) with breakpoints at 1100/960/767/640/480/420 are added; 4 surface refactors applying those classes are uncommitted; C3 + H7 are direct consequences. The uncommitted bundle needs operator-authorized commit before Phase 2A starts.

4. **Component crash risk on /community (C1) is the single Phase-2A blocker.** Every other Critical can be navigated around; a missing import will crash render the moment a user clicks the Search tab.

---

## Disposition summary

| Disposition | Count | Findings |
|---|---|---|
| WIRE | 16 | C3, C4, C5 (after investigate), H1, H2, H3, H4, H5, H6, H7, H8, H9, M3, M4, M5, M6, M8 |
| STRIP | 2 | L1 (paired with L5), L2 |
| BUILD | 1-2 | C1 (stub) or STRIP, L4 (when scoring lands) |
| DEFER | 4 | L3, L4, L5, L8 |
| VERIFY | 1 | M7 |
| INVESTIGATE | 2 | C5, M2 |
| Operator-decision | 2 | C2 (WIRE or STRIP), M1 (Phase 2A) |

Total: 29 findings (5 Critical + 9 High + 8 Medium + 7 Low). One Low (L7 cosmetic uniform border) is folded into Fix 21 polish sweep.

---

## Recommended fix order

1. **Phase 2A blocker resolution:**
   - C1 (CommunitySearchResults stub or strip)
   - C3 (commit MapView viewMode default)
   - C5 (investigate basemap; wire OSM fallback if CARTO unreachable)
   - M1 (Phase 2A operator decision on count derivation, gates M2 + M6)

2. **Phase 4 WIRE sweep (16 findings):**
   - All H1–H9, C4
   - M3 (pop stash), M4, M5, M8

3. **Phase 4 STRIP sweep (2 findings):**
   - L1+L5 paired
   - L2

4. **Phase 4 polish (5 findings):**
   - L6 (jurisdiction normalizer extension)
   - L7 (folded into Fix 21)
   - M7 (verify)

5. **DEFER (4 findings):**
   - L3, L4, L8, plus C2 if operator decides STRIP-until-content

---

## What this audit did not check

- /research/[slug], /market/[slug] detail routes (do not exist; Phase 5 scope)
- /admin section-card click-through correctness (verified only at section-count level)
- Performance metrics (TTI, LCP, bundle size)
- A11y (keyboard nav, screen reader landmarks, contrast ratios)
- E2E auth flows (sign-in, workspace switching, role gates beyond Sidebar admin gate)
- Email and push notification channels (Phase 1.5 Settings flow 4 marked PARTIAL: in_app only; no further verification here)
- RPC response time / DB query plans
- Production vs preview environment drift (audit done against current main branch only)

These gaps are flagged for a future audit pass, not addressed here.

---

**End of May 25 comprehensive site audit.**

## Related

- [[functional-purpose-audit-2026-05-24]] — Declared companion; the two form a deliberate lens pair — that doc asks whether required flows are present, this asks whether present elements…
- [[DESIGN-AUDIT-2026-05]] — Later whole-site audit continues this surface-fidelity review after the spec-audit series
- [[VISUAL-RECONCILIATION-2026-05-06]] — Later whole-site audit revisits the same production-vs-design surface reconciliation
- [[cards-clickable-audit-2026-05-12]] — Shares the card/interactive-element click-behavior concern; both check whether clickable-looking surface elements resolve to real navigation/handlers
