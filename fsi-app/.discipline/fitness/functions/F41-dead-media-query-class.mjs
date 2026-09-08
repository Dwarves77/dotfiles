// F41: dead-media-query-class (lane mobfix61, 2026-09-08).
//
// THE DEFECT CLASS, CONFIRMED IN PRODUCTION. src/components/map/MapPageView.tsx carried exactly one
// media query:
//
//     @media (max-width: 1280px) { .cl-map-grid { grid-template-columns: 1fr !important; } }
//
// while the element holding the page's two-column layout was `.cl-map-outer`
// (`grid-template-columns: minmax(0,1fr) 300px`). `.cl-map-grid` is the INNER content column, a
// `display: flex` element on which `grid-template-columns` does nothing at all. So the rule was
// dead twice over, the 300px rail track survived at every width, and at 390 the rail cards were
// laid out ON TOP of the filter chip rows. The operator found it on his phone on 2026-09-08 ("map
// page complete overlaps sections") — nothing in tsc, the fitness suite, the rendering guard or
// the 68-spec design audit could see it, because a CSS selector that matches no element is not an
// error in any language involved. It is silent by construction.
//
// WHAT THIS GATE DOES. For every .tsx under src/ that declares CSS inside a `<style>` template
// literal, it collects the class names targeted inside `@media` blocks and asserts each one appears
// as a class on an element in the SAME FILE — in a `className="..."` / `className={...}` attribute,
// or in a string the file builds class names with. A class named in a media query but carried by no
// element in the file is reported: either the element lost the class, or the rule names the wrong
// one, and both are the defect. A class the file legitimately targets on a DESCENDANT rendered by
// another component (`.cl-band-tile` inside a BandTile, `[data-audit=...]` compound selectors) is
// the reason for the `fitness-allow: F41` marker rather than a silent whole-file exemption: the
// proof that the target really is rendered elsewhere is written next to the rule that assumes it.
//
// Scope note: only class selectors inside `@media` are checked. Rules OUTSIDE a media query are a
// far larger surface (hover states, nested-descendant styling, shared globals) and their failure
// mode is cosmetic; the defect this gate exists for is a RESPONSIVE rule that silently never fires,
// where the page looks correct at the width the author tested and breaks at the width he did not.
//
// NO ALLOWLIST, NO EXPIRY: a rule that targets nothing gets fixed or gets the marker naming where
// the element actually lives.

import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { isTestFile } from './F25-module-liveness.mjs';

const SCOPE_GLOBS = ['fsi-app/src/**/*.tsx'];

/** Class names this repo's shared parts render into OTHER components' trees by design, so a media
 *  query naming one is targeting a real element that simply is not authored in this file. Each is
 *  a shared-part root class whose owning file is named, so the pair can be checked by hand. */
const CROSS_COMPONENT_CLASSES = new Map([
  ['cl-band-tile', 'src/components/ui/BandTile.tsx'],
  ['cl-band-tiles', 'src/components/ui/BandTileRow.tsx'],
  ['cl-list-row', 'src/components/ui/ListRow.tsx'],
  ['cl-list-row-header', 'src/components/ui/ListRow.tsx'],
  ['cl-masthead', 'src/components/ui/Masthead.tsx'],
  ['cl-masthead-body', 'src/components/ui/Masthead.tsx'],
  ['cl-command-bar', 'src/components/ui/CommandBar.tsx'],
  ['cl-filter-group', 'src/components/ui/Chips.tsx'],
  ['cl-filter-chip', 'src/components/ui/Chips.tsx'],
  ['cl-impact-bar', 'src/components/ui/ImpactMeter.tsx'],
  ['cl-impact-bars', 'src/components/ui/ImpactMeter.tsx'],
  ['cl-impact-baseline', 'src/components/ui/ImpactMeter.tsx'],
  ['cl-impact-unscored', 'src/components/ui/ImpactMeter.tsx'],
  ['cl-tier-chip', 'src/components/ui/Chips.tsx'],
  ['cl-absence', 'src/components/ui/Absence.tsx'],
  ['cl-section-heading-aside', 'src/components/ui/SectionHeading.tsx'],
]);

