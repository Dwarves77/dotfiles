// F49: parts-not-pages (site-wide parts brief, docs/design/parts-brief-2026-09-18.md, rule 1.2, verbatim):
// "a route's page.tsx may not contain the literal styles that define a part (Anton title, card border +
// radius 10, 3px rule, fact card edge/band, chip padding, state note edge). Pages import parts. No
// grandfathering."
//
// WHY THIS GATE EXISTS. The brief's rule of work (section 1) is "parts, not pages": every visual shell the
// design names lives in exactly one shared component under src/components/ui/, and a route's page.tsx
// imports it rather than retyping its literal styles. The parts inventory (docs/design/parts-inventory.md,
// "Literal part styles in page.tsx") swept the tree by hand for this brief and found the seed small: two
// card-shell literals and one already-exempted auth pair. This gate is the machine-checkable form of that
// same sweep, run on every commit, over six literal patterns named by the brief's own words:
//
//   1. an Anton title      fontFamily containing the word Anton or the Anton CSS variable var(--font-display)
//   2. a card border + radius 10   border: 1px solid ... together with borderRadius: 10 or var(--radius-card)
//   3. a 3px rule           height: 3 or borderTop: "3px on a non-part element (page.tsx is never a part)
//   4. a fact card edge/band   borderLeft: "3px solid with a tint background nearby
//   5. chip padding         padding: "2px 6px" with textTransform: "uppercase" nearby
//   6. a state note edge    borderLeft: "3px solid with borderRadius: "0 6px 6px 0" nearby
//
// THE EXEMPTION IS NAMED, NEVER GLOBAL, AND ONLY FOR "NO MATCHING PART" (brief rule, verbatim: "If a seed
// site has no matching part: do not invent a part; list it under cases not drawn and leave it allowlisted
// in F49 with the inventory's reason quoted and a review-by note."). A site marks itself
// `// fitness-allow: F49 (reason)` at or up to WINDOW lines above the literal; there is no path allowlist
// and no expiry.

import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';

const SCOPE_GLOBS = ['fsi-app/src/app/**/page.tsx'];

/** How many lines a two-literal pattern (card shell, fact card edge, chip, state note) may span and
 *  still be recognised as one shell. Matches F42's own WINDOW for the same reason: the repo's widest
 *  observed style-object formatting. */
export const WINDOW = 9;

const ANTON_TITLE = /fontFamily:\s*["'`][^"'`]*(Anton|var\(--font-display\))/;
const CARD_BORDER = /border:\s*"1px solid/;
const CARD_RADIUS_10 = /borderRadius:\s*(?:"var\(--radius-card\)"|10\b)/;
const THREE_PX_RULE = /height:\s*3\b|borderTop:\s*"3px/;
const BORDER_LEFT_3PX = /borderLeft:\s*"3px solid/;
const TINT_BACKGROUND = /background:/;
const CHIP_PADDING = /padding:\s*"2px 6px"/;
const UPPERCASE_TRANSFORM = /textTransform:\s*"uppercase"/;
const STATE_NOTE_RADIUS = /borderRadius:\s*"0 6px 6px 0"/;

/** Every line index at which BOTH `a` and `b` match within a WINDOW-line span starting there, one hit
 *  per span (the index is advanced past the whole window on a match, exactly like F42's cardShellLines,
 *  so one style object with both literals is one hit, not one hit per overlapping window start). */
function windowHits(lines, a, b) {
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const win = lines.slice(i, i + WINDOW).join('\n');
    if (a.test(win) && b.test(win)) {
      out.push(i);
      i += WINDOW - 1;
    }
  }
  return out;
}

/** Every line index at which a single-literal pattern matches, one hit per matching line. */
function lineHits(lines, re) {
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (re.test(lines[i])) out.push(i);
  }
  return out;
}

/** Every (line, pattern) the six patterns find, 0-based line indices, sorted by line. Exported for the
 *  test. */
