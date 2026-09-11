// SITE-WIDE LAYOUT GUARD - the red-then-green proof. Lane layoutguard, 2026-09-08.
//
// PORTABLE: node builtins + relative .mjs only, so run-test-suite.sh's no-npm-ci job runs it (see
// that script's header) and the npmtest glob picks it up. No browser: the detectors are pure, and
// this file feeds them the measurement bundles collect.mjs produces so the judgement is proven
// without a chromium, exactly the split assertions.test.mjs and ux-assert.test.mjs already use.
//
// CLAUDE.md rule 15, "a guard is proven by attack, not by presence". Every rule below is given a
// bundle that MUST fail it and a bundle that MUST pass it. L2 in particular gets the operator's own
// defect shape - a full-width static content card with a static rail card sitting on top of it,
// which is what he found on /admin on 2026-09-08 - and the test requires the detector to catch it,
// because an overlap test whose exclusions have grown until nothing overlaps is worse than none.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  checkL1, checkL2, checkL3, checkL4, checkL5, checkL6, checkL7, checkL8, checkL9, checkL10,
  isL9DesktopExempt,
  checkL12, normaliseCardTitle, RULE_IDS, RULE_PROVENANCE,
} from './rules.mjs';
import {
  FRAME_SPEC, POSITION_ALLOWLIST, SCROLLER_ALLOWLIST, ANTON_ALLOWLIST, ABSENCE_ANYWHERE,
  ABSENCE_WHOLE_RUN_ONLY, NOT_A_CARD, L9_LONG_AXIS_MIN, L9_SHORT_AXIS_MIN,
} from './allowlists.mjs';
import { activeDeviations } from './manifests.mjs';
import { generateManifests } from './generate-manifests.mjs';
import { applyBaseline, findingKey, BASELINE_EXPIRY_DATE, isExpired } from './baseline.mjs';
import { ROUTES, LAYOUT_WIDTHS } from './routes.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const base = (over = {}) => ({ route: '/test', artboard: 'p1', width: 1440, doc: { scrollWidth: 1440, clientWidth: 1440 }, ...over });

// ── L1 ────────────────────────────────────────────────────────────────────────────────────────
const goodFrame = {
  found: true, name: 'div.frame', gridTemplateColumns: '780px 300px', trackCount: 2, tracks: [780, 300],
  columnGap: 28, alignItems: 'start', padding: '20px 40px 40px', contentTrackHasWidth: null,
  ancestorGrids: [], nestedRailGrids: [],
};

test('L1 passes the frame the artboard draws', () => {
  assert.deepEqual(checkL1(base({ frame: goodFrame })), []);
});

test('L1 catches the admin defect: a width set on the content column', () => {
  const f = { ...goodFrame, contentTrackHasWidth: { name: 'div.admin-col', property: 'width', value: '768px' } };
  const hits = checkL1(base({ frame: f }));
  assert.equal(hits.length, 1);
  assert.match(hits[0].measured, /width: 768px/);
});

test('L1 catches a route wrapping content in its own container, and a nested rail grid', () => {
  const f = {
    ...goodFrame,
    ancestorGrids: [{ name: 'div.wrapper', gridTemplateColumns: '1fr 1fr' }],
    nestedRailGrids: [{ name: 'div.inner', gridTemplateColumns: '440px 300px' }],
  };
  const hits = checkL1(base({ frame: f }));
  assert.equal(hits.length, 2);
  assert.ok(hits.some((h) => /own container/.test(h.message)));
  assert.ok(hits.some((h) => /from below/.test(h.message)));
});

test('L1 catches the detail frame\'s 24px gap and missing padding', () => {
  const f = { ...goodFrame, columnGap: 24, padding: '0px 0px 0px' };
  const hits = checkL1(base({ frame: f }));
  assert.equal(hits.length, 2);
  assert.ok(hits.some((h) => /column-gap 24px, expected 28px/.test(h.measured)));
});

test('L1 expects the STACKED form below 1280, which is README §0.3 and not an invented rule', () => {
  const stacked = { ...goodFrame, trackCount: 1, tracks: [944], gridTemplateColumns: '944px' };
  assert.deepEqual(checkL1(base({ width: 1024, frame: stacked })), []);
  const notStacked = checkL1(base({ width: 1024, frame: goodFrame }));
  assert.equal(notStacked.length, 1);
  assert.match(notStacked[0].message, /the rail stacks under the content/);
});

