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
//
// Also covers the 2026-09-25 operator ruling under this SAME invariant (RD-84): "With more than 4,
// show the next 4 then '+N more'." The strip-removal half of that ruling is F58 (static, this
// registry's sibling fitness function, mirroring F57's split); THIS spec proves the rendered TIMELINE
// never shows more than 4 markers at once, and shows the "+N more" chip exactly when it collapsed. A
// LOCAL 6-entry timeline override (below) is used for this one measurement rather than the shared
// fixture's own 3-entry timeline (under the 4-collapse threshold, so it would never exercise the
// collapsed branch) - the override is built here, not written back into detail-surfaces-smoke.mjs, so
// every other spec reading that fixture is unaffected.

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

    // ── Operator ruling 2026-09-25 (invariant RD-84): TIMELINE shows at most 4 markers, plus a
    // "+N more" chip when there are more. Requires the caller to have mounted with a >4-entry
    // timeline (this spec's local override) for the collapsed branch to be reachable at all.
    const timelinePart = document.querySelector('[data-part="timeline"]');
    const visibleDots = timelinePart ? timelinePart.querySelectorAll('[role="img"] > span').length : 0;
    const moreChip = document.querySelector('[data-audit="timeline-more-markers"]');
    out.cTimeline = {
      timelineFound: !!timelinePart,
      visibleDots,
      moreChipFound: !!moreChip,
      moreChipIsLink: !!(moreChip && moreChip.tagName === 'A' && moreChip.getAttribute('href')),
      moreChipText: moreChip ? (moreChip.textContent || '').trim() : null,
    };

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

  // Local 6-entry timeline override (this spec only - the shared fixture's own 3-entry timeline
  // stays untouched for every other spec that reads it). 6 > the 4-marker collapse threshold, so
  // this exercises the "next 4 plus +N more" branch; entry[2] is "current" (the classifier's "next"),
  // so the visible window is entries 2-5 (4 of them), hiddenCount 2.
  const timelineOverrideProps = {
    ...state.props,
    resource: {
      ...state.props.resource,
      timeline: [
        { date: '2026-01-01', label: 'Entered into force', status: 'past' },
        { date: '2026-03-01', label: 'First reporting window', status: 'past' },
        { date: '2026-06-01', label: 'Compliance deadline', status: 'current' },
        { date: '2026-09-01', label: 'Review checkpoint', status: 'future' },
        { date: '2026-12-01', label: 'Phase step', status: 'future' },
        { date: '2027-03-01', label: 'Final surrender', status: 'future' },
      ],
    },
  };

  const bundleJs = await bundleEntry(REGULATION_ENTRY, { alias: ALIAS });
  const page = await newSmokePage(browser);
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mountBundle(page, bundleJs, '__mount', timelineOverrideProps);
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

    // Operator ruling 2026-09-25 (RD-84): TIMELINE shows at most 4 markers, plus "+N more" (a real
    // link, per the "which jumps to the obligations section" ruling) when collapsed.
    checks += 1;
    if (!m.cTimeline.timelineFound) failures.push('parity-checks:cTimeline: no [data-part="timeline"] found');
    else {
      checks += 1;
      if (m.cTimeline.visibleDots > 4) failures.push(`parity-checks:cTimeline: ${m.cTimeline.visibleDots} markers rendered at once, exceeds the 4-marker collapse bound`);
      checks += 1;
      if (!m.cTimeline.moreChipFound) failures.push('parity-checks:cTimeline: 6-entry fixture (> 4) collapsed with no "+N more" chip rendered');
      else {
        checks += 1;
        if (!m.cTimeline.moreChipIsLink) failures.push('parity-checks:cTimeline: "+N more" is not a real link (moreMarkersHref was not threaded through)');
        checks += 1;
        if (!/^\+\d+ more$/.test(m.cTimeline.moreChipText || '')) failures.push(`parity-checks:cTimeline: "+N more" chip text is "${m.cTimeline.moreChipText}", expected "+<N> more"`);
      }
    }
  } finally {
    await page.close();
  }

  return { checks, failures };
}
