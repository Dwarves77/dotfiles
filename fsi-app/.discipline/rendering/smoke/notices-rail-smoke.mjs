// UX smoke spec: RecalculationNotice (lane NOTICES, complete-system build plan W4.3, 2026-09-05).
// F35 ROW_COMPONENTS candidate: src/components/figures/RecalculationNotice.tsx — a customer-facing row
// component (one `<li className="cl-row-card">` per notice, an entity-label title beside a timestamp
// aside — the exact "title beside an aside" shape F35's own header names) newly mounted on 5 surfaces
// this lane (Operations' AutomateVsHireCalculator, the Market index page, and all four item detail
// pages, via the shared `NoticesRail` fetch wrapper — see that module's own header). Built on
// `ux-harness.mjs`'s `runUxSpec`, fixture data only, per the UX contract
// (docs/dispatches/lane-common-contract.md).
//
// MOUNTS RecalculationNotice DIRECTLY, NOT NoticesRail. NoticesRail is a thin "use client" fetch
// wrapper (useEffect -> GET /api/notices -> setState) with no row markup of its own; the actual row
// shape (data-guard-title, the delta line, the method-version line) lives entirely in
// RecalculationNotice, which is pure-props (no fetch, no client-only hook beyond none at all — it is
// safe to mount as a plain function component). Mounting it directly means `runUxSpec`'s one-frame
// settle window is exact (no async fetch to race), the same posture the community-smoke.mjs spec uses
// for its own prop-driven `ENTRY_POST` mount alongside its fetch-driven `ENTRY_POSTLIST`.
//
// STATE AXIS: empty / one-row / extreme, keyed to notices VOLUME and entity-label LENGTH — the two ways
// a real feed varies (an org's watchlist can be empty, can produce one recalculation, or — every
// entity on the watchlist recomputing off one shared upstream input, e.g. an EIA fuel-price revision
// fanning out through every price-derived figure — many at once), plus one unbroken long token on the
// entity label + a currency-bearing delta to stress the title/meta row's wrap at 375px.

import { runUxSpec } from './ux-harness.mjs';

const ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { RecalculationNotice } from '@/components/figures/RecalculationNotice';

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(RecalculationNotice, props));
};
`;

// A single unbroken ~90-char token — the extreme-data case a long instrument/organisation
// canonical_name could plausibly produce (same stress case community-smoke.mjs's LONG_UNBROKEN uses),
// with no natural break point for a wrapping engine.
const LONG_UNBROKEN =
  "roasteddieselcompositebenchmarkforeuropeancoldchaindistributionnetworksq3twentytwentysix1234567890";

function notice(overrides = {}) {
  return {
    entityId: "cl:instrument:diesel-eu",
    entityLabel: "EU diesel composite",
    href: "/market/diesel-eu",
    methodId: "fuel_price_passthrough",
    oldValueId: "old-1",
    oldMethodVersion: "1.0.0",
    oldValue: 1.42,
    oldValueLow: 1.38,
    oldValueHigh: 1.46,
    newValueId: "new-1",
    newMethodVersion: "1.0.0",
    newValue: 1.51,
    newValueLow: 1.47,
    newValueHigh: 1.55,
    unit: null,
    currency: "EUR",
    supersededAt: "2026-09-04T12:00:00.000Z",
    triggeringEvent: {
      table: "market_series",
      pk: "diesel-eu-2026-09-04",
      changeKind: "update",
      occurredAt: "2026-09-04T11:55:00.000Z",
    },
    ...overrides,
  };
}

function extremeNotices(n) {
  return Array.from({ length: n }, (_, i) =>
    notice({
      entityId: `cl:instrument:${LONG_UNBROKEN}-${i}`,
      entityLabel: i % 3 === 0 ? null : `${LONG_UNBROKEN} lane ${i}`,
      href: i % 4 === 0 ? null : `/market/lane-${i}`,
      oldValueId: `old-${i}`,
      newValueId: `new-${i}`,
      oldValue: 1000 + i,
      newValue: 950 + i,
      newMethodVersion: i % 2 === 0 ? "1.0.0" : "1.1.0",
      currency: i % 2 === 0 ? "USD" : null,
      unit: i % 2 === 0 ? null : "MWh",
      triggeringEvent: i % 5 === 0 ? null : notice().triggeringEvent,
    })
  );
}

export async function runSmoke(browser) {
  return runUxSpec(browser, {
    name: "notices-rail",
    entry: ENTRY,
    states: [
      // Honest empty state (docs/plans/complete-system-build-plan-2026-09-04.md W4.3: "with the honest
      // empty state when there are none"). No data-guard-title in this branch by design (the empty-state
      // copy is not itself a titled row) — expectTitles deliberately omitted rather than asserting 0,
      // which would prove nothing.
      { label: "empty", props: { notices: [] } },
      { label: "one-row", props: { notices: [notice()] }, expectTitles: 1 },
      { label: "extreme", props: { notices: extremeNotices(8) }, expectTitles: 8 },
    ],
  });
}