test('L1 reads the artboard\'s own padding, so p14/p15\'s 18px top is not reported as broken', () => {
  const f = { ...goodFrame, padding: '18px 40px 40px' };
  assert.deepEqual(checkL1(base({ artboard: 'p14', frame: f })), []);
  assert.equal(checkL1(base({ artboard: 'p1', frame: f })).length, 1);
});

// ── L2, and the exclusion set proven not to swallow a real overlap ─────────────────────────────
const card = (id, name, x, y, width, height, over = {}) => ({ id, name, x, y, width, height, excused: false, contains: [], ...over });

test('L2 catches the operator\'s own /admin defect: a rail card sitting on a full-width content card', () => {
  const m = base({
    boxes: [
      card(0, 'section[Source Tiers]', 40, 200, 1108, 320),
      card(1, 'aside[Issues queue]', 848, 220, 300, 260),
    ],
  });
  const hits = checkL2(m);
  assert.equal(hits.length, 1, 'the real overlap must be caught');
  assert.match(hits[0].measured, /overlap 300×260px/);
});

test('L2 excludes parent/child pairs (E1)', () => {
  const m = base({
    boxes: [card(0, 'section', 40, 200, 800, 300, { contains: [1] }), card(1, 'button', 60, 220, 100, 44, { contains: [0] })],
  });
  assert.deepEqual(checkL2(m), []);
});

test('L2 excludes the four things that legitimately stack, and ONLY because they are on the L5 list (E2)', () => {
  const stacking = base({
    boxes: [card(0, 'section[rows]', 40, 200, 800, 600), card(1, 'nav[sticky nav card]', 0, 0, 252, 900, { excused: true })],
  });
  assert.deepEqual(checkL2(stacking), []);
  // The SAME geometry with the nav NOT excused is a finding: nothing is excused for its shape.
  const notOnTheList = base({
    boxes: [card(0, 'section[rows]', 40, 200, 800, 600), card(1, 'div[a page-local sticky]', 0, 0, 252, 900)],
  });
  assert.equal(checkL2(notOnTheList).length, 1);
});

test('L2 tolerates a border-width intersection but not a 5px one (E3)', () => {
  const touching = base({ boxes: [card(0, 'a', 0, 0, 100, 100), card(1, 'b', 97, 97, 100, 100)] });
  assert.deepEqual(checkL2(touching), []);
  const real = base({ boxes: [card(0, 'a', 0, 0, 100, 100), card(1, 'b', 94, 94, 100, 100)] });
  assert.equal(checkL2(real).length, 1);
});

// ── L3 ────────────────────────────────────────────────────────────────────────────────────────
test('L3 catches page overflow and a card wider than its column, and permits the table card', () => {
  const m = base({
    doc: { scrollWidth: 1600, clientWidth: 1440 },
    cards: [
      { name: 'section[T1-T8]', scrollWidth: 1200, clientWidth: 1108, width: 1108, columnClientWidth: 780, isTableCard: false },
      { name: 'section[matrix]', scrollWidth: 1600, clientWidth: 780, width: 780, columnClientWidth: 780, isTableCard: true },
    ],
  });
  const hits = checkL3(m);
  assert.equal(hits.length, 3);
  assert.ok(hits.some((h) => /scrollWidth 1600px vs clientWidth 1440px/.test(h.measured)));
  assert.ok(hits.some((h) => /card width 1108px vs column clientWidth 780px/.test(h.measured)));
  assert.ok(!hits.some((h) => h.element === 'section[matrix]' && /only the table-card/.test(h.message)),
    'the table-card pattern is the one permitted horizontal scroller');
});

// ── L4 ────────────────────────────────────────────────────────────────────────────────────────
test('L4 catches an unreachable horizontal scroller and an arrow carousel, and permits a keyboard-reachable table card', () => {
  const m = base({
    scrollers: [
      { name: 'div[Source Tiers]', scrollWidth: 1495, clientWidth: 1108, allowed: false },
      { name: 'div[matrix]', scrollWidth: 1600, clientWidth: 780, allowed: true, requiresKeyboardReach: true, keyboardReachable: true, tabIndex: '0', focusableCount: 12 },
      { name: 'div[strip]', scrollWidth: 1600, clientWidth: 780, allowed: true, requiresKeyboardReach: true, keyboardReachable: false, tabIndex: null, focusableCount: 0 },
    ],
    carousels: [{ name: 'button[→]', label: '→' }],
  });
  const hits = checkL4(m);
  assert.equal(hits.length, 3);
  assert.ok(hits.some((h) => /horizontal swipe/.test(h.message)));
  assert.ok(hits.some((h) => /reachable by keyboard/.test(h.message)));
  assert.ok(hits.some((h) => /arrow-button carousels/.test(h.message)));
});

