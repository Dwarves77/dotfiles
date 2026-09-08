// SITE-WIDE LAYOUT GUARD - L1..L12 as PURE detectors. Lane layoutguard, 2026-09-08.
//
// One function per rule, each taking the measurement bundle `collect.mjs` produces in the browser
// and returning findings. Pure and npm-free, exactly the posture assertions.mjs and ux-assert.mjs
// already hold, so the same detectors are proven by `layout-guard.test.mjs` (node --test, no
// browser) and run by `run-layout-guard.mjs` (real chromium) and the two cannot disagree.
//
// PROVENANCE, stated per rule in each function's header and summarised here so a reader of the
// report can check it:
//   ALREADY COVERED  L3 (audit/overflow-sweep.mjs + ux-assert detectClippedOverflow), L11
//                    (ux-assert detectClippedText).
//   EXTENDED         L2 (assertions.mjs detectBoundsViolations did row/cell containment only -
//                    extended here to every pair of layout boxes on the page, with the exclusion
//                    set L2 needs), L9 (ux-assert detectSmallTargets is the law-2 mobile floor;
//                    the operator's L9 is a different, site-wide floor and reuses boxGap).
//   NEW              L1, L4, L5, L6, L7, L8, L10, L12.
//
// A FINDING NEVER SAYS ONLY "FAILED". Every finding carries `rule`, `route`, `width`, `element`
// (what was measured) and `measured` (the numbers), because the operator's closing instruction was
// exactly that: "a guard that says only 'failed' costs more than it saves".

import { boxGap } from '../ux-assert.mjs';
import { LAW2_DESKTOP_EXEMPTIONS, activeLaw2Exemptions } from '../exemptions-law2-desktop.mjs';
import { latestTrainWave } from '../../fitness/functions/F25-module-liveness.mjs';
import {
  FRAME_SPEC,
  POSITION_ALLOWLIST,
  ANTON_ALLOWLIST,
  ABSENCE_ANYWHERE,
  ABSENCE_WHOLE_RUN_ONLY,
  L9_LONG_AXIS_MIN,
  L9_SHORT_AXIS_MIN,
  OVERLAP_TOLERANCE_PX,
} from './allowlists.mjs';

const px = (v) => Math.round(Number(v) * 10) / 10;

function finding(rule, m, element, measured, message) {
  return { rule, route: m.route, width: m.width, element, measured, message };
}

/**
 * L1 ONE FRAME.
 *
 * THE TEST, AND WHY THIS ONE (the operator's text needed a decision here). His words: "Fail if any
 * route wraps content in its own container, sets its own grid, or sets a width on the content
 * column." A SOURCE GREP for `grid-template-columns` cannot answer that: a page can satisfy the
 * grep and still defeat the frame with a nested wrapper that re-grids inside the content column, or
 * with a `max-width` two levels down. So this is a COMPUTED-STYLE check on the rendered tree:
 *
 *   1. the route's top-level content element (the first grid inside <main>) is measured with
 *      getComputedStyle and compared to the ARTBOARD's own frame values (FRAME_SPEC, read from the
 *      dc.html, not from the app's source - comparing the build to the build proves nothing);
 *   2. no element BETWEEN <main> and that frame may set a grid of its own (that is the "wraps
 *      content in its own container" case, and it is invisible to a grep of the page file because
 *      the wrapper is usually a shared shell);
 *   3. no DESCENDANT of the content column may set a two-track grid with a fixed second track (the
 *      nested-wrapper case: a page that re-grids inside the column has taken the rail's job);
 *   4. the content column carries no width/max-width of its own (`contentTrackHasWidth`).
 *
 * At a width below FRAME_SPEC.stackedBelow (1280) the expectation switches to the STACKED form
 * README §0.3 states verbatim ("Below 1280 the rail stacks under the content"): one track, still no
 * width on the content column. That is the handoff's own rule, so enforcing it at 1024 invents
 * nothing - ruling R10 (2026-09-07, no invented responsive behaviour) is not touched.
 */
