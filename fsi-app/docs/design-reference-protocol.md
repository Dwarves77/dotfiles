# Design Reference Protocol for Claude Code

**Date:** May 25, 2026
**Purpose:** Establish the canonical design source and reading protocol for every remaining Phase 4 / Phase 5 / Phase 6 build. Correct two material design mismatches caught in mid-flight design re-read.

---

## 1. Canonical design source

The canonical design source for Caro's Ledge surfaces is the design handoff bundle. **Path lives at the dotfiles repo root (one level above `fsi-app/`)**, not inside `fsi-app/`:

```
design_handoff_2026-05/
├── README.md                    ← Design system contract (binding)
├── shared/tokens.css            ← Production tokens mirror
├── operations.html              ← /operations surface mockup
├── regulations.html             ← /regulations index mockup
├── regulations-detail.html      ← /regulations/[slug] mockup
├── market-intel.html            ← /market surface mockup
├── research.html                ← /research surface mockup
├── community.html               ← /community surface mockup
├── map.html                     ← /map surface mockup
└── admin.html                   ← /admin surface mockup
```

If any of these files are missing from the repo, retrieve from `/mnt/user-data/uploads/` and commit to the design_handoff folder before proceeding with any rebuild. The HTML mockups are pixel-fidelity prototypes against production tokens.

**Reading protocol:**

For every surface rebuild, BEFORE writing code:

1. Read `design_handoff_2026-05/README.md` Section [matching surface number] for the binding design contract
2. Read the surface-specific HTML mockup for visual + structural reference
3. Check this document (design-reference-protocol.md) for operator refinements that override the mockup
4. Check `docs/audits/functional-purpose-audit-2026-05-24.md` for required user flows
5. Check `docs/audits/comprehensive-site-audit-2026-05-25.md` for code-level gap details

The audits identify where the BUILT site falls short of the mockups. They are NOT critiques of the mockups themselves. The mockups are the target; the audits map the gap from current implementation TO target.

---

## 2. Framing correction (binding for all remaining dispatch interpretation)

Prior dispatch instructions in this session occasionally treated audit findings as "the design is wrong" or "the page should not have X." That framing was inverted. The correct framing is always:

- **Mockup says X** → X is the design intent
- **Audit found Y is missing or broken** → Y is the implementation gap that must close
- **Operator decision says Z** → Z is the refinement that supersedes the mockup on that specific point

When in doubt, the mockup is the target. Operator decisions are explicit overrides (enumerated in Section 3 below). Audits are gap-to-target diagnostics.

---

## 3. Operator refinements that override the mockup

These are explicit operator-level decisions made during this session that supersede the mockup on specific points. Apply these in addition to the mockup, not instead of it.

| # | Surface | Mockup says | Operator refinement |
|---|---|---|---|
| O1 | /regulations/[slug] | Tab labeled "Penalty calculator" | **Rename to "Penalty schedule"** until interactive calculator with shipment-data integration is built (separate dispatch) |
| O2 | /map | Mapbox GL / Leaflet / Google Maps (any) | **Use OpenStreetMap via Leaflet** (Decision 6 in dispatch v3) |
| O3 | /settings | (mockup not in handoff bundle) | **Strip duplicate Dashboard + Exports tabs** that rendered same DashboardSettings as General. Strip empty Data & Supersessions + Help card frames. |
| O4 | /market | Featured B1 signal has trajectory bars only | **Render TrajectoryEmptyState placeholder on every B1 Price signal** including the featured signal (the previous featured trajectory was fabricated hardcoded data, which violates integrity rule). Per-item trajectory data backfill is Sprint 3 work; until it lands, every B1 signal shows honest empty state. |
| O5 | /admin | 6 section cards replacing 11-tab strip | **Section cards added as overlay above the 11-tab strip in the May 24 partial rebuild.** Full restructure (retire the 11-tab strip and migrate content to section card destinations) is deferred to a separate Admin Restructure dispatch. New BUILDs in current dispatch hang off section card clicks as destination views, NOT extend the legacy 11-tab strip. |
| O6 | /onboarding | (mockup not in handoff bundle) | **LinkedIn import is in-flight, not stub.** Label "Pre-fill from LinkedIn" with `linkedinEnabled` config gate is the current correct state. |
| O7 | All surfaces | Right rails as designed | **Watchlist UI deferred to Sprint 3 cross-cutting capability dispatch.** Right rails render without watchlist controls until that dispatch ships. |

---

## 4. Mid-flight design mismatches to correct

These are two specific points where dispatch instructions I gave Claude Code diverged from the mockup. Correct before continuing HIGH RISK work.

### Correction A: /community 5 tabs are the design, NOT to be stripped

**What I said earlier (wrong):** "Strip the 4 placeholder tabs (Industry Pulse / Hot Topics / People / Editorial Picks) per audit." Replace with composable surface, filter chips, compose path.

**What the mockup actually specifies (binding):**

