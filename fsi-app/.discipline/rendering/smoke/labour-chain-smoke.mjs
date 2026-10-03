// UX smoke spec: LabourChain. Lane L13, 2026-10-03 (docs/dispatches/lane-briefs/2026-10-03-w4/
// brief-l13.md, spec 04 S5, S6 component 5). Mounts the REAL
// `src/components/operations/LabourChain.tsx` via ux-harness.mjs's `runUxSpec` (law-2 targets,
// overflow, placeholder-literal detectors at 375/1280, plus the 1440 cell-bounds sweep every spec
// gets) in its two states: all five terms present (the computed chain + final figure) and one term
// missing (the named gap, no fabricated total), then a bespoke red-then-green text check, same
// pattern as lead-time-chart-smoke.mjs (lane L10), confirming each state renders the text unique to
// it and never the other state's text.
//
// Registered in ux-smoke-specs.mjs; F35's ROW_COMPONENTS line is reported for the coordinator to add
// (lane common contract's UX contract: "report the line; the coordinator adds it").

import { runUxSpec } from './ux-harness.mjs';
import { bundleEntry, newSmokePage, mountBundle } from './harness.mjs';

const ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { LabourChain } from '@/components/operations/LabourChain';

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(LabourChain, props));
};
`;

function fact(label, valueNumeric, unit) {
  return {
    factLabel: label,
    valueNumeric,
    unit,
    sourceKey: 'bls-oews',
    sourceRef: 'fixture-ref',
    originClass: 'official',
    derivation: 'observed',
    referencePeriod: '2026-Q3',
    asAtDate: '2026-09-01',
  };
}

// Hand-computed check value: 28.5 + 9.4 + 1.8 + 0.9 + 1.4 = 42.0; 42.0 / 1650 = 0.0254545... ->
// displayed to 3dp (roundDisplay) as "0.025".
const FULL_CHAIN_FACTS = [
  fact('Median hourly wage (BLS OEWS)', 28.5, 'EUR/hour'),
  fact('Employer non-wage social contribution rate', 9.4, 'EUR/hour'),
  fact('Leave and absence loading', 1.8, 'EUR/hour'),
  fact('Turnover and recruitment loading', 0.9, 'EUR/hour'),
  fact('Shift premium', 1.4, 'EUR/hour'),
  fact('Productive hours per year', 1650, 'hours/year'),
];

// The same six facts, minus leave/absence, the one-term-missing proof.
const MISSING_TERM_FACTS = FULL_CHAIN_FACTS.filter((f) => !/leave/i.test(f.factLabel));

const FULL_STATE = { label: 'full-chain', props: { facts: FULL_CHAIN_FACTS, regionLabel: 'Fixture region' }, expectTitles: 1 };
const MISSING_STATE = { label: 'one-term-missing', props: { facts: MISSING_TERM_FACTS, regionLabel: 'Fixture region' }, expectTitles: 1 };

export async function runSmoke(browser) {
  const uxResult = await runUxSpec(browser, {
    name: 'labour-chain',
    entry: ENTRY,
    states: [FULL_STATE, MISSING_STATE],
  });

  const failures = [...uxResult.failures];
  let checks = uxResult.checks;

  const bundleJs = await bundleEntry(ENTRY);

  async function renderedText(props) {
    const page = await newSmokePage(browser);
    try {
      await mountBundle(page, bundleJs, '__mount', props);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      return await page.evaluate(() => document.body.innerText);
    } finally {
      await page.close();
    }
  }

  checks += 1;
  const fullText = await renderedText(FULL_STATE.props);
  if (!/chain complete/i.test(fullText)) {
    failures.push('labour-chain:full-chain, expected "chain complete" in the SectionHeading aside, found none');
  }
  if (!/0\.025/.test(fullText)) {
    failures.push(`labour-chain:full-chain, expected the computed final figure "0.025..." (42.0 / 1650), found none in: ${fullText}`);
  }
  if (/missing:/i.test(fullText)) {
    failures.push('labour-chain:full-chain, expected NO gap reason to render when every term is present, found one');
  }

  checks += 1;
  const missingText = await renderedText(MISSING_STATE.props);
  if (!/chain incomplete/i.test(missingText)) {
    failures.push('labour-chain:one-term-missing, expected "chain incomplete" in the SectionHeading aside, found none');
  }
  if (!/missing: Leave and absence/.test(missingText)) {
    failures.push(`labour-chain:one-term-missing, expected the named gap "missing: Leave and absence", found none in: ${missingText}`);
  }
  if (/0\.025/.test(missingText)) {
    failures.push('labour-chain:one-term-missing, expected NO final figure to render with a term missing, found the full-chain figure (guard is vacuous)');
  }

  return { checks, failures };
}
