// rendering-guard UX detectors (2026-09-03, coordinator, operator directive "mobile version has compacted
// words on every page or words going off page"). GOVERNING text: docs/design/ux-laws.md (law 2 target
// size, laws 4/12 no overflow, the one-word-per-line wrap class) and invariant RD-60. This module is the
// PURE detector core, npm-free, consumed by BOTH run-rendering-guard.mjs (fixture legs and every
// real-component smoke spec, at every viewport) and ux-assert.test.mjs (the red-then-green proof).
// One detector core, two callers, same posture as assertions.mjs.
//
// Root cause of the 2026-09-03 screenshots [CONFIRMED in MarketIntelLedger.tsx ~L900]: an inline-styled
// flex row with a non-shrinking aside (`flexShrink: 0`, `minWidth: 120`, nowrap figure + "Full analysis"
// link + toggle, ~330 px) beside a `flex: 1; minWidth: 0` title. At 375 px the title got ~40 px and every
// word wrapped onto its own line. No detector measured a title's width against its card, so nothing
// fired. `detectSqueezedTitles` is that detector; `detectSmallTargets` is law 2's floor.

/** Law-2 floor: an interactive target is at least 44 CSS px on its shorter axis ... */
export const TARGET_MIN_PX = 44;
/** ... or at least 24 px with TARGET_CLEARANCE_PX of clear space from every other target. */
export const TARGET_SMALL_MIN_PX = 24;
export const TARGET_CLEARANCE_PX = 8;
/** A wrapped title narrower than this fraction of its container is squeezed (one-word-per-line class). */
export const TITLE_MIN_RATIO = 0.6;

/** The elements the browser collector treats as interactive targets. NOT exported (lane DEAD-EXEC,
 *  2026-09-04): used only within this file (the collector call below); the "test agree on one list"
 *  framing was stale — no external importer named it, per the wiring audit's Appendix B (dead exports,
 *  2026-09-04). */
const TARGET_SELECTOR =
  'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"]';

/** Shortest-axis size of a box. */
function shortAxis(b) {
  return Math.min(Number(b.width), Number(b.height));
}

/** Gap between two axis-aligned boxes (0 when they touch or overlap). */
export function boxGap(a, b) {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height));
  return Math.max(dx, dy);
}

/**
 * Targets below the law-2 floor. Input: [{ name, x, y, width, height }] for every VISIBLE interactive
 * element (the collector drops zero-size and hidden ones). A box passes when its shorter axis is
 * ≥ TARGET_MIN_PX, or ≥ TARGET_SMALL_MIN_PX with ≥ TARGET_CLEARANCE_PX from every other target.
 * Returns the failing boxes annotated with `shortAxis` and `nearest` (px to the closest other target,
 * null when alone). Pure.
 */
export function detectSmallTargets(boxes) {
  if (!Array.isArray(boxes)) return [];
  const out = [];
  for (let i = 0; i < boxes.length; i += 1) {
    const b = boxes[i];
    if (!b) continue;
    const s = shortAxis(b);
    if (s >= TARGET_MIN_PX) continue;
    let nearest = null;
    for (let j = 0; j < boxes.length; j += 1) {
      if (j === i || !boxes[j]) continue;
      const g = boxGap(b, boxes[j]);
      if (nearest === null || g < nearest) nearest = g;
    }
    const clear = nearest === null || nearest >= TARGET_CLEARANCE_PX;
    if (s >= TARGET_SMALL_MIN_PX && clear) continue;
    out.push({ ...b, shortAxis: s, nearest });
  }
  return out;
}

/**
 * Titles that wrapped because they were squeezed, not because they were long. Input:
 * [{ name, width, containerWidth, lines }] where `lines` is the rendered line count (height /
 * line-height, rounded) and `containerWidth` the clientWidth of the nearest [data-guard-container]
 * (or the offset parent). A title on ONE line is never squeezed (short text is fine). A title on two or
 * more lines whose box is narrower than TITLE_MIN_RATIO × container is the defect class. Pure.
 */
