// SITE-WIDE LAYOUT GUARD - the allowlists, as DATA with the operator's own reasons attached.
// Lane layoutguard, 2026-09-08. GOVERNING text: the operator's "SITE-WIDE LAYOUT GUARD" dispatch
// (rules L1-L12, verbatim in docs/design/handoff-2026-09-06/DEVIATION-LOG.md, this lane's section),
// docs/design/handoff-2026-09-06/README.md §0.3/§0.4, and the artboard values in
// 'Caros Ledge UI System.dc.html'.
//
// WHY DATA AND NOT `if` STATEMENTS. The operator's instruction on L4/L5 and L7 was explicit: the
// allowlist is encoded "as data with his reasons attached, so a future addition is a visible edit
// rather than a silent exception". Every entry below therefore carries `reason` (why this element
// is allowed to break the rule) and `source` (who ruled it). A lane that needs a new exception adds
// a row here, in a diff a reviewer reads, and the guard's own test asserts every row has both
// fields - an exception with no stated reason fails the test suite, not the review.

/**
 * L1. THE FRAME, per artboard, measured from 'Caros Ledge UI System.dc.html' rather than asserted
 * from the app's own source. Comparing the build to the build proves nothing; these are the numbers
 * the DESIGN carries, extracted from each artboard's own frame div (see generate-manifests.mjs,
 * which reads the same file).
 *
 * `padding` is per artboard because the artboards themselves differ: p1-p13 draw `20px 40px 40px`
 * and p14/p15 (account, settings) draw `18px 40px 40px`, both verbatim in the dc.html. The artboard
 * is the spec (handoff README "Fidelity: high"), so the guard carries the artboard's number rather
 * than flattening the two into one and reporting the account page as broken for matching its own
 * drawing. L1's substance - one grid, a 300px rail, a 28px gap, a content column with no width of
 * its own - is identical on every route.
 *
 * `stackedBelow: 1280` is README §0.3 verbatim ("Below 1280 the rail stacks under the content"), so
 * at 1024 the guard expects the STACKED form: one track, still no width on the content column. This
 * is the designed behaviour, not an invented responsive rule - ruling R10 (no invented responsive
 * behaviour at 1024/390) is respected because the handoff itself states this one.
 */
export const FRAME_SPEC = {
  railPx: 300,
  gapPx: 28,
  alignItems: 'start',
  contentTrack: 'minmax(0,1fr)',
  stackedBelow: 1280,
  /** Frame padding by artboard id, from the dc.html. */
  paddingByArtboard: {
    p1: '20px 40px 40px', p2: '20px 40px 40px', p3: '20px 40px 40px', p4: '20px 40px 40px',
    p5: '20px 40px 40px', p6: '20px 40px 40px', p7: '20px 40px 40px', p8: '20px 40px 40px',
    p9: '20px 40px 40px', p10: '20px 40px 40px', p11: '20px 40px 40px', p12: '20px 40px 40px',
    p13: '20px 40px 40px', p14: '18px 40px 40px', p15: '18px 40px 40px',
  },
};

/**
 * L5. THE POSITIONING ALLOWLIST - the operator's own list, verbatim: "Only the nav card (sticky),
 * the detail section index (sticky), the command bar hint, and overlays may use position other than
 * static/relative."
 *
 * `match` is a CSS selector tested against the element itself or an ancestor (`viaAncestor: true`),
 * because an overlay's own children inherit the exception from the overlay that carries them.
 */
export const POSITION_ALLOWLIST = [
  {
    id: 'nav-card-sticky',
    match: '[data-guard-nav], aside.cl-nav-card, .cl-sidebar',
    viaAncestor: true,
    positions: ['sticky', 'fixed'],
    reason: 'the nav card is sticky by design so the page never shifts on navigation (operator L5, README §0.3 "Nav 252px, always")',
    source: 'operator, SITE-WIDE LAYOUT GUARD 2026-09-08, L5',
  },
  {
    id: 'detail-section-index-sticky',
    match: '[data-guard-section-index], .cl-section-index',
    viaAncestor: true,
    positions: ['sticky'],
    reason: 'the detail section index is sticky by design (README §0.5 "sticky section index S1 · S2 · S3")',
    source: 'operator, SITE-WIDE LAYOUT GUARD 2026-09-08, L5',
  },
  {
    id: 'command-bar-hint',
    match: '.cl-cmdk-hint',
    viaAncestor: false,
    positions: ['absolute', 'sticky'],
    reason: 'the command bar ⌘K hint may be positioned inside the bar (operator L5)',
    source: 'operator, SITE-WIDE LAYOUT GUARD 2026-09-08, L5',
  },
  {
    id: 'overlays',
    match: '[data-guard-overlay], [role="dialog"], [role="menu"], [role="tooltip"], [role="listbox"], .cl-scrim, .cl-toast, .cl-popover',
    viaAncestor: true,
    positions: ['absolute', 'fixed', 'sticky'],
    reason: 'overlays (dialogs, menus, popovers, tooltips, scrims, toasts) sit above the page by definition (operator L5)',
    source: 'operator, SITE-WIDE LAYOUT GUARD 2026-09-08, L5',
  },
  {
    id: 'map-markers',
    match: '[data-guard-clip]',
    viaAncestor: true,
    positions: ['absolute', 'fixed', 'sticky'],
    reason: 'inside the DECLARED clipping viewport a marker and a tile are placed by GEOGRAPHY, not by layout - the same reasoning FOLD-61 already ratified for the map ("an overlap is geography, not a defect", audit/run-audit.mjs\'s containmentOnly note; the tile grid, lane mapclip)',
    source: 'lane mapclip 2026-09-08 (data-guard-clip), extended from L2/L3 to L5 by lane layoutguard 2026-09-08',
  },
  {
    id: 'mobile-top-bar',
    match: '[data-guard-topbar], .cl-topbar',
    viaAncestor: true,
    positions: ['sticky'],
    reason: 'below 768 the nav card is replaced by the sticky top bar, which IS the nav card at that width (mobile-390 spec, TOP BAR); the same exception the nav card carries, at the width where it is the nav',
    source: 'lane layoutguard 2026-09-08, extending the operator\'s nav-card entry to the part that replaces it below 768',
  },
];

