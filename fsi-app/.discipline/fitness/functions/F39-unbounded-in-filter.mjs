// F39: unbounded-in-filter (IN-CHUNK, 2026-09-06). A PostgREST `.in(col, list)` filter serialises
// `list` into the request's URL query string. `list` is a runtime array of ids: past roughly 2,000
// UUIDs (~80 KB) or any long-URL list, the gateway answers 400 Bad Request, or an HTML error page —
// NOT a retryable/transient failure. This happened twice CONFIRMED: the four review-apply-*.mjs
// wrappers (run 34045479342, 911-id post-apply read-back, 400 Bad Request AFTER the chunked write had
// already succeeded — see db.mjs's readAllByIds header) and census-off-vertical.mjs (Maintenance run
// 34046850770, 1,655-id read-back, "paginated read failed at offset 0: <!DOCTYPE html>" — same shape,
// a different table). Both times the WRITE succeeded and only the READ-BACK choked, so the class is
// dangerous precisely because it surfaces after the mutation, not before it.
//
// THE FIX, already built and reused by this gate: db.mjs's readAllByIds (chunked id-list read, mirrors
// guardedUpdateByIds' write-side chunking) and guardedUpdateByIds/guardedDelete (chunked writes/deletes)
// are the ONE place list-chunking is implemented for scripts/**; src/lib/db/paginate.mjs's fetchAllRows
// is the transport-agnostic core both `.mjs` and `.ts` callers build on, and assertBound is the .ts-side
// structural proof that a call site's list is bounded by something upstream (a request-scoped LIMIT
// clamp, a prior bounded read) rather than by assumption.
//
// WHAT THIS GATE DOES: registers every `.in(col, X)` call in scripts/** and src/** whose second
// argument X is NOT an array literal (`[...]`), NOT a string/template literal, and NOT a same-file
// SCREAMING_SNAKE_CASE enum constant (this codebase's own literal-enum convention — CLAIM_KIND_FILTER,
// NEW_REQUIRED_ITEM_TYPES, SOURCEY_ARCHIVE_REASONS and the like are fixed-size vocabularies, not
// runtime-scaled ids, the same convention F38 already trusts for `.limit(CONST)`). X is then a runtime
// value — a variable, a property access, a function call — whose size follows the DATA, not the code.
// A site is GREEN only when:
//   (a) it lives inside db.mjs's readAllByIds/guardedUpdateByIds/guardedDelete or
//       src/lib/db/paginate.mjs's fetchAllRows core (the chunking implementations themselves), or
//   (b) it carries a `// fitness-allow: F39 (reason)` marker — same line or the line directly above —
//       naming why the list is provably bounded (a request-scoped LIMIT clamp asserted via
//       assertBound, an ad hoc chunked-slice loop already capping the list below a safe size, a
//       same-file small literal set built inline rather than declared as a constant).
//
// NO ALLOWLIST, NO EXPIRY (unlike F38's ALLOWLIST-with-expiry shape): rule 13-18's directive for this
// class is explicit — a site that cannot be proven bounded gets FIXED, not allowlisted, and a flag that
// dissolves under evidence gets corrected in place, never quietly exempted with a countdown. The marker
// is not a bypass; it is the one-line proof left in the code next to the thing it proves, checked again
// on every run against the ACTUAL file (not a registry that drifts from it).

import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { isOverridden } from '../lib/file-content.mjs';
import { isTestFile } from './F25-module-liveness.mjs';

const SCOPE_GLOBS = ['fsi-app/src/**/*.{ts,tsx,mjs}', 'fsi-app/scripts/**/*.mjs'];

// The chunking implementations themselves — a `.in(` call written INSIDE these files is the fix, not
// an instance of the defect. Exact repo-relative paths (not a directory prefix) so nothing else in
// scripts/lib/ or src/lib/db/ is accidentally exempted by living nearby.
const IMPLEMENTATION_FILES = new Set([
  'fsi-app/scripts/lib/db.mjs',
  'fsi-app/src/lib/db/paginate.mjs',
]);