export function detectSqueezedTitles(titles, ratio = TITLE_MIN_RATIO) {
  if (!Array.isArray(titles)) return [];
  return titles
    .filter((t) => t && Number(t.lines) >= 2 && Number(t.containerWidth) > 0)
    .filter((t) => Number(t.width) < ratio * Number(t.containerWidth))
    .map((t) => ({ ...t, ratio: Number((Number(t.width) / Number(t.containerWidth)).toFixed(2)) }));
}

/**
 * TITLES THAT BREAK INSIDE A WORD (RD-82, lane MASTHEAD-AUTH, 2026-09-24). The operator's
 * screenshot of /login: the shared Masthead's "SIGN IN" rendered one letter per line. Measured
 * [CONFIRMED, 2026-09-24, real chromium, the guard's own compose-login mount]: at a 1440 viewport the
 * title's content box was 0.0px wide against a longest word ("SIGN") of 51.3px, because Masthead's
 * viewport-keyed `min-width: 1440px` grid reserved a 420px command-bar track in a 330px auth-panel
 * row that renders no command bar; `word-break: break-word` then broke every word at every letter.
 * `detectSqueezedTitles` above could not see it: it reads only `[data-guard-title]` in the UX
 * smoke slot, and a title that breaks inside every word is short, so its ratio test never ran on
 * the auth frame at all.
 *
 * The rule is geometric and needs no ratio: a heading or title whose CONTENT box is narrower than
 * the rendered width of its longest unbreakable word must break that word. Input:
 * [{ name, contentWidth, longestWordWidth, word, containerWidth }] from the collector below
 * (`TITLE_WORDS_SRC`), where `longestWordWidth` is measured in the element's OWN computed font (so a
 * fallback face measures as a fallback, which is why the RD-82 loaded-faces precondition runs
 * before it). Pure.
 *
 * ONE carve-out, and why it is not a hole [CONFIRMED on the first full guard run]: a word WIDER
 * THAN THE TITLE'S WHOLE CONTAINER (the extreme-data fixtures' 100-character unbroken tokens, 632 to
 * 778px, in cards of at most 375px) cannot fit anywhere the layout could put it, so breaking it is
 * the designed last resort (`word-break: break-word`), not a squeezed box. The defect is a word that
 * WOULD fit its container and was denied the room: "SIGN" (51.3px) in a 380px masthead card whose
 * title track had collapsed to 0px. `containerWidth` absent (an older caller) means no carve-out.
 */
export function detectWordBrokenTitles(titles, tolerance = 0.5) {
  if (!Array.isArray(titles)) return [];
  return titles.filter(
    (t) =>
      t &&
      Number.isFinite(Number(t.contentWidth)) &&
      Number(t.longestWordWidth) > Number(t.contentWidth) + tolerance &&
      !(Number(t.containerWidth) > 0 && Number(t.longestWordWidth) > Number(t.containerWidth)),
  );
}

/** Every element the word-break rule measures: every heading, and every marked title. */
export const TITLE_WORDS_SELECTOR = 'h1, h2, h3, h4, h5, h6, [data-guard-title]';