// ── L5 ────────────────────────────────────────────────────────────────────────────────────────
test('L5 excuses only the allowlist and contained decoration; a text run or an escaping box fails', () => {
  const m = base({
    positioned: [
      { name: 'nav[sticky]', position: 'sticky', allowed: true, contained: false, ownText: true },
      { name: 'span[band spine]', position: 'absolute', allowed: false, contained: true, ownText: false },
      { name: 'div[rail card]', position: 'absolute', allowed: false, contained: false, ownText: false },
      { name: 'div[a fixed banner]', position: 'fixed', allowed: false, contained: true, ownText: true },
      { name: 'span[a contained label]', position: 'absolute', allowed: false, contained: true, ownText: true },
    ],
  });
  const hits = checkL5(m);
  assert.equal(hits.length, 3);
  assert.ok(hits.every((h) => h.element !== 'nav[sticky]' && h.element !== 'span[band spine]'));
});

// ── L6 ────────────────────────────────────────────────────────────────────────────────────────
const goodCard = { name: 'section[DUE NEXT]', hasRule: true, ruleHeight: 3, ruleBackground: 'linear-gradient(90deg, rgb(90, 85, 82), ...)', ruleIsBand: false, ruleIsGrey: true, borderWidth: 1, borderRadius: 10, hasShadow: true };

test('L6 passes a complete card and names every missing part of an incomplete one', () => {
  assert.deepEqual(checkL6(base({ cards: [goodCard] })), []);
  const hits = checkL6(base({ cards: [{ ...goodCard, hasRule: false, ruleHeight: null, hasShadow: false, borderRadius: 6 }] }));
  assert.equal(hits.length, 1);
  assert.match(hits[0].measured, /3px top rule \(measured none\)/);
  assert.match(hits[0].measured, /radius 10 \(measured 6px\)/);
  assert.match(hits[0].measured, /shadow \(measured none\)/);
});

test('L6 accepts a band-coloured rule on a band block and rejects an arbitrary one', () => {
  assert.deepEqual(checkL6(base({ cards: [{ ...goodCard, ruleIsGrey: false, ruleIsBand: true }] })), []);
  const hits = checkL6(base({ cards: [{ ...goodCard, ruleIsGrey: false, ruleIsBand: false, ruleBackground: 'rgb(0, 128, 255)' }] }));
  assert.equal(hits.length, 1);
  assert.match(hits[0].message, /neither the band colour .* nor the grey gradient/);
});

// ── L7 ────────────────────────────────────────────────────────────────────────────────────────
test('L7 fails Anton anywhere the operator did not name', () => {
  const m = base({ anton: [{ name: 'h1[title]', text: 'PLATFORM ADMIN', allowed: true }, { name: 'p[body]', text: 'A SENTENCE', allowed: false }] });
  const hits = checkL7(m);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].element, 'p[body]');
});

// ── L8 ────────────────────────────────────────────────────────────────────────────────────────
test('L8 fails an absence token outside the absence component and passes it inside', () => {
  const m = base({
    absence: [
      { name: 'td[cell]', text: 'NOT IN PRIMARY SOURCE', inAbsenceComponent: false },
      { name: 'span.cl-absence', text: 'NOT IN PRIMARY SOURCE', inAbsenceComponent: true },
      { name: 'td[cell]', text: 'UNSCORED', inAbsenceComponent: false },
    ],
  });
  const hits = checkL8(m);
  assert.equal(hits.length, 2);
});

test('L8 does not fire on ordinary prose containing the word "pending", and still fires on a bare PENDING cell', () => {
  const prose = base({ absence: [{ name: 'span', text: '489 PENDING · SHOWING 4 · APPROVED', inAbsenceComponent: false }] });
  assert.deepEqual(checkL8(prose), []);
  const token = base({ absence: [{ name: 'td', text: 'PENDING', inAbsenceComponent: false }] });
  assert.equal(checkL8(token).length, 1);
});