export function literalHits(content) {
  const lines = content.split(/\r?\n/);
  const hits = [];
  for (const line of lineHits(lines, ANTON_TITLE)) hits.push({ line, pattern: 'anton-title' });
  for (const line of lineHits(lines, THREE_PX_RULE)) hits.push({ line, pattern: '3px-rule' });
  for (const line of windowHits(lines, CARD_BORDER, CARD_RADIUS_10)) {
    hits.push({ line, pattern: 'card-border-radius-10' });
  }
  for (const line of windowHits(lines, BORDER_LEFT_3PX, TINT_BACKGROUND)) {
    hits.push({ line, pattern: 'fact-card-edge' });
  }
  for (const line of windowHits(lines, CHIP_PADDING, UPPERCASE_TRANSFORM)) {
    hits.push({ line, pattern: 'chip-padding' });
  }
  for (const line of windowHits(lines, BORDER_LEFT_3PX, STATE_NOTE_RADIUS)) {
    hits.push({ line, pattern: 'state-note-edge' });
  }
  return hits.sort((x, y) => x.line - y.line);
}

/** The marker may sit anywhere in the hit's own window or in the WINDOW lines above it (same reach as
 *  F42's isMarked, for the same reason: a literal is frequently preceded by several layout lines). */
export function isMarked(lines, hitLine) {
  const from = Math.max(0, hitLine - WINDOW);
  // A site may carry more than one gate's marker on one line (e.g. `F42 F49`, the reset-password
  // confirmation box's marker), so F49 is matched anywhere after `fitness-allow:` on the line, not
  // only immediately after it.
  return lines
    .slice(from, hitLine + WINDOW)
    .some((l) => /fitness-allow:[^\n]*\bF49\b/.test(l));
}

const PATTERN_LABEL = {
  'anton-title': 'an Anton title (fontFamily naming Anton or var(--font-display))',
  '3px-rule': 'a 3px rule (height: 3 or borderTop: "3px)',
  'card-border-radius-10': 'a card border + radius 10 (border: 1px solid together with borderRadius: 10 or var(--radius-card))',
  'fact-card-edge': 'a fact card edge/band (borderLeft: "3px solid with a tint background)',
  'chip-padding': 'chip padding (padding: "2px 6px" with textTransform: "uppercase")',
  'state-note-edge': 'a state note edge (borderLeft: "3px solid with borderRadius: "0 6px 6px 0")',
};

export const fitnessFunction = {
  id: 'F49',
  name: 'parts-not-pages',
  description:
    'A route\'s page.tsx under src/app/** may not contain the literal styles that define a shared part: ' +
    'an Anton title, a card border + radius 10, a 3px rule, a fact card edge/band, chip padding, or a ' +
    'state note edge (site-wide parts brief, docs/design/parts-brief-2026-09-18.md, rule 1.2). Pages ' +
    'import parts. Mark a site `// fitness-allow: F49 (reason)` only when no existing part renders the ' +
    'same result; there is no other allowlist and no expiry.',
  source:
    'docs/design/parts-brief-2026-09-18.md section 1.2, "Fitness F44" (landed as F49 per the coordinator\'s ' +
    'note: F44 is taken by F44-broken-main-guard.mjs); the literal patterns are the brief\'s own six words.',

  enumerate() {
    return globFiles(SCOPE_GLOBS);
  },

  check(filepath, content) {
    const lines = content.split(/\r?\n/);
    const out = [];
    for (const hit of literalHits(content)) {
      if (isMarked(lines, hit.line)) continue;
      out.push(
        violation(
          hit.line + 1,
          `Literal part style in a page.tsx: ${PATTERN_LABEL[hit.pattern]}. Pages import parts, they do ` +
            'not retype them (site-wide parts brief, rule 1.2, "no grandfathering"). Import the shared ' +
            'part that renders this shape, or mark the site `// fitness-allow: F49 (reason)` if no ' +
            'existing part renders the same result (the brief\'s only allowlist condition).'
        )
      );
    }
    return out;
  },
};
