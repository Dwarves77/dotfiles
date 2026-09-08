// UX smoke spec: Map page shell (lane uimapcomm, 2026-09-06). Named as a gap in the perf audit
// ("no smoke spec mounts the map register or the marker legend"), written this lane against the UI
// system handoff (docs/design/handoff-2026-09-06, README screen 10 / artboard "Map").
//
// WHAT THIS MOUNTS, AND WHY NOT MapPageView ITSELF. MapPageView wraps the production map in
// `next/dynamic(..., { ssr:false })` and lazily imports `leaflet/dist/leaflet.css`. Neither survives
// an esbuild browser bundle unmodified — `next/dynamic` drags in Next's server-request-tracing chain
// (the same `@opentelemetry/api` failure spec09-smoke.mjs's header documents for
// `@/lib/supabase-server`), and a bare `.css` import has no output path configured in this
// harness's write:false bundle (same class of failure spec09-smoke.mjs's CSS_ALIAS_TARGET note
// describes). This spec mounts the two REAL pieces the page assembles directly instead, same
// technique spec09-smoke.mjs uses for its seven panel Views:
//   - `MapView` (src/components/map/MapView.tsx) — the real Leaflet basemap + urgency-band markers +
//     the bottom-left marker legend (`data-map-legend`), fixture jurisdictions covering all four
//     bands so every band's marker colour and every legend row renders.
//   - `ListRow` (src/components/ui/ListRow.tsx) with `variant="register"` + `endStat`, under its
//     `ListRowColumnHeader variant="register"`, the real jurisdiction register, exactly as
//     MapPageView.tsx renders it (band spine, name column, active-themes column, band + count stat
//     cells, trailing → glyph), fixture rows across bands. Updated by lane map60 (2026-09-08) when
//     the register moved to artboard 10's own six-column grid; a smoke spec describes the product,
//     it does not preserve the shape the product has left behind.
//
// THE CSS ALIAS. Same technique as spec09-smoke.mjs's CSS_ALIAS_TARGET: `leaflet/dist/leaflet.css`
// is aliased to the existing next/link stub (any valid ES module works as an import-for-side-effect
// target) so esbuild never needs an output path for it.

import { bundleEntry, newSmokePage, mountBundle, measureGuard, findPlaceholderLiterals, detectOverflows } from './harness.mjs';
import { MOBILE_VIEWPORT, DESKTOP_VIEWPORT } from './ux-harness.mjs';
import { measureUx, assertUxClean } from '../ux-assert.mjs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { getRepoRoot } from '../../lib/context.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const CSS_ALIAS_TARGET = join(HERE, 'stub-next-link.mjs');
// The real leaflet stylesheet cannot be `import`ed by this write:false, no-outdir esbuild bundle
// (same class of failure spec09-smoke.mjs's CSS_ALIAS_TARGET note documents) — aliased away above —
// but IS needed at runtime: without it `.leaflet-container` has no `overflow:hidden`/positioning
// rules, so its internally-panned tiles read as a real page overflow and the (unstyled) zoom
// buttons read as a law-2 target-floor violation, neither a real defect. Loaded via
// `page.addStyleTag` instead (a real browser `<style>` tag, not part of the JS bundle).
const LEAFLET_CSS = readFileSync(join(getRepoRoot(), 'fsi-app/node_modules/leaflet/dist/leaflet.css'), 'utf8');

// Same false-positive class regulations-rows-smoke.mjs's own KNOWN_SAFE_PLACEHOLDER_LITERALS
// documents for "Action" (the urgency band's real label, coincidentally also a §3 "action headers"
// literal in source-entry-filter.mjs's HEADER_LITERALS — an unrelated extracted-brief-table
// vocabulary): the register row's `endStat` band label renders this real band name, never a
// placeholder/header-echo. "—" is the honest Absence-style "no active themes on record" dash
// (row.activeThemes || '—'), the same NO_DATA_TOKENS/"—" collision detail-surfaces-smoke.mjs
// documents for the unrated-tier chip — a deliberate honest omission, never fabricated content.
const KNOWN_SAFE_PLACEHOLDER_LITERALS = new Set(['Action', '—']);

const ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MapView } from '@/components/map/MapView';
import { ListRow, ListRowColumnHeader } from '@/components/ui/ListRow';
import { BAND_ORDER } from '@/lib/urgency/bands';

function RegisterRow({ row }) {
  const band = BAND_ORDER.find((b) => b.key === row.bandKey);
  return React.createElement(ListRow, {
    variant: 'register',
    minHeight: 44,
    href: '/regulations?region=' + row.id.toUpperCase(),
    band,
    jurisdiction: row.code,
    title: row.label,
    meta: row.activeThemes || '—',
    endStat: { label: band.label, value: String(row.count), band },
  });
}

