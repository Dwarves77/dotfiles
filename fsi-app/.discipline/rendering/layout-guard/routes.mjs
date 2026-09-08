// SITE-WIDE LAYOUT GUARD - the 17 routes, each bound to the mount that renders it and to the
// artboard that specifies it. Lane layoutguard, 2026-09-08.
//
// The mounts are the design audit's own (`audit/mounts.mjs`), so the layout guard measures the SAME
// real component trees the value-level audit measures rather than a second reproduction of them -
// the operator's instruction was explicit: do not build a thirteenth parallel harness.
//
// TWO MOUNTS ARE NEW (added in the existing style, per the dispatch: "if a route has no fixture,
// add one in the existing style"). `page-frame-1440` stacks the dashboard AND the regulation detail
// in one AppShell, which is right for a component audit and wrong for a per-ROUTE layout guard:
// two page bodies in one content column make every card-vs-column and card-order measurement
// meaningless. `compose-01-dashboard` and `compose-03-regulation-detail` render one surface each,
// reusing the SAME entry and fixtures via `window.__ONLY_AUDIT` rather than forking a second copy.
//
// `noFrame` marks the two artboards that do not draw the nav+content frame at all: 16 (auth) and
// 17 (onboarding) are the AuthFrame identity split, which AppShell's own NO_SIDEBAR_ROUTES already
// encodes. L1 does not apply to them, and saying so here is a data entry rather than an `if` buried
// in the runner.

export const ROUTES = [
  { route: '/', artboard: 'p1', mount: 'compose-01-dashboard', screen: '01-dashboard' },
  { route: '/regulations', artboard: 'p2', mount: 'compose-02-regulations', screen: '02-regulations-list' },
  { route: '/regulations/[slug]', artboard: 'p3', mount: 'compose-03-regulation-detail', screen: '03-regulation-detail' },
  { route: '/market', artboard: 'p4', mount: 'compose-04-market', screen: '04-market-list' },
  { route: '/market/[slug]', artboard: 'p5', mount: 'market-detail-1440', screen: '05-market-detail' },
  { route: '/research', artboard: 'p6', mount: 'compose-06-research', screen: '06-research-list' },
  { route: '/research/[slug]', artboard: 'p7', mount: 'research-detail-1440', screen: '07-research-detail' },
  { route: '/operations', artboard: 'p8', mount: 'compose-08-operations', screen: '08-operations-list' },
  { route: '/operations/[slug]', artboard: 'p9', mount: 'operations-detail-1440', screen: '09-operations-profile' },
  { route: '/map', artboard: 'p10', mount: 'compose-map', screen: '10-map' },
  { route: '/watchlist', artboard: 'p11', mount: 'compose-11-watchlist', screen: '11-watchlist' },
  { route: '/community', artboard: 'p12', mount: 'compose-community', screen: '12-community' },
  { route: '/admin', artboard: 'p13', mount: 'compose-admin', screen: '13-admin' },
  { route: '/profile', artboard: 'p14', mount: 'compose-account', screen: '14-account' },
  { route: '/settings', artboard: 'p15', mount: 'compose-settings', screen: '15-settings' },
  { route: '/login', artboard: 'p16', mount: 'compose-login', screen: '16-auth', noFrame: true },
  { route: '/signup', artboard: 'p16', mount: 'compose-signup', screen: '16-auth', noFrame: true },
  { route: '/onboarding', artboard: 'p17', mount: 'compose-onboarding', screen: '17-onboarding', noFrame: true },
];

/** The two widths the operator named. 1024 is the tablet width he asked the guard to run at. */
export const LAYOUT_WIDTHS = [1440, 1024];

/**
 * WHO OWNS WHAT, for the routing table in the audit document. The operator's instruction: fix the
 * shared parts that are unambiguously this lane's (the frame, the card, the command bar), and for a
 * failure that belongs to a part another lane is actively rewriting, name the owning part in the
 * table so the coordinator routes it rather than two lanes editing one file.
 *
 * Keys are `<rule>@<route>`, or `<rule>` for a rule whose findings all belong to one part. The
 * routing is DATA, so the next run's table stays correct without anyone re-deriving it by eye.
 */
export const ROUTING = [
  { match: 'L1@/admin', owner: 'the admin frame (AdminDashboard.tsx `admin-t08-grid`)', note: 'the operator\'s own root cause, 2026-09-08: gap 24 not 28, no frame padding, and an explicit width:768px on the content column. Do NOT fix here - the admin frame is being rewritten.' },
  { match: 'L1@/regulations/[slug]', owner: 'the detail shell (DetailShell.tsx `.cl-detail-layout`)', note: 'gap 24 not 28 and no frame padding, on all four detail routes. Adopt <PageFrame/>.' },
  { match: 'L1@/market/[slug]', owner: 'the detail shell (DetailShell.tsx `.cl-detail-layout`)', note: 'same frame, same finding.' },
  { match: 'L1@/research/[slug]', owner: 'the detail shell (DetailShell.tsx `.cl-detail-layout`)', note: 'same frame, same finding.' },
  { match: 'L1@/operations/[slug]', owner: 'the detail shell (DetailShell.tsx `.cl-detail-layout`)', note: 'same frame, same finding.' },
  { match: 'L1@/community', owner: 'CommunityRooms.tsx `.cl-community-grid`', note: 'no frame padding at all. Adopt <PageFrame/>.' },
  { match: 'L1@/settings', owner: 'SettingsPage.tsx `.cl-settings-columns`', note: 'padding 18px 40px 0 against artboard p15\'s 18px 40px 40px. NOT fixed here: the page splits its frame into two stacked regions and the second carries the bottom padding, so the correct value is a composition question for the settings lane, not a one-number edit.' },
  { match: 'L2@/admin', owner: 'the admin frame (AdminDashboard.tsx)', note: 'overlapping action buttons at 1024, downstream of the same unconstrained content column.' },
  { match: 'L2@/settings', owner: 'SettingsPage.tsx', note: 'a wrapped chip row overlapping the Save control.' },
  { match: 'L4@/admin', owner: 'the admin frame (AdminDashboard.tsx)', note: 'the operator\'s T1-T8 strip: 387px of content past the right edge of a horizontal scroller that is not a table card. His ruling 3 removes the strip entirely.' },
  { match: 'L6', owner: 'the surface that draws the card', note: 'a card missing part of its chrome. Every one is a card drawn locally rather than mounted from components/ui/Card.tsx; adopting the shared Card is the fix and it is one import per site. The detail sections (DetailShell.tsx) are the largest group.' },
  { match: 'L7', owner: 'the component that draws the display type', note: 'Anton outside the operator\'s six. The six are declared by the shared components that draw them (data-guard-display); a part that is legitimately one of the six adds the attribute, a part that is not stops using Anton. DetailShell\'s section h2 (a card title) and the market figures (a headline figure) are the two largest groups.' },
  { match: 'L9', owner: 'the control\'s own component', note: 'targets under the 44/28 floor. The shared parts in this lane\'s reach are fixed (CardFoot, StateNote, DashboardRailCard); the rest are filter chips, list-surface controls and detail links owned by the lanes rewriting them.' },
  { match: 'L10', owner: 'the surface that renders the card', note: 'a card the artboard does not draw. Either remove it, or the operator rules it in and it takes a dated deviation entry (route, card, reason, expiry) in manifests.mjs.' },
];
