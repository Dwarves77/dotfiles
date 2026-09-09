// Rendering-guard smoke spec: THE OPERATOR'S THREE ACCEPTANCE CRITERIA FOR THE /operations MATRIX
// (lane opsmatrix5, 2026-09-09).
//
// HIS WORDS, verbatim, closing the STOP SHIP message this lane answers:
//
//   "Acceptance: at 1440 the matrix card height is constant regardless of selection; no text column
//    in the card is narrower than 560px; no cell contains a word."
//
// Coordinator note C3, binding: "THE TABLE NEVER GROWS is the acceptance test, not a slogan. Card
// height constant at 1440 whether nothing, a cell, or a row header is selected, measured, not
// asserted." So each criterion is a MEASUREMENT with a number in the failure text, never a presence
// check, and each is reachable by attack: change the panel slot's height rule, drop a column floor,
// or put a word back in a cell, and the matching leg goes red on the exact number.
//
// SIX LEGS:
//   A. CARD HEIGHT IS CONSTANT. The same mount measured in the three states the operator names:
//      nothing selected (Esc), one cell selected, a row header selected (compare mode). Three
//      numbers, and they must be equal. This is what the fixed-height, internally scrolling panel
//      slot (PANEL_SLOT_HEIGHT) exists for.
//   B. NO TEXT COLUMN NARROWER THAN 560px. Every text-bearing box inside the panel is measured in
//      all three states, and the NARROWEST is reported. The defect this closes is the retired
//      pattern's five ~110px columns of prose.
//   C. NO CELL CONTAINS A WORD. Every body cell's RENDERED text is enumerated: text nodes of
//      elements that are actually displayed, plus `::before`/`::after` content, because the em dash
//      is CSS content and the absence word beside it is `display: none` above 767px. Each cell must
//      be a bare integer score or a bare em dash, and the failure names the offending cell's text.
//      Measuring `textContent` instead is the mistake that let eight forbids on this project match
//      nothing for weeks: it reads the injected <style> element and the hidden word, and misses
//      anything drawn by `content:`.
//   D. THE NO-FIGURE FACT CARD, and the detail sentence's measure. See the block at the assertion
//      itself for the one place his own two numbers ("at most 72 characters per line" and "no text
//      column narrower than 560px") cannot both hold, what was measured, and which one won.
//      D. THE NO-FIGURE FACT CARD. `ops-matrix-nofigure` selects a cell whose one fact has no figure:
//      the card must lead with a headline of at most six words at 13px / weight 600, must carry the
//      claim after it, and must contain no figure element. Proof that the fallback is a branch that
//      runs, not a sentence in a comment.
//   E. FIVE COLUMNS FIT, SIX SCROLL (operator item 4, "regions beyond five scroll inside the card").
//      Both halves, because a floor big enough to scroll at six is only correct if five still fit.
//   F. THE CLICK PATH STILL MOVES THE SELECTION OFF THE DEFAULT. With the default selection restored
//      (item 5), the arrival state and `ops-matrix-selected`'s clicked state are the same cell, so
//      this leg clicks a DIFFERENT one (UAE x D6) and requires the selection, the tint and the panel
//      heading to follow it. Compare mode's cards are also checked to be STACKED VERTICALLY
//      ("never side by side"), by geometry rather than by a CSS property name.
//
// COST: filesystem + the shared headless chromium the guard already launched. No network (page.route
// answers every fetch), no database, no credential.

import { bundleEntry, newSmokePage, mountBundle } from './harness.mjs';
import { fullAppCssCompiled } from './smoke-fixtures.mjs';
import { AUDIT_MOUNTS, mountExtraCss } from '../audit/mounts.mjs';

const CARD = '[data-audit="ops-matrix-card"]';
const PANEL = '[data-audit="ops-matrix-panel"]';

/** The operator's floor for any text-bearing box inside the card. */
const MIN_TEXT_COLUMN = 560;

