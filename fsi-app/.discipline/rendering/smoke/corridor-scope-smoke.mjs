// UX smoke spec: the two real components lane SCOPE-READER wired to the entity_scope reader
// (2026-09-06, operator ruling: "keep spec 08's scoping table, build the reader, and make every
// customer-facing corridor reference human-readable, because nobody knows what CNSHA-NLRTM means").
//
// WHAT THIS MOUNTS.
//   1. CarbonCostOverlay (src/components/market/CarbonCostOverlay.tsx) — UNCHANGED shape, already a
//      pure server component with no fetch of its own (see that file's own header); this lane only added
//      two OPTIONAL props to its entry type (`label`, `entityId`, `jurisdictions`) and the jurisdiction-
//      chip block + anchor `id` that render from them. No split needed — it already has zero
//      `@/lib/supabase-server` (or any server-only) import in its graph, so it bundles for a browser
//      smoke harness exactly as-is.
//   2. CorridorsAppliedStripView (src/components/regulations/CorridorsAppliedStripView.tsx) — the new
//      pure, sync render half of the regulation-detail "Corridors this applies on" block. Split from its
//      data-fetch sibling CorridorsAppliedStrip.tsx for the SAME reason every spec-09 panel is split (see
//      that lane's spec09-smoke.mjs header): the fetch half transitively imports Next's server
//      request-tracing chain (`@opentelemetry/api`, via `@/lib/entities/corridor-scope-cache` ->
//      `@/lib/supabase-server`), unresolvable in a plain esbuild browser bundle.
//
// STATE AXIS. Each component gets its own empty/populated pair (independent — a corridor selector with
// no jurisdiction data and a regulation with no touching corridors are two different honest-omission
// states, not the same one): CarbonCostOverlay's `overlays: []` / a populated set spanning all three
// badge states (statutory/derived/estimate) plus a GAP card, several jurisdiction chips, one long
// unbroken corridor label (a UN/LOCODE miss, unformatted raw code, to prove the "never guessed" fallback
// renders honestly rather than throwing or truncating); CorridorsAppliedStripView's `corridors: []` (must
// render NOTHING — plan §W5, asserted below) / a populated set with multi-jurisdiction chips and one long
// label, to exercise the 44px link-row target floor and wrap.
//
// SCREENSHOTS. Saved to the path SCOPE_READER_SCREENSHOT_DIR names (env var, default a scratch dir under
// /tmp — never committed to the repo; the "screenshots" deliverable is REPORT evidence, not a repo
// artifact, same posture the harness takes with every other spec's pass/fail proof).

import { bundleEntry, newSmokePage, mountBundle, measureGuard, assertGuardClean } from './harness.mjs';
import { MOBILE_VIEWPORT, DESKTOP_VIEWPORT } from './ux-harness.mjs';
import { measureUx, assertUxClean } from '../ux-assert.mjs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SCREENSHOT_DIR =
  process.env.SCOPE_READER_SCREENSHOT_DIR || '/tmp/claude-scope-reader-smoke-screenshots';

const ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { CarbonCostOverlay } from '@/components/market/CarbonCostOverlay';
import { CorridorsAppliedStripView } from '@/components/regulations/CorridorsAppliedStripView';