/**
 * L4 / L3. THE ONE PERMITTED HORIZONTAL SCROLLER: the table-card pattern (card `overflow:hidden`,
 * inner `overflow-x:auto`, sticky first column, scroll hint), plus the declared strips the rendering
 * guard's own `data-guard-strip` contract already governs. Everything else that scrolls sideways is
 * content the reader cannot reach by page scroll or keyboard, which is L4's whole point.
 */
export const SCROLLER_ALLOWLIST = [
  {
    id: 'table-card-inner-scroller',
    match: '[data-guard-table-card] [data-guard-strip], [data-guard-strip]',
    reason: 'the table-card inner scroller is the only permitted horizontal scroller, and its columns must also be reachable by keyboard (operator L3/L4)',
    source: 'operator, SITE-WIDE LAYOUT GUARD 2026-09-08, L3 and L4',
    requiresKeyboardReach: true,
  },
  {
    id: 'map-tile-viewport',
    match: '[data-guard-clip]',
    reason: 'a slippy map lays a tile grid wider than its frame and clips it; a tile is rendering substrate, not a run of words (lane mapclip 2026-09-08, DEVIATION-LOG "LANE MAPCLIP")',
    source: 'lane mapclip 2026-09-08, ratified at FOLD-61',
    requiresKeyboardReach: false,
  },
];

/**
 * L7. THE DISPLAY-TYPE (Anton) ALLOWLIST - the operator's own six, verbatim: "Anton only on: page
 * title, card title, band-tile numeral, stat-block numeral, headline figure, timeline callout."
 * Anything else computing to that family fails.
 */
// The six the operator named are declared by the SHARED COMPONENT that draws them, with one
// attribute (`data-guard-display`) carrying which of the six it is. A page that wants display type
// therefore has to reach for one of these parts, which is the point: the allowlist is not a list of
// selectors a page can quietly satisfy, it is a list of components.
export const ANTON_ALLOWLIST = [
  { id: 'page-title', match: '[data-guard-display="page-title"]', reason: 'page title (README §0.3: Anton 34px list/dashboard, 28px detail) - drawn by Masthead.tsx', source: 'operator L7' },
  { id: 'card-title', match: '[data-guard-display="card-title"]', reason: 'card title (README type scale: display titles 20px) - drawn by SectionHeading.tsx', source: 'operator L7' },
  { id: 'band-tile-numeral', match: '[data-guard-display="band-tile-numeral"]', reason: 'band-tile numeral (README §0.4: Anton numeral 34px in band colour) - drawn by BandTile.tsx', source: 'operator L7' },
  { id: 'stat-block-numeral', match: '[data-guard-display="stat-block-numeral"]', reason: 'stat-block numeral (README §0.4: label / Anton numeral / note) - drawn by StatBlock.tsx', source: 'operator L7' },
  { id: 'headline-figure', match: '[data-guard-display="headline-figure"]', reason: 'headline figure (the market surface\'s "Carbon cost per FEU" figure)', source: 'operator L7' },
  { id: 'timeline-callout', match: '[data-guard-display="timeline-callout"]', reason: 'timeline callout (README §0.4: the callout is always the next obligation)', source: 'operator L7' },
  {
    id: 'nav-wordmark',
    match: '[data-guard-display="wordmark"]',
    reason: 'the nav card wordmark "Caro\'s Ledge" - the artboard draws it in Anton on every one of the 17 frames (dc.html, each frame\'s nav card: font-family:\'Anton\';font-size:19px), and the artboard is the spec',
    source: 'lane layoutguard 2026-09-08 - a seventh entry the operator\'s six did not name, added because the artboards draw it; stated in the lane report rather than assumed',
  },
];