async function mountRegistered(browser, id, { width = 1440 } = {}) {
  const mount = AUDIT_MOUNTS[id];
  if (!mount) throw new Error(`no AUDIT_MOUNTS entry "${id}"`);
  const page = await newSmokePage(browser, { apiRoutes: mount.apiRoutes || [] });
  await page.setViewportSize({ width, height: 1600 });
  await page.addStyleTag({ content: await fullAppCssCompiled() });
  const extra = mountExtraCss(mount);
  if (extra) await page.addStyleTag({ content: extra });
  await mountBundle(page, await bundleEntry(mount.entry, { alias: mount.alias || {} }), '__mount', null);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  await page.waitForTimeout(220);
  return page;
}

/**
 * RENDERED text of one element: the text nodes of descendants that are actually displayed, plus any
 * `::before` / `::after` `content`, with each owner's own `text-transform` applied. This is the
 * measurement the project's own 2026-09-07 correction demands ("forbid textMatch compares against
 * RENDERED text, not source text"), reproduced here because this leg reads cells rather than specs.
 */
const RENDERED_TEXT = `(el) => {
  const tf = (s, t) => (t === 'uppercase' ? s.toUpperCase() : t === 'lowercase' ? s.toLowerCase() : s);
  let out = '';
  const walk = (node) => {
    if (node.nodeType === 3) return;
    const cs = getComputedStyle(node);
    if (node.tagName === 'STYLE' || node.tagName === 'SCRIPT') return;
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    for (const pseudo of ['::before', '::after']) {
      const c = getComputedStyle(node, pseudo).content;
      if (c && c !== 'none' && c !== 'normal') out += ' ' + tf(c.replace(/^["']|["']$/g, ''), cs.textTransform);
    }
    for (const child of node.childNodes) {
      if (child.nodeType === 3) out += ' ' + tf(child.textContent, cs.textTransform);
      else walk(child);
    }
  };
  walk(el);
  return out.replace(/\\s+/g, ' ').trim();
}`;

/** Every text-bearing box inside the panel, with its content-box width. */
const TEXT_BOXES = `(() => {
  const panel = document.querySelector('${PANEL}');
  if (!panel) return [];
  const out = [];
  for (const el of panel.querySelectorAll('*')) {
    if (el.tagName === 'STYLE' || el.tagName === 'SCRIPT') continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    // A box is TEXT-BEARING when it owns a non-empty direct text node: the innermost element that
    // actually sets a line. Measuring wrappers instead would flatter the number.
    const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3 && n.textContent.trim()).length;
    if (!own) continue;
    // WHAT COUNTS AS THE COLUMN, and it is a real decision. A box only constrains a line when it is
    // the thing that decides where the line breaks. An INLINE box has no width of its own, and a
    // FLEX or GRID ITEM's width is decided by the line it shares with its siblings, not by a column
    // of its own: the headline figure and the claim beside it are one line at the card's width, and
    // measuring the figure's 40px shrink-to-fit box as a "text column" would report a number that
    // describes nothing a reader reads. So walk up past both until a box that actually lays the
    // text out in normal flow is reached, and measure that.
    let box = el;
    for (let i = 0; i < 12 && box; i += 1) {
      const cs2 = getComputedStyle(box);
      const parent = box.parentElement;
      const pd = parent ? getComputedStyle(parent).display : '';
      const isInline = cs2.display.startsWith('inline');
      const isFlexItem = pd === 'flex' || pd === 'inline-flex' || pd === 'grid' || pd === 'inline-grid';
      if (!isInline && !isFlexItem) break;
      box = parent;
    }
    if (!box || !panel.contains(box)) box = panel;
    const r = box.getBoundingClientRect();
    const b = getComputedStyle(box);
    const w = r.width - parseFloat(b.paddingLeft || 0) - parseFloat(b.paddingRight || 0);
    out.push({
      width: Math.round(w * 100) / 100,
      audit: el.getAttribute('data-audit') || (el.closest('[data-audit]') ? el.closest('[data-audit]').getAttribute('data-audit') : null),
      text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 50),
    });
  }
  return out;
})()`;