// The in-page half of detectWordBrokenTitles, as SOURCE (the rendered-text.mjs pattern: it runs
// inside `page.evaluate`, which cannot close over a module import, so the string travels as an
// argument and both probes, measureUx below and layout-guard/collect.mjs, rebuild the ONE copy).
//
// PER TEXT NODE, IN ITS OWN FONT: a heading can hold a child span in another face, so each word is
// measured by a hidden, nowrap probe span appended to the text node's own parent, which therefore
// inherits that parent's exact computed font, letter-spacing and text-transform (an uppercase
// title is measured uppercase). Break opportunities the browser has without breaking a word are
// honoured: whitespace, and after a hyphen or dash. The content box is the element's clientWidth
// less its horizontal padding; an inline title takes its first non-inline ancestor's box, since an
// inline box has no width of its own to break against.
export const TITLE_WORDS_SRC = `function titleWords(selector) {
  const out = [];
  const shown = (el) => {
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    // EITHER axis, never both: the /login defect's own title measured 0.0px wide and 176.3px
    // tall (six lines of one letter each). A "width and height" visibility test calls that box
    // invisible and skips exactly the title this rule exists for [CONFIRMED, first run of L13].
    return r.width > 0 || r.height > 0;
  };
  const contentWidthOf = (el) => {
    let box = el;
    while (box && box !== document.body) {
      const d = getComputedStyle(box).display;
      if (d !== 'inline' && d !== 'contents') break;
      box = box.parentElement;
    }
    if (!box) return null;
    const s = getComputedStyle(box);
    return box.clientWidth - (parseFloat(s.paddingLeft) || 0) - (parseFloat(s.paddingRight) || 0);
  };
  const label = (el) => el.tagName.toLowerCase() + '[' + ((el.textContent || '').trim().slice(0, 24) || el.className || '') + ']';
  for (const el of document.querySelectorAll(selector)) {
    if (out.length >= 300) break;
    if (!(el.textContent || '').trim() || !shown(el)) continue;
    const contentWidth = contentWidthOf(el);
    if (contentWidth === null) continue;
    let longestWordWidth = 0;
    let word = '';
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const owner = n.parentElement;
      if (!owner || owner.tagName === 'STYLE' || owner.tagName === 'SCRIPT') continue;
      const pieces = (n.nodeValue || '')
        .split(/[\\s\\u200B]+/)
        .flatMap((w) => w.split(/(?<=[-\\u2010\\u2011\\u2013\\u2014])/))
        .filter(Boolean);
      if (!pieces.length) continue;
      const probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;left:0;top:0;padding:0;border:0;margin:0';
      owner.appendChild(probe);
      for (const p of pieces) {
        probe.textContent = p;
        const w = probe.getBoundingClientRect().width;
        if (w > longestWordWidth) { longestWordWidth = w; word = p; }
      }
      probe.remove();
    }
    // The title's container, by the SAME rule measureUx's squeezed-title check uses (its own table
    // cell, else the nearest declared guard container, else the offset parent): the space the
    // title's layout had to give it.
    const container = el.closest('td,th') || el.closest('[data-guard-container]') || el.offsetParent || document.body;
    out.push({ name: label(el), contentWidth, longestWordWidth, word, containerWidth: container.clientWidth });
  }
  return out;
}`;

/**
 * Elements whose box runs past the viewport's right edge with no scrolling ancestor to carry them
 * (2026-09-03, second phone report: the regional matrix table and a detail-page breadcrumb were CLIPPED
 * at the right edge; scrollWidth never moved because an `overflow: hidden` ancestor swallowed the
 * overflow, so the existing detector stayed green while words ran off the page). Input:
 * [{ name, right, viewportWidth, scrollable, inClipViewport }] where `scrollable` is true only when a
 * DECLARED strip ancestor (`data-guard-strip` + overflow-x auto/scroll) carries the element, and
 * `inClipViewport` true only when a DECLARED clipping viewport ancestor (`data-guard-clip` + an
 * overflow that actually clips, and itself inside the viewport) carries it. See measureUx below for
 * why a slippy map's tile grid is the one thing that legitimately declares itself that way. Pure.
 */
export function detectClippedOverflow(boxes, tolerance = 2) {
  if (!Array.isArray(boxes)) return [];
  return boxes.filter(
    (b) => b && !b.scrollable && !b.inClipViewport && Number(b.right) > Number(b.viewportWidth) + tolerance,
  );
}

