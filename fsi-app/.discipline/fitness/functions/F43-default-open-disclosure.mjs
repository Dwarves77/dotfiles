// F43: default-open-disclosure (lane noexpand, 2026-09-08).
//
// THE DEFECT CLASS, FOUND BY THE OPERATOR ON THE LIVE SITE. He navigated to /operations and the page
// had already opened a dimension, Infrastructure capacity, with nobody having clicked anything. His
// ruling, verbatim: "the ops page opend to a sub category not just the main page, infastructure
// capacity and other items should be closed, no items expanded when first navigtaing to a page".
// The coordinator's binding reading (docs/ops/session-log.md, lane noexpand) is R1: the rule is
// SITE-WIDE, not /operations-local. Every route renders its content sections, groups, rows and
// panels CLOSED on first navigation.
//
// WHY A FITNESS FUNCTION AND NOT ONLY A TEST. The class has one mechanical tell that a compiler,
// a type-checker and every existing gate are blind to: a component initialises its own disclosure
// state to OPEN. `const [open, setOpen] = useState(true)` is valid TypeScript, renders without a
// warning, passes every layout and design assertion (the thing it opens is correctly styled), and
// only a human looking at the page at the right moment can see that it opened itself. It is exactly
// the shape that came back twice on this train.
//
// WHAT THIS GATE SEES, in every `src/components/**/*.tsx`:
//   1. a `useState` disclosure initialiser whose starting value is OPEN. The state's own NAME is
//      the signal, and the polarity is read from it: a name carrying `open` / `expand` flagged when
//      it starts `true`, a name carrying `collaps` / `closed` flagged when it starts `false`.
//      Both spellings say the same thing about the first render.
//   2. a default-open PROP: `defaultOpen` / `defaultExpanded` / `initialOpen` / `expandedByDefault`
//      / `openByDefault` / `defaultIndex` given a truthy default in a destructuring pattern, or
//      passed truthy at a JSX call site (`defaultOpen`, `defaultOpen={true}`).
//   3. a native `<details open>`.
//
// WHAT THIS GATE CANNOT SEE, stated rather than papered over. A page can open itself with no
// boolean anywhere: the /operations matrix did it by computing a DEFAULT SELECTION on mount ("the
// first sourced cell in the first sourced row") and rendering its fact panel for that cell. There is
// no `true` to match and no prop to name, the tell is in the RENDERED DOM, not in the source. That
// half of the class is closed where the initial DOM is real, in the rendering guard:
// `.discipline/rendering/smoke/no-default-open-smoke.mjs` (mounts the real matrix and fails if
// anything is `aria-selected` or if the panel exists before a click), and
// `.discipline/rendering/audit/open-state-sweep.mjs` (the same measurement across every registered
// mount). The two halves are complementary and neither is sufficient alone.
//
// THE ALLOW MARKER: `// fitness-allow: F43 (ruling)` on the initialiser's line or within the five
// lines above it. An allow must NAME ITS RULING. Two categories are legitimate, both from the
// coordinator's readings of the operator's words:
//
//   R3, the FILTERS rail. "UI FIX ROUND 2 item 4 states their default explicitly, 'first two groups
//   open, rest closed', and that is a control surface the reader filters with, not page content
//   that opened itself." NOTE, and this is a measurement, not an assumption: on this base there is
//   NO such site to mark. The rail's facet groups (src/components/list-surface/ListSurfaceRailCards.tsx)
//   are not collapsible per group at all, every group renders its options, and the only disclosure
//   in the file is the per-group "show the rest of the options" expander, which already starts
//   `useState(false)`. There is no `FiltersCard` in the tree. So the R3 allowance is stated here and
//   carries no entry, because the defect it protects does not exist yet; a lane that later builds
//   collapsible facet groups marks them with R3 and this comment is the citation it uses.
//
//   R4, a deep link. "A URL that names a section, an anchor, or an item may open exactly what it
//   names, because the reader asked for it. Arriving at the bare route may not." A component that
//   opens something BECAUSE THE URL NAMED IT is not this defect. It is also not a constant `true`,
//   so it does not usually match this gate at all; the one live instance in the app
//   (UserProfilePage's `?tab=` read, via lib/account/initial-tab.ts) initialises from
//   `window.location.search` and matches nothing here.
//
// NO EXPIRY, NO PATH ALLOWLIST. An allow is per-site and written next to the state it exempts, so
// the ruling that permits it is read at the same moment as the code it permits.

import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { isTestFile } from './F25-module-liveness.mjs';

const SCOPE_GLOBS = ['fsi-app/src/components/**/*.tsx'];

/** `const [name, setName] = useState(true|false)`, with or without a type argument. */
const USE_STATE_RE =
  /\b(?:const|let)\s*\[\s*([A-Za-z0-9_$]+)\s*,\s*[A-Za-z0-9_$]+\s*\]\s*=\s*useState\s*(?:<[^>()]*>)?\s*\(\s*(true|false)\s*\)/g;

/** `tocOpen` -> `toc open`, `isExpanded` -> `is expanded`, so a camelCase hump is a word boundary
 *  and the vocabulary below can be matched on whole words rather than on substrings. Matching on
 *  substrings is what makes this family of gate noisy: `reopenQueue` and `openingHours` are not
 *  disclosure state. */
export function nameWords(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_$]+/g, ' ')
    .toLowerCase();
}

/** A state name whose `true` means OPEN. WHOLE words after the camelCase split, both ends: matching
 *  a prefix instead is what turns `openingHours` into a violation. */
