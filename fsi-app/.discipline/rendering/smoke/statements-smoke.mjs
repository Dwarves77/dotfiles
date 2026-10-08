// UX smoke spec: the Operations statements block. Lane S8-F2, 2026-10-08 (ADR-043: industry-level
// statements replace the removed calculator). Mounts the REAL `StatementsBlock.tsx` fed by the REAL
// `buildStatements` (src/lib/operations/statements.mjs) over fixture facts, through ux-harness.mjs's
// `runUxSpec`: law-2 targets, overflow, squeezed title and placeholder-literal detectors at 375, 768,
// 1024 and 1280, plus the 1440 cell-bounds sweep every spec gets. Fixture data only, no database.
//
// STATES: `full` (three dimensions: labour same-unit with an index, energy mixed-unit with none, a
// one-region infrastructure group showing the absence line, a region named as not available);
// `extreme` (unbroken 80-character tokens in the label, region, source and dataset fields, the squeeze
// class); `empty` (no eligible group: the block must render NOTHING).
//
// Bespoke checks on top of the harness (red-then-green: each fails against a block that drops the
// behaviour): the absence line and the index text render in `full`; the mixed-unit group shows no
// index; no verdict word renders anywhere; `empty` renders no node; and the phone layout is one
// bordered card per statement while the wide layout is not.
//
// Registered in ux-smoke-specs.mjs; F35's ROW_COMPONENTS carries StatementsBlock.tsx.

import { runUxSpec } from './ux-harness.mjs';
import { bundleEntry, newSmokePage, mountBundle } from './harness.mjs';
import { fullAppCss } from './smoke-fixtures.mjs';
import { VERDICT_PATTERN } from '../../../src/lib/operations/statements.mjs';

const css = `
(() => {
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(fullAppCss())};
  document.head.appendChild(style);
})();
`;

const ENTRY = `${css}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { StatementsBlock } from '@/components/operations/StatementsBlock';
import { buildStatements } from '@/lib/operations/statements.mjs';

let root = null;
window.__mount = ({ facts, regions, dimensions, names }) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement(StatementsBlock, {
      statements: buildStatements({ facts, regions, dimensions }),
      dimensionNames: names,
    }),
  );
};
`;

const REGIONS = [
  { code: 'EU', label: 'European Union', displayOrder: 1 },
  { code: 'US', label: 'United States', displayOrder: 2 },
  { code: 'ASIA', label: 'Asia, Singapore and Hong Kong', displayOrder: 3 },
  { code: 'UAE', label: 'UAE, Dubai', displayOrder: 4 },
];
const DIMENSIONS = ['labor_markets', 'regional_resources', 'infrastructure'];
const NAMES = { labor_markets: 'D3 Labor markets', regional_resources: 'D2 Regional resource availability', infrastructure: 'D5 Infrastructure capacity' };

function fact(over) {
  return {
    region_code: 'EU',
    dimension: 'labor_markets',
    fact_label: 'Warehouse worker median wage',
    value: 'text',
    status: null,
    trend: null,
    source_name: 'Fixture Statistics Office',
    source_url: 'https://example.org/stats',
    source_tier: 1,
    source_note: null,
    last_updated: '2026-09-01T00:00:00Z',
    freshness: 'current',
    value_numeric: 40.4,
    unit: 'EUR/hour',
    currency: 'EUR',
    derivation: 'observed',
    origin_class: 'official',
    source_key: 'fixture-src',
    source_ref: 'fx_dataset_1',
    n_observations: 50,
    method_version: null,
    as_at_date: '2026-09-01',
    reference_period: '2025',
    ...over,
  };
}

const FULL_FACTS = [
  fact({ region_code: 'EU', value_numeric: 40.4 }),
  fact({ region_code: 'US', value_numeric: 36.1, source_name: 'Bureau of Labor Statistics', reference_period: '2024', source_tier: 2 }),
  fact({ region_code: 'ASIA', value_numeric: 22, source_tier: null, source_name: null, source_key: null, source_ref: null, reference_period: null, derivation: null, as_at_date: null }),
  fact({ region_code: 'EU', dimension: 'regional_resources', fact_label: 'Industrial electricity price', unit: 'EUR/kWh', value_numeric: 0.12 }),
  fact({ region_code: 'US', dimension: 'regional_resources', fact_label: 'Industrial electricity price', unit: 'USD/kWh', currency: 'USD', value_numeric: 0.09 }),
  fact({ region_code: 'EU', dimension: 'infrastructure', fact_label: 'Grid connection lead time', unit: 'months', currency: null, value_numeric: 24 }),
];

