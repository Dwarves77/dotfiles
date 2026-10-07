// UX smoke spec: lane PAR-2 (2026-10-07, Claude Design artboard 22 rulings A, B, C). Mounts the REAL
// BandTile row, the REAL list group header (ListSurfaceShell's BandSectionHeader), the REAL DetailSection
// inside a BandProvider, and the REAL CrossPageSection, then asserts the measured look at 375, 768, 1024
// and 1280:
//   A. the group header has NO tinted background (white card), band name Anton 18px in the band colour,
//      a 3px band rule on top;
//   B. every band tile's numeral row is 34px and all four bottom rules share one y;
//   C. the detail section header sits on the item's band tint with a 24px title, and the Connected
//      intelligence disclosures are rule-separated rows (no card shell).
// Each mount also runs through runUxSpec (overflow, squeezed title, 44px targets) on fixture data only.

import { fileURLToPath } from 'node:url';
import { runUxSpec, UX_VIEWPORTS } from './ux-harness.mjs';
import { bundleEntry, newSmokePage, mountBundle } from './harness.mjs';
import { fullAppCss } from './smoke-fixtures.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
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
import { BandTile } from '@/components/ui/BandTile';
import { BandTileRow } from '@/components/ui/BandTileRow';
import { BandSectionHeader } from '@/components/list-surface/ListSurfaceShell';
import { DetailSection, DetailPageWrapper } from '@/components/detail/DetailShell';
import { CrossPageSection } from '@/components/detail/CrossPageSection';
import { ItemGroup } from '@/components/ui/ItemGroup';
import { BAND_ORDER, band } from '@/lib/urgency/bands';

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  const h = React.createElement;
  if (props.kind === 'tiles') {
    root.render(h(BandTileRow, null, BAND_ORDER.map((b, i) => h(BandTile, { key: b.key, band: b, count: props.counts[i], onSelect: () => {} }))));
  } else if (props.kind === 'group') {
    root.render(h('div', { style: { background: 'var(--card)' } }, BAND_ORDER.map((b) => h(BandSectionHeader, { key: b.key, band: b, total: 1135, showing: 5 }))));
  } else if (props.kind === 'itemgroup') {
    root.render(h(DetailPageWrapper, { band: band('action') }, h(ItemGroup, { title: 'Take-back registration', qualifier: '2 facts' }, [h('div', { key: 'a' }, 'Card one')])));
  } else if (props.kind === 'detail') {
    root.render(h(DetailPageWrapper, { band: band(props.bandKey) }, h(DetailSection, { id: 's2', title: 'Substantive findings', index: 2, aside: '3 items' }, h('p', null, 'Section text'))));
  } else {
    root.render(h(CrossPageSection, props.section));
  }
};
`;

const ix = (scenarios, objects, strength, tier) => ({ signal: 'intersection', detail: { scenarios, objects, strength, tier }, weight: 0.9 });
const conn = (id, surface, basis) => ({ id, direction: 'outgoing', relationship: 'related', origin: 'provenance_discovery', basis, score: 0.9, surface });
const SECTION = {
  surfaceKey: 'regulations',
  surfaceLabel: 'Regulations',
  connections: [
    conn('m1', 'market', [ix(['ocean-bunkering', 'ets-allowance-surrender'], ['carrier-ocean', 'vessel-operator'], 14, 'strong')]),
    conn('r1', 'research', [ix(['saf-blending'], ['carrier-air'], 5, 'weak')]),
  ],
  resourceLookup: {
    m1: { id: 'm1', title: 'Bunker surcharge signal for the Asia Europe corridor', priority: 'HIGH' },
    r1: { id: 'r1', title: 'Methanol engine trial result', priority: 'HIGH' },
  },
  crossPage: { intersectionSummary: 'Both items turn on how the surrender obligation reaches ocean carriers.', theme: null },
};

async function measure(browser, vp, props) {
  const bundle = await bundleEntry(ENTRY, { alias: ALIAS });
  const page = await newSmokePage(browser);
  try {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await mountBundle(page, bundle, '__mount', props);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    await page.waitForTimeout(50);
    return await page.evaluate((kind) => {
      const cs = (el) => getComputedStyle(el);
      if (kind === 'tiles') {
        return [...document.querySelectorAll('.cl-band-tile')].map((t) => {
          const n = t.querySelector('.cl-band-tile-numeral');
          const rule = t.querySelector('.cl-band-tile-rule');
          const w = t.querySelector('.cl-band-tile-window');
          const l = t.querySelector('.cl-band-tile-label');
          return {
            numeralH: n.getBoundingClientRect().height,
            ruleBottom: Math.round((rule.getBoundingClientRect().bottom - t.getBoundingClientRect().top) * 10) / 10,
            sameLine: Math.abs(w.getBoundingClientRect().top - l.getBoundingClientRect().top) < 6,
            windowTitle: w.getAttribute('title'),
          };
        });
      }
      if (kind === 'group') {
        return [...document.querySelectorAll('[data-audit="band-header"]')].map((h) => {
          const name = h.querySelector('[data-audit="band-header-label"]');
          return { bg: cs(h).backgroundColor, topW: cs(h).borderTopWidth, nameFont: cs(name).fontFamily, nameSize: cs(name).fontSize, nameColor: cs(name).color, topColor: cs(h).borderTopColor };
        });
      }
      if (kind === 'itemgroup') {
        const h = document.querySelector('[data-part-slot="group-header"] [data-audit="band-header"]');
        const name = h.querySelector('[data-audit="band-header-label"]');
        return { bg: cs(h).backgroundColor, topW: cs(h).borderTopWidth, nameFont: cs(name).fontFamily, nameSize: cs(name).fontSize, nameColor: cs(name).color, topColor: cs(h).borderTopColor };
      }
      if (kind === 'detail') {
        const head = document.querySelector('.cl-section-header');
        const h2 = head.querySelector('h2');
        const probe = document.createElement('i');
        probe.style.background = 'var(--immediate-tint)';
        document.body.appendChild(probe);
        return { bg: cs(head).backgroundColor, tint: cs(probe).backgroundColor, titleSize: cs(h2).fontSize };
      }
      return [...document.querySelectorAll('[data-audit="disclosure-row"]')].map((d) => ({
        radius: cs(d).borderTopLeftRadius, left: cs(d).borderLeftWidth, right: cs(d).borderRightWidth, bg: cs(d).backgroundColor, top: cs(d).borderTopWidth, bottom: cs(d).borderBottomWidth,
      }));
    }, props.kind);
  } finally {
    await page.close();
  }
}

export async function runSmoke(browser) {
  const failures = [];
  let checks = 0;
  const uxRuns = [
    await runUxSpec(browser, {
      name: 'par2-tiles',
      entry: ENTRY,
      alias: ALIAS,
      knownSafePlaceholders: ['Action'],
      states: [
        { label: 'normal', props: { kind: 'tiles', counts: [8, 31, 1135, 4] } },
        { label: 'wide-figures', props: { kind: 'tiles', counts: [1, 1234, 56789, 100000] } },
      ],
    }),
    await runUxSpec(browser, { name: 'par2-group-header', entry: ENTRY, alias: ALIAS, knownSafePlaceholders: ['Action'], states: [{ label: 'four', props: { kind: 'group' } }] }),
    await runUxSpec(browser, { name: 'par2-item-group', entry: ENTRY, alias: ALIAS, knownSafePlaceholders: ['Action'], states: [{ label: 'titled', props: { kind: 'itemgroup' }, expectTitles: 1 }] }),
    await runUxSpec(browser, { name: 'par2-detail-section', entry: ENTRY, alias: ALIAS, knownSafePlaceholders: ['Action'], states: [{ label: 'immediate', props: { kind: 'detail', bandKey: 'immediate' }, expectTitles: 1 }] }),
    await runUxSpec(browser, { name: 'par2-cross-page', entry: ENTRY, alias: ALIAS, knownSafePlaceholders: ['Action'], states: [{ label: 'full', props: { kind: 'cross', section: SECTION }, expectTitles: 2 }] }),
  ];
  for (const r of uxRuns) {
    checks += r.checks;
    failures.push(...r.failures);
  }

  const rgb = (c) => c.replace(/\s+/g, '');
  for (const vp of UX_VIEWPORTS) {
    const at = `@${vp.width}`;
    const tiles = await measure(browser, vp, { kind: 'tiles', counts: [8, 31, 1135, 4] });
    checks += 1;
    if (tiles.length !== 4) failures.push(`par2-tiles${at}: expected 4 tiles, found ${tiles.length}`);
    for (const [i, t] of tiles.entries()) {
      if (t.numeralH !== 34) failures.push(`par2-tiles${at}: tile ${i} numeral row is ${t.numeralH}px, expected 34`);
      if (t.ruleBottom !== tiles[0].ruleBottom) failures.push(`par2-tiles${at}: tile ${i} bottom rule at ${t.ruleBottom}, tile 0 at ${tiles[0].ruleBottom} (rules sit at the same offset in every tile)`);
      if (!t.sameLine) failures.push(`par2-tiles${at}: tile ${i} label and definition are not on one line`);
      if (!t.windowTitle) failures.push(`par2-tiles${at}: tile ${i} definition carries no title attribute`);
    }
    const groups = await measure(browser, vp, { kind: 'group' });
    checks += 1;
    if (groups.length !== 4) failures.push(`par2-group${at}: expected 4 headers, found ${groups.length}`);
    for (const [i, g] of groups.entries()) {
      if (rgb(g.bg) !== 'rgb(255,255,255)') failures.push(`par2-group${at}: header ${i} background is ${g.bg}, expected white (untinted)`);
      if (g.topW !== '3px') failures.push(`par2-group${at}: header ${i} top rule is ${g.topW}, expected 3px`);
      if (g.nameSize !== '18px') failures.push(`par2-group${at}: header ${i} band name is ${g.nameSize}, expected 18px`);
      if (!/Anton/i.test(g.nameFont)) failures.push(`par2-group${at}: header ${i} band name face is ${g.nameFont}, expected Anton`);
      if (g.nameColor !== g.topColor) failures.push(`par2-group${at}: header ${i} band name colour ${g.nameColor} differs from the band rule ${g.topColor}`);
    }
    const ig = await measure(browser, vp, { kind: 'itemgroup' });
    checks += 1;
    if (rgb(ig.bg) !== 'rgb(255,255,255)') failures.push(`par2-itemgroup${at}: header background is ${ig.bg}, expected white (untinted)`);
    if (ig.topW !== '3px') failures.push(`par2-itemgroup${at}: header top rule is ${ig.topW}, expected 3px`);
    if (ig.nameSize !== '18px' || !/Anton/i.test(ig.nameFont)) failures.push(`par2-itemgroup${at}: band name is ${ig.nameSize} ${ig.nameFont}, expected Anton 18px`);
    if (ig.nameColor !== ig.topColor) failures.push(`par2-itemgroup${at}: band name colour ${ig.nameColor} differs from the band rule ${ig.topColor}`);
    const d = await measure(browser, vp, { kind: 'detail', bandKey: 'immediate' });
    checks += 1;
    if (rgb(d.bg) !== rgb(d.tint)) failures.push(`par2-detail${at}: section header background ${d.bg}, expected the band tint ${d.tint}`);
    if (d.titleSize !== '24px') failures.push(`par2-detail${at}: section title is ${d.titleSize}, expected 24px`);
    const rows = await measure(browser, vp, { kind: 'cross', section: SECTION });
    checks += 1;
    if (rows.length === 0) failures.push(`par2-cross${at}: no disclosure row rendered, the measurement is empty`);
    for (const [i, r] of rows.entries()) {
      if (r.radius !== '0px' || r.left !== '0px' || r.right !== '0px' || rgb(r.bg) !== 'rgba(0,0,0,0)') failures.push(`par2-cross${at}: disclosure ${i} has a card shell (${JSON.stringify(r)})`);
      if (r.top !== '1px' || r.bottom !== '1px') failures.push(`par2-cross${at}: disclosure ${i} is not rule-separated (${r.top} / ${r.bottom})`);
    }
  }
  return { checks, failures };
}
