// THE ONE "what does the reader actually see" text reader, shared by every in-page probe.
// Lane layoutguard, 2026-09-08.
//
// WHY IT IS A STRING. It runs inside the page (Playwright `page.evaluate`), which cannot close over
// a module import, so the source travels as an argument and is rebuilt in the page. That is the
// only reason this is not an ordinary exported function.
//
// WHY IT IS SHARED. Lane MOBFIX-61 (2026-09-08) proved by attack that matching SOURCE text is
// vacuous for this product: nineteen audit forbids looking for "UNSCORED"/"NOT SCORED" had matched
// nothing since they were written, because the product writes those words in lower case and
// uppercases them with `text-transform` (Absence.tsx's ABSENCE_TEXT_STYLE). They reported MATCH
// while the operator was photographing the literal token on his phone. run-audit.mjs fixed that in
// its own probe; the site-wide layout guard's L8 needs the identical reading, and CLAUDE.md rule 13
// forbids the second copy - so the implementation moved here and BOTH probes inject this one string.
//
// PER TEXT NODE, not per element: `text-transform` is inherited, so an element's own computed value
// describes only the text it holds directly. Reading `body`'s computed transform ("none") would
// uppercase nothing and miss a token a descendant span renders uppercase - the same vacuity in a
// different place.

export const RENDERED_TEXT_SRC = `function renderedText(root) {
  if (!root || root.nodeType !== 1) return (root && root.textContent) || '';
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let out = '';
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const owner = n.parentElement;
    if (!owner) { out += n.nodeValue || ''; continue; }
    const tag = owner.tagName;
    if (tag === 'STYLE' || tag === 'SCRIPT') continue;
    const tt = getComputedStyle(owner).textTransform;
    const s = n.nodeValue || '';
    out += tt === 'uppercase' ? s.toUpperCase() : tt === 'lowercase' ? s.toLowerCase() : s;
  }
  return out;
}`;