// ── L9 ────────────────────────────────────────────────────────────────────────────────────────
test('L9 holds the operator\'s floor (44 long, 28 short) and catches overlapping neighbours', () => {
  const t = (id, name, x, y, width, height) => ({ id, name, x, y, width, height, contains: [] });
  assert.deepEqual(checkL9(base({ targets: [t(0, 'button[Ask]', 0, 0, 58, 40)] })), []);
  const small = checkL9(base({ targets: [t(0, 'a[Watchlist →]', 0, 0, 90.4, 24)] }));
  assert.equal(small.length, 1);
  assert.match(small[0].measured, /short 24 < 28/);
  const overlapping = checkL9(base({ targets: [t(0, 'button[Approve]', 700, 995, 89, 44), t(1, 'button[Refresh]', 700, 1021, 84, 44)] }));
  assert.ok(overlapping.some((h) => /adjacent targets overlap/.test(h.measured)));
});

// FOLD 62 (2026-09-08): L9's one dated, component-scoped desktop exemption, attacked from every
// side that matters. It exists because lane railfacets' 24px desktop facet row (operator item C1,
// artboard 02's own measure) and lane layoutguard's site-wide 28px short-axis floor first met in
// one tree at this fold and produced 100 findings on ONE component. Both guards now read the same
// entry, so it cannot expire in one and live in the other.
test('L9\'s desktop exemption covers exactly the one named target, at desktop width, while dated', () => {
  const t = (id, name, x, y, width, height) => ({ id, name, x, y, width, height, contains: [] });
  const facet = t(0, 'input.cl-facet-check[]', 0, 0, 266, 24);

  // FACETFIX (2026-09-11), task 0.1: `checkL9` always reads the LIVE `latestTrainWave()` (it has no
  // injectable override - only `isL9DesktopExempt` below does), so this first assertion is pinned to
  // REAL repo history, not a fixed point in time. It used to read `[]` (the synthetic 266x24 box
  // covered) while the repo's landed wave was still under the entry's expiryWave:70. That was the
  // exact CI-divergence mechanism task 0.1 investigated (a depth-1 pull_request checkout has no
  // origin/master ref and resolves latestWave to null - "unknown", treated as still-active - while a
  // depth-1 push checkout's origin/master IS the one pushed commit, whose own subject line names the
  // real wave): see .github/workflows/discipline.yml's checkout step and docs/ops/session-log.md's
  // FACETFIX entry. This tree has now landed wave71 (commit 5e891abd), past the expiry, so the
  // exemption is correctly, permanently retired for this synthetic box too - proving the SAME
  // wave-oracle mechanism the real /regulations mount now relies on (the test below) to have stopped
  // masking the undersized target rather than to have started masking it. The wave-pinned assertions
  // two lines down (isL9DesktopExempt at explicit waves 70/69) are what still prove the exemption
  // mechanism itself works; this one now proves it has expired for real.
  assert.equal(checkL9(base({ width: 1440, targets: [facet] })).length, 1);

  // NOT covered at 390: below the entry's 768 floor the 44px touch target has to hold, and does.
  assert.equal(checkL9(base({ width: 390, targets: [facet] })).length, 1);

  // NOT covered: any other undersized control at the same width stays red.
  assert.equal(checkL9(base({ width: 1440, targets: [t(0, 'a[Watchlist →]', 0, 0, 90.4, 24)] })).length, 1);

  // NOT covered: a target whose name merely BEGINS like the exempt one is not the exempt one.
  assert.equal(checkL9(base({ width: 1440, targets: [t(0, 'input.cl-facet-checkbox-other[]', 0, 0, 266, 24)] })).length, 1);

  // NOT covered past the entry's expiry wave: the finding returns with no edit to this file.
  assert.equal(isL9DesktopExempt('input.cl-facet-check[]', 1440, 70), false);
  assert.equal(isL9DesktopExempt('input.cl-facet-check[]', 1440, 69), true);

  // NOT covered when the wave is UNKNOWN (coordinator review, 2026-09-11, task 0.1 follow-up,
  // [CONFIRMED by the reviewer]): a null latestWave used to degrade to "still active" (fail open),
  // which is the exact mechanism that let a depth-1 pull_request checkout - unable to resolve
  // origin/master, so latestTrainWave() returns null - keep suppressing this finding while a depth-1
  // push checkout, resolving a real and expired wave on the SAME tree, correctly reported it.
  // fetch-depth: 0 made null unreachable on the two CI events this task observed, but the predicate
  // itself stayed fail-open; this asserts the predicate now fails CLOSED on its own, independent of
  // which checkout depth happens to be in front of it.
  assert.equal(isL9DesktopExempt('input.cl-facet-check[]', 1440, null), false);

  // The overlap half of L9 is never suppressed, for any target.
  const stacked = checkL9(base({ width: 1440, targets: [t(0, 'input.cl-facet-check[]', 0, 0, 266, 24), t(1, 'input.cl-facet-check[]', 0, 10, 266, 24)] }));
  assert.ok(stacked.some((h) => /adjacent targets overlap/.test(h.measured)));
});