const LONG = 'unbrokenidentifierthatcarriesonandonwithnobreakpointsatalleightyplusc';
const EXTREME_FACTS = [
  fact({ region_code: 'EU', fact_label: `${LONG} wage`, source_name: LONG, source_ref: LONG, reference_period: LONG }),
  fact({ region_code: 'US', fact_label: `${LONG} wage`, value_numeric: 30, source_name: LONG, source_ref: LONG }),
];

// An ineligible-only group (modelled): there is nothing sourced to state, so nothing renders.
const EMPTY_FACTS = [fact({ region_code: 'EU', origin_class: 'modelled' }), fact({ region_code: 'US', origin_class: 'community' })];

const base = { regions: REGIONS, dimensions: DIMENSIONS, names: NAMES };
const FULL = { label: 'full', props: { ...base, facts: FULL_FACTS }, expectTitles: 1 };
const EXTREME = { label: 'extreme', props: { ...base, facts: EXTREME_FACTS }, expectTitles: 1 };
const EMPTY = { label: 'empty', props: { ...base, facts: EMPTY_FACTS } };

export async function runSmoke(browser) {
  const ux = await runUxSpec(browser, { name: 'statements', entry: ENTRY, states: [FULL, EXTREME, EMPTY] });
  const failures = [...ux.failures];
  let checks = ux.checks;
  const bundleJs = await bundleEntry(ENTRY);

  async function measure(props, width) {
    const page = await newSmokePage(browser);
    try {
      await page.setViewportSize({ width, height: 900 });
      await mountBundle(page, bundleJs, '__mount', props);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      return await page.evaluate(() => {
        const items = [...document.querySelectorAll('[data-audit="ops-statement"]')];
        return {
          text: document.getElementById('smoke-root').innerText,
          rootChildren: document.getElementById('smoke-root').children.length,
          statements: items.length,
          components: document.querySelectorAll('[data-audit="ops-statement-component"]').length,
          absence: [...document.querySelectorAll('[data-audit="ops-statement-absence"]')].map((e) => e.innerText),
          borders: items.map((e) => getComputedStyle(e).borderLeftWidth),
          sentences: [...document.querySelectorAll('[data-audit="ops-statement-sentence"]')].map((e) => e.innerText),
        };
      });
    } finally {
      await page.close();
    }
  }

  const wide = await measure(FULL.props, 1280);
  checks += 1;
  if (wide.statements !== 3) failures.push(`statements:full, expected 3 statements (labour, energy, infrastructure), found ${wide.statements}`);
  checks += 1;
  if (!wide.absence.some((t) => /needs a second sourced region/i.test(t))) {
    failures.push('statements:full, expected the absence line "needs a second sourced region" for the one-region group, found none');
  }
  checks += 1;
  const labour = wide.sentences.find((t) => /Warehouse worker median wage/.test(t)) || '';
  if (!/\(base European Union = 100\)/.test(labour)) failures.push(`statements:full, expected the labour sentence to carry "(base European Union = 100)", got: ${labour}`);
  if (!/Asia, Singapore and Hong Kong 22 EUR\/hour/.test(labour)) failures.push(`statements:full, expected the third region named in the labour sentence, got: ${labour}`);
  if (!/UAE, Dubai: not available/.test(labour)) failures.push(`statements:full, expected the missing region named "UAE, Dubai: not available", got: ${labour}`);
  checks += 1;
  const energy = wide.sentences.find((t) => /Industrial electricity price/.test(t)) || '';
  if (!energy || /index|base /i.test(energy)) failures.push(`statements:full, the mixed-unit energy sentence must exist and carry no index, got: ${energy}`);
  checks += 1;
  if (VERDICT_PATTERN.test(wide.text)) failures.push(`statements:full, a verdict word rendered: ${wide.text}`);
  checks += 1;
  if (wide.components < 6) failures.push(`statements:full, expected a component row per held figure (6), found ${wide.components}`);
  checks += 1;
  if (wide.borders.some((b) => b !== '0px')) failures.push(`statements:full@1280, statements must be rule-separated rows, not boxed cards, found borders ${wide.borders.join(',')}`);
  const phone = await measure(FULL.props, 375);
  checks += 1;
  if (phone.borders.length !== 3 || phone.borders.some((b) => b !== '1px')) {
    failures.push(`statements:full@375, expected one bordered card per statement, found border widths ${phone.borders.join(',')}`);
  }

  checks += 1;
  const empty = await measure(EMPTY.props, 1280);
  if (empty.rootChildren !== 0 || empty.statements !== 0) {
    failures.push(`statements:empty, expected NO node when no group is sourced, found ${empty.rootChildren} child(ren) and ${empty.statements} statement(s)`);
  }

  return { checks, failures };
}
