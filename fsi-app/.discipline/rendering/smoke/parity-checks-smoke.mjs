// UX smoke spec: artboard parity (lane PARITY-PARTS, 2026-09-24, invariant RD-84). Mounts the REAL
// RegulationDetailSurface via detail-surfaces-smoke.mjs's own already-built fixture (REGULATION_ENTRY /
// REGULATION_STATES / ALIAS, reused rather than duplicated - CLAUDE.md rule 13) and measures the
// rendered DOM/computed-style output against the operator's 8-point artboard-parity check
// (fsi-app/scripts/tmp/artboard-parity.mjs, the read-only production/local harness this session used to
// find and fix all eight). This spec is the STATIC-BUILD proof (execution-wired, run every gate) that
// the fixes hold; the harness itself is the LIVE proof (run manually against a real build/DB).
//
// Covers checks 1, 2, 5, 7, 8 (the rendering-dependent half; check 3's static half is F57, this
// registry's sibling fitness function - see RD-84's own residual note for why the split exists).
//
// Uses the 'record-grade-facts-and-connections' fixture state: it is the one REGULATION_STATES entry
// carrying both a real recommendedActions entry (baseResource()'s own default, check 1's ACTION strip)
// and a real connections row (check 8's Connections-not-a-rail-card).

import { bundleEntry, newSmokePage, mountBundle } from './harness.mjs';
import { REGULATION_ENTRY, REGULATION_STATES, ALIAS } from './detail-surfaces-smoke.mjs';

const TINTS = { '#FEF2F2': 'immediate', '#FFF7ED': 'action', '#EFF6FF': 'monitor', '#F0FDF4': 'awareness' };
const FORBIDDEN = ['PENDING', 'NOT IN PRIMARY SOURCE', 'Connect shipment data', 'UNSCORED'];

const MEASURE_FN = `
  ({ TINTS, FORBIDDEN }) => {
    const hex = (c) => {
      const m = String(c).match(/rgba?\\(([^)]+)\\)/); if (!m) return c;
      const p = m[1].split(',').map((x) => parseFloat(x));
      if (p.length === 4 && p[3] === 0) return 'transparent';
      return '#' + p.slice(0, 3).map((x) => Math.round(x).toString(16).padStart(2, '0')).join('').toUpperCase();
    };
    const cs = (el) => getComputedStyle(el);
    const out = {};

    // ── Check 1: band tint on item groups / state notes / ACTION strips that render ──
    const groups = [...document.querySelectorAll('[data-part="item-group"]')];
    out.c1 = groups.map((g) => {
      const header = g.querySelector(':scope > [data-part-slot="group-header"]');
      const strip = g.querySelector(':scope > [data-part-slot="action-strip"]');
      const stripNote = strip ? strip.querySelector('[data-part="state-note"]') : null;
      const rootBg = hex(cs(g).backgroundColor);
      const headerBg = header ? hex(cs(header).backgroundColor) : null;
      const stripBg = stripNote ? hex(cs(stripNote).backgroundColor) : null;
      const tinted = !!(TINTS[rootBg] || (headerBg && TINTS[headerBg]));
      const stripOk = !strip || !!TINTS[stripBg];
      return { tinted, hasStrip: !!strip, stripOk };
    });

    // ── Check 2: ONE masthead card, holding the action row/exposure/timeline ──
    const masthead = document.querySelector('.cl-masthead');
    out.c2 = {
      mastheadFound: !!masthead,
      actionCardInsideMasthead: !!(masthead && masthead.querySelector('[data-part="action-card"]')),
      exposureInsideMasthead: !!(masthead && masthead.querySelector('.cl-exposure-grid')),
      // No SECOND top-level card between the masthead and the section index carries the action row.
      secondActionCardOutsideMasthead: !!(document.querySelector('[data-part="action-card"]') && masthead &&
        !masthead.contains(document.querySelector('[data-part="action-card"]'))),
    };

    // ── Check 5: none of the four forbidden strings render anywhere (case-sensitive) ──
    const bodyText = document.body.innerText;
    out.c5 = Object.fromEntries(FORBIDDEN.map((s) => [s, bodyText.includes(s)]));

    // ── Check 7: the Summary|Full switch is a DOM descendant of the section index's own strip ──
    const strip = document.querySelector('[data-guard-strip]');
    const sw = document.querySelector('[aria-label="Summary depth"]');
    out.c7 = { stripFound: !!strip, switchFound: !!sw, switchInsideStrip: !!(strip && sw && strip.contains(sw)) };

    // ── Check 8: Connections is never a rail card ──
    const rail = document.querySelector('[data-audit="detail-rail"]');
    const railHeadings = rail ? [...rail.querySelectorAll('[data-part="rail-card"], [data-audit$="-rail"]')]
      .map((c) => (c.textContent || '').trim().slice(0, 40)) : [];
    out.c8 = { railFound: !!rail, connectionsInRail: railHeadings.some((h) => /connections/i.test(h)) };

    return out;
  }
`;

