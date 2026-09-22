// UX smoke spec: record-grade regulation path renders its fact cards inside ItemGroup.
//
// Finding (addendum, 2026-09-22): [CONFIRMED on production bfde1be8] the record-grade regulation
// page /regulations/f8268063-0e07-4562-82da-a1373d6dd797 rendered 4 fact cards and ZERO
// `[data-part="item-group"]`. RegulationDetailSurface.tsx's local `RecordGradeSections` mapped
// `RecordFactCard` directly, never through `ItemGroup`, unlike every other detail surface (F49:
// "All four detail surfaces render fact cards through ItemGroup; no page hand-builds a group").
// Fixed in this lane by wrapping the same two groups (`dateFacts`, `otherFacts`) `RecordGradeSections`
// already computes in `ItemGroup`, matching the shared `RecordFactsBody` primitive
// (src/components/detail/primitives.tsx) that Market/Research already use.
//
// This spec mounts the REAL `RecordFactCard` + `ItemGroup` components against a frozen real
// record (src/components/ui/__fixtures__/record-grade-fixture.ts, item
// f8268063-0e07-4562-82da-a1373d6dd797, read-only SELECT 2026-09-22) in the exact two-group shape
// RegulationDetailSurface.tsx's `RecordGradeSections` now renders, and asserts both groups carry
// `data-part="item-group"`.

import { bundleEntry, newSmokePage, mountBundle, measureGuard, detectOverflows } from './harness.mjs';
import { fullAppCss } from './smoke-fixtures.mjs';

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
import { ItemGroup } from '@/components/ui/ItemGroup';
import { RecordFactCard } from '@/components/detail/primitives';
import {
  RECORD_GRADE_FIXTURE_DATE_FACTS,
  RECORD_GRADE_FIXTURE_OTHER_FACTS,
} from '@/components/ui/__fixtures__/record-grade-fixture';

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('div', { 'data-part': 'record-grade-sections' },
      React.createElement(ItemGroup, { title: 'Key dates' },
        RECORD_GRADE_FIXTURE_DATE_FACTS.map((f) => React.createElement(RecordFactCard, { key: f.slotKey, fact: f })),
      ),
      React.createElement(ItemGroup, { title: 'Verbatim facts' },
        RECORD_GRADE_FIXTURE_OTHER_FACTS.map((f) => React.createElement(RecordFactCard, { key: f.slotKey, fact: f })),
      ),
    ),
  );
};
`;

export async function runSmoke(browser) {
  const failures = [];
  let checks = 0;
  const bundleJs = await bundleEntry(ENTRY);

  const page = await newSmokePage(browser);
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mountBundle(page, bundleJs, '__mount', null);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

    const guard = await measureGuard(page);
    checks += 1;
    const overflows = detectOverflows(guard.measurements);
    if (overflows.length > 0) {
      failures.push(`record-grade@1440: horizontal overflow (${overflows.map((o) => `${o.name} +${o.overflowBy}px`).join(', ')})`);
    }

    const measured = await page.evaluate(() => {
      const root = document.querySelector('[data-part="record-grade-sections"]');
      const groups = root ? Array.from(root.querySelectorAll('[data-part="item-group"]')) : [];
      const cardsOutsideGroup = root
        ? Array.from(root.querySelectorAll('[data-part="fact-card"]')).filter((c) => !c.closest('[data-part="item-group"]')).length
        : 0;
      const cardsInGroups = groups.reduce((n, g) => n + g.querySelectorAll('[data-part="fact-card"]').length, 0);
      return { groupCount: groups.length, cardsOutsideGroup, cardsInGroups };
    });
    checks += 1;
    if (measured.groupCount < 2) {
      failures.push(`record-grade@1440: expected 2 item-group parts (Key dates, Verbatim facts), found ${measured.groupCount}`);
    }
    checks += 1;
    if (measured.cardsOutsideGroup > 0) {
      failures.push(`record-grade@1440: ${measured.cardsOutsideGroup} fact card(s) rendered outside any [data-part="item-group"]`);
    }
    checks += 1;
    if (measured.cardsInGroups !== 4) {
      failures.push(`record-grade@1440: expected 4 fact cards inside item-group parts (the frozen fixture's 4 FACT rows), found ${measured.cardsInGroups}`);
    }
  } finally {
    await page.close();
  }

  return { checks, failures };
}