// FACETFIX (2026-09-11): the pure-bundle test above proves the DETECTOR against a hand-built box;
// this proves the actual PRODUCT tree, real chromium, real /regulations mount - the same measurement
// run-rendering-guard.mjs takes in CI. It is the one test in this otherwise browser-free file that
// needs a real chromium, so it self-skips (diagnosably, not silently) when playwright is not
// resolvable, the same posture rule 15's execution-wiring gate requires of a no-cred verifier - a
// lane without the browser dependency gets a skip, never a crash and never a false green.
//
// CORRECTED (coordinator review, 2026-09-11, task 0.1 follow-up round 3): this file is now wired
// into the "Discipline engine unit tests" job via run-test-suite.sh's own
// `rendering/layout-guard/*.test.mjs` glob, not the rendering-guard job - that job never runs
// `node --test` against any file, only `run-rendering-guard.mjs` directly (the exact gap this round
// closes; see the header note below and docs/ops/session-log.md's FACETFIX entry). The
// discipline-unit-tests job runs with NO `npm ci` step at all (checkout + setup-node, then straight
// to `bash run-test-suite.sh`), so THIS test self-skips there every time - it runs for real only in
// an environment where `npm install`/`npm ci` already put playwright in node_modules (a local run,
// or after the "App unit tests requiring npm deps" step elsewhere installs it for other reasons).
// That is the correct, honest state: the detector logic it exercises (checkL9, isL9DesktopExempt)
// is unit-proven with no browser by the pure-bundle test above and by
// exemptions-law2-desktop.test.mjs, both of which DO run in the no-npm-ci job; this one test is the
// supplementary real-DOM confirmation, same posture as the rendering-guard job's own relationship to
// assertions.test.mjs (see that job's header comment in discipline.yml).
test('L9: facet checkboxes meet the hit-target floor at 1440', async (t) => {
  try {
    createRequire(import.meta.url).resolve('playwright');
  } catch {
    t.skip('playwright is not installed in this lane (e.g. the no-npm-ci discipline-unit-tests job) - the pure-bundle L9 test above and exemptions-law2-desktop.test.mjs cover the detector logic without a browser; this test is the supplementary real-chromium confirmation and runs for real wherever playwright is already installed');
    return;
  }
  const { runLayoutGuardFor } = await import('./run-layout-guard.mjs');
  const findings = await runLayoutGuardFor({ route: '/regulations', width: 1440 });
  const facet = findings.filter((f) => f.rule === 'L9' && f.element.includes('cl-facet-check'));
  assert.deepEqual(facet, [], `facet checkbox findings: ${JSON.stringify(facet)}`);
});

// ── L10 ───────────────────────────────────────────────────────────────────────────────────────
const manifest = { artboard: 'p11', cards: ['Vol IV · No. 36 · Sunday 6 September 2026', 'Watched · 1', 'Recalculation notices'], rail: ['Filters', 'Legend'] };

test('L10 fails a card the artboard does not draw and passes the ones it does', () => {
  const clean = base({ route: '/watchlist', cardTitles: ['Vol IV · No. 37 · Tuesday 8 September 2026', 'Watched · 6', 'Recalculation notices', 'Filters', 'Legend'] });
  assert.deepEqual(checkL10(clean, manifest, []).filter((f) => f.element.startsWith('card "')), []);
  const extra = base({ route: '/watchlist', cardTitles: ['Watched · 6', 'A card nobody drew'] });
  const hits = checkL10(extra, manifest, []);
  assert.ok(hits.some((h) => h.element === 'card "A CARD NOBODY DREW"'));
});

test('L10 card identity survives live counts and dates, which is the whole reason it truncates', () => {
  assert.equal(normaliseCardTitle('Watched · 1'), normaliseCardTitle('Watched · 6'));
  assert.equal(normaliseCardTitle('Vol IV · No. 36 · Sunday 6 September 2026'), normaliseCardTitle('Vol IV · No. 37 · Tuesday 8 September 2026 · Personal'));
  assert.notEqual(normaliseCardTitle('Coverage gaps'), normaliseCardTitle('Coverage'));
});