/**
 * L8. THE ABSENCE COMPONENT. The forbidden strings are the operator's regex, verbatim; the one
 * element allowed to render them is the absence convention itself (`Absence.tsx`, which marks both
 * its variants `.cl-absence` - see that file's FOLD-61 header).
 */
export const ABSENCE_PATTERN = /NOT IN PRIMARY SOURCE|UNSCORED|NOT SCORED|PENDING/;
export const ABSENCE_HOST = '.cl-absence, [data-absence]';

/**
 * "PENDING" is the one word in the operator's four that is also ordinary English, and the first run
 * proved it: it matched "4 inputs pending" on /market and "489 pending · showing 4 · approved" on
 * /admin, neither of which is an absence token shouting in a cell - they are sentences. The other
 * three ("NOT IN PRIMARY SOURCE", "UNSCORED", "NOT SCORED") are never prose in this product and are
 * matched anywhere they appear.
 *
 * So PENDING alone must be the WHOLE of its own rendered text run to be a finding, which is exactly
 * what an absence token is: a value standing where a value would. The rule is not weakened -
 * `<span>PENDING</span>` in a cell still fails, at every viewport - it is made to mean what it says.
 * [CONFIRMED by the run that produced both false positives; see docs/audits/layout-guard-2026-09-08.md.]
 */
export const ABSENCE_WHOLE_RUN_ONLY = /^PENDING$/;
export const ABSENCE_ANYWHERE = /NOT IN PRIMARY SOURCE|UNSCORED|NOT SCORED/;

/**
 * NOT CARDS, though they carry the card's chrome. The README gives each of these its own anatomy,
 * so holding them to L6's four-part card chrome would report a correct part as broken:
 *   - band tile (§0.4): `padding:14px 16px 0`, stacked label over window, Anton numeral, and a 4px
 *     band rule pinned to the card's BOTTOM edge - deliberately not a 3px top rule;
 *   - stat block / stat tile (§0.4): "label / Anton numeral / note ... never a band tile", a
 *     counter rather than a panel.
 *   - the HEADLINE SERIES tile (added FOLD 63, 2026-09-08). Artboard 04's HEADLINE SERIES card is a
 *     card and draws the 3px rule; the five tiles INSIDE it carry the same chrome and no rule. Read
 *     off the artboard source itself, `docs/design/handoff-2026-09-06/Caros Ledge UI System.dc.html`
 *     id="p4": the enclosing card opens
 *     `<div style="...border-radius:10px;box-shadow:..."><div style="height:3px;background:linear-gradient(90deg,#5A5552,...)">`
 *     while each tile opens
 *     `background:#fff;border:1px solid rgba(0,0,0,.12);border-radius:10px;box-shadow:0 1px 2px rgba(26,26,26,.04),0 4px 14px rgba(26,26,26,.06);padding:10px 12px;overflow:hidden`
 *     with no rule child at all. Without this entry L6 reported five "3px top rule (measured none)"
 *     findings and L10 five "not in the manifest" findings on /market, for five tiles the artboard
 *     draws exactly as they are rendered.
 * ALL THREE are excluded from the manifest by generate-manifests.mjs for the same reason, so the two
 * sides of L10's comparison agree on what a card is. For the headline tile that exclusion is
 * STRUCTURAL rather than by name: `cardsIn()` returns at the first card it meets and never descends
 * into it, so a tile nested inside a card can never enter a manifest. This entry is what makes the
 * BUILD side agree with the manifest side it was already being compared against.
 */
export const NOT_A_CARD = '.cl-band-tile, .cl-admin-stat-tile, .cl-stat-tile, [data-guard-band-tile], [data-guard-stat-tile], [data-guard-tile]';

/**
 * L9. Hit targets, the operator's own numbers: ">= 44px in one dimension and >= 28px in the other;
 * adjacent targets do not overlap." Deliberately DIFFERENT from ux-assert.mjs's law-2 floor (>=44,
 * or >=24 with 8px clearance), which is the mobile row law and stays as it is; this is the
 * site-wide layout rule. Both are enforced; neither is weakened to match the other.
 */
export const L9_LONG_AXIS_MIN = 44;
export const L9_SHORT_AXIS_MIN = 28;

/**
 * L2. Minimum overlap, in px on BOTH axes, before an intersection is reported. A 1px border, a 3px
 * rule drawn with a negative margin, and sub-pixel rounding all produce intersections of 1-3px that
 * are not what the operator means by "two elements with visible content intersect". Calibrated
 * against the real overlap the test fixture reproduces (40x40), which is two orders above it.
 */
export const OVERLAP_TOLERANCE_PX = 4;