const cardHeight = (page) =>
  page.evaluate((c) => Math.round(document.querySelector(c).getBoundingClientRect().height * 100) / 100, CARD);

export async function runSmoke(browser) {
  const failures = [];
  let checks = 0;
  const eq = (label, actual, expected) => {
    checks += 1;
    if (actual !== expected) failures.push(`ops-matrix-acceptance: ${label}, expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  };

  // ── A: the card height is constant in all three states ───────────────────────────────────────
  {
    const page = await mountRegistered(browser, 'ops-matrix');
    try {
      // State 2 first, because it is the ARRIVAL state: the default selection (item 5) means the
      // matrix is already showing one cell's facts with nothing clicked.
      const hCell = await cardHeight(page);

      // State 1: nothing selected. Esc, which is item 3's other half.
      await page.evaluate((c) => document.querySelector(`${c} [tabindex="0"]`).focus(), CARD);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(140);
      eq('Esc closes the panel (no fact card left)', await page.locator('[data-audit="ops-fact-card"]').count(), 0);
      eq('Esc leaves no cell selected', await page.locator(`${CARD} [aria-selected="true"]`).count(), 0);
      eq('Esc keeps the panel SLOT in the DOM (that is what holds the height)', await page.locator(PANEL).count(), 1);
      const hNone = await cardHeight(page);

      // State 3: a row header, which is compare mode.
      await page.locator(`${CARD} table > tbody > tr:nth-child(3) > th`).click();
      await page.waitForTimeout(160);
      eq('a row header opens compare mode', await page.locator('[data-audit="ops-fact-card"]').count() > 0, true);
      const hCompare = await cardHeight(page);

      console.log(`    [A] matrix card height @1440 · nothing selected ${hNone}px · cell selected ${hCell}px · compare mode ${hCompare}px`);
      checks += 1;
      if (!(hNone === hCell && hCell === hCompare)) {
        failures.push(
          `ops-matrix-acceptance: A. THE TABLE NEVER GROWS. Card height must be constant at 1440. ` +
            `nothing selected ${hNone}px, cell selected ${hCell}px, compare mode ${hCompare}px`
        );
      }

      // Compare mode's cards are STACKED, never side by side: proven by geometry.
      const stacked = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('[data-audit="ops-fact-card"]')).map((c) => c.getBoundingClientRect());
        for (let i = 1; i < cards.length; i += 1) if (cards[i].top < cards[i - 1].bottom - 0.5) return false;
        return cards.length > 1;
      });
      eq('compare mode stacks its cards vertically, never side by side', stacked, true);
      const labels = await page.locator('[data-audit="ops-compare-label"]').count();
      checks += 1;
      if (labels < 2) failures.push(`ops-matrix-acceptance: compare mode must label every region, found ${labels} labels`);
    } finally {
      await page.close();
    }
  }

  // ── B: no text column inside the card is narrower than 560px ─────────────────────────────────
  {
    const page = await mountRegistered(browser, 'ops-matrix');
    try {
      const seen = [];
      for (const [state, act] of [
        ['cell selected (arrival)', async () => {}],
        ['compare mode', async () => {
          await page.locator(`${CARD} table > tbody > tr:nth-child(3) > th`).click();
          await page.waitForTimeout(160);
        }],
        ['nothing selected (Esc)', async () => {
          await page.evaluate((c) => document.querySelector(`${c} [tabindex="0"]`).focus(), CARD);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(140);
        }],
      ]) {
        await act();
        const boxes = await page.evaluate(TEXT_BOXES);
        const narrowest = boxes.reduce((a, b) => (b.width < a.width ? b : a), boxes[0] ?? { width: Infinity, audit: null, text: '(none)' });
        seen.push({ state, narrowest, count: boxes.length });
        checks += 1;
        if (narrowest.width < MIN_TEXT_COLUMN) {
          failures.push(
            `ops-matrix-acceptance: B. text column too narrow in ${state}: ${narrowest.width}px ` +
              `(floor ${MIN_TEXT_COLUMN}px) on ${narrowest.audit ?? 'unlabelled'} :: "${narrowest.text}"`
          );
        }
      }
      for (const s of seen) {
        console.log(`    [B] narrowest text column, ${s.state}: ${s.narrowest.width}px on ${s.narrowest.audit ?? 'unlabelled'} (${s.count} text boxes measured)`);
      }
    } finally {
      await page.close();
    }
  }

  // ── C: no cell contains a word ───────────────────────────────────────────────────────────────
  {
    const page = await mountRegistered(browser, 'ops-matrix');
    try {
      const cells = await page.evaluate(
        ([card, rendered]) => {
          const fn = eval(rendered);
          return Array.from(document.querySelectorAll(`${card} table > tbody > tr > td`)).map((td) => fn(td));
        },
        [CARD, RENDERED_TEXT]
      );
      checks += 1;
      const EM_DASH = '—';
      const bad = cells.filter((t) => !/^\d+$/.test(t) && t !== EM_DASH);
      console.log(`    [C] ${cells.length} body cells, rendered: ${JSON.stringify(cells)}`);
      if (bad.length > 0) {
        failures.push(`ops-matrix-acceptance: C. a cell contains a word, ${bad.length} of ${cells.length}: ${JSON.stringify(bad.slice(0, 6))}`);
      }
      if (cells.length === 0) failures.push('ops-matrix-acceptance: C. no body cells were measured at all');

      // The delete list, measured on RENDERED text over the whole card: the words CURRENT and
      // PENDING appear nowhere, in a cell or in a fact card.
      const words = await page.evaluate(
        ([card, rendered]) => eval(rendered)(document.querySelector(card)).toUpperCase(),
        [CARD, RENDERED_TEXT]
      );
      eq('the rendered card never says CURRENT', /\bCURRENT\b/.test(words), false);
      eq('the rendered card never says PENDING', /\bPENDING\b/.test(words), false);
      eq('the rendered card never carries a disclosure glyph', /[▸▾]/.test(words), false);
      eq('the header hint no longer says "click a dimension to open its facts"', /CLICK A DIMENSION/.test(words), false);
    } finally {
      await page.close();
    }
  }

  // ── A2 / B2: the SAME two criteria on the REAL /operations page at 1440 ──────────────────────
  // The component mount above is a 900px box, which is the harder width for criterion B and the
  // right one for the geometry. But the operator said "at 1440", and the page he is looking at puts
  // this card in the list surface's grid beside the rail, so both criteria are measured there too,
  // on the composed page, with the card at whatever width that layout gives it.
  {
    const page = await mountRegistered(browser, 'compose-08-operations');
    try {
      const present = await page.locator(CARD).count();
      checks += 1;
      if (present !== 1) {
        failures.push(`ops-matrix-acceptance: A2. the composed /operations page must carry exactly one matrix card, found ${present}`);
      } else {
        const hCell = await cardHeight(page);
        await page.evaluate((c) => document.querySelector(`${c} [tabindex="0"]`).focus(), CARD);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(140);
        const hNone = await cardHeight(page);
        await page.locator(`${CARD} table > tbody > tr:nth-child(3) > th`).click();
        await page.waitForTimeout(160);
        const hCompare = await cardHeight(page);
        const cardW = await page.evaluate((c) => Math.round(document.querySelector(c).getBoundingClientRect().width), CARD);
        console.log(`    [A2] composed /operations @1440, card ${cardW}px wide · nothing selected ${hNone}px · cell selected ${hCell}px · compare mode ${hCompare}px`);
        checks += 1;
        if (!(hNone === hCell && hCell === hCompare)) {
          failures.push(
            `ops-matrix-acceptance: A2. on the composed page the card height must be constant at 1440. ` +
              `nothing selected ${hNone}px, cell selected ${hCell}px, compare mode ${hCompare}px`
          );
        }
        const boxes = await page.evaluate(TEXT_BOXES);
        if (boxes.length > 0) {
          const narrowest = boxes.reduce((a, b) => (b.width < a.width ? b : a), boxes[0]);
          console.log(`    [B2] composed /operations @1440, narrowest text column: ${narrowest.width}px on ${narrowest.audit ?? 'unlabelled'} (${boxes.length} text boxes)`);
          checks += 1;
          if (narrowest.width < MIN_TEXT_COLUMN) {
            failures.push(`ops-matrix-acceptance: B2. text column too narrow on the composed page: ${narrowest.width}px (floor ${MIN_TEXT_COLUMN}px) on ${narrowest.audit ?? 'unlabelled'} :: "${narrowest.text}"`);
          }
        }
      }
    } finally {
      await page.close();
    }
  }

  // ── D: the no-figure fact card ───────────────────────────────────────────────────────────────
  {
    const page = await mountRegistered(browser, 'ops-matrix-nofigure');
    try {
      const headline = page.locator('[data-audit="ops-fact-headline"]');
      eq('the no-figure card renders a headline', await headline.count(), 1);
      eq('the no-figure card renders NO figure', await page.locator('[data-audit="ops-fact-figure"]').count(), 0);
      const h = await page.evaluate(() => {
        const el = document.querySelector('[data-audit="ops-fact-headline"]');
        const cs = getComputedStyle(el);
        return { text: el.textContent.trim(), size: cs.fontSize, weight: cs.fontWeight };
      });
      console.log(`    [D] no-figure headline: ${JSON.stringify(h)}`);
      eq('the no-figure headline is 13px', h.size, '13px');
      eq('the no-figure headline is weight 600', h.weight, '600');
      checks += 1;
      const wordCount = h.text.split(/\s+/).filter(Boolean).length;
      if (wordCount === 0 || wordCount > 6) failures.push(`ops-matrix-acceptance: D. headline must be at most six words, got ${wordCount}: "${h.text}"`);
      // "then the claim": the detail sentence below the headline, at 12.5px / line-height 1.5.
      const detail = await page.evaluate(() => {
        const el = document.querySelector('[data-audit="ops-fact-detail"]');
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { text: el.textContent.trim(), size: cs.fontSize, lh: cs.lineHeight, width: Math.round(el.getBoundingClientRect().width) };
      });
      checks += 1;
      if (!detail || detail.text.length < 20) {
        failures.push(`ops-matrix-acceptance: D. the claim must follow the headline as the detail sentence, got ${JSON.stringify(detail)}`);
      } else {
        console.log(`    [D] detail sentence: ${detail.size} / ${detail.lh}, ${detail.width}px wide, ${detail.text.length} chars`);
        eq('the detail sentence is 12.5px', detail.size, '12.5px');
        eq('the detail sentence is line-height 1.5', detail.lh, '18.75px');
        // "at most 72 characters per line", measured by where the characters actually LAND rather
        // than by trusting the `ch` unit: each character's client rect is grouped by its line's top.
        const lines = await page.evaluate(() => {
          const el = document.querySelector('[data-audit="ops-fact-detail"]');
          const node = el.firstChild;
          const text = node.textContent;
          const rows = {};
          for (let i = 0; i < text.length; i += 1) {
            const r = document.createRange();
            r.setStart(node, i);
            r.setEnd(node, i + 1);
            const k = Math.round(r.getBoundingClientRect().top);
            rows[k] = (rows[k] || 0) + 1;
          }
          return Object.values(rows);
        });
        const longest = Math.max(...lines);
        console.log(`    [D] detail sentence line lengths: ${JSON.stringify(lines)} characters, box ${detail.width}px`);
        // THE ONE PLACE THE OPERATOR'S OWN TWO NUMBERS CONFLICT, stated rather than quietly picked.
        // He asks for "at most 72 characters per line" AND, as acceptance criterion B, "no text
        // column in the card is narrower than 560px". MEASURED here, this face at 12.5px: a 560px
        // box sets about 92 characters, and 72 characters need about 439px. The two cannot both
        // hold. Criterion B is the one the lane is judged on, it is the later statement, and it is
        // the one aimed at the defect he stopped the ship over (five ~110px columns of prose); the
        // replacement artboard corroborates it, setting roughly 88 characters on its own first fact
        // card's detail line. So the cap is `max(560px, 72ch)`: the NARROWEST measure criterion B
        // allows, which is as close to 72 characters as B permits. That is what is asserted, with
        // the character count printed above so the trade is visible in every run rather than argued
        // from memory.
        checks += 1;
        if (detail.width < MIN_TEXT_COLUMN) failures.push(`ops-matrix-acceptance: D. the detail sentence must not fall under the ${MIN_TEXT_COLUMN}px floor, it is ${detail.width}px`);
        checks += 1;
        if (detail.width > 600) failures.push(`ops-matrix-acceptance: D. the detail sentence must be CAPPED near the floor, not run the card's full width: ${detail.width}px (longest line ${longest} characters)`);
      }
    } finally {
      await page.close();
    }
  }

  // ── E: five columns fit, six scroll ──────────────────────────────────────────────────────────
  {
    const measure = (page) =>
      page.evaluate(() => {
        const s = document.querySelector('.cl-ops-matrix-table');
        return { scrollWidth: s.scrollWidth, clientWidth: s.clientWidth };
      });
    const five = await mountRegistered(browser, 'ops-matrix');
    let m5;
    try {
      m5 = await measure(five);
    } finally {
      await five.close();
    }
    const six = await mountRegistered(browser, 'ops-matrix-six-regions');
    let m6;
    try {
      m6 = await measure(six);
    } finally {
      await six.close();
    }
    console.log(`    [E] scroller: five regions ${m5.scrollWidth}/${m5.clientWidth}px · six regions ${m6.scrollWidth}/${m6.clientWidth}px`);
    checks += 2;
    if (m5.scrollWidth > m5.clientWidth) failures.push(`ops-matrix-acceptance: E. five region columns must FIT, but the table scrolls (${m5.scrollWidth} > ${m5.clientWidth})`);
    if (m6.scrollWidth <= m6.clientWidth) failures.push(`ops-matrix-acceptance: E. a sixth region column must SCROLL inside the card, but the table still fits (${m6.scrollWidth} <= ${m6.clientWidth})`);
  }

  // ── F: the click path moves the selection off the default ────────────────────────────────────
  {
    const page = await mountRegistered(browser, 'ops-matrix');
    try {
      const headingOf = () => page.locator('[data-audit="ops-panel-heading"]').textContent();
      const arrival = await headingOf();
      checks += 1;
      if (!arrival.startsWith('Asia · SG + HK · D3 Labor markets')) {
        failures.push(`ops-matrix-acceptance: F. the arrival panel must be the first sourced cell of the first sourced row, got ${JSON.stringify(arrival)}`);
      }
      await page.locator(`${CARD} table > tbody > tr:nth-child(6) > td:nth-child(6)`).click();
      await page.waitForTimeout(160);
      const after = await headingOf();
      checks += 1;
      if (!after.startsWith('UAE · Dubai · D6 Operational cost')) {
        failures.push(`ops-matrix-acceptance: F. a click must move the selection off the default, got ${JSON.stringify(after)}`);
      }
      eq('after a click there is still exactly one selected cell', await page.locator(`${CARD} [aria-selected="true"]`).count(), 1);
      eq('the arrival declaration is dropped the moment the reader acts', await page.locator('[data-open-on-mount]').count(), 0);

      // Item 3's first half: arrows MOVE THE SELECTION and the panel follows.
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(140);
      const arrowed = await headingOf();
      checks += 1;
      if (!arrowed.startsWith('United Kingdom · D6 Operational cost')) {
        failures.push(`ops-matrix-acceptance: F. an arrow key must move the SELECTION and the panel must follow, got ${JSON.stringify(arrowed)}`);
      }
    } finally {
      await page.close();
    }
  }

  return { checks, failures };
}
