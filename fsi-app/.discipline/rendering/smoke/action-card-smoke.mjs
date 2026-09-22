// UX smoke spec: ActionCard + Timeline. Lane W10-ActionCard-a, 2026-09-21, operator review panels
// 21a/21b + artboard 3. Mounts the REAL `ActionCard` (src/components/ui/ActionCard.tsx, which
// mounts the real `Timeline`, src/components/ui/Timeline.tsx) via the review's own worked example
// plus the brief's named edge cases (no tags, absent EXPOSURE cell, 9 milestones, 1 milestone, all
// passed), measured at 1440x900 and 375x812.
//
// Acceptance measured here, verbatim from the brief's step 7:
//   - one card (one border box) containing pill row, EXPOSURE and timeline
//   - no EXPOSURE cell taller than 3 lines
//   - every rendered timeline dot has a visible label
//   - no standalone Summary|Full brief switch row (out of scope here: ActionCard carries no depth
//     switch at all; SectionIndex's own switch is measured by section-index-smoke.mjs)
//   - no horizontal page overflow

import { bundleEntry, newSmokePage, mountBundle, measureGuard, detectOverflows } from './harness.mjs';
import { fullAppCss } from './smoke-fixtures.mjs';
import { detectClampedOverflow, detectEmptyDotLabels, detectCardCountViolation } from '../action-card-assert.mjs';

const STYLE_INJECT = `
(() => {
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(fullAppCss())};
  document.head.appendChild(style);
})();
`;

const ENTRY = `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ActionCard } from '@/components/ui/ActionCard';

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(ActionCard, props));
};
`;

const AWARENESS_BAND = {
  key: 'awareness', label: 'Awareness', window: 'background', hex: '#16A34A', tint: '#F0FDF4',
  cssVar: 'var(--awareness)', tintCssVar: 'var(--awareness-tint)', border: '#BBF7D0',
  borderCssVar: 'var(--awareness-border)', priority: 'LOW',
};
const ACTION_BAND = {
  key: 'action', label: 'Action', window: '<= 6 months', hex: '#F97316', tint: '#FFF7ED',
  cssVar: 'var(--action)', tintCssVar: 'var(--action-tint)', border: '#FED7AA',
  borderCssVar: 'var(--action-border)', priority: 'HIGH',
};

const DEFAULT_TIMELINE = [
  { date: '2023-06-05', label: 'Directive entered into force', status: 'past' },
  { date: '2023-12-31', label: 'Member State transposition deadline', status: 'past' },
  { date: '2024-01-01', label: 'Maritime extension operative', status: 'past' },
  { date: '2026-09-29', label: 'Transition deadline', status: 'current' },
  { date: '2027-01-01', label: 'Offshore ships added to scope', status: 'future' },
  { date: '2027-03-31', label: 'MRV submission for 2026 reporting year', status: 'future' },
  { date: '2027-09-30', label: 'Surrender: 100% of 2026 reported emissions', status: 'future' },
];

const NINE_MILESTONES = Array.from({ length: 9 }, (_, i) => ({
  date: `2026-${String(i + 1).padStart(2, '0')}-01`,
  label: `Milestone ${i + 1} of nine`,
  status: i < 4 ? 'past' : i === 4 ? 'current' : 'future',
}));

function noop() {}

