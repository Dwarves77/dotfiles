// UX smoke spec: spec 09 panels (OemRoadmapPanel, ReroutingPanel, AuxiliaryEnergyPanel,
// GridQueuePanel, IndexationPanel). Lane SPEC-09, wave 3, 2026-09-03; IndexationPanel added by lane
// SPEC09-B, 2026-09-05; narrowed by lane EXTERNAL-ONLY, 2026-10-03 (ADR-042 removed the surcharge-audit,
// DQI and EUDR/custody panels). docs/dispatches/lane-common-contract.md UX contract; docs/design/ux-laws.md;
// RD-60; F35 row-ux-coverage.
//
// WHAT THIS MOUNTS, AND WHY NOT THE ASYNC PANELS THEMSELVES. Every panel is a self-contained async
// Server Component (`export async function XPanel()`, fetch via `@/lib/supabase-server`). Two
// independent reasons neither of those async wrappers can be the thing this spec bundles and mounts
// with ReactDOM.createRoot, both proven live while authoring this file:
//   1. React's client reconciler (a plain esbuild --platform=browser IIFE bundle, no RSC renderer) does
//      not support an async function component — there is no server pipeline here to resolve it.
//   2. `@/lib/supabase-server` transitively imports Next's server request-tracing chain, which requires
//      `@opentelemetry/api` — absent from a browser bundle (esbuild: `Could not resolve
//      "@opentelemetry/api"`, reproduced while building this spec).
// Every panel is therefore split (same commit) into a data-only file (`XPanel.tsx`, unchanged public
// name/behaviour) and a SEPARATE sync render-only file (`XPanelView.tsx`, no `@/lib/supabase-server`
// import anywhere in its own graph) — the real production render code, just reachable without the two
// obstacles above. This spec bundles and mounts the five `*View` files directly; nothing here is a
// reproduction of the real markup.
//
// THE CSS ALIAS. Each View imports `@/components/market/spec09.css` (this lane's shared header/mobile
// stylesheet) for its side effect. esbuild's default `.css` handling needs an output path this harness's
// `write:false`, no-outdir bundleEntry() does not configure (`Cannot import "...css" into a JavaScript
// file without an output path configured`), and esbuild's `alias` option only accepts non-relative
// specifier names — which `@/components/market/spec09.css` is, unlike `./spec09.css`, which is exactly
// why every View imports the CSS via the `@/` path alias rather than a relative one. The alias below
// redirects that one specifier to an existing, already-harmless smoke stub (`stub-next-link.mjs` — any
// valid ES module works as the target of a side-effect-only `import "..."`, and reusing an existing file
// avoids adding a new one purely to be empty).
//
// FIXTURE SHAPE. One composite root (`Spec09SmokeRoot`, defined in the entry below) renders all five
// Views stacked, each already carrying its own `data-guard-container` (added this commit, alongside
// `data-guard-title` on every panel's `<h2>`) so the squeezed-title and overflow detectors measure each
// panel's own card width, not the full viewport. Two states, per the lane brief ("fixture data incl.
// empty and extreme states"): `empty` (every table's honest "no rows yet" line, today's live state per
// scripts/spec09/SOURCES.md) and `extreme` (every table populated, several rows each, deliberately long
// free-text values (corridor ids, DSO names, contract refs), the same defect class
// F35/ux-assert.mjs exists to catch).

import { bundleEntry, newSmokePage, mountBundle, measureGuard, assertGuardClean } from './harness.mjs';
import { MOBILE_VIEWPORT, DESKTOP_VIEWPORT } from './ux-harness.mjs';
import { measureUx, assertUxClean } from '../ux-assert.mjs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
// See header "THE CSS ALIAS" — any valid ES module works here; reusing the existing next/link stub
// avoids adding a file purely to be an empty side-effect target.
const CSS_ALIAS_TARGET = join(HERE, 'stub-next-link.mjs');

const ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { OemRoadmapPanelView } from '@/components/market/OemRoadmapPanelView';
import { ReroutingPanelView } from '@/components/market/ReroutingPanelView';
import { AuxiliaryEnergyPanelView } from '@/components/operations/AuxiliaryEnergyPanelView';
import { GridQueuePanelView } from '@/components/operations/GridQueuePanelView';
import { IndexationPanelView } from '@/components/market/IndexationPanelView';