function CorridorScopeSmokeRoot(props) {
  return React.createElement(React.Fragment, null,
    React.createElement(CarbonCostOverlay, { overlays: props.overlays }),
    React.createElement(CorridorsAppliedStripView, { corridors: props.corridors }),
  );
}

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(CorridorScopeSmokeRoot, props));
};
`;

const LONG_UNBROKEN =
  'CNSHA-EXTREMELYLONGUNKNOWNLOCODEFRAGMENTTHATHASNOENTRYINTHEREFERENCEMODULE-NLRTM:ocean';

function okResult(overrides = {}) {
  return {
    ok: true,
    corridor: { origin: 'CNSHA', dest: 'NLRTM', mode: 'ocean' },
    unit: 'FEU',
    currency: 'EUR',
    low: 210.4,
    point: 244.8,
    high: 279.2,
    classification: 'statutory',
    intensity: { headlineLabel: 'IMO CII', unit: 'gCO2/t-nm', sourceKey: 'imo-cii-2026' },
    distanceKm: 19620,
    distanceBasis: 'Great-circle, ocean routing table',
    payloadTonnesPerFeu: 21.7,
    payloadBasis: 'IMO default FEU payload',
    carbonPrice: { value: 82.4, currency: 'EUR', sourceKey: 'eua-front-dec', asOf: '2026-09-05', basis: 'EUA front-month settle' },
    gaps: [],
    ...overrides,
  };
}

function gapResult(overrides = {}) {
  return {
    ok: false,
    corridor: { origin: 'USLAX', dest: 'ITGOA', mode: 'ocean' },
    gaps: ['No emission-factor fixture for this mode', 'No live carbon price series resolved'],
    partial: {
      intensity: null,
      distanceKm: 11230,
      distanceBasis: 'Great-circle, ocean routing table',
      payloadTonnesPerFeu: null,
      payloadBasis: null,
      carbonPrice: null,
    },
    ...overrides,
  };
}

const EMPTY_OVERLAYS = [];

function populatedOverlays() {
  return [
    {
      label: 'Shanghai (CN) → Rotterdam (NL), ocean',
      entityId: 'cl:corridor:cnsha-nlrtm-ocean',
      jurisdictions: [{ code: 'CN', name: 'China' }, { code: 'NL', name: 'Netherlands' }],
      result: okResult(),
    },
    {
      label: 'New York (US) → Genoa (IT), ocean',
      entityId: 'cl:corridor:usnyc-itgoa-ocean',
      jurisdictions: [{ code: 'US', name: 'United States' }, { code: 'IT', name: 'Italy' }],
      result: okResult({
        corridor: { origin: 'USNYC', dest: 'ITGOA', mode: 'ocean' },
        classification: 'estimate',
        low: 190.1,
        point: 231.6,
        high: 288.9,
      }),
    },
    {
      // Deliberate UN/LOCODE miss: no unlocode-names.mjs entry for this raw code — the label falls back
      // to the caller-supplied string verbatim rather than being guessed, an unbroken long token to
      // exercise the squeezed-title/overflow detectors against a real card width.
      label: LONG_UNBROKEN,
      entityId: 'cl:corridor:unknown-unknown-ocean',
      jurisdictions: [],
      result: gapResult(),
    },
  ];
}

const EMPTY_CORRIDORS = [];

function populatedCorridors() {
  return [
    {
      entityId: 'cl:corridor:cnsha-nlrtm-ocean',
      label: 'Shanghai (CN) → Rotterdam (NL), ocean',
      jurisdictions: [{ code: 'CN', name: 'China' }, { code: 'NL', name: 'Netherlands' }],
    },
    {
      entityId: 'cl:corridor:usnyc-itgoa-ocean',
      label: 'New York (US) → Genoa (IT), ocean',
      jurisdictions: [{ code: 'US', name: 'United States' }, { code: 'IT', name: 'Italy' }],
    },
    {
      entityId: 'cl:corridor:unknown-unknown-ocean',
      label: LONG_UNBROKEN,
      jurisdictions: [{ code: 'XX', name: null }],
    },
  ];
}

const STATES = [
  { label: 'empty', props: { overlays: EMPTY_OVERLAYS, corridors: EMPTY_CORRIDORS }, expectTitles: 0 },
  // Only CorridorsAppliedStripView carries a data-guard-title (one, for the whole strip — see that
  // file's own header); CarbonCostOverlay's per-card <h2> title is the section header, not per corridor.
  { label: 'populated', props: { overlays: populatedOverlays(), corridors: populatedCorridors() }, expectTitles: 1 },
];

export async function runSmoke(browser) {
  const failures = [];
  let checks = 0;
  const bundleJs = await bundleEntry(ENTRY, {});

  try {
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
  } catch {
    // best-effort; a screenshot write failure is evidence-gathering, never a gate failure
  }

  for (const vp of [MOBILE_VIEWPORT, DESKTOP_VIEWPORT]) {
    for (const state of STATES) {
      const label = `corridor-scope:${state.label}@${vp.width}`;
      const page = await newSmokePage(browser);
      try {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await mountBundle(page, bundleJs, '__mount', state.props);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));

        const guard = await measureGuard(page);
        const ux = await measureUx(page);
        checks += 1;
        failures.push(...assertGuardClean(label, guard));
        failures.push(...assertUxClean(label, ux));
        if (state.expectTitles && ux.titles.length < state.expectTitles) {
          failures.push(`${label}: expected >=${state.expectTitles} [data-guard-title] element(s), found ${ux.titles.length} (spec cannot pass by rendering nothing)`);
        }

        // Empty state: NEITHER component renders anything (both return null on empty input — plan §W5,
        // "nothing renders empty by design") — proof, not assumption.
        if (state.label === 'empty') {
          checks += 1;
          const rootHtml = await page.$eval('#smoke-root', (el) => el.innerHTML.trim());
          if (rootHtml.length !== 0) {
            failures.push(`${label}: expected the empty state to render NOTHING (both components return null), found ${rootHtml.length} chars of markup.`);
          }
        }

        // Populated state: the UN/LOCODE miss renders its raw, un-guessed label verbatim in both
        // components (never silently dropped, never replaced by a placeholder).
        if (state.label === 'populated') {
          checks += 1;
          const text = await page.textContent('body');
          const rawCodeCount = (text.match(/EXTREMELYLONGUNKNOWNLOCODEFRAGMENT/g) || []).length;
          if (rawCodeCount < 2) {
            failures.push(`${label}: expected the un-guessed UN/LOCODE raw label to render verbatim in both components (found ${rawCodeCount} occurrence(s), expected >=2).`);
          }
        }

        try {
          await page.screenshot({
            path: join(SCREENSHOT_DIR, `${state.label}-${vp.width}x${vp.height}.png`),
            fullPage: true,
          });
        } catch {
          // best-effort evidence capture; never a gate failure
        }
      } finally {
        await page.close();
      }
    }
  }

  return { checks, failures };
}
