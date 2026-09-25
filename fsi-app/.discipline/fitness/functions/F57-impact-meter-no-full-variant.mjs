// F57: impact-meter-no-full-variant (lane PARITY-PARTS, 2026-09-24, invariant RD-84).
//
// Operator check 3: "One stepped meter out of 12: no four-bar block, no 'four scored dimensions'
// text." ImpactMeter.tsx carries two variants: the row/rail meter (default, a single stepped bar
// out of 12, the ONE the artboards draw everywhere) and a retired `variant="full"` (four separate
// per-dimension bars, Cost/Compliance/Client-facing/Operational). [CONFIRMED, 2026-09-24, by the
// artboard-parity harness against a local build]: every detail-rail ImpactRailCard call site had
// already been ported off `variant="full"` before this function was written, and DetailShell's own
// npmtest (a stale assertion this lane fixed in the same session) used to REQUIRE the opposite -
// that the four-bar block stay mounted. This is the class fix: a static, source-level gate so
// `variant="full"` can never re-enter a live call site again, not just a memory of having removed
// it once. `ImpactMeter.tsx`'s OWN definition of the variant, and its sibling test file exercising
// it directly, are excluded - the variant type itself is not retired (a future dedicated
// "full impact breakdown" page could still request it deliberately); what is forbidden is a LIVE
// application surface mounting it silently.
import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { isTestFile } from './F25-module-liveness.mjs';

const SCOPE_GLOBS = ['fsi-app/src/**/*.tsx', 'fsi-app/src/**/*.ts'];

// The component's own definition file and its Storybook-less sibling test are not a "live mount" -
// they are the variant's own declaration and the direct-unit-test proving it still renders when
// asked. Any OTHER file that writes `<ImpactMeter ... variant="full"` is a live application surface
// remounting the retired four-bar block.
const EXEMPT_FILES = new Set([
  'fsi-app/src/components/ui/ImpactMeter.tsx',
]);

// Matches the OPEN of an ImpactMeter tag; the attribute list is then scanned up to the tag's own
// close (`/>` or `>`), across line breaks, a multi-line-formatted mount (props one per line, the
// prevailing style in this codebase's larger components) is not a blind spot.
const TAG_OPEN_RE = /<ImpactMeter\b/g;

/** Find every line in `content` mounting ImpactMeter with variant="full", including a mount whose
 *  props are formatted one per line. Skips a tag that opens on a comment-only line (a historical
 *  mention in prose is not a live call site). PURE, no filesystem, no git.
 *  @param {string} content
 *  @returns {number[]} 1-based line numbers */
export function findFullVariantMounts(content) {
  const src = String(content ?? '');
  const out = [];
  let m;
  TAG_OPEN_RE.lastIndex = 0;
  while ((m = TAG_OPEN_RE.exec(src))) {
    const tagStart = m.index;
    const lineStart = src.lastIndexOf('\n', tagStart) + 1;
    const linePrefix = src.slice(lineStart, tagStart);
    if (/^\s*(\/\/|\*)/.test(linePrefix)) continue; // tag opens on a comment-only line
    // The tag's own close: the first `>` not inside a `{...}` expression or a quoted string, found
    // by a small bracket/quote-depth scan (JSX attribute values commonly contain `>` inside `{}`,
    // e.g. a comparison in an inline expression, which a naive indexOf('>') would stop at early).
    let depth = 0;
    let quote = null;
    let end = -1;
    for (let i = tagStart; i < src.length; i++) {
      const c = src[i];
      if (quote) {
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (c === '{') { depth++; continue; }
      if (c === '}') { depth--; continue; }
      if (c === '>' && depth === 0) { end = i; break; }
    }
    if (end === -1) continue; // unterminated tag (malformed source); nothing to check
    const tagText = src.slice(tagStart, end + 1);
    if (/\bvariant="full"/.test(tagText)) {
      const lineNo = src.slice(0, tagStart).split('\n').length;
      out.push(lineNo);
    }
  }
  return out;
}

export const fitnessFunction = {
  id: 'F57',
  name: 'impact-meter-no-full-variant',
  description:
    'No live application surface mounts <ImpactMeter variant="full"> (the retired four-bar ' +
    'per-dimension block). Operator check 3 (lane PARITY-PARTS, 2026-09-24): impact is ONE stepped ' +
    'meter out of 12 everywhere, the same row variant every list row already draws - never a ' +
    'four-bar block, never "four scored dimensions" text. ImpactMeter.tsx itself (the variant\'s own ' +
    'declaration) and its direct unit test are exempt; every other .ts/.tsx file is a live surface.',
  source: 'docs/ops/session-log.md, 2026-09-24 operator rulings; invariant RD-84',

  enumerate() {
    return globFiles(SCOPE_GLOBS).filter((f) => !isTestFile(f) && !EXEMPT_FILES.has(f));
  },

  check(filepath, content) {
    const out = [];
    for (const line of findFullVariantMounts(content)) {
      out.push(
        violation(
          line,
          'live surface mounts <ImpactMeter variant="full">, the retired four-bar per-dimension ' +
            'block operator check 3 (2026-09-24) forbids. Mount the default (row/stepped) variant ' +
            'instead, matching ImpactRailCard.tsx.'
        )
      );
    }
    return out;
  },
};