export function checkL1(m) {
  const out = [];
  const f = m.frame;
  if (!f || !f.found) {
    out.push(finding('L1', m, 'page frame', 'no grid container found inside <main>', 'the route renders no frame grid at all'));
    return out;
  }
  const stacked = m.width < FRAME_SPEC.stackedBelow;
  const wantPadding = FRAME_SPEC.paddingByArtboard[m.artboard] ?? null;

  if (stacked) {
    if (f.trackCount !== 1) {
      out.push(finding('L1', m, f.name, `grid-template-columns: ${f.gridTemplateColumns} (${f.trackCount} tracks)`,
        `below ${FRAME_SPEC.stackedBelow}px the rail stacks under the content (README §0.3), so the frame must resolve to ONE track`));
    }
  } else {
    if (f.trackCount !== 2) {
      out.push(finding('L1', m, f.name, `grid-template-columns: ${f.gridTemplateColumns} (${f.trackCount} tracks)`,
        'the frame is content + rail, two tracks'));
    } else if (px(f.tracks[1]) !== FRAME_SPEC.railPx) {
      out.push(finding('L1', m, f.name, `rail track ${px(f.tracks[1])}px, expected ${FRAME_SPEC.railPx}px`,
        'the rail is 300px on every artboard'));
    }
    if (px(f.columnGap) !== FRAME_SPEC.gapPx) {
      out.push(finding('L1', m, f.name, `column-gap ${px(f.columnGap)}px, expected ${FRAME_SPEC.gapPx}px`, 'frame gap'));
    }
    if (f.alignItems !== FRAME_SPEC.alignItems) {
      out.push(finding('L1', m, f.name, `align-items ${f.alignItems}, expected ${FRAME_SPEC.alignItems}`,
        'align-items:start keeps a short rail card from stretching to the content column\'s height'));
    }
    if (wantPadding && f.padding !== wantPadding) {
      out.push(finding('L1', m, f.name, `padding ${f.padding}, expected ${wantPadding}`,
        `the artboard for this route (${m.artboard}) draws this padding verbatim`));
    }
  }
  if (f.contentTrackHasWidth) {
    out.push(finding('L1', m, f.contentTrackHasWidth.name, `${f.contentTrackHasWidth.property}: ${f.contentTrackHasWidth.value}`,
      'the content column takes its width from the frame track, never from itself'));
  }
  for (const w of f.ancestorGrids || []) {
    out.push(finding('L1', m, w.name, `grid-template-columns: ${w.gridTemplateColumns}`,
      'a container between <main> and the frame sets its own grid - the route is wrapping content in its own container'));
  }
  for (const n of f.nestedRailGrids || []) {
    out.push(finding('L1', m, n.name, `grid-template-columns: ${n.gridTemplateColumns}`,
      'a wrapper inside the content column sets its own content+rail grid, defeating the frame from below'));
  }
  return out;
}

/**
 * L2 NO OVERLAP.
 *
 * THE EXCLUSION SET, defined precisely and narrowly (the operator's text needed a decision here:
 * "must exclude parent/child pairs, and also siblings that legitimately stack"). A pair is excluded
 * when, and only when:
 *
 *   E1 one contains the other (`contains`), which is the parent/child case;
 *   E2 either box is EXCUSED - it is, or is carried by, an element the L5 allowlist names: the
 *      sticky nav card, the sticky detail section index, the command bar hint, an overlay. That is
 *      the whole of "siblings that legitimately stack": a sticky nav over scrolled content, an open
 *      menu over a row, a tooltip. Nothing else stacks legitimately, and an element that stacks
 *      WITHOUT being on that list is already an L5 failure, so it is never quietly excused here;
 *   E3 the boxes overlap by less than OVERLAP_TOLERANCE_PX on either axis (borders, 3px rules drawn
 *      with negative margins, sub-pixel rounding);
 *   E4 either box has no visible content (the collector never emits those).
 *
 * Everything else is a finding. Proven not to swallow a real overlap by `layout-guard.test.mjs`,
 * which feeds it the admin defect's own shape - a full-width static content card under a static
 * rail card - and requires it to fire.
 */
