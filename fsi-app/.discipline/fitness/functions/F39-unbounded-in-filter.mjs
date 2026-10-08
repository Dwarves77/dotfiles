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
//   (b) its list is BOUNDED BY SHAPE (lane GATE-3, 2026-10-08; measured: of 5 CI firings in 30 days, 3 were
//       false positives, each a list the gate could not see was capped, and the 136 markers it had
//       accumulated were mostly the same fact restated). The list is bounded when it is
//         - `<expr>.slice(0, N)` with N a literal <= 500 (SLICE_CAP);
//         - a spread or copy of a module-level SCREAMING_SNAKE constant (`[...CONST]`, `Array.from(CONST)`);
//         - or the call sits inside the callback of fetchAllByIdChunks(...) or readAllByIds(...), the two
//           chunking helpers, whose callback only ever receives one chunk; or
//   (c) it carries a `// fitness-allow: F39 (reason)` marker - same line or the line directly above -
//       naming why the list is provably bounded (a request-scoped LIMIT clamp asserted via
//       assertBound, a same-file small literal set built inline rather than declared as a constant).
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

// The largest literal `.slice(0, N)` that still reads as bounded: 500 ids is ~20 KB of URL, an order of
// magnitude under the ~2,000-id failure the class is about. db.mjs's own default chunk is 50.
export const SLICE_CAP = 500;

// The argument text handed to isBoundedArgShape is the FULL second argument (parens balanced, see
// findUnboundedInCalls); the optional `)` below also accepts the truncated tail IN_CALL_RE's own capture
// produces (`ids.slice(0, 200`), which is what a caller that only has the regex capture would pass.
const SLICE_TAIL_RE = /\.slice\(\s*0\s*,\s*(\d+)\s*\)?\s*$/;
const ARRAY_FROM_CONST_RE = /^Array\.from\(\s*[A-Z][A-Z0-9_]*\s*\)?\s*$/;

// The two chunking helpers whose callback only ever receives ONE chunk of ids.
const CHUNKING_CALLERS = ['fetchAllByIdChunks', 'readAllByIds'];

/** True when `arg` (the exact text of .in()'s second argument) is something OTHER than a runtime,
 *  unbounded-by-construction value: an array literal, a string/template literal, a same-file
 *  SCREAMING_SNAKE_CASE enum constant, a literal `.slice(0, N)` with N <= SLICE_CAP, or a copy of a
 *  SCREAMING_SNAKE constant (`Array.from(CONST)`). PURE. @param {string} arg */
export function isBoundedArgShape(arg) {
  const trimmed = arg.trim();
  // An array literal: a fixed enum written inline, or `[...CONST]`. NOTE (lane GATE-3, 2026-10-08): this
  // also lets `[...runtimeIds]` through, a hole; closing it would newly fail
  // src/app/api/admin/sources/bulk-import/route.ts line 379 (`.in("url", [...wellFormedUrls])`), a file
  // outside this lane's write set, so it is recorded in the lane report instead of changed here.
  if (trimmed.startsWith('[')) return true;
  if (/^(?:"[^"]*"|'[^']*'|`[^`]*`)$/.test(trimmed)) return true; // a single string/template literal
  if (ENUM_CONST_RE.test(trimmed)) return true; // same-file/imported SCREAMING_SNAKE_CASE constant
  if (ARRAY_FROM_CONST_RE.test(trimmed)) return true; // a copy of a module-level constant
  const slice = SLICE_TAIL_RE.exec(trimmed);
  if (slice && Number(slice[1]) <= SLICE_CAP) return true; // a literal head slice no larger than SLICE_CAP
  return false;
}

/** Index just past the `)` that closes the `(` at `openIdx`, scanning `text` while skipping string,
 *  template and comment text; -1 when it never closes (the span is then ignored, never guessed). PURE. */
function closingParen(text, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (c === '/' && n === '/') { const e = text.indexOf('\n', i); if (e === -1) return -1; i = e; continue; }
    if (c === '/' && n === '*') { const e = text.indexOf('*/', i + 2); if (e === -1) return -1; i = e + 1; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < text.length && text[j] !== c) { if (text[j] === '\\') j++; j++; }
      if (j >= text.length) return -1;
      i = j;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return i + 1; }
  }
  return -1;
}

/** The [start, end) character spans of every `fetchAllByIdChunks(...)` / `readAllByIds(...)` call in
 *  `content`: a `.in()` written inside one is inside the helper's per-chunk callback. PURE. */
export function chunkingCallbackSpans(content) {
  const spans = [];
  for (const name of CHUNKING_CALLERS) {
    const re = new RegExp(`\\b${name}\\s*\\(`, 'g');
    let m;
    while ((m = re.exec(content)) !== null) {
      // a mention inside a comment is not a call (its text could even be unbalanced)
      const before = content.slice(content.lastIndexOf('\n', m.index) + 1, m.index);
      if (before.includes('//') || /^\s*(?:\*|\/\*)/.test(before)) continue;
      // ...nor is a mention inside a string literal (an odd number of quote characters precede it)
      if (['"', "'", '`'].some((q) => before.split(q).length % 2 === 0)) continue;
      const open = m.index + m[0].length - 1;
      const end = closingParen(content, open);
      if (end !== -1) spans.push([open, end]);
    }
  }
  return spans;
}

/** Find every `.in(col, X)` call in `content` whose X is NOT bounded (see isBoundedArgShape) and which is
 *  not written inside the callback of a chunking helper (chunkingCallbackSpans) - a runtime value with no
 *  cap visible at the call site. PURE - no filesystem, no git. Returns `{ line, col, argText }[]`.
 *  @param {string} content */
export function findUnboundedInCalls(content) {
  const lines = content.split(/\r?\n/);
  const spans = chunkingCallbackSpans(content);
  const out = [];
  let lineStart = 0;
  lines.forEach((line, i) => {
    const thisStart = lineStart;
    lineStart += line.length + (content[lineStart + line.length] === '\r' ? 2 : 1);
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
    IN_CALL_RE.lastIndex = 0;
    let m;
    while ((m = IN_CALL_RE.exec(line)) !== null) {
      const [, colExpr, truncatedArg] = m;
      // Extend the capture to the real second argument when its parens balance on this line, so a nested
      // call (`rows.map((r) => r.id).slice(0, 200)`) is classified on its whole text, not on the tail the
      // first `)` cut off. When they do not balance on the line, the regex capture stands, as before.
      const openIdx = m.index + '.in'.length;
      const closeIdx = closingParen(line, openIdx);
      const argStart = m.index + m[0].indexOf(',', m[0].indexOf(colExpr) + colExpr.length) + 1;
      const argExpr = closeIdx !== -1 && argStart <= closeIdx - 1 ? line.slice(argStart, closeIdx - 1) : truncatedArg;
      if (isBoundedArgShape(argExpr)) continue;
      const abs = thisStart + m.index;
      if (spans.some(([s, e]) => abs > s && abs < e)) continue; // inside a fetchAllByIdChunks/readAllByIds callback
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
    'string literal, SCREAMING_SNAKE_CASE enum constant, `.slice(0, N)` with N <= 500, or a copy of a ' +
    'module-level constant) must live inside db.mjs\'s readAllByIds/guardedUpdateByIds/guardedDelete or ' +
    'paginate.mjs\'s fetchAllRows core, sit inside the callback of fetchAllByIdChunks/readAllByIds, or ' +
    'carry a `// fitness-allow: F39 (reason)` marker (same line or the line above) naming why the list ' +
    'is provably bounded. No allowlist, no expiry - an unbounded id list serialises into the PostgREST ' +
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
