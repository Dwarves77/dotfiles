// UX smoke spec: LeadTimeChart. Lane L10, 2026-10-03 (docs/dispatches/lane-briefs/2026-10-03/
// brief-l10.md, spec 02 section 6 item 5). Mounts the REAL
// `src/components/market/LeadTimeChart.tsx` via ux-harness.mjs's `runUxSpec` (law-2 targets,
// overflow, placeholder-literal detectors at 375/1280, plus the 1440 cell-bounds sweep every spec
// gets) in its two mutually exclusive states: zero/thin sample (the honest "not forecastable"
// absence line) and a 5-row cohort (the comparative bar list), then runs a bespoke red-then-green
// text check confirming each state renders the text that is actually unique to it, never the other
// state's text (so this spec cannot pass by rendering nothing, the same concern expectTitles exists
// for).
//
// Registered in ux-smoke-specs.mjs; F35's ROW_COMPONENTS line is reported for the coordinator to add
// (lane common contract's UX contract: "report the line; the coordinator adds it").

import { runUxSpec } from './ux-harness.mjs';
import { bundleEntry, newSmokePage, mountBundle } from './harness.mjs';

const ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { LeadTimeChart } from '@/components/market/LeadTimeChart';

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(LeadTimeChart, props));
};
`;

function sbtiRow(i, months) {
  return {
    series_key: `sbti:company-${i}`,
    label: `Company ${i} (fixture)`,
    value_numeric: months,
    unit: 'months',
    origin_class: 'official',
    source_key: 'sbti_target_dashboard',
    n_observations: 1,
    as_at_date: '2026-10-01',
    reference_period: '2026-10-01',
  };
}

const NOT_FORECASTABLE_STATE = {
  label: 'zero-sample-not-forecastable',
  props: { rows: [] },
  expectTitles: 1,
};

const FORECASTABLE_STATE = {
  label: 'five-row-cohort',
  props: {
    rows: [sbtiRow(1, 4), sbtiRow(2, 8), sbtiRow(3, 12), sbtiRow(4, 16), sbtiRow(5, 20)],
  },
  expectTitles: 1,
};

export async function runSmoke(browser) {
  const uxResult = await runUxSpec(browser, {
    name: 'lead-time-chart',
    entry: ENTRY,
    states: [NOT_FORECASTABLE_STATE, FORECASTABLE_STATE],
  });

  const failures = [...uxResult.failures];
  let checks = uxResult.checks;

  // Red-then-green: the not-forecastable state must show the absence line and NEVER a company bar
  // row; the forecastable state must show the cohort median and a fixture company label and NEVER
  // the absence line. Proves neither state is a silent no-op render.
  const bundleJs = await bundleEntry(ENTRY);

  async function renderedText(props) {
    const page = await newSmokePage(browser);
    try {
      await mountBundle(page, bundleJs, '__mount', props);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
      return await page.evaluate(() => document.body.innerText);
    } finally {
      await page.close();
    }
  }

  checks += 1;
  const emptyText = await renderedText(NOT_FORECASTABLE_STATE.props);
  if (!/not forecastable/i.test(emptyText)) {
    failures.push('lead-time-chart:zero-sample, expected the "Not forecastable" absence line, found none');
  }
  if (/company 1 \(fixture\)/i.test(emptyText)) {
    failures.push('lead-time-chart:zero-sample, expected NO company row to render against zero rows, found one (fabricated position)');
  }

  checks += 1;
  const populatedText = await renderedText(FORECASTABLE_STATE.props);
  if (/not forecastable/i.test(populatedText)) {
    failures.push('lead-time-chart:five-row-cohort, expected the comparative bar list, found the "Not forecastable" absence line instead (guard is vacuous)');
  }
  if (!/cohort median/i.test(populatedText)) {
    failures.push('lead-time-chart:five-row-cohort, expected a "Cohort median" line, found none');
  }
  if (!/company 1 \(fixture\)/i.test(populatedText)) {
    failures.push('lead-time-chart:five-row-cohort, expected the fixture company label to render, found none');
  }

  return { checks, failures };
}
