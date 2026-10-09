// UX smoke spec: the item-level binding-position banner on the Regulations detail page. Lane OBL-2,
// 2026-10-08 (spec 01 section 4 component 1). Mounts the REAL BindingBanner.tsx through ux-harness.mjs's
// `runUxSpec`: law-2 targets, overflow, squeezed title and placeholder-literal detectors at 375, 768, 1024 and
// 1280, plus the 1440 cell-bounds sweep every spec gets. Fixture data only; no network, no database.
//
// The component fetches /api/detail/relevance on mount, so the entry answers `window.fetch` itself from the
// state's props (a body, a status, or a request that never settles): the harness's route table is not needed.
//
// STATES: `loading` (the request never settles: the loading line must show); `error` (HTTP 500: the plain
// failure with the Try again control); `not-decomposed` (an item with no objects: "Obligations not yet
// decomposed", never an empty section); `populated` (the four forwarder-direct fixture instruments run through
// the REAL gate, summariseObligationBinding, with a profile that holds no role, so the profile link shows);
// `extreme` (unbroken 80-character duty-holder, trigger and cost-slot tokens, the squeeze class, plus all three
// cost slots).
//
// Bespoke checks on top of the harness (each fails against a banner that drops the behaviour): the loading line,
// the failure line and its 44 px retry, the decomposed text, the position label, "In scope because", the three cost
// slot names exactly, no merged total, effort without a currency, and the profile link only when an answer needs
// profile input.
//
// Registered in ux-smoke-specs.mjs; F35's ROW_COMPONENTS carries BindingBanner.tsx.

import { runUxSpec } from './ux-harness.mjs';
import { bundleEntry, newSmokePage, mountBundle } from './harness.mjs';
import { fullAppCss } from './smoke-fixtures.mjs';

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
import { BindingBanner } from '@/components/regulations/BindingBanner';
import { summariseObligationBinding } from '@/lib/workspace/relevance.mjs';
import FIX from '@/lib/obligations/fixtures/obligation-objects.fixture.json';

let root = null;
window.__mount = ({ mode }) => {
  const long = 'X'.repeat(80);
  const objects = FIX.objects.map((o) => ({ ...o }));
  if (mode === 'extreme') {
    objects.push({
      obligation_id: 'cl:obligation:00000000000000e1', binding_position: 'carrier_passthrough',
      duty_holder_class: [long], applicability_trigger: { attribute: long, value: long },
      statutory_maximum: long, cost_formula: long,
      direct_compliance_cost: { amount: 120, currency: 'EUR', basis: long, source: long },
      effort: { person_days: 3, recurrence: long },
    });
  }
  const profile = { orgRoles: [], orgSize: {} };
  let impl;
  if (mode === 'loading') impl = () => new Promise(() => {});
  else if (mode === 'error') impl = () => Promise.resolve(new Response('{}', { status: 500 }));
  else {
    const binding = mode === 'not-decomposed' ? summariseObligationBinding([], profile) : summariseObligationBinding(objects, profile);
    impl = () => Promise.resolve(new Response(JSON.stringify({ relevance: null, binding }), { status: 200, headers: { 'content-type': 'application/json' } }));
  }
  window.fetch = impl;
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(BindingBanner, { itemId: 'fixture-item' }));
};
`;

const STATES = [
  { label: 'loading', props: { mode: 'loading' }, expectTitles: 1 },
  { label: 'error', props: { mode: 'error' }, expectTitles: 1 },
  { label: 'not-decomposed', props: { mode: 'not-decomposed' }, expectTitles: 1 },
  { label: 'populated', props: { mode: 'populated' }, expectTitles: 1 },
  { label: 'extreme', props: { mode: 'extreme' }, expectTitles: 1 },
];

export async function runSmoke(browser) {
  const { checks: baseChecks, failures } = await runUxSpec(browser, { name: 'binding-banner', entry: ENTRY, states: STATES });
  let checks = baseChecks;

  const bundleJs = await bundleEntry(ENTRY, {});
  const text = async (mode, width = 375) => {
    const page = await newSmokePage(browser);
    try {
      await page.setViewportSize({ width, height: 812 });
      await mountBundle(page, bundleJs, '__mount', { mode });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
      await page.waitForTimeout(150);
      const body = await page.textContent('#smoke-root');
      const targets = await page.$$eval('#smoke-root a, #smoke-root button', (els) =>
        els.map((e) => ({ text: (e.textContent || '').trim(), h: Math.round(e.getBoundingClientRect().height) })));
      return { body: body || '', targets };
    } finally {
      await page.close();
    }
  };
  const expect = (cond, msg) => { checks += 1; if (!cond) failures.push(`binding-banner:${msg}`); };

  const loading = await text('loading');
  expect(/Checking which obligations reach your organisation/.test(loading.body), 'loading state shows the loading line');
  expect(!/Obligations not yet decomposed/.test(loading.body), 'loading state does not claim the item has no obligations');

  const error = await text('error');
  expect(/could not be loaded/.test(error.body), 'error state says the load failed in plain words');
  const retry = error.targets.find((t) => t.text === 'Try again');
  expect(!!retry && retry.h >= 44, `error state offers a Try again control at least 44 px tall (found ${retry ? retry.h : 'none'})`);
  expect(!error.targets.some((t) => /organisation profile/i.test(t.text)), 'error state does not also offer the profile link (one action)');

  const none = await text('not-decomposed');
  expect(/Obligations not yet decomposed/.test(none.body), 'an item with no objects says Obligations not yet decomposed');
  expect(none.targets.length === 0, 'the not-decomposed state offers no action');

  const populated = await text('populated');
  expect(/Your duty/.test(populated.body), 'populated state shows the position label');
  expect(/In scope because/.test(populated.body) && /Your organisation role is Freight forwarder/.test(populated.body), 'populated state shows the trigger that put the customer in scope');
  expect(/Duty holders:/.test(populated.body) && /Customs representative \(indirect\)/.test(populated.body), 'populated state names the duty holders');
  const profileLink = populated.targets.find((t) => /organisation profile/i.test(t.text));
  expect(!!profileLink && profileLink.h >= 44, `a profile with no role gets the profile link at least 44 px tall (found ${profileLink ? profileLink.h : 'none'})`);
  expect(!/Try again/.test(populated.body), 'populated state has no retry control');

  const extreme = await text('extreme');
  for (const name of ['Penalty exposure:', 'Direct compliance cost:', 'Effort (person-days, not money):']) {
    expect(extreme.body.includes(name), `extreme state labels the cost slot "${name}" by name`);
  }
  expect(!/\btotal\b/i.test(extreme.body), 'cost slots are never merged into a total');
  expect(/3 person-days/.test(extreme.body) && !/3 person-days[^.]{0,20}EUR/.test(extreme.body), 'effort renders as person-days and never as money');

  return { checks, failures };
}