const OPENS_ON_TRUE = /(?:^|\s)(open|opened|expand|expanded|disclosed|disclosure|unfolded|revealed)(?:\s|$)/;
/** A state name whose `false` means OPEN. */
const OPENS_ON_FALSE = /(?:^|\s)(collapsed|closed)(?:\s|$)/;

/** Prop names that mean "start this open", in a destructuring default or at a JSX call site. */
const DEFAULT_OPEN_PROPS = [
  'defaultOpen',
  'defaultExpanded',
  'initialOpen',
  'initialExpanded',
  'expandedByDefault',
  'openByDefault',
  'defaultIndex',
];

const PROP_DEFAULT_RE = new RegExp(
  `\\b(${DEFAULT_OPEN_PROPS.join('|')})\\s*=\\s*(true|\\{\\s*true\\s*\\}|[0-9]+|\\{\\s*[0-9]+\\s*\\})(?![A-Za-z0-9_$])`,
  'g'
);
/** A bare boolean JSX prop: `<Thing defaultOpen>` is `defaultOpen={true}`. */
const PROP_BARE_RE = new RegExp(`<[A-Z][A-Za-z0-9_$.]*[^>]*?\\s(${DEFAULT_OPEN_PROPS.join('|')})(\\s|/|>)`, 'g');
/** `<details open>` / `<details open={...}>` / `<details className=".." open>`. */
const DETAILS_OPEN_RE = /<details(?![A-Za-z])[^>]*?\sopen(\s|=|\/|>)/g;

const ALLOW_RE = /fitness-allow:\s*F43\b/;
const ALLOW_LOOKBACK = 5;

/** Line number (1-based) of a character index. */
export function lineOf(content, index) {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i += 1) if (content[i] === '\n') line += 1;
  return line;
}

/** An allow marker on this line, or within the five lines above it. */
export function isAllowed(lines, line) {
  for (let i = line - 1; i >= 0 && i >= line - 1 - ALLOW_LOOKBACK; i -= 1) {
    if (i < lines.length && ALLOW_RE.test(lines[i])) return true;
  }
  return false;
}

/** Every default-open site in one file's source, as `{ line, what, detail }`. */
export function findDefaultOpenSites(content) {
  const out = [];
  const seen = new Set();
  const add = (index, what, detail) => {
    const line = lineOf(content, index);
    const key = `${line}:${what}:${detail}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ line, what, detail });
  };

  for (const m of content.matchAll(USE_STATE_RE)) {
    const [, name, value] = m;
    const words = nameWords(name);
    if (value === 'true' && OPENS_ON_TRUE.test(words)) {
      add(m.index, 'useState', `\`${name}\` starts \`true\``);
    } else if (value === 'false' && OPENS_ON_FALSE.test(words)) {
      add(m.index, 'useState', `\`${name}\` starts \`false\`, which is OPEN for that name`);
    }
  }
  for (const m of content.matchAll(PROP_DEFAULT_RE)) add(m.index, 'prop', `\`${m[1]}\` defaults open`);
  for (const m of content.matchAll(PROP_BARE_RE)) add(m.index, 'prop', `\`${m[1]}\` passed bare, which is \`true\``);
  for (const m of content.matchAll(DETAILS_OPEN_RE)) add(m.index, 'details', '`<details open>`');

  return out;
}

export const fitnessFunction = {
  id: 'F43',
  name: 'default-open-disclosure',
  description:
    'No component under src/components/** may initialise a disclosure to OPEN: a `useState` whose ' +
    'name carries open/expand starting `true` (or collapsed/closed starting `false`), a ' +
    'defaultOpen/defaultExpanded/initialOpen/expandedByDefault/openByDefault/defaultIndex prop ' +
    'defaulting truthy, or a `<details open>`. A page that arrives with something already opened is ' +
    'a defect wherever it happens. A legitimate case carries ' +
    '`// fitness-allow: F43 (ruling)` naming the ruling that permits it, R3 (the FILTERS rail\'s ' +
    'stated default) or R4 (the reader deep-linked it). No expiry, no path allowlist.',
  source:
    'Operator ruling 2026-09-08, verbatim: "the ops page opend to a sub category not just the main ' +
    'page, infastructure capacity and other items should be closed, no items expanded when first ' +
    'navigtaing to a page", /operations opened Infrastructure capacity with nobody having clicked',

  enumerate() {
    return globFiles(SCOPE_GLOBS).filter((f) => !isTestFile(f) && !f.includes('/_archive/'));
  },

  check(filepath, content) {
    const lines = content.split(/\r?\n/);
    const out = [];
    for (const site of findDefaultOpenSites(content)) {
      if (isAllowed(lines, site.line)) continue;
      out.push(
        violation(
          site.line,
          `Disclosure starts OPEN: ${site.detail}. Operator ruling 2026-09-08, "no items expanded ` +
            `when first navigtaing to a page", every content section, group, row and panel renders ` +
            `CLOSED on first navigation, site-wide. Start it closed, or mark this site ` +
            `\`// fitness-allow: F43 (ruling)\` naming the ruling: R3 for the FILTERS rail's stated ` +
            `"first two groups open" default, R4 for something the reader deep-linked. ` +
            `A default SELECTION that renders a panel is the same defect with no boolean to match; ` +
            `that half is caught in .discipline/rendering/smoke/no-default-open-smoke.mjs.`
        )
      );
    }
    return out;
  },
};