const STATES = [
  {
    label: 'default',
    props: {
      band: ACTION_BAND, kindLabel: 'Regulation', tier: 1,
      meta: '4 sources · T1 primary · regenerated Sep 18',
      tags: ['High-value cargo', 'Ocean'],
      onExport: noop, onShare: noop, watch: null,
      where: { value: 'Ocean freight · European EEA port call' },
      whoPays: { value: 'Vessel operator is obligated' },
      yourLanes: { value: 'Connect shipment data' },
      timeline: DEFAULT_TIMELINE,
    },
  },
  {
    label: 'no-tags',
    props: {
      band: AWARENESS_BAND, kindLabel: 'Decision', tier: 1,
      meta: '1 source · T1 primary · brief regenerated Sep 12',
      tags: null,
      onExport: noop, onShare: noop, watch: null,
      where: { value: 'Belgium · packaging placed on the Belgian market' },
      whoPays: { value: 'Economic operators, fillers and importers' },
      yourLanes: { value: 'Connect shipment data' },
      timeline: [
        { date: '1997-01-21', label: 'Belgian measures notified', status: 'past' },
        { date: '1999-09-15', label: 'Decision adopted', status: 'past' },
      ],
    },
  },
  {
    label: 'absent-cell',
    props: {
      band: ACTION_BAND, kindLabel: 'Standard', tier: 3,
      meta: '1 source · T3 primary · regenerated Sep 4',
      tags: ['Fine art'],
      onExport: noop, onShare: noop, watch: null,
      where: { value: 'Global · cross-border art logistics' },
      whoPays: { value: null },
      yourLanes: { value: 'Connect shipment data' },
      timeline: DEFAULT_TIMELINE.slice(0, 3),
    },
  },
  {
    label: 'nine-milestones',
    props: {
      band: ACTION_BAND, kindLabel: 'Regulation', tier: 1,
      meta: '9 sources · T1 primary · regenerated Sep 20',
      tags: ['Ocean'],
      onExport: noop, onShare: noop, watch: null,
      where: { value: 'Ocean freight' },
      whoPays: { value: 'Vessel operator' },
      yourLanes: { value: 'Connect shipment data' },
      timeline: NINE_MILESTONES,
    },
  },
  {
    label: 'one-milestone',
    props: {
      band: AWARENESS_BAND, kindLabel: 'Guidance', tier: 4,
      meta: '1 source · T4 primary · regenerated Aug 30',
      tags: [],
      onExport: noop, onShare: noop, watch: null,
      where: { value: 'European Union' },
      whoPays: { value: 'Not obligated directly' },
      yourLanes: { value: 'Connect shipment data' },
      timeline: [{ date: '2027-06-30', label: 'Guidance review date', status: 'future' }],
    },
  },
];

async function measureAcceptance(page) {
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-part="action-card"]')];
    const exposureValues = [...document.querySelectorAll('[data-audit="exposure-value"]')].map((el) => {
      const style = getComputedStyle(el);
      const lineHeight = parseFloat(style.lineHeight) || 18;
      const lines = Math.round(el.getBoundingClientRect().height / lineHeight);
      return { lines, text: (el.textContent || '').trim() };
    });
    const timelineRoot = document.querySelector('[data-part="timeline"]');
    const dotLabels = timelineRoot
      ? [...timelineRoot.querySelectorAll('span[tabindex="0"]')].map((el) => (el.textContent || '').trim())
      : [];
    return { cardCount: cards.length, exposureValues, dotLabels };
  });
}

export async function runSmoke(browser) {
  const failures = [];
  let checks = 0;
  const bundleJs = await bundleEntry(ENTRY);

  for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
    for (const state of STATES) {
      const label = `action-card:${state.label}@${viewport.width}`;
      const page = await newSmokePage(browser);
      try {
        await page.setViewportSize(viewport);
        await mountBundle(page, bundleJs, '__mount', state.props);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
        await page.waitForTimeout(50);

        const guard = await measureGuard(page);
        checks += 1;

        const overflows = detectOverflows(guard.measurements);
        checks += 1;
        if (overflows.length > 0) {
          failures.push(`${label}: horizontal overflow (${overflows.map((o) => `${o.name} +${o.overflowBy}px`).join(', ')})`);
        }

        const acceptance = await measureAcceptance(page);
        checks += 1;
        const cardViolation = detectCardCountViolation(acceptance.cardCount);
        if (cardViolation) failures.push(`${label}: ${cardViolation}`);

        checks += 1;
        for (const v of detectClampedOverflow(acceptance.exposureValues)) {
          failures.push(`${label}: an EXPOSURE cell rendered ${v.lines} lines (over the 3-line clamp): "${v.text.slice(0, 40)}"`);
        }

        checks += 1;
        if (acceptance.dotLabels.length === 0 && state.props.timeline.length > 0) {
          failures.push(`${label}: timeline rendered with milestones but zero dot labels found`);
        }
        for (const l of detectEmptyDotLabels(acceptance.dotLabels)) {
          failures.push(`${label}: a timeline dot rendered with an empty label (found: "${l}")`);
        }
      } finally {
        await page.close();
      }
    }
  }
  return { checks, failures };
}