const IN_CALL_RE = /\.in\(\s*((?:"[^"]*"|'[^']*'|`[^`]*`))\s*,\s*([^)]*)\)/g;

// A bare SCREAMING_SNAKE_CASE identifier — this codebase's own literal-enum-constant convention
// (CLAIM_KIND_FILTER, NEW_REQUIRED_ITEM_TYPES, SOURCEY_ARCHIVE_REASONS, REG_TYPES, ...): a fixed-size
// vocabulary declared once, not a runtime id list. Matches F38's identical trust of ALL_CAPS constants.
const ENUM_CONST_RE = /^[A-Z][A-Z0-9_]*$/;

/** True when `arg` (the exact text of .in()'s second argument) is something OTHER than a runtime,
 *  unbounded-by-construction value: an array literal, a string/template literal, or a same-file
 *  SCREAMING_SNAKE_CASE enum constant. PURE. @param {string} arg */
export function isBoundedArgShape(arg) {
  const trimmed = arg.trim();
  if (trimmed.startsWith('[')) return true; // array literal — a fixed enum written inline
  if (/^(?:"[^"]*"|'[^']*'|`[^`]*`)$/.test(trimmed)) return true; // a single string/template literal
  if (ENUM_CONST_RE.test(trimmed)) return true; // same-file/imported SCREAMING_SNAKE_CASE constant
  return false;
}

/** Find every `.in(col, X)` call in `content` whose X is NOT a bounded shape (array literal, string
 *  literal, or SCREAMING_SNAKE_CASE constant) — a runtime value with no cap visible at the call site.
 *  PURE — no filesystem, no git. Returns `{ line, col, argText }[]`. @param {string} content */
export function findUnboundedInCalls(content) {
  const lines = content.split(/\r?\n/);
  const out = [];
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
    IN_CALL_RE.lastIndex = 0;
    let m;
    while ((m = IN_CALL_RE.exec(line)) !== null) {
      const [, colExpr, argExpr] = m;
      if (isBoundedArgShape(argExpr)) continue;
      out.push({ line: i + 1, col: colExpr, argText: argExpr.trim() });
    }
  });
  return out;
}

/** Same-line OR preceding-line `// fitness-allow: F39 (reason)` marker. @param {string[]} lines
 *  @param {number} lineIndex 0-based index of the .in() call's line */
function isMarked(lines, lineIndex) {
  if (isOverridden(lines[lineIndex] ?? '', 'F39')) return true;
  if (lineIndex > 0 && isOverridden(lines[lineIndex - 1] ?? '', 'F39')) return true;
  return false;
}

export const fitnessFunction = {
  id: 'F39',
  name: 'unbounded-in-filter',
  description:
    'Every `.in(col, X)` call in scripts/**+src/** whose X is a runtime value (not an array literal, ' +
    'string literal, or SCREAMING_SNAKE_CASE enum constant) must live inside db.mjs\'s ' +
    'readAllByIds/guardedUpdateByIds/guardedDelete or paginate.mjs\'s fetchAllRows core, or carry a ' +
    '`// fitness-allow: F39 (reason)` marker (same line or the line above) naming why the list is ' +
    'provably bounded. No allowlist, no expiry — an unbounded id list serialises into the PostgREST ' +
    'request URL and 400s past ~2,000 UUIDs; a site that cannot be proven bounded gets fixed.',
  source: 'IN-CHUNK, 2026-09-06 (review-apply run 34045479342; census-off-vertical run 34046850770)',

  enumerate() {
    // Test files excluded (same posture as F38): fixture arrays and in-memory mock query builders in a
    // .test.mjs are not live PostgREST call sites, and flagging them would only invite noise markers.
    return globFiles(SCOPE_GLOBS).filter((f) => !isTestFile(f) && !f.includes('/_archive/'));
  },

  check(filepath, content) {
    if (IMPLEMENTATION_FILES.has(filepath)) return [];
    const out = [];
    const lines = content.split(/\r?\n/);
    for (const site of findUnboundedInCalls(content)) {
      if (isMarked(lines, site.line - 1)) continue;
      out.push(
        violation(
          site.line,
          `.in(${site.col}, ${site.argText}) — the second argument is a runtime value with no cap ` +
            `visible at this call site (the IN-CHUNK defect class: an oversized .in() filter serialises ` +
            `into ONE PostgREST request URL and 400s past ~2,000 UUIDs, confirmed twice — run ` +
            `34045479342 and run 34046850770). Route the read through readAllByIds, the write/delete ` +
            `through guardedUpdateByIds/guardedDelete (scripts/lib/db.mjs), or a chunked fetchAllRows ` +
            `caller (src/lib/db/paginate.mjs) for a .ts route; or, if this list is provably bounded ` +
            `(e.g. a request-scoped LIMIT clamp asserted via assertBound, an already-chunked slice), ` +
            `mark it \`// fitness-allow: F39 (reason)\` on this line or the line above — never allowlist it.`
        )
      );
    }
    return out;
  },
};