function MapSmokeRoot(props) {
  return React.createElement(React.Fragment, null,
    React.createElement('div', { style: { height: 460, width: '100%', position: 'relative', overflow: 'hidden' } },
      React.createElement(MapView, { jurisdictions: props.markers, communityActivity: [] }),
    ),
    React.createElement('div', { 'data-testid': 'jurisdiction-register-rows' },
      props.registerRows.length > 0
        ? React.createElement(ListRowColumnHeader, { key: 'head', variant: 'register' })
        : null,
      props.registerRows.map((row) => React.createElement(RegisterRow, { key: row.id, row })),
    ),
  );
}

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(MapSmokeRoot, props));
};
`;

// One jurisdiction per band, so all four marker colours and all four register rows render.
const MARKERS = [
  { id: 'eu', label: 'EU', count: 392, tone: 'immediate' },
  { id: 'us', label: 'United States', count: 28, tone: 'action' },
  { id: 'global', label: 'Global', count: 549, tone: 'monitor' },
  { id: 'uk', label: 'United Kingdom', count: 2, tone: 'awareness' },
];

const REGISTER_ROWS = [
  { id: 'eu', code: 'EU', label: 'EU', count: 392, bandKey: 'immediate', activeThemes: 'Emissions · Reporting · Packaging' },
  { id: 'us', code: 'US', label: 'United States', count: 28, bandKey: 'action', activeThemes: 'Reporting · Emissions · Transport' },
  { id: 'global', code: 'GLO', label: 'Global', count: 549, bandKey: 'monitor', activeThemes: '' },
  { id: 'uk', code: 'UK', label: 'United Kingdom', count: 2, bandKey: 'awareness', activeThemes: '' },
];

const STATES = [
  {
    label: 'populated',
    props: { markers: MARKERS, registerRows: REGISTER_ROWS },
    expectTitles: 0,
  },
  {
    label: 'empty',
    props: { markers: [], registerRows: [] },
    expectTitles: 0,
  },
];

export async function runSmoke(browser) {
  const failures = [];
  let checks = 0;
  const bundleJs = await bundleEntry(ENTRY, {
    alias: { 'leaflet/dist/leaflet.css': CSS_ALIAS_TARGET },
  });

  for (const vp of [MOBILE_VIEWPORT, DESKTOP_VIEWPORT]) {
    for (const state of STATES) {
      const label = `map-page:${state.label}@${vp.width}`;
      const page = await newSmokePage(browser);
      try {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.addStyleTag({ content: LEAFLET_CSS });
        await mountBundle(page, bundleJs, '__mount', state.props);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
        // Tiles load async even against the intercepted same-origin (no network — page.route
        // answers everything, including the OSM tile URLs, with a 404, which is enough for
        // leaflet to finish laying out the DOM); one more frame lets that settle.
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));

        const guard = await measureGuard(page);
        const ux = await measureUx(page);
        checks += 1;
        const overflows = detectOverflows(guard.measurements);
        if (overflows.length > 0) {
          failures.push(`${label}: horizontal overflow — ${overflows.map((o) => `${o.name} +${o.overflowBy}px`).join(', ')}`);
        }
        const placeholders = findPlaceholderLiterals(guard.texts).filter((p) => !KNOWN_SAFE_PLACEHOLDER_LITERALS.has(p));
        if (placeholders.length > 0) {
          failures.push(`${label}: placeholder literal rendered — ${placeholders.join(', ')}`);
        }
        failures.push(...assertUxClean(label, ux));

        if (state.label === 'populated') {
          checks += 1;
          const legendCount = await page.$$eval('[data-map-legend]', (els) => els.length);
          if (legendCount < 1) {
            failures.push(`${label}: expected the marker legend ([data-map-legend]) to render, found none.`);
          }

          checks += 1;
          const rowCount = await page.$$eval('[data-testid="jurisdiction-register-rows"] > *', (els) => els.length);
          // +1 for the column header, which is a child of the same container.
          if (rowCount < REGISTER_ROWS.length + 1) {
            failures.push(`${label}: expected ${REGISTER_ROWS.length} jurisdiction register rows plus a column header, found ${rowCount} children.`);
          }

          // Every register row is a real navigable Link (the whole row is the click target) —
          // train 49 fixed dead clicks in the map list view; this asserts it stays fixed.
          checks += 1;
          const linkCount = await page.$$eval(
            '[data-testid="jurisdiction-register-rows"] a[href]',
            (els) => els.length,
          );
          if (linkCount < REGISTER_ROWS.length) {
            failures.push(`${label}: expected every register row to carry a navigable <a href>, found ${linkCount} of ${REGISTER_ROWS.length}.`);
          }
        }
      } finally {
        await page.close();
      }
    }
  }

  return { checks, failures };
}