export function checkL2(m) {
  const out = [];
  const boxes = m.boxes || [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.contains?.includes(b.id) || b.contains?.includes(a.id)) continue; // E1
      if (a.excused || b.excused) continue; // E2
      const dx = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const dy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      if (dx <= OVERLAP_TOLERANCE_PX || dy <= OVERLAP_TOLERANCE_PX) continue; // E3
      out.push(finding('L2', m, `${a.name} × ${b.name}`,
        `overlap ${px(dx)}×${px(dy)}px (a at ${px(a.x)},${px(a.y)} ${px(a.width)}×${px(a.height)}; b at ${px(b.x)},${px(b.y)} ${px(b.width)}×${px(b.height)})`,
        'two elements with visible content intersect and neither contains the other'));
    }
  }
  return out;
}

/**
 * L3 NO HORIZONTAL OVERFLOW. ALREADY COVERED in part: audit/overflow-sweep.mjs measures
 * `documentElement.scrollWidth - clientWidth` per mount and ux-assert's `detectClippedOverflow`
 * catches an element clipped past the viewport's right edge. Neither measures the operator's second
 * clause - "Every card: scrollWidth <= clientWidth of its column" - which is the admin defect
 * exactly (a card wider than its column, clipped by the frame rather than scrolling the page). That
 * clause is what this adds; the page-level measurement is kept here too so one report carries both.
 */
export function checkL3(m) {
  const out = [];
  const over = Number(m.doc.scrollWidth) - Number(m.doc.clientWidth);
  if (over > 1) {
    out.push(finding('L3', m, 'document', `scrollWidth ${m.doc.scrollWidth}px vs clientWidth ${m.doc.clientWidth}px (+${px(over)}px)`,
      'document.scrollWidth must equal the viewport width'));
  }
  for (const c of m.cards || []) {
    const self = Number(c.scrollWidth) - Number(c.clientWidth);
    if (self > 1 && !c.isTableCard) {
      out.push(finding('L3', m, c.name, `card scrollWidth ${c.scrollWidth}px vs its own clientWidth ${c.clientWidth}px (+${px(self)}px)`,
        'only the table-card pattern may scroll horizontally'));
    }
    const past = Number(c.width) - Number(c.columnClientWidth);
    if (past > 1) {
      out.push(finding('L3', m, c.name, `card width ${px(c.width)}px vs column clientWidth ${px(c.columnClientWidth)}px (+${px(past)}px)`,
        'a card is wider than the frame column it lives in'));
    }
  }
  return out;
}

/**
 * L4 REACHABLE CONTENT. NEW. Every element with text is reachable by vertical page scroll or
 * keyboard Tab: so a horizontal scroller hides content unless it is the one permitted scroller (the
 * table-card inner scroller, whose columns must ALSO be reachable by keyboard), and an arrow-button
 * carousel is a failure wherever it appears - "Nothing in the product may require an arrow button to
 * scroll horizontally to reach it" (operator, /admin item 3).
 */
export function checkL4(m) {
  const out = [];
  for (const s of m.scrollers || []) {
    const hidden = Number(s.scrollWidth) - Number(s.clientWidth);
    if (hidden <= 4) continue;
    if (!s.allowed) {
      out.push(finding('L4', m, s.name, `${px(hidden)}px of content past the right edge of a horizontal scroller that is not a table card (scrollWidth ${s.scrollWidth}, clientWidth ${s.clientWidth})`,
        'content reachable only by horizontal swipe'));
      continue;
    }
    if (s.requiresKeyboardReach && !s.keyboardReachable) {
      out.push(finding('L4', m, s.name, `table-card scroller carrying ${px(hidden)}px of hidden content, tabindex=${JSON.stringify(s.tabIndex)}, focusable descendants ${s.focusableCount}`,
        'the table-card inner scroller is permitted, but its columns must also be reachable by keyboard'));
    }
  }
  for (const c of m.carousels || []) {
    out.push(finding('L4', m, c.name, `arrow control "${c.label}" beside a horizontal scroller`,
      'no arrow-button carousels: all primary content is reachable by page scroll or keyboard'));
  }
  return out;
}

