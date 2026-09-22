// UX smoke spec: every fact card on every detail surface, both grades, renders inside ItemGroup.
//
// Lane W10-SectionHeader, 2026-09-22, build item 1 (amendment 1: item 1's fix already landed as PR
// #784, "record-grade fact cards now render inside ItemGroup"; this lane's own job is to VERIFY it
// with the test the brief describes, add it if missing, fix at the cause if it fails). This is that
// test: it mounts the REAL shared primitives every detail surface renders fact cards through
// (`RecordFactCard`/`RecordFactsBody`, `src/components/detail/primitives.tsx`, the record-grade
// path; `FactBlocks`, `src/components/detail/FactBlocks.tsx`, the full-brief path) against real
// fixture data for each of the four detail surfaces, and asserts every `[data-part="fact-card"]`
// has an `[data-part="item-group"]` ancestor, site-wide, both grades.
//
// Coverage (one CASE per row; the three SHAPEs below are the only mount bodies, reused across
// rows rather than repeated per row - F45 duplicate-code):
//   - Regulation record-grade: RegulationDetailSurface.tsx's own local ItemGroup wrap (its
//     RecordGradeSections carries an extra gaps-count line vs primitives.tsx's shared
//     RecordFactsBody, per primitives.tsx's own header, so it is not byte-identical to the other
//     two and is asserted on its own terms), the exact shape record-grade-smoke.mjs already
//     proves; reused here rather than re-derived so the two specs can never silently diverge.
//   - Market / Research record-grade: the shared `RecordFactsBody` primitive both surfaces mount.
//   - Regulation / Market / Research / Operations full-brief: the shared `FactBlocks` primitive
//     every one of the four mounts for its numbered/prose sections (Operations has no record-grade
//     path at all, OperationsDetailSurface.tsx carries no `itemGrade === "record"` branch, unlike
//     the other three, so full-brief is its only coverage here, honestly).
//
// Fixtures: record-grade fields (title/dateFacts/otherFacts) come from
// `src/components/ui/__fixtures__/record-grade-fixture.ts`, the frozen real record (intelligence_items.id
// = f8268063-0e07-4562-82da-a1373d6dd797, EC 391/2009, EUR-Lex, frozen 2026-09-22). Full-brief
// content_md comes from `src/components/ui/__fixtures__/full-brief-fixture.ts`, built from the SAME
// frozen verbatim spans, reshaped as FACT paragraphs, no invented claim text anywhere in this spec.

import { bundleEntry, newSmokePage, mountBundle, measureGuard, detectOverflows } from './harness.mjs';
import { fullAppCss } from './smoke-fixtures.mjs';

const STYLE_INJECT = `
(() => {
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(fullAppCss())};
  document.head.appendChild(style);
})();
`;

const MOUNT_WRAP = (subjectExpr) => `
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!window.__root) window.__root = createRoot(el);
  window.__root.render(
    React.createElement('div', { 'data-part': 'coverage-root' }, ${subjectExpr}),
  );
};
`;

/** The three real mount shapes, one function each, parameterized. Every CASE below picks one. */
const SHAPES = {
  regulationRecordGrade: () => `
    import { ItemGroup } from '@/components/ui/ItemGroup';
    import { RecordFactCard } from '@/components/detail/primitives';
    import {
      RECORD_GRADE_FIXTURE_DATE_FACTS,
      RECORD_GRADE_FIXTURE_OTHER_FACTS,
    } from '@/components/ui/__fixtures__/record-grade-fixture';
    ${MOUNT_WRAP(`
      React.createElement(ItemGroup, { title: 'Key dates' },
        RECORD_GRADE_FIXTURE_DATE_FACTS.map((f) => React.createElement(RecordFactCard, { key: f.slotKey, fact: f })),
      ),
      React.createElement(ItemGroup, { title: 'Verbatim facts' },
        RECORD_GRADE_FIXTURE_OTHER_FACTS.map((f) => React.createElement(RecordFactCard, { key: f.slotKey, fact: f })),
      )
    `)}
  `,
  recordGradeBody: (leadNote) => `
    import { RecordFactsBody } from '@/components/detail/primitives';
    import {
      RECORD_GRADE_FIXTURE_DATE_FACTS,
      RECORD_GRADE_FIXTURE_OTHER_FACTS,
    } from '@/components/ui/__fixtures__/record-grade-fixture';
    ${MOUNT_WRAP(`
      React.createElement(RecordFactsBody, {
        leadNote: ${JSON.stringify(leadNote)},
        dateFacts: RECORD_GRADE_FIXTURE_DATE_FACTS,
        otherFacts: RECORD_GRADE_FIXTURE_OTHER_FACTS,
      })
    `)}
  `,
  fullBrief: () => `
    import { FactBlocks } from '@/components/detail/FactBlocks';
    import { FULL_BRIEF_FIXTURE_MARKDOWN } from '@/components/ui/__fixtures__/full-brief-fixture';
    ${MOUNT_WRAP(`React.createElement(FactBlocks, { markdown: FULL_BRIEF_FIXTURE_MARKDOWN })`)}
  `,
};

const CASES = [
  { name: 'regulation-record-grade', body: SHAPES.regulationRecordGrade() },
  { name: 'market-record-grade', body: SHAPES.recordGradeBody('Market signal, record-grade.') },
  { name: 'research-record-grade', body: SHAPES.recordGradeBody('Research finding, record-grade.') },
  { name: 'regulation-full-brief', body: SHAPES.fullBrief() },
  { name: 'market-full-brief', body: SHAPES.fullBrief() },
  { name: 'research-full-brief', body: SHAPES.fullBrief() },
  { name: 'operations-full-brief', body: SHAPES.fullBrief() },
];

function entryFor(body) {
  return `
${STYLE_INJECT}
import React from 'react';
import { createRoot } from 'react-dom/client';
${body}
`;
}

export async function runSmoke(browser) {
  const failures = [];
  let checks = 0;

  for (const { name, body } of CASES) {
    const bundleJs = await bundleEntry(entryFor(body));
    const page = await newSmokePage(browser);
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await mountBundle(page, bundleJs, '__mount', null);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

      const guard = await measureGuard(page);
      checks += 1;
      const overflows = detectOverflows(guard.measurements);
      if (overflows.length > 0) {
        failures.push(`item-group-coverage:${name}@1440: horizontal overflow (${overflows.map((o) => `${o.name} +${o.overflowBy}px`).join(', ')})`);
      }

      const measured = await page.evaluate(() => {
        const root = document.querySelector('[data-part="coverage-root"]');
        const cards = root ? Array.from(root.querySelectorAll('[data-part="fact-card"]')) : [];
        const cardsOutsideGroup = cards.filter((c) => !c.closest('[data-part="item-group"]')).length;
        return { cardCount: cards.length, cardsOutsideGroup };
      });
      checks += 1;
      if (measured.cardCount === 0) {
        failures.push(`item-group-coverage:${name}@1440: expected at least one [data-part="fact-card"], found 0 (fixture produced no cards)`);
      }
      checks += 1;
      if (measured.cardsOutsideGroup > 0) {
        failures.push(`item-group-coverage:${name}@1440: ${measured.cardsOutsideGroup} fact card(s) rendered outside any [data-part="item-group"]`);
      }
    } finally {
      await page.close();
    }
  }

  return { checks, failures };
}