/**
 * TEXT CLIPPED WITHOUT AN ELLIPSIS (opsclip, train 61, defects 2 and 6). The class the operator
 * found on production himself, on five surfaces at once: the dashboard and /watchlist column
 * header shipped as "IMPACT LOW → H"; /research row meta as "Last-mile electrifica"; the
 * /operations and /regulations section index as "S6 Operational requirem" and a bare "S7"; the
 * /regulations UPCOMING OBLIGATIONS fifth card cut mid-word. Every one of them is a text run
 * whose own box hides its overflow with `text-overflow: clip`, a character is lost and the
 * reader is given no sign that anything is missing.
 *
 * The rule: a text run may overflow its own box only when it says so, i.e. `text-overflow:
 * ellipsis` (or a `-webkit-line-clamp`, which draws its own ellipsis). Otherwise it must fit,
 * wrap, or scroll inside a DECLARED strip.
 *
 * A COLUMN HEADER (`mustFit`) is held to a stricter rule: it must fit outright, ellipsis or not.
 * Its text is fixed, short and known at build time, so there is no reader-supplied string that
 * could ever justify truncating it, and an ellipsis is exactly how defect 2 hid itself, shipping
 * "IMPACT LOW → HIGH" as "IMPACT LOW → H" while every truncation detector stayed green because the
 * truncation was declared.
 *
 * Input: [{ name, overflowX, overflowY, textOverflow, clamped, inStrip, mustFit }] from
 * `measureUx`. `overflowX`/`overflowY` are scrollWidth-clientWidth / scrollHeight-clientHeight
 * in px. Pure.
 */
export function detectClippedText(runs, tolerance = 1) {
  if (!Array.isArray(runs)) return [];
  return runs.filter(
    (r) =>
      r &&
      !r.clamped &&
      !r.inStrip &&
      (r.mustFit === true || r.textOverflow !== 'ellipsis') &&
      (Number(r.overflowX) > tolerance || Number(r.overflowY) > tolerance),
  );
}

/**
 * Human-readable failure strings for one measured page (empty = clean). `targets`, `titles` and
 * `clipped` are the collector outputs; `label` prefixes each line for the caller's summary. Pure.
 */
export function assertUxClean(label, { targets = [], titles = [], clipped = [], textRuns = [], titleWords = [] } = {}) {
  const failures = [];
  const broken = detectWordBrokenTitles(titleWords);
  if (broken.length > 0) {
    const detail = broken
      .slice(0, 6)
      .map((t) => `${t.name} content ${Math.round(t.contentWidth)}px < "${t.word}" ${Math.round(t.longestWordWidth)}px`)
      .join(', ');
    failures.push(`${label}: ${broken.length} heading/title(s) narrower than their longest word, so they break inside a word (RD-82): ${detail}`);
  }
  const off = detectClippedOverflow(clipped);
  if (off.length > 0) {
    const detail = off.slice(0, 6).map((b) => `${b.name} right=${Math.round(b.right)}px > ${Math.round(b.viewportWidth)}px`).join(', ');
    failures.push(`${label}: ${off.length} element(s) clipped past the viewport's right edge with no scrolling ancestor — ${detail}`);
  }
  const small = detectSmallTargets(targets);
  if (small.length > 0) {
    const detail = small
      .slice(0, 8)
      .map((t) => `${t.name} ${Math.round(t.width)}×${Math.round(t.height)}px${t.nearest !== null && t.nearest < TARGET_CLEARANCE_PX ? ` (${Math.round(t.nearest)}px from a neighbour)` : ''}`)
      .join(', ');
    failures.push(
      `${label}: ${small.length} interactive target(s) below the law-2 floor (≥${TARGET_MIN_PX}px, or ≥${TARGET_SMALL_MIN_PX}px with ${TARGET_CLEARANCE_PX}px clearance) — ${detail}${small.length > 8 ? ', …' : ''}`,
    );
  }
  const clippedText = detectClippedText(textRuns);
  if (clippedText.length > 0) {
    const detail = clippedText
      .slice(0, 8)
      .map((r) => `${r.name} +${Math.round(Math.max(r.overflowX, r.overflowY))}px`)
      .join(', ');
    failures.push(
      `${label}: ${clippedText.length} text run(s) clipped with no ellipsis, ${detail}${clippedText.length > 8 ? ', …' : ''}`,
    );
  }
  const squeezed = detectSqueezedTitles(titles);
  if (squeezed.length > 0) {
    const detail = squeezed
      .slice(0, 6)
      .map((t) => `${t.name} ${Math.round(t.width)}/${Math.round(t.containerWidth)}px (${t.lines} lines)`)
      .join(', ');
    failures.push(`${label}: ${squeezed.length} title(s) squeezed to <${TITLE_MIN_RATIO * 100}% of their card and wrapping — ${detail}`);
  }
  return failures;
}