/**
 * L5 NO ABSOLUTE OR FIXED POSITIONING ON CONTENT. NEW.
 *
 * THE SCOPE DECISION (his text needed one). Taken literally over every element, this rule fires on
 * the band spine of every list row, every impact-meter bar, every timeline dot and every
 * virtualized row - decoration and layout mechanics that cannot overlap anything because they are
 * contained. That is noise, and noise is how a guard gets switched off. So: `position: absolute` is
 * excused when the element is CONTAINED - it has a positioned ancestor in normal flow and its own
 * border box sits entirely inside that ancestor's box - because a contained decoration provably
 * cannot collide with anything outside it, which is the harm L5 exists to prevent. `fixed` and
 * `sticky` are NEVER excused that way: they leave the flow at page level and must be on the
 * allowlist. An absolutely positioned element that ESCAPES its container, or that carries a text
 * run of its own, is a finding.
 */
export function checkL5(m) {
  const out = [];
  for (const p of m.positioned || []) {
    if (p.allowed) continue;
    if (p.position === 'absolute' && p.contained && !p.ownText) continue;
    out.push(finding('L5', m, p.name, `position: ${p.position}${p.contained ? ' (contained)' : ' (escapes its container)'}${p.ownText ? ', carries text' : ''}`,
      'only the nav card, the detail section index, the command bar hint and overlays may leave the flow'));
  }
  return out;
}

/**
 * L6 CARD CHROME. NEW. "Every card gets its 3px top rule, 1px border, radius 10, shadow. Fail on a
 * card missing any of the four. Band blocks use the band colour; all others the grey gradient."
 *
 * A CARD IS DETECTED STRUCTURALLY, not by a marker attribute (see collect.mjs): radius 10 + a 1px
 * border + a shadow + the card background is the artboard's own definition of a card. A
 * marker-based test would report nothing on the cards nobody remembered to mark, which is a blind
 * spot exactly where the defect lives.
 */
export function checkL6(m) {
  const out = [];
  for (const c of m.cards || []) {
    const missing = [];
    if (!c.hasRule) missing.push(`3px top rule (measured ${c.ruleHeight === null ? 'none' : `${px(c.ruleHeight)}px`})`);
    if (px(c.borderWidth) !== 1) missing.push(`1px border (measured ${px(c.borderWidth)}px)`);
    if (px(c.borderRadius) !== 10) missing.push(`radius 10 (measured ${px(c.borderRadius)}px)`);
    if (!c.hasShadow) missing.push('shadow (measured none)');
    if (missing.length) {
      out.push(finding('L6', m, c.name, missing.join('; '), 'a card is missing part of its chrome'));
    } else if (c.hasRule && !c.ruleIsBand && !c.ruleIsGrey) {
      out.push(finding('L6', m, c.name, `top rule background ${c.ruleBackground}`,
        'a card rule is neither the band colour (band blocks) nor the grey gradient (all others)'));
    }
  }
  return out;
}

/** L7 DISPLAY TYPE ALLOWLIST. NEW. Anton on anything the operator did not name is a finding. */
export function checkL7(m) {
  const out = [];
  for (const a of m.anton || []) {
    if (a.allowed) continue;
    out.push(finding('L7', m, a.name, `font-family resolves to Anton on "${a.text}"`,
      `Anton only on: ${ANTON_ALLOWLIST.map((x) => x.id).join(', ')}`));
  }
  return out;
}

/**
 * L8 ABSENCE STRINGS. NEW, and it compares RENDERED text, not source text - the whole reason it is
 * worth writing. Lane MOBFIX-61 found on 2026-09-08 that nineteen audit forbids matching these same
 * words against `textContent` had matched NOTHING since they were written, because the product
 * writes them lower case and uppercases them with `text-transform` (Absence.tsx's
 * ABSENCE_TEXT_STYLE). The collector applies each text node's own computed transform before
 * matching (rendered-text.mjs, the one implementation run-audit.mjs also uses).
 */
