// UX smoke spec: spec 09 panels (SurchargeAuditPanel, OemRoadmapPanel, ReroutingPanel, DqiPanel,
// AuxiliaryEnergyPanel, GridQueuePanel, EudrCustodyPanel, IndexationPanel). Lane SPEC-09, wave 3,
// 2026-09-03; IndexationPanel added by lane SPEC09-B, 2026-09-05 (the reader indexation_clauses lacked at
// wave 3 — docs/dispatches/lane-common-contract.md UX contract; docs/design/ux-laws.md; RD-60; F35
// row-ux-coverage).
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
// obstacles above. This spec bundles and mounts the seven `*View` files directly; nothing here is a
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
// FIXTURE SHAPE. One composite root (`Spec09SmokeRoot`, defined in the entry below) renders all seven
// Views stacked, each already carrying its own `data-guard-container` (added this commit, alongside
// `data-guard-title` on every panel's `<h2>`) so the squeezed-title and overflow detectors measure each
// panel's own card width, not the full viewport. Two states, per the lane brief ("fixture data incl.
// empty and extreme states"): `empty` (every table's honest "no rows yet" line, today's live state per
// scripts/spec09/SOURCES.md) and `extreme` (every table populated, several rows each, deliberately long
// free-text values — invoice lines, corridor ids, DSO names, consignment refs — the same defect class
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
import { SurchargeAuditPanelView } from '@/components/market/SurchargeAuditPanelView';
import { OemRoadmapPanelView } from '@/components/market/OemRoadmapPanelView';
import { ReroutingPanelView } from '@/components/market/ReroutingPanelView';
import { DqiPanelView } from '@/components/operations/DqiPanelView';
import { AuxiliaryEnergyPanelView } from '@/components/operations/AuxiliaryEnergyPanelView';
import { GridQueuePanelView } from '@/components/operations/GridQueuePanelView';
import { EudrCustodyPanelView } from '@/components/regulations/EudrCustodyPanelView';
import { IndexationPanelView } from '@/components/market/IndexationPanelView';

function Spec09SmokeRoot(props) {
  return React.createElement(React.Fragment, null,
    React.createElement(SurchargeAuditPanelView, { rows: props.surcharge }),
    React.createElement(OemRoadmapPanelView, { rows: props.oem }),
    React.createElement(ReroutingPanelView, { rows: props.reroute }),
    React.createElement(DqiPanelView, { rows: props.dqi }),
    React.createElement(AuxiliaryEnergyPanelView, { rows: props.aux }),
    React.createElement(GridQueuePanelView, { rows: props.grid }),
    React.createElement(EudrCustodyPanelView, { plotClaims: props.eudrPlot, custodyChains: props.eudrCustody }),
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
  surcharge: [], oem: [], reroute: [], dqi: [], aux: [], grid: [], eudrPlot: [], eudrCustody: [], indexation: [],
});

const LONG = (n, word) => Array.from({ length: n }, (_, i) => `${word}-${i}`).join(' ');

/** Extreme fixture: every table populated, several rows each, deliberately long free-text values to
 *  exercise the squeezed-title/overflow detectors against real card widths. Enum-shaped columns (e.g.
 *  hold_risk, double_count_check, tech_category) use REAL values from their DB CHECK vocabularies (see
 *  migrations 296-298) so the real calculators (classifyHoldRisk, evaluateGridQueueGate, …) exercise
 *  their real branches, not a default/unknown path. */