/**
 * Browser-side collector. Runs inside a Playwright page and returns `{ targets, titles }` in the shapes
 * the detectors above take. Not pure (DOM), but npm-free: the caller passes the page in.
 * Titles are the elements marked `data-guard-title` (row components carry the attribute on the title
 * element; a lane adding a row adds the attribute) — the container is the nearest
 * `[data-guard-container]`, falling back to the offset parent.
 */
export async function measureUx(page) {
  return page.evaluate(
    ({ selector, titleWordsSrc, titleWordsSelector }) => {
      // eslint-disable-next-line no-new-func
      const titleWordsOf = new Function(`return (${titleWordsSrc})`)();
      const visible = (el) => {
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const nameOf = (el) =>
        `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}[${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24) || el.className || ''}]`;
      const targets = [];
      for (const el of document.querySelectorAll(selector)) {
        if (!visible(el)) continue;
        // A checkbox/radio wrapped in a <label> is activated anywhere in that label (native semantics),
        // so the label IS the hit target, not the glyph — measure the label's box, not the input's, when
        // one wraps it. Lets a page draw a small glyph (artboard-accurate) inside a full 44px label row.
        const wrappingLabel =
          (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) ? el.closest('label') : null;
        const r = (wrappingLabel || el).getBoundingClientRect();
        targets.push({ name: nameOf(el), x: r.x, y: r.y, width: r.width, height: r.height });
      }
      // Clipped overflow: every element whose right edge passes the viewport, unless an ancestor scrolls
      // horizontally on purpose (a strip). Fixed-position chrome is excluded.
      const clipped = [];
      const vw = window.innerWidth;
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.right <= vw + 2) continue;
        const cs = getComputedStyle(el);
        if (cs.position === 'fixed' || cs.visibility === 'hidden') continue;
        // Only a DECLARED strip (data-guard-strip on the scrolling ancestor: tab bars, chip rows, the
        // upcoming-obligations tile strip) may carry content past the edge. A data table or a matrix
        // that merely sets overflow-x: auto is NOT exempt: on a phone that is sideways panning to read
        // the page, the operator's "words going off page" (2026-09-03, second round; the region matrix
        // passed the first detector because its wrapper scrolled). Reflow it instead.
        let scrollable = false;
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          if (p.hasAttribute('data-guard-strip')) {
            const ox = getComputedStyle(p).overflowX;
            if (ox === 'auto' || ox === 'scroll') { scrollable = true; break; }
          }
        }
        // A DECLARED CLIPPING VIEWPORT (`data-guard-clip`) carries its descendants, the same way a
        // declared strip does (lane mapclip, 2026-09-08, train 61 PR #610's one CI-only red).
        // WHY A MAP TILE IS NOT A TEXT RUN: a slippy map lays a tile grid deliberately wider than its
        // own frame and clips it with that frame's overflow, so getBoundingClientRect reports a tile's
        // UNCLIPPED rect and a tile at the frame's right edge can report a right edge past the viewport
        // while nothing the reader is meant to read is cut off. A tile is rendering substrate, drawn
        // to be panned over, not a run of words that must be readable where it sits. That is the whole
        // width of this exemption: it never excuses a text run, a control or a table, which are still
        // failures anywhere, INCLUDING inside a declared clipping viewport's own box if they overflow
        // the page. Two conditions keep it from becoming a way to hide any overflow: the element must
        // ACTUALLY clip (an `overflow` of hidden/clip, not merely the attribute), and it must ITSELF
        // sit inside the viewport. A declaring element whose own right edge runs past the edge carries
        // nothing and is reported here like any other box.
        let inClipViewport = false;
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          if (!p.hasAttribute('data-guard-clip')) continue;
          const pcs = getComputedStyle(p);
          const clips = (o) => o === 'hidden' || o === 'clip';
          if (!clips(pcs.overflowX) && !clips(pcs.overflow)) continue;
          if (p.getBoundingClientRect().right > vw + 2) continue;
          inClipViewport = true;
          break;
        }
        clipped.push({ name: nameOf(el), right: r.right, viewportWidth: vw, scrollable, inClipViewport });
        if (clipped.length >= 40) break;
      }
      const titles = [];
      for (const el of document.querySelectorAll('[data-guard-title]')) {
        if (!visible(el)) continue;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3 || 16;
        // A title inside a TABLE CELL is budgeted by its own column, not by the card the table
        // sits in (lane opsclip, train 61). Measuring a 6-column matrix's dimension name against
        // the whole card reports every long name as "squeezed to 12% of its card" whether the
        // table is laid out well or badly, which is noise; measuring it against its own cell says
        // the true thing, whether the name fits the column it was given.
        const container =
          el.closest('td,th') || el.closest('[data-guard-container]') || el.offsetParent || document.body;
        titles.push({
          name: nameOf(el),
          width: r.width,
          containerWidth: container.clientWidth,
          lines: Math.max(1, Math.round(r.height / lh)),
        });
      }
      // Text runs (opsclip, defects 2 and 6): every element that IS a run of text, it has visible
      // text and every element child of its own is inline, measured against its own box. A card or
      // a column whose children are blocks is not a text run and is not swept here; that case is
      // what `clipped` above and `detectOverflows` already cover.
      const textRuns = [];
      for (const el of document.querySelectorAll('body *')) {
        if (textRuns.length >= 60) break;
        const text = (el.textContent || '').trim();
        if (!text || !visible(el)) continue;
        const cs = getComputedStyle(el);
        if (cs.overflowX !== 'hidden' && cs.overflowY !== 'hidden') continue;
        let inlineOnly = true;
        for (const child of el.children) {
          const d = getComputedStyle(child).display;
          if (d !== 'inline' && d !== 'inline-block' && d !== 'inline-flex' && d !== 'contents') { inlineOnly = false; break; }
        }
        if (!inlineOnly) continue;
        const clamped = cs.webkitLineClamp !== undefined && cs.webkitLineClamp !== 'none' && cs.webkitLineClamp !== '';
        let inStrip = false;
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          if (p.hasAttribute('data-guard-strip')) { inStrip = true; break; }
          const ox = getComputedStyle(p).overflowX;
          if (ox === 'auto' || ox === 'scroll') { inStrip = true; break; }
        }
        textRuns.push({
          name: nameOf(el),
          overflowX: el.scrollWidth - el.clientWidth,
          overflowY: el.scrollHeight - el.clientHeight,
          textOverflow: cs.textOverflow,
          clamped,
          inStrip,
          mustFit: !!el.closest('.cl-list-row-header'),
        });
      }
      return { targets, titles, clipped, textRuns, titleWords: titleWordsOf(titleWordsSelector) };
    },
    { selector: TARGET_SELECTOR, titleWordsSrc: TITLE_WORDS_SRC, titleWordsSelector: TITLE_WORDS_SELECTOR },
  );
}