export function checkL8(m) {
  const out = [];
  for (const a of m.absence || []) {
    if (a.inAbsenceComponent) continue;
    const whole = String(a.ownerText ?? a.text).trim().toUpperCase();
    if (!ABSENCE_ANYWHERE.test(a.text) && !ABSENCE_WHOLE_RUN_ONLY.test(whole)) continue;
    out.push(finding('L8', m, a.name, `rendered text "${a.text.slice(0, 70)}"`,
      'an absence string outside the meta-line absence component'));
  }
  return out;
}

/**
 * L9 HIT TARGETS. EXTENDED from ux-assert.mjs's `detectSmallTargets` (the law-2 mobile floor: >=44,
 * or >=24 with 8px clearance). The operator's L9 is a different and site-wide floor - ">= 44px in
 * one dimension and >= 28px in the other; adjacent targets do not overlap" - so it is a second
 * detector rather than a rewrite of the first: weakening law 2 to match this, or this to match law
 * 2, would drop a rule the product is already held to. `boxGap` is imported, not copied.
 */
/**
 * L9's ONE dated, component-scoped exemption, read from the SAME entries the rendering guard's
 * law-2 slot reads (`.discipline/rendering/exemptions-law2-desktop.mjs`, lane railfacets, operator
 * item C1). Added at FOLD 62, when railfacets' 24px desktop facet row and layoutguard's site-wide
 * L9 floor first met in one tree and produced 100 findings on one component.
 *
 * It is not a relaxation of L9, and the shape is deliberately the narrow one:
 *   - only the ONE named target, matched on the layout guard's own full name prefix;
 *   - only at or above the entry's `minViewport` (768). At 390 the same element takes its 44px
 *     min-height from globals.css and L9 still measures it, which is the width where a finger is
 *     the pointer;
 *   - only while the entry has not reached its expiry wave, against the same `latestTrainWave()`
 *     oracle F25, exemptions-375.mjs and the layout-guard baseline all read. Past wave 70 this
 *     covers nothing and the findings return.
 * A lane that wants another exception adds a row to that file, in a diff a reviewer reads.
 */
export function isL9DesktopExempt(name, width, latestWave = latestTrainWave()) {
  if (!name) return false;
  const active = activeLaw2Exemptions(LAW2_DESKTOP_EXEMPTIONS, latestWave);
  return active.some(
    (e) => e.layoutGuardTargetName && width >= e.minViewport && String(name).startsWith(e.layoutGuardTargetName)
  );
}

export function checkL9(m) {
  const out = [];
  const t = m.targets || [];
  for (let i = 0; i < t.length; i += 1) {
    const b = t[i];
    const long = Math.max(b.width, b.height);
    const short = Math.min(b.width, b.height);
    if ((long < L9_LONG_AXIS_MIN || short < L9_SHORT_AXIS_MIN) && !isL9DesktopExempt(b.name, m.width)) {
      out.push(finding('L9', m, b.name, `${px(b.width)}×${px(b.height)}px (long ${px(long)} < ${L9_LONG_AXIS_MIN} or short ${px(short)} < ${L9_SHORT_AXIS_MIN})`,
        'interactive target below the hit-target floor'));
    }
    for (let j = i + 1; j < t.length; j += 1) {
      const o = t[j];
      if (b.contains?.includes(o.id) || o.contains?.includes(b.id)) continue;
      const dx = Math.min(b.x + b.width, o.x + o.width) - Math.max(b.x, o.x);
      const dy = Math.min(b.y + b.height, o.y + o.height) - Math.max(b.y, o.y);
      if (dx > OVERLAP_TOLERANCE_PX && dy > OVERLAP_TOLERANCE_PX && boxGap(b, o) === 0) {
        out.push(finding('L9', m, `${b.name} × ${o.name}`, `adjacent targets overlap by ${px(dx)}×${px(dy)}px`,
          'adjacent interactive targets must not overlap'));
      }
    }
  }
  return out;
}

