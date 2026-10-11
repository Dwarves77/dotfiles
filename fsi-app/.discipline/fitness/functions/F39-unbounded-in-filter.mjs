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
import { isTestFile, latestTrainWave } from './F25-module-liveness.mjs';
import { getRepoRoot } from '../../lib/context.mjs';

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
  if (trimmed.startsWith('[')) {
    // An array literal is a fixed enum written inline, or a spread of a module-level constant
    // (`[...CONST]`). A spread of anything else (`[...ids]`, `[...byId.keys()]`) is a runtime list wearing
    // brackets: its size follows the data, so it is not bounded by shape (lane GATE-3, 2026-10-08; this
    // hole let `.in("url", [...wellFormedUrls])` in bulk-import/route.ts through unmarked until then).
    const spreads = [...trimmed.matchAll(/\.\.\.\s*([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
    return spreads.every((name) => ENUM_CONST_RE.test(name));
  }
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

// Facet A, formerly F38 (absorbed by REG-1, 2026-10-11): unbounded-supabase-read (CAP-1000, 2026-09-05, "two defects one cause" audit). PostgREST's
// db-max-rows setting caps ANY response at 1000 rows regardless of what `.limit(N)` asks for or whether
// the query carries no `.limit()`/`.range()` at all — PERF-13's `getPublicSurfaceSlugs`
// (`.limit(BUILD_TIME_SLUG_ENUM_LIMIT = 20000)`, live corpus 1,312+ regulations, only the first 1,000 ever
// prerendered) and the obligations register's `fetchObligationRegisterPage`
// (`OVERFETCH_CAP = 2000` then a JS-side filter/count over the truncated array — masthead read "60 of
// 1000" while the table held 1,141) are the two live instances that named this bug CLASS; this lane also
// found and fixed a third (`supabase-server.ts`'s `runCategoryRpc`/`runCategoryRpcPublic`, a bare unranged
// `.rpc()` call) and a fourth (`run-change-detection.mjs`'s `readPendingDrainRows`, an overflow count
// derived from a capped array's `.length` instead of an exact DB count). This guard is the mechanical
// backstop against a FIFTH: it registers every remaining `.limit(<literal or same-file ALL_CAPS
// constant> > 1000)` call site in src/+scripts/ with a classification (bounded-by-design, with why) and
// an expiry train/wave, exactly F17's size-cap-doctrine registry shape; a NEW unregistered site, or a
// registered site whose expiry has passed, is RED.
//
// SCOPE, STATED (not silently narrower than it looks): this mechanizes the literal-number half of the
// dispatch precisely ("`.limit(` with a literal > 1000"). It does NOT attempt to mechanically detect "a
// full-set read with no `.range()`/`.limit()` at all that expects the whole table" — the codebase has
// dozens of legitimate single-row/scalar `.rpc()` calls (`validate_item_provenance`, `get_surface_counts`,
// admin RPCs) that a generic "unranged .rpc()/.select() is RED" rule would flag as false positives on
// every run; building a reliable AST-level "is this a listing query" classifier is out of scope for a
// glob+regex fitness function. That half of the audit was done by hand this lane (every `.limit(`/full-
// table-read call site in fsi-app/src and fsi-app/scripts was read; see the CAP-1000 REPORT's audit
// table) and is backstopped structurally instead: every real listing/RPC site this lane found now routes
// through `fetchAllRows`/`exactCount` (src/lib/db/paginate.mjs), so a future full-table read written the
// SAME way (reusing that helper) is safe by construction, and a future one written the OLD way (a bare
// unranged call) still trips THIS gate the moment anyone adds a `.limit()` above 1000 to bound it "for
// safety" — the exact reflex that produced BUILD_TIME_SLUG_ENUM_LIMIT and OVERFETCH_CAP in the first place.

// A `.limit(N)` call with a bare numeric literal.
const LIMIT_LITERAL_RE = /\.limit\(\s*(\d+)\s*\)/g;
// A `.limit(NAME)` call with a SCREAMING_SNAKE_CASE identifier — this codebase's own constant-naming
// convention (BUILD_TIME_SLUG_ENUM_LIMIT, OVERFETCH_CAP, SERIES_HISTORY_LIMIT, ...). A lowercase/camelCase
// identifier is a parameter or local variable, not a module constant, and is out of this check's reach
// (tracing an arbitrary variable's value is not a regex's job) — same-file constant declarations only.
const LIMIT_IDENT_RE = /\.limit\(\s*([A-Z][A-Z0-9_]*)\s*\)/g;
// `const NAME = <number>` / `export const NAME = <number>` — resolves LIMIT_IDENT_RE's identifier to a
// literal value when the declaration and the call site live in the same file.
const CONST_DECL_RE = /(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*=\s*(\d+)\b/g;

const DB_MAX_ROWS = 1000;

// THE REGISTRY — every remaining `.limit(...)` call site above DB_MAX_ROWS, classified. Every entry MUST
// carry `expiry` (a train/wave number, F25's `latestTrainWave` oracle): once the landed history reaches or
// passes it, the entry REDS — "bounded by design" is a live judgment call re-confirmed on a cadence, not a
// permanent exemption wearing a temporary label (same posture F25 W7.1 established for module-liveness
// allowlist entries).
// 'fsi-app/scripts/verify/mint-gate-calibration.mjs' entry REMOVED (lane W71-A, 2026-09-05,
// docs/plans/complete-system-build-plan-2026-09-04.md §W7): the script had zero live callers (an
// operator CLI whose one historical use — the REPRESENTATIVE calibration that justified flipping the
// four mint-time gates live, per remediation-discipline SKILL.md RD-41 — already ran and is a matter of
// record; nothing in .github/workflows, package.json, or run-data-audit-lane.mjs's AUDITS table invokes
// it). Deleted with its F25-module-liveness.mjs allowlist entry rather than paged through
// fetchAllRows/exactCount, since there is no live caller left to page.
export const ALLOWLIST = [];

function allowlistEntry(file, limitExpr) {
  return ALLOWLIST.find((e) => e.file === file && e.limit === limitExpr);
}

/** Collect same-file `const NAME = <number>` bindings. PURE. @param {string} content */
export function collectConstNumbers(content) {
  const out = new Map();
  CONST_DECL_RE.lastIndex = 0;
  let m;
  while ((m = CONST_DECL_RE.exec(content)) !== null) out.set(m[1], Number(m[2]));
  return out;
}

/** Find every `.limit(...)` call site above `DB_MAX_ROWS`, resolving a same-file ALL_CAPS identifier to
 *  its declared numeric value. PURE — no filesystem, no git. Returns `{ line, limitExpr, value }[]`,
 *  `limitExpr` the exact text inside `.limit(...)` (a literal number, or the identifier name) — the key
 *  ALLOWLIST entries match on. @param {string} content */
export function findOversizedLimitCalls(content) {
  const consts = collectConstNumbers(content);
  const lines = content.split(/\r?\n/);
  const out = [];
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
    LIMIT_LITERAL_RE.lastIndex = 0;
    let m;
    while ((m = LIMIT_LITERAL_RE.exec(line)) !== null) {
      const value = Number(m[1]);
      if (value > DB_MAX_ROWS) out.push({ line: i + 1, limitExpr: m[1], value });
    }
    LIMIT_IDENT_RE.lastIndex = 0;
    while ((m = LIMIT_IDENT_RE.exec(line)) !== null) {
      const name = m[1];
      if (!consts.has(name)) continue; // not a same-file constant (imported, or a runtime param) — out of reach
      const value = consts.get(name);
      if (value > DB_MAX_ROWS) out.push({ line: i + 1, limitExpr: name, value });
    }
  });
  return out;
}

let cachedLatestWave; // memoized across check() calls in one runner invocation — one `git log`, not one per file
function resolveLatestWave(root) {
  if (cachedLatestWave === undefined) cachedLatestWave = latestTrainWave(root);
  return cachedLatestWave;
}


/** Facet A (formerly F38 unbounded-supabase-read): violations for an oversized .limit() call. */
export function checkUnboundedLimit(filepath, content) {
    const out = [];
    const root = getRepoRoot();
    const latestWave = resolveLatestWave(root);

    for (const site of findOversizedLimitCalls(content)) {
      const lineText = content.split(/\r?\n/)[site.line - 1] ?? '';
      if (isOverridden(lineText, 'F38')) continue;
      const entry = allowlistEntry(filepath, site.limitExpr);
      if (!entry) {
        out.push(
          violation(
            site.line,
            `.limit(${site.limitExpr}) = ${site.value} rows is ABOVE PostgREST's 1000-row db-max-rows ceiling — ` +
              `a request for ${site.value} silently returns at most 1000 regardless (the PERF-13/OVERFETCH_CAP ` +
              `defect class). If this must page past 1000, route it through fetchAllRows/exactCount ` +
              `(src/lib/db/paginate.mjs). If it is genuinely bounded by design, add it to F38's ALLOWLIST with a ` +
              `reason and an expiry train/wave, or mark the line \`// fitness-allow: F38 (reason)\`.`
          )
        );
        continue;
      }
      if (latestWave !== null && latestWave >= entry.expiry) {
        out.push(
          violation(
            site.line,
            `F38 ALLOWLIST ENTRY EXPIRED — ${filepath}'s .limit(${entry.limit}) allowlist entry (expiry wave${entry.expiry}) ` +
              `has passed (latest landed: wave${latestWave}). Re-confirm it is still bounded by design and grant a fresh ` +
              `expiry with a current reason, page it through fetchAllRows/exactCount instead, or remove the site — an ` +
              `expiry nobody returns to is a permanent exemption wearing a temporary label.`
          )
        );
      }
    }
    return out;
}


/** Facet B (the original F39 unbounded-in-filter): violations for an unbounded runtime .in() list. */
export function checkUnboundedIn(filepath, content) {
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
}

export const fitnessFunction = {
  id: 'F39',
  name: 'unbounded-supabase-reads',
  description:
    'Unbounded Supabase reads. Facet A (formerly F38): every `.limit(N)` call above PostgREST db-max-rows ' +
    '(1000), a bare literal or a same-file SCREAMING_SNAKE_CASE constant, is RED unless registered or marked ' +
    '`// fitness-allow: F38 (reason)`. Facet B: every `.in(col, X)` call in scripts/**+src/** whose X is a runtime value (not an array literal, ' +
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
    return [...checkUnboundedLimit(filepath, content), ...checkUnboundedIn(filepath, content)];
  },
};