test('L10 accepts a dated deviation for one card, and only for that card', () => {
  const m = base({ route: '/watchlist', cardTitles: ['A card nobody drew', 'A second card nobody drew'] });
  const hits = checkL10(m, manifest, [{ route: '/watchlist', card: 'A card nobody drew', reason: 'ruled', dated: '2026-09-08', expiryWave: 99 }]);
  const outside = hits.filter((h) => h.element.startsWith('card "'));
  assert.equal(outside.length, 1);
  assert.equal(outside[0].element, 'card "A SECOND CARD NOBODY DREW"');
});

test('L10 fails a route with no manifest rather than passing it silently', () => {
  const hits = checkL10(base({ route: '/nowhere', cardTitles: [] }), null, []);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].measured, 'no manifest');
});

test('a deviation expires the way F25 dates its own entries', () => {
  const entries = [{ route: '/x', card: 'c', reason: 'r', dated: '2026-09-08', expiryWave: 62 }];
  assert.equal(activeDeviations(entries, 61).length, 1, 'still in force before the wave lands');
  assert.equal(activeDeviations(entries, 62).length, 0, 'expired the moment the wave lands');
  assert.equal(activeDeviations(entries, 63).length, 0);
  // A row READ FROM the deviation log carries no wave of its own and is never given one.
  assert.equal(activeDeviations([{ route: '/x', card: 'c', reason: 'r', expiryWave: null }], 99).length, 1);
});

// ── L12 ───────────────────────────────────────────────────────────────────────────────────────
test('L12 catches an intersecting hint and a cut placeholder, and passes a declared ellipsis', () => {
  const clean = base({ commandBar: { found: true, input: { x: 0, y: 0, width: 283, height: 40 }, hint: { x: 300, y: 8, width: 30, height: 20 }, button: { x: 340, y: 0, width: 58, height: 40 }, placeholderWidth: 461, inputClientWidth: 283, textOverflow: 'ellipsis' } });
  assert.deepEqual(checkL12(clean), []);
  const cut = base({ commandBar: { ...clean.commandBar.found ? clean.commandBar : {}, textOverflow: 'clip' } });
  assert.equal(checkL12(cut).length, 1);
  const intersecting = base({ commandBar: { found: true, input: { x: 0, y: 0, width: 320, height: 40 }, hint: { x: 300, y: 8, width: 30, height: 20 }, button: null, placeholderWidth: 100, inputClientWidth: 320, textOverflow: 'ellipsis' } });
  const hits = checkL12(intersecting);
  assert.equal(hits.length, 1);
  assert.match(hits[0].measured, /boxes intersect/);
});

// ── The allowlists are data, and the data is complete ──────────────────────────────────────────
test('every allowlist entry carries a reason and a source - an exception with neither is a hole', () => {
  for (const list of [POSITION_ALLOWLIST, SCROLLER_ALLOWLIST, ANTON_ALLOWLIST]) {
    for (const e of list) {
      assert.ok(e.id, 'every entry has an id');
      assert.ok(e.match, `${e.id}: every entry has a selector`);
      assert.ok(e.reason && e.reason.length > 20, `${e.id}: every entry states WHY, at length`);
      assert.ok(e.source && e.source.length > 10, `${e.id}: every entry names who ruled it`);
    }
  }
});

// UPDATED (coordinator review, 2026-09-11, task 0.1 follow-up round 2). This test was failing on
// origin/master already - [CONFIRMED] via `gh api repos/Dwarves77/dotfiles/actions/jobs/103383655386
// /logs` (the "Discipline engine unit tests" job on master run 34634686151, commit 5e891abd): zero
// occurrences of "layout-guard.test.mjs" anywhere in that job's log, and no `.github/workflows/*.yml`
// job or `run-test-suite.sh` glob names `.discipline/rendering/layout-guard/*.test.mjs` (the suite
// globs `rendering/*.test.mjs`, `rendering/audit/*.test.mjs` and `rendering/smoke/*.test.mjs`, none
// of which reach the `layout-guard/` subdirectory). This is a PRE-EXISTING rule-15 orphaned proof,
// not created by this task: `layout-guard-expiry.test.mjs`'s own header already documented the exact
// same gap on 2026-09-09 ("[CONFIRMED 2026-09-09: the suite ran 6025 tests, 0 fail, while `node --test
// .discipline/rendering/layout-guard/layout-guard.test.mjs` on the SAME tree... reports two
// failures]"), reported to the coordinator rather than fixed because the two red tests read
// `allowlists.mjs`, another lane's write set at the time. The three entries these assertions were
// missing are now confirmed legitimate, dated, reasoned exemptions (FOLD 64, 2026-09-09, lane
// opsmatrix3's artboard-8 matrix; read `allowlists.mjs` directly rather than assumed) - the fix here
// is to the test's stale expected set, not to the allowlist.
test('the Anton allowlist is exactly the operator\'s six, plus the three declared extensions', () => {
  const ids = ANTON_ALLOWLIST.map((e) => e.id);
  for (const required of ['page-title', 'card-title', 'band-tile-numeral', 'stat-block-numeral', 'headline-figure', 'timeline-callout']) {
    assert.ok(ids.includes(required), `missing the operator's "${required}"`);
  }
  const extra = ids.filter((id) => !['page-title', 'card-title', 'band-tile-numeral', 'stat-block-numeral', 'headline-figure', 'timeline-callout'].includes(id));
  assert.deepEqual(
    extra.sort(),
    ['matrix-cell-score', 'matrix-fact-figure', 'nav-wordmark'].sort(),
    'any addition beyond his six is declared here, so it cannot be added quietly'
  );
});