export async function runSmoke(browser) {
  const failures = [];
  let checks = 0;

  const state = REGULATION_STATES.find((s) => s.label === 'record-grade-facts-and-connections');
  if (!state) {
    return { checks: 1, failures: ['parity-checks: fixture state "record-grade-facts-and-connections" not found in REGULATION_STATES'] };
  }

  const bundleJs = await bundleEntry(REGULATION_ENTRY, { alias: ALIAS });
  const page = await newSmokePage(browser);
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mountBundle(page, bundleJs, '__mount', state.props);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

    const m = await page.evaluate(
      ({ fnSrc, args }) => {
        // eslint-disable-next-line no-eval
        const measure = eval(fnSrc);
        return measure(args);
      },
      { fnSrc: MEASURE_FN, args: { TINTS, FORBIDDEN } }
    );

    // Check 1
    checks += 1;
    const untinted = m.c1.filter((g) => !g.tinted);
    if (untinted.length) failures.push(`parity-checks:c1: ${untinted.length} item-group(s) render untinted (band-context not threaded)`);
    checks += 1;
    const badStrips = m.c1.filter((g) => g.hasStrip && !g.stripOk);
    if (badStrips.length) failures.push(`parity-checks:c1: ${badStrips.length} ACTION strip(s) render but are not band-tinted`);

    // Check 2
    checks += 1;
    if (!m.c2.mastheadFound) failures.push('parity-checks:c2: no .cl-masthead found');
    else {
      checks += 1;
      if (!m.c2.actionCardInsideMasthead) failures.push('parity-checks:c2: [data-part="action-card"] is not a descendant of .cl-masthead');
      checks += 1;
      if (!m.c2.exposureInsideMasthead) failures.push('parity-checks:c2: .cl-exposure-grid is not a descendant of .cl-masthead');
      checks += 1;
      if (m.c2.secondActionCardOutsideMasthead) failures.push('parity-checks:c2: an action-card exists OUTSIDE .cl-masthead (a second, sibling card)');
    }

    // Check 5
    for (const [needle, hit] of Object.entries(m.c5)) {
      checks += 1;
      if (hit) failures.push(`parity-checks:c5: forbidden literal "${needle}" renders in the DOM`);
    }

    // Check 7
    checks += 1;
    if (!m.c7.stripFound) failures.push('parity-checks:c7: no [data-guard-strip] found');
    checks += 1;
    if (!m.c7.switchFound) failures.push('parity-checks:c7: no Summary|Full switch found (aria-label="Summary depth")');
    if (m.c7.stripFound && m.c7.switchFound) {
      checks += 1;
      if (!m.c7.switchInsideStrip) failures.push('parity-checks:c7: the Summary|Full switch is NOT a DOM descendant of [data-guard-strip]');
    }

    // Check 8
    checks += 1;
    if (!m.c8.railFound) failures.push('parity-checks:c8: no [data-audit="detail-rail"] found');
    checks += 1;
    if (m.c8.connectionsInRail) failures.push('parity-checks:c8: a rail card titled "Connections" was found (Connections must render in main content, not the rail)');
  } finally {
    await page.close();
  }

  return { checks, failures };
}