function Spec09SmokeRoot(props) {
  return React.createElement(React.Fragment, null,
    React.createElement(OemRoadmapPanelView, { rows: props.oem }),
    React.createElement(ReroutingPanelView, { rows: props.reroute }),
    React.createElement(AuxiliaryEnergyPanelView, { rows: props.aux }),
    React.createElement(GridQueuePanelView, { rows: props.grid }),
    React.createElement(IndexationPanelView, { rows: props.indexation }),
  );
}

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(Spec09SmokeRoot, props));
};
`;

const EMPTY_STATE = Object.freeze({
  oem: [], reroute: [], aux: [], grid: [], indexation: [],
});

const LONG = (n, word) => Array.from({ length: n }, (_, i) => `${word}-${i}`).join(' ');

/** Extreme fixture: every table populated, several rows each, deliberately long free-text values to
 *  exercise the squeezed-title/overflow detectors against real card widths. Enum-shaped columns (e.g.
 *  tech_category, commercial_stage) use REAL values from their DB CHECK vocabularies (see
 *  migrations 296-298) so the real calculators (evaluateGridQueueGate, tcoCrossoverBand) exercise
 *  their real branches, not a default/unknown path. */
function extremeState() {
  return {
    oem: [
      { roadmap_id: 'o1', tech_category: 'heavy_battery', commercial_stage: 'small_batch_fleet', target_year: 2028, density_basis: 'pack', confidence_admiralty: 'B2', announced_at: '2026-06-01' },
      { roadmap_id: 'o2', tech_category: 'hydrogen_fcell', commercial_stage: 'announced', target_year: null, density_basis: null, confidence_admiralty: null, announced_at: '2026-01-15' },
    ],
    reroute: [
      { reroute_id: 'r1', baseline_corridor_id: `cl:corridor:${LONG(4, 'suez-baseline-long-id-segment')}`, reroute_corridor_id: `cl:corridor:${LONG(4, 'cape-reroute-long-id-segment')}`, cause: 'Red Sea diversion (Houthi attacks, Bab-el-Mandeb strait closure)', fuel_burn_multiplier: 1.35, effective_from: '2025-12-01', effective_to: null },
    ],
    aux: [
      { profile_id: 'x1', load_type: 'museum_spec_hold', kw_draw: 4.2, duty_cycle: 0.9, hours_typical: 72, setpoint_c: 21, setpoint_rh_pct: 50, grid_intensity_source: 'EEA gCO2/kWh, EU grid mix 2026' },
      { profile_id: 'x2', load_type: 'reefer_genset', kw_draw: 8, duty_cycle: 1, hours_typical: 240, setpoint_c: -18, setpoint_rh_pct: null, grid_intensity_source: null },
    ],
    grid: [
      { queue_id: 'g1', dso_name: `${LONG(5, 'extremely-long-distribution-system-operator-name-segment')}`, capacity_band_mw: '1-5MW', queue_months_p50: 18, queue_months_p90: 40, as_of: '2026-08-01' },
      { queue_id: 'g2', dso_name: 'Small DSO', capacity_band_mw: '<1MW', queue_months_p50: 6, queue_months_p90: 10, as_of: '2026-08-01' },
    ],
    indexation: [
      { clause_id: 'i1', contract_ref: `${LONG(6, 'extremely-long-contract-reference-token')}`, corridor_id: 'cl:corridor:0000000000000101', index_id: 'cl:instrument:eua-front-dec', base_value: 80, base_date: '2026-01-01', passthrough_pct: 70, cap_pct: 20, floor_pct: -10, review_cadence: 'quarterly', rounding_rule: 'round to nearest cent' },
      { clause_id: 'i2', contract_ref: null, corridor_id: null, index_id: 'cl:instrument:uka', base_value: 45, base_date: '2026-03-01', passthrough_pct: 100, cap_pct: null, floor_pct: null, review_cadence: 'monthly', rounding_rule: 'round to nearest whole unit' },
    ],
  };
}

const STATES = [
  { label: 'empty', props: EMPTY_STATE, expectTitles: 0 },
  // 8 -> 5 (UI fix round 2026-09-08, item D3), then 5 -> 3 (ADR-042, 2026-10-03): the OPERATIONS panels
  // (auxiliary energy, grid queue) live on the Operations profile as S-sections, and a section body does
  // not carry its own heading ( <DetailSection> supplies it, and DetailShell.tsx's h2 carries
  // `data-guard-title` for them). The three MARKET panels (OEM roadmap, rerouting, indexation) still
  // render their own heading and are counted here. The spec follows the product: it is still an exact
  // minimum and still fails if any of the three stops rendering. The moved sections' titles are measured
  // on the profile instead, by .discipline/rendering/audit/spec/compose-09-operations-profile.json.
  { label: 'extreme', props: extremeState(), expectTitles: 3 },
];

export async function runSmoke(browser) {
  const failures = [];
  let checks = 0;
  const bundleJs = await bundleEntry(ENTRY, {
    alias: { '@/components/market/spec09.css': CSS_ALIAS_TARGET },
  });

  for (const vp of [MOBILE_VIEWPORT, DESKTOP_VIEWPORT]) {
    for (const state of STATES) {
      const label = `spec09-panels:${state.label}@${vp.width}`;
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

        // Empty state: every one of the five "no rows yet" gap lines renders (honest omission, never a
        // silently blank panel), law 15's "explain what went wrong" applied to an absent-data state.
        if (state.label === 'empty') {
          checks += 1;
          const text = await page.textContent('body');
          const gapCount = (text.match(/No rows yet/gi) || []).length;
          if (gapCount < 5) {
            failures.push(`${label}: expected 5 "no rows yet" gap lines (one per panel), found ${gapCount}.`);
          }
        }
      } finally {
        await page.close();
      }
    }
  }

  return { checks, failures };
}