test('the L5 allowlist covers exactly the four things the operator named, plus the three declared extensions', () => {
  const ids = POSITION_ALLOWLIST.map((e) => e.id);
  assert.deepEqual(ids.slice(0, 4), ['nav-card-sticky', 'detail-section-index-sticky', 'command-bar-hint', 'overlays']);
  assert.deepEqual(ids.slice(4).sort(), ['map-markers', 'mobile-top-bar', 'table-card-sticky-first-column']);
});

test('the operator\'s absence vocabulary is complete, and only PENDING is narrowed', () => {
  for (const token of ['NOT IN PRIMARY SOURCE', 'UNSCORED', 'NOT SCORED']) {
    assert.ok(ABSENCE_ANYWHERE.test(`a cell reading ${token} in the middle of a sentence`), `${token} is matched anywhere`);
  }
  assert.ok(ABSENCE_WHOLE_RUN_ONLY.test('PENDING'));
  assert.ok(!ABSENCE_WHOLE_RUN_ONLY.test('4 INPUTS PENDING'));
});

test('the band tile and the stat tile are excluded from L6/L10 because the README gives them their own anatomy', () => {
  assert.match(NOT_A_CARD, /cl-band-tile/);
  assert.match(NOT_A_CARD, /stat-tile/);
});

test('the floors are the operator\'s own numbers', () => {
  assert.equal(L9_LONG_AXIS_MIN, 44);
  assert.equal(L9_SHORT_AXIS_MIN, 28);
  assert.equal(FRAME_SPEC.railPx, 300);
  assert.equal(FRAME_SPEC.gapPx, 28);
  assert.equal(FRAME_SPEC.stackedBelow, 1280);
});

// ── Coverage: 17 routes, 12 rules, two widths, every mount registered ──────────────────────────
test('all 17 artboards are covered by a route, at both widths the operator named', () => {
  const artboards = new Set(ROUTES.map((r) => r.artboard));
  assert.equal(artboards.size, 17, `expected 17 artboards, have ${[...artboards].join(',')}`);
  assert.deepEqual(LAYOUT_WIDTHS, [1440, 1024]);
});

test('every route names a mount that mounts.mjs defines', () => {
  const mounts = readFileSync(join(HERE, '../audit/mounts.mjs'), 'utf8');
  for (const r of ROUTES) {
    assert.ok(new RegExp(`['"]${r.mount.replace(/[-/]/g, '\\$&')}['"]\\s*:\\s*\\{`).test(mounts), `${r.route}: mount "${r.mount}" is not registered`);
  }
});

test('every one of the twelve rules has a stated provenance', () => {
  assert.equal(RULE_IDS.length, 12);
  for (const id of RULE_IDS) {
    assert.ok(RULE_PROVENANCE[id], `${id} has no provenance`);
    assert.match(RULE_PROVENANCE[id], /new|extended|already covered/);
  }
});

test('the manifests are generated from the ARTBOARDS, and say so in the file', () => {
  const path = join(HERE, 'manifests.json');
  assert.ok(existsSync(path), 'manifests.json is missing - run generate-manifests.mjs');
  const m = JSON.parse(readFileSync(path, 'utf8'));
  assert.match(m.generatedFrom, /Caros Ledge UI System\.dc\.html$/);
  for (const r of ROUTES) {
    assert.ok(m.manifests[r.route], `${r.route} has no manifest`);
    assert.equal(m.manifests[r.route].artboard, r.artboard);
  }
});

