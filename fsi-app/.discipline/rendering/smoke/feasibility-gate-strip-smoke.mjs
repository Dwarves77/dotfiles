// UX smoke spec: FeasibilityGateStrip. Lane L14, 2026-10-03 (docs/dispatches/lane-briefs/2026-10-03-w4/
// brief-l14.md, spec 04 S6 #8). Mounts the REAL src/components/operations/FeasibilityGateStrip.tsx via
// ux-harness.mjs's runUxSpec (law-2 targets, overflow, placeholder-literal detectors at 375/1280, plus
// the 1440 cell-bounds sweep) in two states: one blocked + one conditional + one clear gate with two
// classes unevaluated, and no gates at all. A bespoke text check then confirms each state renders what
// is unique to it, and that an unevaluated class never reads as clear.
//
// Registered in ux-smoke-specs.mjs; F35's ROW_COMPONENTS line is reported for the coordinator to add.

import { runUxSpec } from './ux-harness.mjs';
import { bundleEntry, newSmokePage, mountBundle } from './harness.mjs';

const ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { FeasibilityGateStrip, MaterialsPpwrRows } from '@/components/operations/FeasibilityGateStrip';
import { joinMaterialsToPpwr, PPWR_PLASTIC_MATERIAL_KEYS } from '@/lib/operations/materials-ppwr-join.ts';

function Both(props) {
  const rows = joinMaterialsToPpwr(props.facts || [], { regionKeys: ['fixture'], materials: PPWR_PLASTIC_MATERIAL_KEYS });
  return React.createElement(React.Fragment, null,
    React.createElement(FeasibilityGateStrip, { gates: props.gates, regionLabel: props.regionLabel }),
    React.createElement(MaterialsPpwrRows, { rows }));
}

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(Both, props));
};
`;

const MIXED = {
  label: 'blocked-conditional-clear',
  props: {
    regionLabel: 'Fixture region',
    gates: [
      { gateClass: 'ppwr_thresholds', state: 'blocked', reason: 'Fixture reason: recycled-content threshold not met.', citation: 'Regulation (EU) 2025/40 Art. 7(1)(d)' },
      { gateClass: 'epr_registration', state: 'conditional', reason: 'Fixture reason: authorised representative must be appointed.' },
      { gateClass: 'pfas_limits', state: 'clear', reason: 'Fixture reason: no restriction applies.' },
    ],
  },
  expectTitles: 1,
};
const FIVE = (state2) => ['ppwr_thresholds', 'epr_registration', 'pfas_limits', 'national_permitting', 'ets2'].map((gateClass, i) => ({ gateClass, state: i === 1 ? state2 : 'clear', reason: 'Fixture reason.' }));
const COND = { label: 'all-assessed-conditional', props: { regionLabel: 'Fixture region', gates: FIVE('conditional') }, expectTitles: 1 };
const CLEAR = { label: 'all-assessed-clear', props: { regionLabel: 'Fixture region', gates: FIVE('clear') }, expectTitles: 1 };
const EMPTY = { label: 'no-gates', props: { regionLabel: 'Fixture region', gates: [] }, expectTitles: 1 };

export async function runSmoke(browser) {
  const uxResult = await runUxSpec(browser, { name: 'feasibility-gate-strip', entry: ENTRY, states: [MIXED, COND, CLEAR, EMPTY] });
  const failures = [...uxResult.failures];
  let checks = uxResult.checks;
  const bundleJs = await bundleEntry(ENTRY);

  async function renderedText(props) {
    const page = await newSmokePage(browser);
    try {
      await mountBundle(page, bundleJs, '__mount', props);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      // The materials rows live in a collapsed <details>; open it so innerText carries them.
      await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
      return await page.evaluate(() => document.body.innerText);
    } finally {
      await page.close();
    }
  }

  checks += 1;
  const mixed = await renderedText(MIXED.props);
  if (process.env.SMOKE_PRINT) console.log('RENDER mixed:\n' + mixed);
  if (!/· blocked\s*$/im.test(mixed)) failures.push('feasibility-gate-strip:mixed, expected the headline "blocked"');
  for (const w of [/Blocked/i, /Conditional/i, /Clear/i]) {
    if (!w.test(mixed)) failures.push(`feasibility-gate-strip:mixed, expected state text ${w}`);
  }
  if (!/Art\. 7\(1\)\(d\)/.test(mixed)) failures.push('feasibility-gate-strip:mixed, expected the citation to render');
  const gateStates = await (async () => {
    const page = await newSmokePage(browser);
    try {
      await mountBundle(page, bundleJs, '__mount', MIXED.props);
      return await page.evaluate(() =>
        [...document.querySelectorAll('[data-gate-class]')].map((n) => n.getAttribute('data-gate-class') + ':' + n.getAttribute('data-gate-state'))
      );
    } finally {
      await page.close();
    }
  })();
  if (!gateStates.includes('national_permitting:not-evaluated') || !gateStates.includes('ets2:not-evaluated')) {
    failures.push(`feasibility-gate-strip:mixed, unsupplied classes must read not-evaluated, got ${gateStates.join(',')}`);
  }

  checks += 1;
  const empty = await renderedText(EMPTY.props);
  if (!/incomplete, not every gate assessed/i.test(empty)) failures.push('feasibility-gate-strip:no-gates, expected the "incomplete" headline, never "clear"');
  if (/\bClear\b|\bBlocked\b|\bConditional\b/.test(empty)) failures.push('feasibility-gate-strip:no-gates, a missing evaluation must never read as a gate state');

  checks += 1;
  const cond = await renderedText(COND.props);
  if (!/· conditional\s*$/im.test(cond)) failures.push('feasibility-gate-strip:all-assessed-conditional, expected the headline "conditional"');
  checks += 1;
  const clr = await renderedText(CLEAR.props);
  if (!/· clear\s*$/im.test(clr)) failures.push('feasibility-gate-strip:all-assessed-clear, expected the headline "clear"');
  // The joined rows: no materials facts supplied, so every plastic category is a threshold-only gap.
  if (process.env.SMOKE_PRINT) console.log('RENDER empty:\n' + empty);
  if (!/PPWR recycled-content thresholds \(4\), materials data: gap/i.test(empty)) failures.push('feasibility-gate-strip:no-gates, expected the details summary naming the 4 rows and the materials gap');
  const gaps = (empty.match(/no availability fact for this region \(gap\)/g) || []).length;
  if (gaps !== 4) failures.push(`feasibility-gate-strip:no-gates, expected 4 threshold-only materials rows, found ${gaps}`);
  if (!/Art\. 7\(1\)\(d\)/.test(empty) || !/35%/.test(empty)) failures.push('feasibility-gate-strip:no-gates, expected the cited 35% (Art. 7(1)(d)) threshold row');

  return { checks, failures };
}
