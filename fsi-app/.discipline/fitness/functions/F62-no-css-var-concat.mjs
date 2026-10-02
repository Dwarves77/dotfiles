// F62: no-css-var-concat (lane R12-13, 2026-10-01, CF-BROKEN-2 / A6).
//
// THE DEFECT CLASS. 24 sites across src/components/sources/** and
// src/components/resource/IntelligenceMetadataStrip.tsx built an inline-style tint by
// string-concatenating a bare percentage onto a `var(--token)` reference, e.g.
// `"var(--color-error)" + "15"` -> `"var(--color-error)15"`. That string terminates the var()
// reference at its closing paren; the trailing digits are not CSS syntax of any kind, so the
// browser drops the whole declaration and the tint never painted. A second instance of the same
// shape (CF-BROKEN-2 / A2bc) appended a raw two-digit alpha suffix directly onto a `var(--token)`
// string in `timeline-dot-styles.ts`'s `nextDotStyle` (the "next milestone" ring), which is the
// SAME defect with the digits glued on by template-literal interpolation instead of `+`
// concatenation: `var(--immediate)33` is exactly as invalid as `var(--immediate)` + "33".
//
// THE FIX, root cause not symptom: src/lib/tint.ts's `tint(cssVar, percent)` builds
// `color-mix(in srgb, var(--token) percent%, transparent)`, a real CSS value, for the inline-style
// sites; the two `nextDotStyle` call sites were repointed from `band.cssVar` (a var() reference) to
// `band.hex` (the raw hex literal `UrgencyBand` already carries), which is what that function's own
// alpha-suffix trick actually requires.
//
// THIS FUNCTION is the static gate so the shape cannot re-enter either call pattern silently:
//   (a) a string literal of the form `var(--token)` immediately followed by one to three digits
//       (the original concatenation shape, with or without a `+`; the `+` disappears once the parts
//       are literal strings next to each other, so matching the resulting literal catches both the
//       `"a" + "b"` and the plain adjacent-literal forms);
//   (b) the same shape appearing inside a template literal, e.g. `` `${x}var(--token)33` `` or a
//       bare `` `var(--token)33` `` segment, which is what `nextDotStyle`'s old body matched.
// `tint.ts`'s own file is exempt (it documents the defect shape in a comment, by design, and must
// not trip the gate it defines). See EXEMPT_FILES.
//
// COST: filesystem only, no network, no database, no model call.
import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { isTestFile } from './F25-module-liveness.mjs';

const SCOPE_GLOBS = ['fsi-app/src/**/*.tsx', 'fsi-app/src/**/*.ts'];

// tint.ts documents the defect shape verbatim in its own header comment (by design, so a reader
// hits the rationale next to the fix); that documentation string must not trip the gate it defines.
const EXEMPT_FILES = new Set(['fsi-app/src/lib/tint.ts']);

// Matches `var(--some-token)` immediately followed by 1-3 digits, with no operator, space, or
// delimiter between the closing paren and the digit run: the exact shape that silently drops the
// whole CSS declaration. Deliberately does NOT match `var(--token) 50%` (a real color-mix() /
// calc() argument, space before the number) or `var(--token), 50` (a real comma-separated list),
// since both have a non-digit character directly after the paren, so both are untouched by this gate.
const VAR_CONCAT_RE = /var\(--[a-zA-Z0-9_-]+\)\d{1,3}/g;

/** Find every line in `content` carrying the var()-immediately-followed-by-digits shape, inside a
 *  plain string literal OR a template literal. PURE, no filesystem, no git.
 *  @param {string} content
 *  @returns {number[]} 1-based line numbers */
export function findCssVarConcat(content) {
  const src = String(content ?? '');
  const out = [];
  let m;
  VAR_CONCAT_RE.lastIndex = 0;
  while ((m = VAR_CONCAT_RE.exec(src))) {
    const lineNo = src.slice(0, m.index).split('\n').length;
    out.push(lineNo);
  }
  return out;
}

export const fitnessFunction = {
  id: 'F62',
  name: 'no-css-var-concat',
  description:
    'No source file builds a color by concatenating digits directly onto a `var(--token)` ' +
    'reference (`"var(--token)" + "NN"` or the equivalent template-literal shape); that string is ' +
    'not valid CSS and the browser silently drops the whole declaration (CF-BROKEN-2). Use ' +
    'src/lib/tint.ts\'s `tint(cssVar, percent)` helper (color-mix()) for an inline-style tint, or a ' +
    'raw hex literal (e.g. `UrgencyBand.hex`) when the call site needs to append its own suffix.',
  source: 'docs/plans/remediation-plan-2026-09-30.md Lane 13; CF-BROKEN-2; A2bc finding A6',

  enumerate() {
    return globFiles(SCOPE_GLOBS).filter((f) => !isTestFile(f) && !EXEMPT_FILES.has(f));
  },

  check(filepath, content) {
    const out = [];
    for (const line of findCssVarConcat(content)) {
      out.push(
        violation(
          line,
          'concatenates digits directly onto a var(--token) reference, which is not valid CSS and ' +
            'silently drops the declaration. Use tint(cssVar, percent) from src/lib/tint.ts, or pass ' +
            'a raw hex literal (e.g. UrgencyBand.hex) if the call site appends its own suffix.',
        ),
      );
    }
    return out;
  },
};
