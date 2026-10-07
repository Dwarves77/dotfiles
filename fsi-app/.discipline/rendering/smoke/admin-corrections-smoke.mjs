// UX smoke spec: the admin Corrections screen (lane G7-UI, 2026-10-06). Mounts the REAL ItemCorrectionsPanel
// (the per-item panel at /admin/items/[id]) and the REAL CorrectionsTab (the admin dashboard tab), with the real
// CorrectionRow they share, at 375x812 and 1280x800 (plus the 1440 bounds sweep), on fixture data only: the
// panel's own GET is answered by page.route, the tab's loader is injected. Measures law-2 targets, overflow and
// squeezed titles (ux-assert.mjs) per docs/dispatches/lane-common-contract.md and F35 (row-ux-coverage).
//
// STATES. Panel: clean (no corrections), with an active and an orphaned and a revoked correction, a fact replace
// form open, a tag add form open, a revoke confirmation open, and an extreme state (long unbroken tokens in the
// item title, claim text, tags, section text and reasons). Tab: populated with all three states, the empty tab.
// The entry opens a form by clicking its real button after the mount, so the form itself is what is measured.

import { fileURLToPath } from 'node:url';
import { runUxSpec } from './ux-harness.mjs';
import { fullAppCss } from './smoke-fixtures.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ALIAS = { 'next/navigation': `${HERE}stub-next-navigation.mjs` };

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
import { ItemCorrectionsPanel } from '@/components/admin/corrections/ItemCorrectionsPanel';
import { CorrectionsTab } from '@/components/admin/corrections/CorrectionsTab';

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  if (props.which === 'tab') {
    const rows = props.rows;
    root.render(React.createElement(CorrectionsTab, { loadAll: async () => ({ rows, unchecked: 0 }) }));
  } else {
    root.render(React.createElement(ItemCorrectionsPanel, { targets: props.targets }));
  }
  if (props.click) {
    // wait for the corrections read to land, then press the named real button so the form is what is measured
    setTimeout(() => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === props.click);
      if (b) b.click();
    }, 150);
  }
};
`;

const ITEM = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const CLAIM = '33333333-3333-4333-8333-333333333333';
const LONG = 'euregulationonpackagingandpackagingwastecomprehensiverevisiontwentytwentysix1234567890';

const targets = (long = false) => ({
  item_id: ITEM,
  title: long ? `${LONG} item` : 'Regulation on packaging and packaging waste',
  full_brief: long ? `${LONG} ${LONG}` : 'The regulation sets recycled content targets for plastic packaging from 2030.',
  tags: {
    topic_tags: long ? [LONG, 'packaging'] : ['packaging', 'plastics'],
    operational_scenario_tags: ['warehousing'],
    compliance_object_tags: [],
  },
  facts: [
    { id: claimId('a'), claim_text: long ? `${LONG} ${LONG} claim` : 'Recycled content targets apply from 1 January 2030.', source_span: 'span' },
    { id: CLAIM, claim_text: 'Producers must register in each member state.', source_span: 'span' },
  ],
  sections: [{ section_key: 'what_changed', content_md: long ? `${LONG} ${LONG}` : 'The text was revised in 2026.' }],
  connections: [{ other_item_id: OTHER, other_title: long ? `${LONG} other item` : 'Guidance on plastic packaging levies', relationship: 'amends' }],
});
function claimId(c) { return `44444444-4444-4444-8444-44444444444${c}`; }

const corr = (id, over = {}) => ({
  id, item_id: ITEM, target_kind: 'fact', target_ref: CLAIM, op: 'suppress', value: null,
  machine_value: { claim_text: 'Producers must register in each member state.' }, reason: 'The figure is out of date.',
  created_by: '99999999-9999-4999-8999-999999999999', created_at: '2026-10-04T10:00:00Z', revoked_at: null,
  active: true, superseded: false, orphaned: false, latest_machine_value: null, machine_observed_count: 0, machine_observed_at: null,
  ...over,
});

const LIST = (rows) => ({ item_id: ITEM, counts: { active: 1, revoked: 1, orphaned: 1 }, corrections: rows });
const FIXTURE_ROWS = [
  corr('55555555-5555-4555-8555-555555555551'),
  corr('55555555-5555-4555-8555-555555555552', { target_ref: CLAIM.replace('3', '7'), orphaned: true, created_at: '2026-10-03T10:00:00Z' }),
  corr('55555555-5555-4555-8555-555555555553', { target_kind: 'tag', target_ref: 'topic_tags:packaging', op: 'remove', revoked_at: '2026-10-05T10:00:00Z', active: false, revoked_reason: 'Put back', created_at: '2026-10-02T10:00:00Z' }),
];
const LONG_ROWS = FIXTURE_ROWS.map((r) => ({ ...r, reason: `${LONG} ${LONG}`, item_title: `${LONG} item` }));
const TAB_ROWS = FIXTURE_ROWS.map((r) => ({ ...r, item_title: 'Regulation on packaging and packaging waste' }));

const answer = (rows) => ({
  urlGlob: '**/api/admin/items/*/corrections',
  handler: (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(LIST(rows)) }),
});

async function runWith(browser, rows, specStates, name) {
  return runUxSpec(browser, { name, entry: ENTRY, alias: ALIAS, apiRoutes: [answer(rows)], states: specStates });
}

export async function runSmoke(browser) {
  const panel = await runWith(browser, FIXTURE_ROWS, [
    { label: 'panel-corrections', props: { which: 'panel', targets: targets() }, expectTitles: 6 },
    { label: 'panel-fact-replace-form', props: { which: 'panel', targets: targets(), click: 'Replace' }, expectTitles: 6 },
    { label: 'panel-tag-add-form', props: { which: 'panel', targets: targets(), click: 'Add a tag' }, expectTitles: 6 },
    { label: 'panel-revoke-confirm', props: { which: 'panel', targets: targets(), click: 'Revoke' }, expectTitles: 6 },
  ], 'admin-corrections');
  const longPanel = await runWith(browser, LONG_ROWS, [
    { label: 'panel-extreme-reasons', props: { which: 'panel', targets: targets(true) }, expectTitles: 6 },
  ], 'admin-corrections');
  const tab = await runWith(browser, [], [
    { label: 'tab-corrections', props: { which: 'tab', rows: TAB_ROWS }, expectTitles: 4 },
    { label: 'tab-extreme', props: { which: 'tab', rows: LONG_ROWS }, expectTitles: 4 },
    { label: 'tab-empty', props: { which: 'tab', rows: [] }, expectTitles: 1 },
  ], 'admin-corrections');
  return {
    checks: panel.checks + longPanel.checks + tab.checks,
    failures: [...panel.failures, ...longPanel.failures, ...tab.failures],
  };
}
