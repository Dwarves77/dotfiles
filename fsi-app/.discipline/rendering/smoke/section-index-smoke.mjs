// UX smoke spec: SectionIndex. Lane W10-ActionCard-a, 2026-09-21, operator review items 4 and 6.
// Mounts the REAL `SectionIndex` (src/components/ui/SectionIndex.tsx) with the real
// `REGULATION_SECTION_INDEX` table, measured at 1440x900 and 375x812. The review's own eight
// anchored sections plus check 8's trailing "related" entry (lane PARITY-PARTS, 2026-09-24;
// Connections moved out of the rail), nine total.
//
// Acceptance measured here, verbatim from the brief's step 7:
//   - no index label with scrollWidth > clientWidth (never truncates)
//   - no standalone Summary|Full brief switch row: the depth control renders INSIDE the nav's own
//     flex row, never as a second element below it
//   - no horizontal PAGE overflow (the strip itself scrolls, the page does not)

import { bundleEntry, newSmokePage, mountBundle, measureGuard, detectOverflows } from './harness.mjs';
import { fullAppCss } from './smoke-fixtures.mjs';
import { detectTruncatedLabels, detectStandaloneSwitch } from '../action-card-assert.mjs';

const STYLE_INJECT = `
(() => {
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(fullAppCss())};
  document.head.appendChild(style);
})();
`;

/** `withDepth` is baked into the bundle at build time (two entries, not a runtime prop) because
 *  `onDepthChange` is a function and mountBundle's props cross a structured-clone boundary that
 *  cannot carry one. */
function entryFor(withDepth) {
  return `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { SectionIndex, REGULATION_SECTION_INDEX } from '@/components/ui/SectionIndex';

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  function App() {
    return React.createElement(React.Fragment, null,
      React.createElement(SectionIndex, ${withDepth}
        ? { sections: REGULATION_SECTION_INDEX, depth: 'summary', onDepthChange: () => {} }
        : { sections: REGULATION_SECTION_INDEX }
      ),
      ...REGULATION_SECTION_INDEX.map((s) =>
        React.createElement('div', { key: s.id, id: s.id, style: { padding: '16px 20px', marginBottom: 12, minHeight: 200, border: '1px solid #eee' } },
          React.createElement('p', null, s.shortName)),
      ),
    );
  }
  root.render(React.createElement(App));
};
`;
}

const STATES = [
  { label: 'with-depth-switch', withDepth: true },
  { label: 'no-depth-switch', withDepth: false },
];

async function measureAcceptance(page) {
  return page.evaluate(() => {
    const nav = document.querySelector('[data-part="section-index"]');
    const links = nav ? [...nav.querySelectorAll('.cl-section-index-link')] : [];
    const labelBoxes = links.map((l) => ({ text: l.textContent, scrollWidth: l.scrollWidth, clientWidth: l.clientWidth }));
    // aria-label is "Summary depth" (DetailShell.tsx's SummaryDepthSwitch, the reused control,
    // see SectionIndex.tsx's own header on reuse-before-construction), not "Section depth": this
    // spec's own selector had never actually been run against the real component until now.
    const switchGroups = [...document.querySelectorAll('[role="group"][aria-label="Summary depth"]')];
    // Operator check 7 (lane PARITY-PARTS, 2026-09-24): "no standalone row" now means the switch is
    // a DOM descendant of the SAME bordered strip card the tabs render in ([data-guard-strip]), not
    // literally `g.parentElement === nav` (the restructure that fixed check 7 wraps the switch in
    // its own flexShrink:0 div, itself a child of the strip, which is a child of nav - two levels
    // deep, correctly nested, but no longer a DIRECT nav child). A sibling card pinned outside the
    // strip (the pre-fix shape) fails this the same way it always did.
    const strip = document.querySelector('[data-guard-strip]');
    const switchShapes = switchGroups.map((g) => ({ isChildOfNav: !!(strip && strip.contains(g)) }));
    return {
      linkCount: links.length,
      labelBoxes,
      switchGroupCount: switchGroups.length,
      switchShapes,
      pageScrollWidth: document.documentElement.scrollWidth,
      pageClientWidth: document.documentElement.clientWidth,
    };
  });
}

export async function runSmoke(browser) {
  const failures = [];
  let checks = 0;

  for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
    for (const state of STATES) {
      const label = `section-index:${state.label}@${viewport.width}`;
      const bundleJs = await bundleEntry(entryFor(state.withDepth));
      const page = await newSmokePage(browser);
      try {
        await page.setViewportSize(viewport);
        await mountBundle(page, bundleJs, '__mount');
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
        await page.waitForTimeout(50);

        const guard = await measureGuard(page);

        const acceptance = await measureAcceptance(page);
        // Operator check 8 (lane PARITY-PARTS, 2026-09-24): REGULATION_SECTION_INDEX gained a
        // trailing "related" entry (Connections moved out of the rail), 9 entries now, not 8.
        checks += 1;
        if (acceptance.linkCount !== 9) {
          failures.push(`${label}: expected 9 section-index links, found ${acceptance.linkCount}`);
        }
        checks += 1;
        for (const t of detectTruncatedLabels(acceptance.labelBoxes)) {
          failures.push(`${label}: truncated label (scrollWidth ${t.scrollWidth} > clientWidth ${t.clientWidth}): "${t.text}"`);
        }
        checks += 1;
        if (state.withDepth && acceptance.switchGroupCount !== 1) {
          failures.push(`${label}: expected the depth switch to render, found ${acceptance.switchGroupCount}`);
        }
        if (!state.withDepth && acceptance.switchGroupCount !== 0) {
          failures.push(`${label}: expected no depth switch (onDepthChange omitted), found ${acceptance.switchGroupCount}`);
        }
        checks += 1;
        if (detectStandaloneSwitch(acceptance.switchShapes).length > 0) {
          failures.push(`${label}: depth switch rendered as a standalone row (not a child of the section-index nav)`);
        }
        checks += 1;
        if (acceptance.pageScrollWidth > acceptance.pageClientWidth + 1) {
          failures.push(`${label}: page-level horizontal overflow (scrollWidth ${acceptance.pageScrollWidth} > clientWidth ${acceptance.pageClientWidth})`);
        }
        checks += 1;
        const guardOverflows = detectOverflows(guard.measurements);
        if (guardOverflows.length > 0) {
          failures.push(`${label}: guard overflow (${guardOverflows.map((o) => `${o.name} +${o.overflowBy}px`).join(', ')})`);
        }
      } finally {
        await page.close();
      }
    }
  }
  return { checks, failures };
}