/**
 * L10 NOTHING OUTSIDE THE ARTBOARD. NEW. Every route has a manifest listing the cards it renders,
 * in order, GENERATED FROM THE ARTBOARDS (generate-manifests.mjs reads the dc.html), never from the
 * current build - a manifest generated from the build certifies today's mistakes.
 *
 * A card in the build and not in the manifest fails. The only escape is a dated deviation entry
 * (route, card, reason, expiry), and the expiry is enforced the way F25 enforces its own dates:
 * `activeDeviations()` in manifests.mjs reads the same `latestTrainWave()` oracle, so an entry
 * whose wave has landed stops excusing anything.
 *
 * The ORDER is checked as a subsequence rather than an equality: a card the manifest names and the
 * build has not built yet is reported separately (`missing`) rather than shifting every later card
 * into a false position finding.
 */
export function checkL10(m, manifest, activeDeviationsForRoute = []) {
  const out = [];
  if (!manifest) {
    out.push(finding('L10', m, m.route, 'no manifest', 'every route has a manifest listing the cards it renders, in order'));
    return out;
  }
  const excused = new Map(activeDeviationsForRoute.map((d) => [normaliseCardTitle(d.card), d]));
  // The manifest's CONTENT and RAIL lists are unioned for membership. The operator's L10 asks
  // which cards a route renders; which of the two columns a card sits in is L1's question, and
  // splitting them here would make every rail card on a route whose frame the guard could not
  // resolve into a false "outside the artboard" finding.
  const want = [...manifest.cards, ...(manifest.rail || [])].map(normaliseCardTitle);
  const got = (m.cardTitles || []).map(normaliseCardTitle);

  for (const g of got) {
    if (want.includes(g)) continue;
    const dev = excused.get(g);
    if (dev) continue;
    out.push(finding('L10', m, `card "${g}"`, `not in the manifest for ${m.route} (${manifest.artboard}); manifest holds ${want.length} cards`,
      'a card the artboard does not draw, with no dated deviation entry'));
  }
  const missing = want.filter((w) => !got.includes(w));
  if (missing.length) {
    out.push(finding('L10', m, m.route, `manifest cards not rendered: ${missing.join(', ')}`,
      'reported for completeness; a card the artboard draws that the build has not built is a build gap, not an "outside the artboard" failure'));
  }
  // Order, as a subsequence of the manifest.
  const present = got.filter((g) => want.includes(g));
  let k = -1;
  for (const g of present) {
    const at = want.indexOf(g);
    if (at < k) {
      out.push(finding('L10', m, `card "${g}"`, `rendered at position ${present.indexOf(g)}, artboard order puts it at ${at}`,
        'cards render in the artboard\'s order'));
      break;
    }
    k = at;
  }
  return out;
}

/**
 * CARD IDENTITY: the rendered title up to its first middot, uppercased, with punctuation and
 * digits removed.
 *
 * WHY THE TRUNCATION (measured, not assumed). Every card title in this product carries LIVE DATA
 * after a middot - "Watched · 1" in the artboard against "Watched · 6" in the fixture, "Vol IV ·
 * No. 36 · Sunday 6 September 2026" against today's issue number and date, "Due next · 5 items"
 * against whatever is due. Comparing the whole string would report every card on every route as
 * "not in the manifest" the day after the artboards were drawn, which is a guard that fails for
 * being right about nothing. The stable half is the name; the count is the data.
 */