test('the guard is wired into the rendering guard, so no train can land with a failure', () => {
  const runner = readFileSync(join(HERE, '../run-rendering-guard.mjs'), 'utf8');
  assert.match(runner, /runLayoutGuard/, 'run-rendering-guard.mjs does not call the layout guard');
  const code = runner.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.match(code, /layout-guard\/run-layout-guard\.mjs/);
});

test('a failure line names the rule, the route, the element and the numbers', async () => {
  const { formatFinding } = await import('./run-layout-guard.mjs');
  const line = formatFinding({ rule: 'L3', route: '/admin', width: 1024, element: 'section[Source Tiers]', measured: 'card width 1108px vs column clientWidth 780px (+328px)', message: 'a card is wider than the frame column it lives in' });
  assert.match(line, /L3/);
  assert.match(line, /\/admin@1024/);
  assert.match(line, /section\[Source Tiers\]/);
  assert.match(line, /1108px/);
});

test('the checked-in manifests still match the artboards they were generated from', () => {
  const onDisk = JSON.parse(readFileSync(join(HERE, 'manifests.json'), 'utf8')).manifests;
  const derived = generateManifests(join(HERE, '../../../..'));
  for (const r of ROUTES) {
    assert.deepEqual(
      onDisk[r.route].cards,
      derived[r.route].cards,
      `${r.route}: the checked-in manifest has drifted from artboard ${r.artboard} - rerun generate-manifests.mjs`,
    );
  }
});

test('the baseline gates NEW findings and expires on the DATE the operator named, not on a wave', () => {
  const known = { rule: 'L6', route: '/admin', width: 1440, element: 'section[x]', measured: '…', message: '…' };
  const fresh = { rule: 'L6', route: '/admin', width: 1440, element: 'section[a card added today]', measured: '…', message: '…' };
  // A hand-made baseline set, so this proves the SPLIT rather than today's baseline.json contents.
  const split = (date) => applyBaseline([known, fresh], { date });
  const before = split('2026-10-14');
  assert.ok(before.blocking.some((f) => f.element === 'section[a card added today]'),
    'a finding that is not in the baseline must fail the build, which is what "no train lands with a failure" means');
  assert.equal(before.expired, false, 'the day before the expiry the baseline still covers its own entries');
  // ATTACK, the other direction: fake the clock past the date and every baselined finding blocks.
  const after = split(BASELINE_EXPIRY_DATE);
  assert.equal(after.baselined.length, 0, 'on the expiry date the baseline excuses nothing');
  assert.equal(after.blocking.length, 2);
  assert.equal(after.expired, true);
  assert.equal(split('2026-12-01').expired, true, 'and it stays dead after the date');
});

test('the expiry is a DATE and the wave oracle is gone, so landing as wave 65 does not expire it', () => {
  assert.equal(BASELINE_EXPIRY_DATE, '2026-10-15', 'operator ruling 2026-09-09');
  const src = readFileSync(join(HERE, 'baseline.mjs'), 'utf8');
  assert.ok(!/EXPIRY_WAVE|latestTrainWave/.test(src),
    'the wave threshold must be REMOVED, not raised: this train lands as wave 65 and any wave rule would expire the baseline the moment it lands');
  assert.equal(isExpired('2026-10-14'), false);
  assert.equal(isExpired('2026-10-15'), true);
});

test('the baseline file is a snapshot of real findings, keyed the way the runner keys them', () => {
  const path = join(HERE, 'baseline.json');
  assert.ok(existsSync(path), 'baseline.json is missing - run run-layout-guard.mjs --write-baseline');
  const b = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(b.expiryDate, BASELINE_EXPIRY_DATE, 'the file and the module must name the same expiry date');
  assert.equal(b.keys.length, b.count);
  for (const k of b.keys.slice(0, 20)) {
    const [rule, route, width] = k.split('|');
    assert.ok(RULE_IDS.includes(rule), `baseline key names an unknown rule: ${k}`);
    assert.ok(ROUTES.some((r) => r.route === route), `baseline key names an unknown route: ${k}`);
    assert.ok(LAYOUT_WIDTHS.includes(Number(width)), `baseline key names an unmeasured width: ${k}`);
  }
  assert.equal(findingKey({ rule: 'L6', route: '/admin', width: 1440, element: 'x' }), 'L6|/admin|1440|x');
});
