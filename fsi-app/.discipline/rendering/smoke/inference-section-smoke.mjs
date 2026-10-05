// UX smoke spec: the inference section (lane P2, 2026-10-05). Mounts the REAL `InferenceSection`
// (src/components/detail/InferenceSection.tsx, the "Inferences" section every detail page mounts) at
// 375x812 and 1280x800 for law-2 targets, overflow and squeezed or word-broken titles (ux-assert.mjs), on
// fixture data only, per the UX contract (docs/dispatches/lane-common-contract.md) and F35 (row-ux-coverage).
//
// STATES: empty (the section renders nothing: no titles expected), two-admissible-one-refuted (the refuted one
// must not appear, asserted in the render proof grade-and-inference.npmtest.mjs; here it is measured), extreme
// (long unbroken tokens in the claim, the cited titles and the cap case of eight inferences, the squeeze class).

import { fileURLToPath } from 'node:url';
import { runUxSpec } from './ux-harness.mjs';
import { fullAppCss } from './smoke-fixtures.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
// DetailShell.tsx (home of DetailSection) also exports an InThisListStat that calls next/navigation's
// useSearchParams; the section does not render it, but the bundle still resolves the import, so the same
// stub the other detail specs use stands in for it. The spec-09 stylesheet import is stubbed likewise.
const ALIAS = {
  'next/navigation': `${HERE}stub-next-navigation.mjs`,
  '@/components/market/spec09.css': `${HERE}stub-empty-css.mjs`,
};

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
import { InferenceSection } from '@/components/detail/InferenceSection';

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(InferenceSection, props));
};
`;

const LONG_UNBROKEN = 'euregulationonpackagingandpackagingwastecomprehensiverevisiontwentytwentysix1234567890';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

const claim = (id, over = {}) => ({
  id,
  claimText: 'The amendment reaches carriers that file in the first quarter, so the filing window opens before the next review.',
  statusToken: 'HYPOTHESIS',
  confidence: 0.6,
  citedItemIds: [A],
  originClass: 'derived',
  questionText: 'Does this apply to me?',
  ...over,
});

const TITLES = { [A]: 'Regulation on carrier reporting for ocean freight', [B]: 'Guidance on first quarter filing' };
const LONG_TITLES = { [A]: `${LONG_UNBROKEN} cited item`, [B]: `${LONG_UNBROKEN} second cited item` };

export async function runSmoke(browser) {
  return runUxSpec(browser, {
    name: 'inference-section',
    entry: ENTRY,
    alias: ALIAS,
    states: [
      { label: 'empty', props: { inferences: null } },
      {
        label: 'two-admissible-one-refuted',
        props: {
          inferences: {
            claims: [
              claim('c1'),
              claim('c2', { statusToken: 'CONFIRMED', confidence: 0.9, citedItemIds: [A, B], questionText: 'What must be done in response, and by when?' }),
              claim('c3', { statusToken: 'REFUTED' }),
            ],
            titles: TITLES,
          },
        },
        expectTitles: 3, // the section heading and the two questions
      },
      {
        label: 'extreme',
        props: {
          inferences: {
            claims: Array.from({ length: 8 }, (_, i) =>
              claim(`x${i}`, { claimText: `${LONG_UNBROKEN} ${LONG_UNBROKEN} claim ${i}`, citedItemIds: [A, B], questionText: 'Act now, wait, or take no action?' })
            ),
            titles: LONG_TITLES,
          },
        },
        expectTitles: 6, // the heading and the five shown (cap)
      },
    ],
  });
}