```
Top frame: masthead + 5 tabs:
- By Region & Group [default]
- Industry Pulse
- Hot Topics
- People
- Editorial Picks
```

Plus the prominent "+ New post" composer at top after the tab row, plus the Activity-by-region cards, plus the Topics-this-week-by-region matrix, plus the Recent-activity-in-your-groups sections.

**Correction for H6-H9 (Community HIGH RISK work):**

- Rebuild the 5 tabs with proper distinct content per tab, per mockup. Each tab is a real view, not a placeholder.
- Tab content per mockup:
  - **By Region & Group:** Region overview cards (4 regions) + Topics-this-week matrix + Recent activity in your groups + Public forums in your network
  - **Industry Pulse:** [Read community.html mockup for the specific content shape]
  - **Hot Topics:** [Read community.html mockup]
  - **People:** [Read community.html mockup]
  - **Editorial Picks:** [Read community.html mockup]
- Add the "+ New post" composer at top after the tabs row, NOT as a replacement for the tabs.
- WIRE-BACK the existing PostComposer / ReplyComposer / PostList / group-thread route / group-browse route components per Phase 1.5 audit (those exist; the May 24 rebuild lost the chrome that exposed them).
- BUILD work (create-group modal, share-link copy button, editorial pickup notification) sits alongside the tab structure, not instead of it.

Before starting H6, read `design_handoff_2026-05/community.html` end-to-end. Then read this section. Then build.

### Correction B: /operations D2-D6 are fact tables, NOT cards

**What I said earlier (wrong):** "Convert D2-D6 to card-shaped containers matching D1's card pattern."

**What the mockup actually specifies (binding):**

Per README Section 5 (/operations), item 7:

> **D2 / D3 / D4 / D5 / D6 bodies**: fact tables (not cards). Each row: label / value (with var(--font-display) numeric + unit / 4-week trend / source line). Every cell sourced and dated.

D1 uses the Operations card pattern (regulation cross-references). D2-D6 use fact tables. The visual asymmetry between D1 (cards) and D2-D6 (tables) is INTENTIONAL because the content types differ (D1 = regulation references that click into /regulations/[slug]; D2-D6 = sourced operational facts where the value IS the value).

**Correction for H2 (already committed at bb76810):**

The H2 commit converted D2-D6 to FactCard grids matching D1's card pattern. That contradicts the mockup design intent. Either:

1. **Revert H2 and re-implement** as fact tables per mockup. Recommended if visual coherence with the mockup matters more than the visual rhythm consistency with D1.
2. **Keep H2 and document the deviation** as an operator-decision refinement to the mockup (visual rhythm with D1 chosen over fact-table density). Acceptable if the operator prefers the card treatment.

**Surface to operator before next step on /operations.** Don't proceed assuming either outcome.

---

## 5. Common mockup elements that must match across surfaces

These elements appear on multiple surfaces. Treat as global design contracts. If they vary by surface, the surface mockup IS the binding instance; otherwise apply the global pattern.

### 5.1 Top frame (every content page)

- Sidebar: 232px sticky, 7 nav items in 2 groups (Dashboard / Regulations / Market Intel / Research / Operations / Map + divider + Community)
- Top accent line: 4px linear gradient `#1E3A8A → #DC2626`
- Page max-width: full (content padding 40px L/R) except detail pages (1100px content max)
- Sidebar nav active state: orange left border + orange text

### 5.2 Masthead pattern (Operations, Market, Research, Regulations index)

- Severity legend strip (5-label vocabulary: Action required · Cost alert · Window closing · Competitive edge · Monitoring) — except Operations which uses 4-label (Critical / High / Moderate / Low)
- 4 stat tiles matching the legend
- "What we cover by [dimension/signal type/theme]" breakdown rail (Operations: 6 cells, Market: 3 cells, Research: 7 cells)
- AI prompt bar (orange-tinted with sparkle icon, placeholder, orange Ask button, 3-4 contextual chips)
- Tabs (where present) with 2px navy underline for active

### 5.3 Card pattern (Operations D1, Market signals, Research findings, Regulations detail signal blocks)

CSS grid: `1fr 220px` with 22px gap. Card structure:

```
.body
  .item-head: severity-pill + kicker + when
  h4.title
  p.summary
  p.byline (sources with tier annotations)
.right
  severity-pill
  tier-pill
  [optional: trajectory bars — price signals only]
  .changes-callout: "What it changes" + body
  [optional: muted .changes-callout: "Conversion trigger" + body]
```

Visual: white surface, 1px border, 3px orange left border, radius-sm, shadow-card. Hover: shadow-card-hover.

Every surface that renders a card-shaped block uses THIS pattern. Variations within the .right column are surface-specific but the grid + item-head + body + right-column structure is invariant.

### 5.4 Severity vocabulary (5-label, MANDATORY)

Per `source-credibility-model` spec, the 5 labels map to colors:

| Label | Color token | Use |
|---|---|---|
| Action required | `--color-critical` (#DC2626) | Immediate workflow trigger |
| Cost alert | `--color-high` (#D97706) | Margin / pricing impact |
| Window closing | `--color-moderate` (#CA8A04) | Deadline approaching |
| Competitive edge | `--color-secondary` (#1E3A8A) | First-mover advantage |
| Monitoring | `--color-text-muted` | Background watch |

Operations uses 4-label (Critical / High / Moderate / Low) per the spec — that's the only surface that diverges, and it's intentional.

### 5.5 Tier vocabulary (T1-T7, MANDATORY)

Surface tier badges on every source pill across the site. Tier semantics per `source-credibility-model`:

- T1 Primary law (`--color-critical` border)
- T2 Regulator guidance (`--color-high` border)
- T3 Intergovernmental (`--color-secondary` border)
- T4 Industry body (`--color-text-primary` border)
- T5 Trade press (`--color-text-muted` border)
- T6 Reserved for aggregators (rarely surfaced)
- T7 Reserved for unverified (rarely surfaced)

---

## 6. Pre-build checklist for every surface

Before writing any code for a Phase 4 / Phase 5 / Phase 6 surface, run this checklist:

```
[ ] Read design_handoff_2026-05/README.md Section [matching surface]
[ ] Read design_handoff_2026-05/[surface].html end-to-end
[ ] Check this document Section 3 (Operator refinements) for that surface
[ ] Check this document Section 4 (Mid-flight corrections) for that surface
[ ] Check docs/audits/functional-purpose-audit-2026-05-24.md for required flows
[ ] Check docs/audits/comprehensive-site-audit-2026-05-25.md for code-level gaps
[ ] Verify the surface's section in audit shows what's missing vs what's broken
[ ] Identify which audit items are WIRE (existing code, missing connection), STRIP (existing code, remove), BUILD (missing entirely)
[ ] Confirm no conflict between mockup and operator refinement
[ ] If conflict exists, surface to operator before building
[ ] Commit atomically per surface
```

If at any point the mockup and the dispatch instructions diverge in a way that wasn't explicitly noted in this document as an operator refinement, **surface the divergence to operator before implementing.** The /community 5-tab strip and /operations D2-D6 card conversion are examples of divergences that should have been caught earlier; both reached commit because the surface step was skipped.

---

## 7. Audit-to-mockup gap mapping (reference)

For each surface, the audit documents map the gap from current implementation to mockup. Use this as the work-input for Phase 4.

| Surface | Audit reference | Gap summary |
|---|---|---|
| /regulations index | functional-purpose-audit § 2, comprehensive-site-audit H3-H5 | Sort tabs broken, REGION filter empty, table columns "—", UUID display |
| /regulations/[slug] | functional-purpose-audit § 3, comprehensive-site-audit L3-L5 | 3 of 14 sections rendered as first-class, dead watchlist, Penalty calculator is static |
| /market | functional-purpose-audit § 4, comprehensive-site-audit M4-M6 | Masthead/tile misalignment, legend gap, no detail route, fabricated trajectory |
| /research | functional-purpose-audit § 5 | Stat tiles non-functional, window pills toggle visual only, no detail route |
| /operations | functional-purpose-audit § 6, comprehensive-site-audit C4 | Stat counts mismatched, "100%" hardcoded, Facility Data placeholder, empty states unlabeled |
| /community | functional-purpose-audit § 7, comprehensive-site-audit C1 H1 H2 M1 M7 | Compose path lost in May 24 rebuild, CommunitySearchResults will crash, region/topic onClicks missing, 5 tabs need rebuild (not strip) |
| /map | functional-purpose-audit § 8, comprehensive-site-audit C3 H7 | Map hidden on mobile by viewMode default, hardcoded height, count mismatches |
| /admin | functional-purpose-audit § 9 | Section card counts hardcoded 0, queue UIs missing, jurisdiction normalizer gaps |
| /settings | functional-purpose-audit § 10, comprehensive-site-audit C2 | Duplicate tabs rendering same content, empty card frames |
| /profile | functional-purpose-audit § 11, comprehensive-site-audit H8 | Hardcoded zeros, org switcher MISSING |
| /dashboard | functional-purpose-audit § 1 | Count derivation chaos (Phase 2A addressed), false-positive on hardcoded zeros |
| /onboarding | functional-purpose-audit § 12 | Mostly functional; LinkedIn label updated |

---

## 8. Commitments going forward

This document is the design reference protocol for the remainder of the v3 dispatch (Phases 4, 5, 6, 7) and any subsequent dispatch (org switcher, classifier-quality, cross-cutting capability, Admin restructure).

Soft commitments (not fitness functions, not discipline rules — engine slim policy holds):

1. Read the mockup before building. Pre-build checklist (Section 6) is the gate.
2. Surface divergence rather than working around. If mockup conflicts with operator decision, surface and ask.
3. Operator refinements are explicit and enumerated (Section 3). Anything else, the mockup binds.
4. Audits show gap-to-mockup. Audits do not critique the mockup itself.

---

**End of protocol document.**