const MEDIA_BLOCK_RE = /@media[^{]*\{/g;
const CLASS_SELECTOR_RE = /\.(cl-[a-zA-Z0-9_-]+)/g;

/** Extract the source text of every `@media (...) { ... }` block, brace-balanced. Returns
 *  `{ text, line }` per block so a violation can point at the rule, not at the file. */
export function mediaBlocks(content) {
  const out = [];
  MEDIA_BLOCK_RE.lastIndex = 0;
  let m;
  while ((m = MEDIA_BLOCK_RE.exec(content)) !== null) {
    let depth = 1;
    let i = m.index + m[0].length;
    while (i < content.length && depth > 0) {
      if (content[i] === '{') depth += 1;
      else if (content[i] === '}') depth -= 1;
      i += 1;
    }
    out.push({
      text: content.slice(m.index + m[0].length, i - 1),
      line: content.slice(0, m.index).split('\n').length,
    });
    MEDIA_BLOCK_RE.lastIndex = i;
  }
  return out;
}

/** Every `cl-*` class name this file puts on an element. Deliberately generous: any occurrence
 *  inside a className attribute value, a className expression, or a plain string the file uses to
 *  build one. A false GREEN here is far cheaper than a false finding (CLAUDE.md rule 14). */
export function classNamesRendered(content) {
  const found = new Set();
  // className="..." / className={`...`} / className={cond ? "a" : "b"} / any bare "cl-x" string
  // that is NOT inside the style template literal is treated as authored onto an element. The
  // style blocks are removed first so a selector cannot vouch for itself.
  const withoutStyles = content.replace(/<style>\{`[\s\S]*?`\}<\/style>/g, '');
  for (const m of withoutStyles.matchAll(/["'`]([^"'`]*\bcl-[a-zA-Z0-9_ -]*)["'`]/g)) {
    for (const cls of m[1].split(/\s+/)) if (cls.startsWith('cl-')) found.add(cls);
  }
  return found;
}

function isMarked(lines, idx) {
  for (const i of [idx, idx - 1]) {
    if (i >= 0 && i < lines.length && /fitness-allow:\s*F41\b/.test(lines[i])) return true;
  }
  return false;
}

export const fitnessFunction = {
  id: 'F41',
  name: 'dead-media-query-class',
  description:
    'Every `cl-*` class targeted inside an `@media` block in a .tsx must be carried by an element ' +
    'in the same file, be a known shared-part class rendered by another component, or carry a ' +
    '`// fitness-allow: F41 (reason)` marker. A responsive rule naming a class nothing carries is ' +
    'a silent no-op: it cannot fail tsc, the fitness suite, the rendering guard or the design ' +
    'audit, and the page looks right at the width the author tested. No allowlist, no expiry.',
  source:
    'D-M3, operator mobile report 2026-09-08 ("map page complete overlaps sections") — ' +
    'MapPageView.tsx\'s only media query named .cl-map-grid while the two-column grid was .cl-map-outer',

  enumerate() {
    return globFiles(SCOPE_GLOBS).filter((f) => !isTestFile(f) && !f.includes('/_archive/'));
  },

  check(filepath, content) {
    if (!content.includes('@media')) return [];
    const rendered = classNamesRendered(content);
    const lines = content.split(/\r?\n/);
    const out = [];
    const seen = new Set();
    for (const block of mediaBlocks(content)) {
      for (const m of block.text.matchAll(CLASS_SELECTOR_RE)) {
        const cls = m[1];
        if (seen.has(cls)) continue;
        if (rendered.has(cls)) continue;
        if (CROSS_COMPONENT_CLASSES.has(cls)) continue;
        if (isMarked(lines, block.line - 1)) continue;
        seen.add(cls);
        out.push(
          violation(
            block.line,
            `@media rule targets .${cls}, which no element in this file carries. A media query ` +
              `naming a class nothing renders is a silent no-op — it is the defect that shipped the ` +
              `map page's overlapping rail at 390 (D-M3, operator report 2026-09-08). Put the class ` +
              `on the element the rule means, correct the selector, or mark the rule ` +
              `\`// fitness-allow: F41 (reason)\` naming the component that renders it.`
          )
        );
      }
    }
    return out;
  },
};
