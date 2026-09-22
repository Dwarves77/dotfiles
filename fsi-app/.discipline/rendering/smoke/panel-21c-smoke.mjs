// UX smoke spec: panel 21c acceptance (lane w10-factcard-d, 2026-09-21, build item 6). Mounts the
// REAL fixture /admin/parts/fact-card renders, ItemGroup + FactCard, PANEL_21C_GROUPS
// (src/lib/detail/fact-card-fixtures.ts), at 1440x900 (the operator's stated gate width) and
// measures the operator's own acceptance list via the pure detector
// (.discipline/rendering/panel21c-accept.mjs's `checkPanel21cAcceptance`, proven red-then-green
// in panel21c-accept.test.mjs, the no-npm suite): both groups together <= 1100px, every card
// <= 140px unless its claim exceeds 4 lines, 0 external captions above a card, 0 empty 132px lead
// columns, 0 adjacent same-kind cards, and every group carries a band pill + ACTION strip.
//
// Runs in the Playwright-driven rendering-guard job (GitHub CI), "Playwright is not installed
// here by operator ruling", so this file cannot execute in the interactive sandbox that authored
// it; the detector core it calls is proven separately in the no-npm suite.

import { bundleEntry, newSmokePage, mountBundle } from './harness.mjs';
import { fullAppCss } from './smoke-fixtures.mjs';
import { checkPanel21cAcceptance } from '../panel21c-accept.mjs';

const STYLE_INJECT = `
(() => {
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(fullAppCss())};
  document.head.appendChild(style);
})();
`;

const ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ItemGroup } from '@/components/ui/ItemGroup';
import { FactCard } from '@/components/ui/FactCard';
import { PANEL_21C_GROUPS } from '@/lib/detail/fact-card-panel21c-fixture';

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('div', { 'data-part': 's2-section' },
      PANEL_21C_GROUPS.map((g) =>
        React.createElement(ItemGroup, { key: g.title, title: g.title, qualifier: g.qualifier, band: g.band, actionStrip: g.actionStrip },
          g.cards.map((f) => React.createElement(FactCard, { key: f.label, model: f.model })),
        ),
      ),
    ),
  );
};
`;

// Pure DOM measurement, evaluated in-page. Builds the plain measurements object
// checkPanel21cAcceptance judges, see panel21c-accept.mjs's own JSDoc for the shape.
const MEASURE_FN = `
  () => {
    const section = document.querySelector('[data-part="s2-section"]');
    const groupEls = Array.from(section.querySelectorAll('[data-part="item-group"]'));
    const first = groupEls[0].getBoundingClientRect();
    const last = groupEls[groupEls.length - 1].getBoundingClientRect();
    const groupsTotalHeight = Math.round(last.bottom - first.top);

    const kindSlugOf = (cardEl) => cardEl.getAttribute('data-kind');

    // A "caption above a card": any element or non-whitespace text node that is a sibling of a
    // card inside the group body, positioned above that card's own top edge, that is not the
    // card itself and not the group's own header/action-strip.
    function captionAbove(bodyEl, cardEl) {
      const cardTop = cardEl.getBoundingClientRect().top;
      for (const child of Array.from(bodyEl.children)) {
        if (child === cardEl) continue;
        if (child.matches('[data-part="fact-card"]')) continue; // another card, not a caption
        if (child.matches('details.cl-more-below')) continue; // the overflow disclosure, not a caption
        const rect = child.getBoundingClientRect();
        if (rect.bottom <= cardTop && (child.textContent || '').trim().length > 0) return true;
      }
      return false;
    }

    const groups = groupEls.map((groupEl) => {
      const hasBandPill = !!groupEl.querySelector('[data-part-slot="band-pill"]');
      const hasActionStrip = !!groupEl.querySelector('[data-part-slot="action-strip"]');
      const bodyEl = groupEl.querySelector('[data-part-slot="group-body"]');
      const cardEls = Array.from(bodyEl.querySelectorAll('[data-part="fact-card"]'));
      const cards = cardEls.map((cardEl) => {
        const rect = cardEl.getBoundingClientRect();
        const claimEl = cardEl.querySelector('.fact-card-v2-claim');
        const claimRect = claimEl ? claimEl.getBoundingClientRect() : { height: 0 };
        const claimStyle = claimEl ? getComputedStyle(claimEl) : null;
        const lineHeight = claimStyle ? parseFloat(claimStyle.lineHeight) || 1 : 1;
        const claimLineCount = claimEl ? Math.max(1, Math.round(claimRect.height / lineHeight)) : 1;
        const bodyRow = cardEl.querySelector('.fact-card-v2-body');
        const gridCols = bodyRow ? getComputedStyle(bodyRow).gridTemplateColumns : '';
        const hasLeadColumn = gridCols.trim().startsWith('132px');
        const leadEl = cardEl.querySelector('.fact-card-v2-lead');
        const hasFigureLead = !!leadEl && (leadEl.textContent || '').trim().length > 0;
        // Sign-off 2026-09-22, correction 1: the provenance column is no longer clipped, so its
        // real rendered line count (not just the claim's) can justify a card over 140px.
        const provenanceEl = cardEl.querySelector('.fact-card-v2-provenance');
        const provenanceRect = provenanceEl ? provenanceEl.getBoundingClientRect() : { height: 0 };
        const provenanceStyle = provenanceEl ? getComputedStyle(provenanceEl) : null;
        const provenanceRowLineHeight = provenanceStyle ? parseFloat(provenanceStyle.fontSize) * 1.45 || 1 : 1;
        const provenanceLineCount = provenanceEl ? Math.max(1, Math.round(provenanceRect.height / provenanceRowLineHeight)) : 1;
        return {
          kindSlug: kindSlugOf(cardEl),
          heightPx: Math.round(rect.height),
          claimLineCount,
          provenanceLineCount,
          hasLeadColumn,
          hasFigureLead,
          captionAboveCard: captionAbove(bodyEl, cardEl),
        };
      });
      return { hasBandPill, hasActionStrip, cards };
    });

    return { groupsTotalHeight, groups };
  }
`;

export async function runSmoke(browser) {
  const failures = [];
  let checks = 0;
  const bundleJs = await bundleEntry(ENTRY);

  const page = await newSmokePage(browser);
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(STYLE_INJECT);
    await mountBundle(page, bundleJs, '__mount', null);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

    const measured = await page.evaluate(
      ({ fnSrc }) => {
        // eslint-disable-next-line no-eval
        const measure = eval(fnSrc);
        return measure();
      },
      { fnSrc: MEASURE_FN },
    );
    checks += 1;
    const { ok, violations } = checkPanel21cAcceptance(measured);
    if (!ok) {
      failures.push(...violations.map((v) => `panel-21c@1440: ${v}`));
    }
  } finally {
    await page.close();
  }

  return { checks, failures };
}
