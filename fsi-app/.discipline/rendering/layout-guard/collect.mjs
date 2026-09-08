// SITE-WIDE LAYOUT GUARD - the in-page collector. Lane layoutguard, 2026-09-08.
//
// Runs inside a Playwright page and returns ONE measurement bundle in the shapes rules.mjs's pure
// detectors take. Not pure (it reads the DOM), but npm-free and browser-only, the same split
// ux-assert.mjs already uses: measurement here, judgement there, so the node --test proof and the
// real-browser run apply the identical rules.
//
// A CARD IS DETECTED STRUCTURALLY. The artboard defines a card as `background:#fff; border:1px
// solid rgba(0,0,0,.12); border-radius:10px; box-shadow:…` (dc.html, every frame). So does this:
// radius 10 + a 1px border + a shadow. A marker-attribute test would be blind on exactly the cards
// nobody remembered to mark, which is where the defects are.

import { RENDERED_TEXT_SRC } from '../browser/rendered-text.mjs';
import { POSITION_ALLOWLIST, SCROLLER_ALLOWLIST, ANTON_ALLOWLIST, ABSENCE_HOST, NOT_A_CARD } from './allowlists.mjs';

const COLLECT = ({ renderedTextSrc, positionAllowlist, scrollerAllowlist, antonAllowlist, absenceHost, notACard }) => {
  // eslint-disable-next-line no-new-func
  const renderedText = new Function(`return (${renderedTextSrc})`)();

  const cs = (el) => getComputedStyle(el);
  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
  };
  const visible = (el) => {
    const s = cs(el);
    if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const nameOf = (el) => {
    const own = (el.getAttribute('aria-label') || '').trim();
    const txt = own || (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30);
    const cls = typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.') : '';
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : cls ? `.${cls}` : ''}[${txt}]`;
  };
  const matches = (el, sel) => { try { return el.matches(sel); } catch { return false; } };
  const closestMatch = (el, sel) => { try { return el.closest(sel); } catch { return null; } };

  const main = document.querySelector('main') || document.body;
  const all = Array.from(main.querySelectorAll('*'));

  // ── L1: the frame ─────────────────────────────────────────────────────────────────────────────
  const isGrid = (el) => { const s = cs(el); return s.display === 'grid' || s.display === 'inline-grid'; };
  const tracksOf = (el) => cs(el).gridTemplateColumns.split(/\s+/).filter(Boolean).map((t) => parseFloat(t));
  // THE ROUTE'S TOP-LEVEL CONTENT ELEMENT, found by walking the rendered tree rather than by
  // selecting a class - which is what makes a nested wrapper VISIBLE instead of assumed away, and
  // is why this is a computed-style test and not a source grep.
  //
  // Two passes, in this order (calibrated on the first full run, which is in the audit document):
  //   1. an unambiguous frame: two tracks whose second is exactly the 300px rail. Nothing else in
  //      this product has that shape.
  //   2. failing that (the stacked form below 1280, where the rail track is gone), the OUTERMOST
  //      grid under <main> that spans the page: width >= 90% of <main>'s own client width, and not
  //      itself inside another grid. Pass 2 without the width test picked a four-column 147px
  //      exposure grid on the detail routes and a 603px inner grid on /settings, and reported the
  //      frame as broken for values that belonged to a component. A frame spans the page.
  let frameEl = null;
  const ancestorGrids = [];
  for (const el of all) {
    if (!isGrid(el) || !visible(el)) continue;
    const t = tracksOf(el);
    if (t.length === 2 && Math.round(t[1]) === 300) { frameEl = el; break; }
  }
  if (!frameEl) {
    const mainWidth = main.clientWidth;
    for (const el of all) {
      if (!isGrid(el) || !visible(el)) continue;
      if (el.getBoundingClientRect().width < mainWidth * 0.9) continue;
      let nestedInGrid = false;
      for (let p = el.parentElement; p && p !== main && p !== document.body; p = p.parentElement) {
        if (isGrid(p)) { nestedInGrid = true; break; }
      }
      if (nestedInGrid) continue;
      frameEl = el;
      break;
    }
  }
  let frame = { found: false, name: null };
  if (frameEl) {
    const s = cs(frameEl);
    const t = tracksOf(frameEl);
    for (let p = frameEl.parentElement; p && p !== main && p !== document.body; p = p.parentElement) {
      if (isGrid(p)) ancestorGrids.push({ name: nameOf(p), gridTemplateColumns: cs(p).gridTemplateColumns });
    }
    // FOLD 62 (2026-09-08), a HARNESS defect found by running the guard over six lanes at once.
    //
    // `frameEl.children[0]` is not always the content column, and the property loop below it was
    // reading a USED value as if it were an authored one.
    //
    //   * `PageFrame` renders a `<style>` element as its first child, so on every route that
    //     adopted the shared frame `contentCol` WAS that style element: `display:none`, computed
    //     width "auto", and the check passed vacuously. Rule 15's own failure mode - a guard that
    //     is green because it is measuring nothing. /admin, which keeps its style block outside
    //     the frame, was the only route where a real box reached the loop, and it failed there.
    //   * getComputedStyle().width returns the USED width in px for every rendered box, always.
    //     So "width is not auto" cannot mean "this element sets its own width"; it means "this
    //     element is rendered". The one route that reached it therefore failed on a value every
    //     route has.
    //   * A child spanning all tracks (`grid-column: 1 / -1`, the /admin masthead) is not the
    //     content column at all; it is a full-width band inside the frame.
    //
    // So: skip non-rendered children and full-span bands, and test what the rule actually says -
    // the content column's box EQUALS the frame's content track, rather than being set from
    // inside. `maxWidth`/`minWidth`/`flexBasis` keep their authored-value test, which is sound for
    // those three (they are `none`/`auto`/`0px` unless someone sets them).
    let contentCol = null;
    for (const child of frameEl.children) {
      if (!visible(child)) continue;
      const gc = cs(child).gridColumnStart;
      if (gc === '1' && cs(child).gridColumnEnd === '-1') continue;
      contentCol = child;
      break;
    }
    let contentTrackHasWidth = null;
    if (contentCol) {
      const c = cs(contentCol);
      for (const prop of ['maxWidth', 'minWidth', 'flexBasis']) {
        const v = c[prop];
        if (v && v !== 'auto' && v !== 'none' && v !== '0px' && !v.endsWith('%')) {
          contentTrackHasWidth = { name: nameOf(contentCol), property: prop, value: v };
          break;
        }
      }
      if (!contentTrackHasWidth && t.length) {
        const boxW = contentCol.getBoundingClientRect().width;
        if (Math.abs(boxW - t[0]) > 1) {
          contentTrackHasWidth = {
            name: nameOf(contentCol),
            property: 'width',
            value: `${Math.round(boxW * 10) / 10}px against a ${Math.round(t[0] * 10) / 10}px content track`,
          };
        }
      }
    }
    // A wrapper INSIDE the content column that re-grids into content+fixed-rail defeats the frame
    // from below - the case a source grep cannot see.
    const nestedRailGrids = [];
    if (contentCol) {
      for (const el of contentCol.querySelectorAll('*')) {
        if (!isGrid(el) || !visible(el)) continue;
        const tt = tracksOf(el);
        if (tt.length === 2 && Math.round(tt[1]) === 300) {
          nestedRailGrids.push({ name: nameOf(el), gridTemplateColumns: cs(el).gridTemplateColumns });
        }
      }
    }
    frame = {
      found: true,
      name: nameOf(frameEl),
      gridTemplateColumns: s.gridTemplateColumns,
      trackCount: t.length,
      tracks: t,
      columnGap: parseFloat(s.columnGap) || 0,
      alignItems: s.alignItems,
      padding: `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom}`.replace(/(\d)px/g, '$1px'),
      contentTrackHasWidth,
      ancestorGrids,
      nestedRailGrids,
      contentColumnWidth: contentCol ? contentCol.clientWidth : null,
    };
  }

  // ── L5: positioning, computed once and reused as L2's exclusion set ───────────────────────────
  const allowFor = (el) => {
    for (const entry of positionAllowlist) {
      const hit = entry.viaAncestor ? closestMatch(el, entry.match) : (matches(el, entry.match) ? el : null);
      if (hit) return entry;
    }
    return null;
  };
  const positioned = [];
  const excusedEls = new Set();
  for (const el of all) {
    const s = cs(el);
    if (s.position === 'static' || s.position === 'relative') continue;
    if (!visible(el)) continue;
    const entry = allowFor(el);
    const allowed = Boolean(entry && entry.positions.includes(s.position));
    if (allowed) excusedEls.add(el);
    // Contained: a positioned ancestor in normal flow whose box holds this element's box entirely.
    let contained = false;
    const r = el.getBoundingClientRect();
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ps = cs(p);
      if (ps.position === 'static') continue;
      const pr = p.getBoundingClientRect();
      contained = r.left >= pr.left - 1 && r.right <= pr.right + 1 && r.top >= pr.top - 1 && r.bottom <= pr.bottom + 1;
      break;
    }
    const ownText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.nodeValue || '').trim().length > 0);
    positioned.push({ name: nameOf(el), position: s.position, allowed, allowId: entry ? entry.id : null, contained, ownText });
    if (allowed) for (const d of el.querySelectorAll('*')) excusedEls.add(d);
  }

  // ── L6 + L10: cards, detected structurally ───────────────────────────────────────────────────
  const isCard = (el) => {
    if (matches(el, notACard)) return false;
    const s = cs(el);
    const radius = parseFloat(s.borderTopLeftRadius) || 0;
    const border = parseFloat(s.borderTopWidth) || 0;
    if (Math.round(radius) !== 10) return false;
    if (border < 0.5 || border > 3.5) return false;
    if (s.boxShadow === 'none') return false;
    const w = el.getBoundingClientRect().width;
    return w >= 120;
  };
  const GREY_RULE = '90, 85, 82';
  const BAND_RGB = ['220, 38, 38', '249, 115, 22', '37, 99, 235', '22, 163, 74'];
  const cards = [];
  const cardTitles = [];
  for (const el of all) {
    if (!isCard(el) || !visible(el)) continue;
    // The nav card and rail cards are cards too, but L10's manifest is the CONTENT column's card
    // list; the collector records the column each card sits in so the runner can split them.
    const s = cs(el);
    const r = el.getBoundingClientRect();
    const column = el.parentElement ? el.parentElement.clientWidth : r.width;
    // The 3px top rule: a child at the card's top edge, 2.5-3.5px tall, spanning the card.
    let ruleHeight = null;
    let ruleBackground = null;
    for (const child of el.children) {
      const cr = child.getBoundingClientRect();
      if (cr.top - r.top > 3.5 || cr.height < 2 || cr.height > 4) continue;
      if (cr.width < r.width - 6) continue;
      ruleHeight = cr.height;
      // FOLD 62 (2026-09-08), a HARNESS defect: read the PAINTED element, not its wrapper. In
      // `SectionCard`'s padded layout the rule is carried by an absolutely positioned wrapper at
      // the card's top edge, so the child found here is a 3px box with a TRANSPARENT background
      // and the real gradient one level down. Reading the wrapper reported "top rule background
      // rgba(0, 0, 0, 0)" against a card whose rule is drawn correctly, which is a false L6. If
      // the child paints nothing itself, descend to the element that does.
      const paintOf = (n) => (cs(n).backgroundImage !== 'none' ? cs(n).backgroundImage : cs(n).backgroundColor);
      let painter = child;
      let paint = paintOf(child);
      if (paint === 'none' || paint === 'rgba(0, 0, 0, 0)' || paint === 'transparent') {
        for (const inner of child.querySelectorAll('*')) {
          const ip = paintOf(inner);
          if (ip !== 'none' && ip !== 'rgba(0, 0, 0, 0)' && ip !== 'transparent') { painter = inner; paint = ip; break; }
        }
      }
      ruleHeight = painter === child ? cr.height : painter.getBoundingClientRect().height;
      ruleBackground = paint;
      break;
    }
    // A card may also draw the rule as its own 3px top border.
    if (ruleHeight === null && parseFloat(s.borderTopWidth) >= 2.5) {
      ruleHeight = parseFloat(s.borderTopWidth);
      ruleBackground = s.borderTopColor;
    }
    const bg = String(ruleBackground || '');
    let title = '';
    for (const d of el.querySelectorAll('*')) {
      const ds = cs(d);
      const own = Array.from(d.childNodes).some((n) => n.nodeType === 3 && (n.nodeValue || '').trim());
      if (!own) continue;
      const isDisplay = ds.textTransform === 'uppercase' || /Anton/i.test(ds.fontFamily);
      if (!isDisplay) continue;
      title = renderedText(d).replace(/\s+/g, ' ').trim();
      if (title) break;
    }
    cards.push({
      name: `${nameOf(el)}${title ? ` "${title.slice(0, 40)}"` : ''}`,
      title,
      hasRule: ruleHeight !== null && ruleHeight >= 2.5 && ruleHeight <= 3.5,
      ruleHeight,
      ruleBackground: bg.slice(0, 90),
      ruleIsBand: BAND_RGB.some((c) => bg.includes(c)),
      ruleIsGrey: bg.includes(GREY_RULE) || bg.includes('26, 26, 26') || bg.includes('61, 57, 54'),
      borderWidth: parseFloat(s.borderTopWidth) || 0,
      borderRadius: parseFloat(s.borderTopLeftRadius) || 0,
      hasShadow: s.boxShadow !== 'none',
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      width: r.width,
      columnClientWidth: column,
      // Ruling 5.2's one sanctioned ruleless card, read from the stamp SectionCard already sets
      // (FOLD 63, 2026-09-08). By identity, never by "it has no rule", so a card that drops its
      // rule without being the band-grouping card is still a finding.
      isBandGrouping: el.getAttribute('data-section-card') === 'band-grouping',
      isTableCard: Boolean(closestMatch(el, '[data-guard-table-card]')) || Boolean(el.querySelector('[data-guard-strip]')),
      inRail: Boolean(frameEl && frameEl.children[1] && frameEl.children[1].contains(el)),
    });
    if (title) cardTitles.push({ title, inRail: Boolean(frameEl && frameEl.children[1] && frameEl.children[1].contains(el)) });
  }

  // ── L2: layout boxes ─────────────────────────────────────────────────────────────────────────
  const BOX_SELECTOR = 'section, article, header, footer, aside, table, button, a[href], [data-guard-card], [data-guard-container], [data-guard-row], [data-guard-strip]';
  const boxEls = [];
  for (const el of main.querySelectorAll(BOX_SELECTOR)) {
    if (!visible(el)) continue;
    if (!(el.textContent || '').trim()) continue;
    boxEls.push(el);
    if (boxEls.length >= 260) break;
  }
  const boxes = boxEls.map((el, i) => ({ el, id: i }));
  const boxRecords = boxes.map(({ el, id }) => {
    const r = rectOf(el);
    return {
      id,
      name: nameOf(el),
      x: r.x, y: r.y, width: r.width, height: r.height,
      excused: excusedEls.has(el),
      contains: boxes.filter(({ el: o }) => o !== el && (el.contains(o) || o.contains(el))).map((b) => b.id),
    };
  });

  // ── L3 / L4: scrollers ───────────────────────────────────────────────────────────────────────
  const scrollers = [];
  const carousels = [];
  for (const el of all) {
    const s = cs(el);
    if (!/auto|scroll/.test(s.overflowX)) continue;
    if (!visible(el)) continue;
    let entry = null;
    for (const a of scrollerAllowlist) { if (closestMatch(el, a.match)) { entry = a; break; } }
    const focusable = el.querySelectorAll('a[href],button,input,select,textarea,[tabindex]');
    scrollers.push({
      name: nameOf(el),
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      allowed: Boolean(entry),
      allowId: entry ? entry.id : null,
      requiresKeyboardReach: Boolean(entry && entry.requiresKeyboardReach),
      tabIndex: el.getAttribute('tabindex'),
      focusableCount: focusable.length,
      keyboardReachable: el.getAttribute('tabindex') !== null || focusable.length > 0,
    });
    if (el.scrollWidth - el.clientWidth <= 4) continue;
    // An arrow control beside a real horizontal scroller is the carousel the operator forbids.
    const scope = el.parentElement || el;
    for (const b of scope.querySelectorAll('button,[role="button"]')) {
      const label = ((b.getAttribute('aria-label') || b.textContent || '').trim()).slice(0, 24);
      if (/^(next|prev|previous|scroll (left|right)|forward|back|←|→|‹|›|◀|▶|<|>)$/i.test(label)) {
        carousels.push({ name: nameOf(b), label });
      }
    }
  }

  // ── L7: Anton ────────────────────────────────────────────────────────────────────────────────
  const anton = [];
  for (const el of all) {
    const s = cs(el);
    if (!/^\s*["']?Anton/i.test(s.fontFamily)) continue;
    const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.nodeValue || '').trim());
    if (!own || !visible(el)) continue;
    let entry = null;
    for (const a of antonAllowlist) { if (closestMatch(el, a.match)) { entry = a; break; } }
    anton.push({
      name: nameOf(el),
      text: renderedText(el).replace(/\s+/g, ' ').trim().slice(0, 40),
      allowed: Boolean(entry),
      allowId: entry ? entry.id : null,
    });
  }

  // ── L8: absence strings, in RENDERED form ────────────────────────────────────────────────────
  const absence = [];
  {
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const owner = n.parentElement;
      if (!owner) continue;
      if (owner.tagName === 'STYLE' || owner.tagName === 'SCRIPT') continue;
      if (!(n.nodeValue || '').trim()) continue;
      const tt = cs(owner).textTransform;
      const raw = n.nodeValue || '';
      const text = tt === 'uppercase' ? raw.toUpperCase() : tt === 'lowercase' ? raw.toLowerCase() : raw;
      absence.push({
        name: nameOf(owner),
        text: text.replace(/\s+/g, ' ').trim(),
        // The OWNER ELEMENT's whole rendered text, alongside this node's own. L8's narrowed
        // "PENDING" clause asks whether the token is the whole of a run, and a run is an element,
        // not a text node: `<span>4 inputs <b>pending</b></span>` hands the walker a node reading
        // exactly "pending", which would make the narrowing vacuous. Measured on /market and
        // /admin, which is where both false positives lived.
        ownerText: renderedText(owner).replace(/\s+/g, ' ').trim(),
        inAbsenceComponent: Boolean(closestMatch(owner, absenceHost)),
      });
      if (absence.length >= 900) break;
    }
  }

  // ── L9: hit targets ──────────────────────────────────────────────────────────────────────────
  const TARGET_SELECTOR = 'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"]';
  const targetEls = Array.from(main.querySelectorAll(TARGET_SELECTOR)).filter(visible);
  const targets = targetEls.map((el, id) => {
    const wrappingLabel = (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) ? el.closest('label') : null;
    const r = (wrappingLabel || el).getBoundingClientRect();
    return {
      id,
      name: nameOf(el),
      x: r.x, y: r.y, width: r.width, height: r.height,
      contains: targetEls.map((o, j) => ({ o, j })).filter(({ o }) => o !== el && (el.contains(o) || o.contains(el))).map(({ j }) => j),
    };
  });

  // ── L12: the command bar ─────────────────────────────────────────────────────────────────────
  let commandBar = { found: false };
  const bar = document.querySelector('.cl-command-bar');
  if (bar) {
    const input = bar.querySelector('input');
    const hint = bar.querySelector('.cl-cmdk-hint');
    const button = bar.querySelector('button');
    if (input) {
      // The placeholder's rendered width, measured with a throwaway span in the input's own type.
      const probe = document.createElement('span');
      const istyle = cs(input);
      probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${istyle.font};letter-spacing:${istyle.letterSpacing}`;
      probe.textContent = input.placeholder || '';
      document.body.appendChild(probe);
      const placeholderWidth = probe.getBoundingClientRect().width;
      probe.remove();
      commandBar = {
        found: true,
        input: rectOf(input),
        hint: hint && visible(hint) ? rectOf(hint) : null,
        button: button && visible(button) ? rectOf(button) : null,
        placeholderWidth,
        inputClientWidth: input.clientWidth,
        textOverflow: istyle.textOverflow,
      };
    }
  }

  // ── L11: text runs (the shape ux-assert.mjs's detectClippedText takes) ───────────────────────
  const textRuns = [];
  for (const el of all) {
    if (textRuns.length >= 200) break;
    const text = (el.textContent || '').trim();
    if (!text || !visible(el)) continue;
    const s = cs(el);
    if (s.overflowX !== 'hidden' && s.overflowY !== 'hidden') continue;
    let inlineOnly = true;
    for (const child of el.children) {
      const d = cs(child).display;
      if (d !== 'inline' && d !== 'inline-block' && d !== 'inline-flex' && d !== 'contents') { inlineOnly = false; break; }
    }
    if (!inlineOnly) continue;
    let inStrip = false;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (p.hasAttribute('data-guard-strip')) { inStrip = true; break; }
      const ox = cs(p).overflowX;
      if (ox === 'auto' || ox === 'scroll') { inStrip = true; break; }
    }
    textRuns.push({
      name: nameOf(el),
      overflowX: el.scrollWidth - el.clientWidth,
      overflowY: el.scrollHeight - el.clientHeight,
      textOverflow: s.textOverflow,
      clamped: s.webkitLineClamp !== undefined && s.webkitLineClamp !== 'none' && s.webkitLineClamp !== '',
      inStrip,
      mustFit: Boolean(closestMatch(el, '.cl-list-row-header')),
    });
  }

  return {
    doc: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
    frame,
    cards,
    cardTitles,
    boxes: boxRecords,
    positioned,
    scrollers,
    carousels,
    anton,
    absence,
    targets,
    commandBar,
    textRuns,
  };
};

/** Run the collector in `page` and return the measurement bundle. */
export async function collectLayout(page) {
  return page.evaluate(COLLECT, {
    renderedTextSrc: RENDERED_TEXT_SRC,
    positionAllowlist: POSITION_ALLOWLIST,
    scrollerAllowlist: SCROLLER_ALLOWLIST,
    antonAllowlist: ANTON_ALLOWLIST,
    absenceHost: ABSENCE_HOST,
    notACard: NOT_A_CARD,
  });
}