function extremeState() {
  return {
    surcharge: [
      { audit_id: 'a1', invoice_line: `EU ETS Surcharge — ${LONG(8, 'extremely-long-invoice-line-token')}`, billed_eur: 18450.5, statutory_eur: 12100.25, statutory_basis: 'FuelEU Maritime Art. 20(1), EUR 2,400/t VLSFOe', variance_eur: 6350.25, corridor_id: 'cl:corridor:cnsha-nlrtm-ocean-0000000001', carrier_id: 'cl:org:0000000000000103' },
      { audit_id: 'a2', invoice_line: 'SAF Premium', billed_eur: 900, statutory_eur: 900, statutory_basis: 'RED III Art. 25', variance_eur: 0, corridor_id: 'cl:corridor:0000000000000102', carrier_id: 'cl:org:0000000000000104' },
    ],
    oem: [
      { roadmap_id: 'o1', tech_category: 'heavy_battery', commercial_stage: 'small_batch_fleet', target_year: 2028, density_basis: 'pack', confidence_admiralty: 'B2', announced_at: '2026-06-01' },
      { roadmap_id: 'o2', tech_category: 'hydrogen_fcell', commercial_stage: 'announced', target_year: null, density_basis: null, confidence_admiralty: null, announced_at: '2026-01-15' },
    ],
    reroute: [
      { reroute_id: 'r1', baseline_corridor_id: `cl:corridor:${LONG(4, 'suez-baseline-long-id-segment')}`, reroute_corridor_id: `cl:corridor:${LONG(4, 'cape-reroute-long-id-segment')}`, cause: 'Red Sea diversion (Houthi attacks, Bab-el-Mandeb strait closure)', fuel_burn_multiplier: 1.35, effective_from: '2025-12-01', effective_to: null },
    ],
    dqi: [
      { dqi_id: 'd1', tce_id: `${LONG(6, 'extremely-long-transport-chain-element-reference-token')}`, reliability: 2, completeness: 3, temporal_correlation: 1, geographical_correlation: 4, technological_correlation: 2, primary_data_share: 0.62 },
      { dqi_id: 'd2', tce_id: 'leg-2', reliability: 1, completeness: 1, temporal_correlation: 1, geographical_correlation: 1, technological_correlation: 1, primary_data_share: 0.1 },
    ],
    aux: [
      { profile_id: 'x1', load_type: 'museum_spec_hold', kw_draw: 4.2, duty_cycle: 0.9, hours_typical: 72, setpoint_c: 21, setpoint_rh_pct: 50, grid_intensity_source: 'EEA gCO2/kWh, EU grid mix 2026' },
      { profile_id: 'x2', load_type: 'reefer_genset', kw_draw: 8, duty_cycle: 1, hours_typical: 240, setpoint_c: -18, setpoint_rh_pct: null, grid_intensity_source: null },
    ],
    grid: [
      { queue_id: 'g1', dso_name: `${LONG(5, 'extremely-long-distribution-system-operator-name-segment')}`, capacity_band_mw: '1-5MW', queue_months_p50: 18, queue_months_p90: 40, as_of: '2026-08-01' },
      { queue_id: 'g2', dso_name: 'Small DSO', capacity_band_mw: '<1MW', queue_months_p50: 6, queue_months_p90: 10, as_of: '2026-08-01' },
    ],
    eudrPlot: [
      { claim_id: 'p1', consignment_ref: `${LONG(6, 'extremely-long-consignment-reference-token')}`, validation_state: 'missing', hold_risk: 'border_hold' },
      { claim_id: 'p2', consignment_ref: 'CNS-002', validation_state: 'valid', hold_risk: 'none' },
    ],
    eudrCustody: [
      { custody_id: 'c1', credit_type: 'saf_bnc', scheme: `${LONG(5, 'extremely-long-certification-scheme-name-segment')}`, double_count_check: 'conflict_detected' },
      { custody_id: 'c2', credit_type: 'green_methanol', scheme: 'ISCC PLUS', double_count_check: 'single_claim_confirmed' },
    ],
    indexation: [
      { clause_id: 'i1', contract_ref: `${LONG(6, 'extremely-long-contract-reference-token')}`, corridor_id: 'cl:corridor:0000000000000101', index_id: 'cl:instrument:eua-front-dec', base_value: 80, base_date: '2026-01-01', passthrough_pct: 70, cap_pct: 20, floor_pct: -10, review_cadence: 'quarterly', rounding_rule: 'round to nearest cent' },
      { clause_id: 'i2', contract_ref: null, corridor_id: null, index_id: 'cl:instrument:uka', base_value: 45, base_date: '2026-03-01', passthrough_pct: 100, cap_pct: null, floor_pct: null, review_cadence: 'monthly', rounding_rule: 'round to nearest whole unit' },
    ],
  };
}

const STATES = [
  { label: 'empty', props: EMPTY_STATE, expectTitles: 0 },
  { label: 'extreme', props: extremeState(), expectTitles: 8 },
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

        // Empty state: every one of the eight "no rows yet" gap lines renders (honest omission, never a
        // silently blank panel) — law 15's "explain what went wrong" applied to an absent-data state.
        if (state.label === 'empty') {
          checks += 1;
          const text = await page.textContent('body');
          const gapCount = (text.match(/No rows yet/gi) || []).length;
          if (gapCount < 8) {
            failures.push(`${label}: expected 8 "no rows yet" gap lines (one per panel), found ${gapCount}.`);
          }
        }

        // Extreme state: the two blocking-severity EUDR cards (border_hold, conflict_detected) render in
        // the blocking visual class (spec 09 §1.8: "a border hold... in a different visual class from a
        // monetary exposure") — proof, not just presence.
        if (state.label === 'extreme') {
          checks += 1;
          const blockingLabels = await page.$$eval('body *', (els) =>
            els.filter((e) => /Border hold|Double-claim conflict/.test(e.textContent || '') && e.children.length === 0).length,
          );
          if (blockingLabels < 2) {
            failures.push(`${label}: expected 2 blocking-severity labels (Border hold, Double-claim conflict), found ${blockingLabels}.`);
          }
        }
      } finally {
        await page.close();
      }
    }
  }

  return { checks, failures };
}
