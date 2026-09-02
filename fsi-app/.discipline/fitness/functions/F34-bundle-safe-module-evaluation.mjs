// F34: BUNDLE-SAFE MODULE EVALUATION. Coordinator, 2026-09-02, after the production incident that
// followed PR #533: `src/lib/market/refresh-published-price-statistics.mjs` read
// `scripts/mint/item-type-required-slots.json` and `series-item-map.json` with readFileSync AT MODULE
// EVALUATION (a top-level `const X = JSON.parse(readFileSync(...))`). That module sits on every page's
// import graph (series-board-view-model.mjs → data.ts), the serverless bundle carries imports and not
// runtime file reads, and under Turbopack `import.meta.url` resolves to the chunk rather than the source
// file, so the first request after the deploy threw ENOENT and carosledge.com answered 500 on every route.
// Every gate we run (suite, tsc, fitness, rendering guard, goldens) executes under Node where the file
// exists; none of them exercised the bundle. This function is the mechanical gate for that class.
//
// RULE. A non-test module under fsi-app/src must not call a synchronous or awaited filesystem function
// at module scope. A filesystem call INSIDE a function body is out of scope here (it runs only when
// called, and the caller owns the path); a call at module scope runs on import, on every page that
// transitively imports the module, with no way to catch it. Detected: an import of `fs`/`node:fs`/
// `fs/promises` (or a require of it) plus a call to one of FS_CALLS at brace depth 0, counting only
// scope braces (function/class/block), not object-literal braces, so `const X = { a: readFileSync() }`
// is still caught while `function f() { readFileSync() }` is not. Strings, template literals and
// comments are stripped before scanning so a mention in prose never fires.
//
// ALLOWLIST. `src/lib/connections/derive-tags.mjs` reads two vocab source files at import time (a
// deliberate fail-closed design, 2026-08) and is reachable today from no page: it is listed with that
// basis so this gate is honest about the one latent instance rather than silently green. Adding to the
// allowlist is a reviewed code change and must cite why the module can never reach a page.
//
// COST: filesystem only. Per-file: enumerate() lists candidates, check(file, content) scans one.

import { violation, PASS } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';

export const FS_CALLS = [
  'readFileSync', 'readdirSync', 'existsSync', 'statSync', 'lstatSync', 'accessSync', 'openSync',
  'readFile', 'readdir', 'stat', 'access', 'open',
];

export const ALLOWLIST = Object.freeze({
  'fsi-app/src/lib/connections/derive-tags.mjs':
    'Reads parse-output.ts / system-prompt.ts at import (fail-closed vocab load, 2026-08). Reachable from ' +
    'no page (grep: only flag-namespaces.mjs shares the directory; no app import). Latent instance of the ' +
    'F34 class, recorded not hidden; the durable fix is a data module, tracked in Addendum 84 postscript 16.',
});

const FS_IMPORT_RE =
  /(?:from\s*['"](?:node:)?fs(?:\/promises)?['"]|require\(\s*['"](?:node:)?fs(?:\/promises)?['"]\s*\))/;

/** Strip block comments, line comments, string literals and template literals (keeping newlines so line
 *  numbers survive). Pure. */
export function stripNoise(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === '/' && c2 === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
      continue;
    }
    if (c === '/' && c2 === '/') {
      const end = src.indexOf('\n', i);
      const stop = end === -1 ? n : end;
      out += ' '.repeat(stop - i);
      i = stop;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      let j = i + 1;
      let closed = false;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === q) { closed = true; break; }
        if (q !== '`' && src[j] === '\n') break; // unterminated single-line string: stop before the newline
        j += 1;
      }
      const bodyEnd = Math.min(j, n);
      out += q + src.slice(i + 1, bodyEnd).replace(/[^\n]/g, ' ') + (closed ? q : '');
      i = closed ? bodyEnd + 1 : bodyEnd;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** True when the character before index i (skipping whitespace) means the `{` at i opens an object
 *  literal rather than a scope. Pure. */
function opensObjectLiteral(s, i) {
  let k = i - 1;
  while (k >= 0 && /\s/.test(s[k])) k -= 1;
  if (k < 0) return false;
  const ch = s[k];
  if ('=(,:[?'.includes(ch)) return true;
  if (ch === '>' && s[k - 1] === '=') return false; // arrow body: a scope
  const word = s.slice(Math.max(0, k - 6), k + 1).match(/(return|yield|typeof|await|in|of)$/);
  return Boolean(word);
}

/**
 * Module-scope filesystem calls in one module's source. Returns [{ line, call }]. Pure.
 * Scope depth counts function/class/block braces only (see opensObjectLiteral); object-literal braces
 * are pushed on the same stack but do not raise the depth, so their contents are still scanned.
 */
export function findModuleScopeFsCalls(src) {
  const s = stripNoise(src);
  if (!FS_IMPORT_RE.test(src)) return []; // raw source: stripNoise blanks the specifier string
  const callRe = new RegExp(`(?<![.\\w$])(?:fs\\.)?(${FS_CALLS.join('|')})\\s*\\(`, 'g');
  const hits = [];
  const stack = []; // true = scope brace, false = object-literal brace
  let depth = 0;
  let segStart = 0;
  const lineAt = (idx) => (s.slice(0, idx).match(/\n/g) || []).length + 1;
  const scan = (from, to) => {
    if (depth !== 0 || to <= from) return;
    const seg = s.slice(from, to);
    callRe.lastIndex = 0;
    let m;
    while ((m = callRe.exec(seg))) hits.push({ line: lineAt(from + m.index), call: m[1] });
  };
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (c === '{') {
      scan(segStart, i);
      const isScope = !opensObjectLiteral(s, i);
      stack.push(isScope);
      if (isScope) depth += 1;
      segStart = i + 1;
    } else if (c === '}') {
      scan(segStart, i);
      const wasScope = stack.pop();
      if (wasScope) depth = Math.max(0, depth - 1);
      segStart = i + 1;
    }
  }
  scan(segStart, s.length);
  return hits;
}

const TEST_RE = /\.(test|selftest|npmtest|spec)\.[cm]?[jt]sx?$|\/__tests__\//;

export const fitnessFunction = {
  id: 'F34',
  name: 'bundle-safe-module-evaluation',
  description:
    'No non-test module under fsi-app/src calls a filesystem function at module scope. A module-scope ' +
    'read runs on import, on every page that transitively imports the module, and the serverless bundle ' +
    'does not carry runtime file reads: PR #533 shipped one and carosledge.com answered 500 on every route ' +
    'until rolled back (2026-09-02). Reads inside functions are out of scope; the allowlist names the one ' +
    'latent instance with its basis.',
  source: 'Addendum 84 postscript 16 (2026-09-02 production incident); finish plan §4 gates',

  enumerate() {
    return globFiles(['fsi-app/src/**/*.{ts,tsx,mjs,cjs,js,jsx}'])
      .filter((f) => !TEST_RE.test(f) && !f.includes('/src/_archive/'));
  },

  check(file, content) {
    const hits = findModuleScopeFsCalls(content);
    if (hits.length === 0) return PASS;
    if (ALLOWLIST[file]) return PASS;
    return hits.map((h) =>
      violation(
        h.line,
        `${h.call}() at module scope: runs on import on every page that imports this module and the ` +
          'serverless bundle does not carry runtime file reads (2026-09-02 production 500). Move the read ' +
          'inside the function that needs it, or make the data an imported module.',
      ),
    );
  },
};