export function normaliseCardTitle(s) {
  return String(s ?? '')
    .split(/[·•|]/)[0]
    .toUpperCase()
    .replace(/[^A-Z0-9&+ ]/g, ' ')
    .replace(/\b\d+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * L11 TEXT FITS. ALREADY COVERED by ux-assert.mjs's `detectClippedText` (lane opsclip, train 61):
 * a text run may overflow its own box only when it declares an ellipsis or a line clamp. This rule
 * therefore CALLS that detector rather than restating it, so the site-wide guard and the mobile UX
 * guard can never drift into two definitions of the same defect.
 */
export function checkL11(m, detectClippedText) {
  return detectClippedText(m.textRuns || []).map((r) =>
    finding('L11', m, r.name, `overflow ${px(r.overflowX)}×${px(r.overflowY)}px, text-overflow: ${r.textOverflow}`,
      'text clipped by overflow:hidden with no single-line ellipsis'));
}

/**
 * L12 COMMAND BAR. NEW. "The command bar placeholder never intersects the hint or Ask button."
 * Two measurements, because the boxes alone do not carry the defect: the input's flex box can sit
 * clear of the hint while the PLACEHOLDER STRING inside it is wider than the box, in which case the
 * reader sees the text run under the hint or cut off. So both the boxes and the rendered string
 * width are measured.
 */
export function checkL12(m) {
  const out = [];
  const cb = m.commandBar;
  if (!cb || !cb.found) return out;
  const pairs = [['hint', cb.hint], ['Ask button', cb.button]];
  for (const [label, box] of pairs) {
    if (!box) continue;
    const dx = Math.min(cb.input.x + cb.input.width, box.x + box.width) - Math.max(cb.input.x, box.x);
    const dy = Math.min(cb.input.y + cb.input.height, box.y + box.height) - Math.max(cb.input.y, box.y);
    if (dx > 0 && dy > 0) {
      out.push(finding('L12', m, `command bar input × ${label}`, `boxes intersect by ${px(dx)}×${px(dy)}px`,
        'the command bar placeholder never intersects the hint or Ask button'));
    }
  }
  // The placeholder longer than its own box is only a defect when the input does NOT declare an
  // ellipsis: the ARTBOARD itself draws the command bar's prompt with `white-space:nowrap;
  // overflow:hidden;text-overflow:ellipsis` (dc.html, every masthead), so a prompt too long for the
  // bar is DESIGNED to trail off - what the artboard never does is cut a character with no sign
  // that anything is missing, which is the same rule L11 holds every other text run to.
  if (Number(cb.placeholderWidth) > Number(cb.inputClientWidth) + 1 && cb.textOverflow !== 'ellipsis') {
    out.push(finding('L12', m, 'command bar placeholder', `placeholder text ${px(cb.placeholderWidth)}px in a ${px(cb.inputClientWidth)}px input, text-overflow: ${cb.textOverflow}`,
      'the placeholder is wider than its own box and the input declares no ellipsis, so it is cut mid-word'));
  }
  return out;
}

export const RULE_IDS = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10', 'L11', 'L12'];

/** Provenance, reported by the runner so the table always says which rules were new. */
export const RULE_PROVENANCE = {
  L1: 'new',
  L2: 'extended (assertions.mjs detectBoundsViolations: row/cell containment → every layout-box pair)',
  L3: 'already covered (audit/overflow-sweep.mjs, ux-assert detectClippedOverflow) + new card-vs-column clause',
  L4: 'new',
  L5: 'new',
  L6: 'new',
  L7: 'new',
  L8: 'new (rendered text, not source text)',
  L9: 'extended (ux-assert detectSmallTargets is the law-2 mobile floor; L9 is the site-wide floor, reusing boxGap)',
  L10: 'new',
  L11: 'already covered (ux-assert detectClippedText, lane opsclip) - called, not restated',
  L12: 'new',
};

/** Run every rule over one measurement bundle. */
export function checkAll(m, { manifest = null, deviations = [], detectClippedText }) {
  return [
    ...checkL1(m),
    ...checkL2(m),
    ...checkL3(m),
    ...checkL4(m),
    ...checkL5(m),
    ...checkL6(m),
    ...checkL7(m),
    ...checkL8(m),
    ...checkL9(m),
    ...checkL10(m, manifest, deviations),
    ...checkL11(m, detectClippedText),
    ...checkL12(m),
  ];
}
