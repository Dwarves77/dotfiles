// Table-access reader for the fitness functions that police who writes or reads a table (F13, F20, F22, F31;
// lane GATE-8, 2026-10-08, AUD-AT-4 register). They each used to scan for `from("<table>")` on one line and
// then look for `.insert(` in the next three lines. That read missed every honest form of the same call:
//
//   - the table named by a constant (`const T = "sources"; sb.from(T)`), a template literal with no holes, or a
//     name split over a `+` (B1-15, B1-17, B2-36, B3-17, B5-09);
//   - `.from(` and the table name on separate lines (B2-35, B5-08);
//   - an `.insert` further down a long chain than the three-line window (B1-16);
//   - `.upsert(` where the function only knew `.insert(` (B1-14).
//
// This module reads the call as a call. It finds each `.from(<arg>)`, resolves the argument against the file's
// own string constants, then walks the method chain that follows (balanced brackets, on the comment-and-string
// blanked view) and returns the methods it finds. The caller decides which table and which method matter.
// Pure, node builtins only (the no-npm discipline glob).

import { views, lineOfIndex } from './code-scan.mjs';
import { foldStringConcat } from '../../governance/coverage-scan.mjs';

const IDENT = /[A-Za-z_$][\w$]*/y;

/** `{ NAME: "literal" }` for every simple `const|let|var NAME = "literal"` (no `${` hole) in the text view. */
export function stringConstants(text) {
  const out = new Map();
  const re = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=;\n]+)?=\s*(["'`])([^"'`\n$]*)\2/g;
  let m;
  while ((m = re.exec(text))) out.set(m[1], m[3]);
  return out;
}

/** Index of the bracket that closes the one at `open` in `code` (strings and comments are blanked there). */
export function matchClose(code, open) {
  const pairs = { '(': ')', '[': ']', '{': '}' };
  const want = pairs[code[open]];
  if (!want) return -1;
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    const c = code[i];
    if (c === code[open]) depth++;
    else if (c === want) { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function skipWs(code, k) {
  while (k < code.length && /\s/.test(code[k])) k++;
  return k;
}

/**
 * Every `.from(<arg>)` call in `content` with its method chain.
 * @returns {{ table: string|null, index: number, line: number, methods: {name: string, argsFrom: number, argsTo: number}[] }[]}
 *   table is null when the argument is not a literal or a file constant.
 */
export function tableCalls(content) {
  const { code, text } = views(content);
  const consts = stringConstants(text);
  const out = [];
  const re = /\.\s*from\s*\(/g;
  let m;
  while ((m = re.exec(code))) {
    const open = m.index + m[0].length - 1;
    const close = matchClose(code, open);
    if (close < 0) continue;
    const argText = foldStringConcat(text.slice(open + 1, close)).trim();
    let table = null;
    const lit = /^(["'`])([^"'`$]*)\1$/.exec(argText);
    if (lit) table = lit[2];
    else if (/^[A-Za-z_$][\w$]*$/.test(argText) && consts.has(argText)) table = consts.get(argText);
    const methods = [];
    let k = close + 1;
    for (let guard = 0; guard < 200; guard++) {
      k = skipWs(code, k);
      if (code[k] === '?' && code[k + 1] === '.') k += 2;
      else if (code[k] === '.') k += 1;
      else break;
      k = skipWs(code, k);
      IDENT.lastIndex = k;
      const id = IDENT.exec(code);
      if (!id) break;
      k += id[0].length;
      const afterName = skipWs(code, k);
      if (code[afterName] === '(') {
        const c = matchClose(code, afterName);
        if (c < 0) break;
        methods.push({ name: id[0], argsFrom: afterName + 1, argsTo: c });
        k = c + 1;
      } else {
        methods.push({ name: id[0], argsFrom: afterName, argsTo: afterName });
      }
    }
    out.push({ table, index: m.index, line: lineOfIndex(code, m.index), methods });
    re.lastIndex = close + 1;
  }
  return out;
}

/** Write methods the function families care about. */
export const WRITE_METHODS = new Set(['insert', 'upsert']);
export const MUTATE_METHODS = new Set(['insert', 'upsert', 'update', 'delete']);

/** Lines (1-based) of `.from(<table>)` calls whose chain carries one of `methods`. Pure. */
export function tableWriteLines(content, tables, methods = WRITE_METHODS) {
  const want = new Set([].concat(tables));
  const hits = [];
  for (const call of tableCalls(content)) {
    if (call.table === null || !want.has(call.table)) continue;
    if (call.methods.some((m) => methods.has(m.name))) hits.push(call.line);
  }
  return hits;
}

/** Lines (1-based) of raw SQL in a string or template (`INSERT INTO <table>`). Comments are excluded. */
export function rawSqlLines(content, verbRegexSource, table) {
  const { text } = views(content);
  const re = new RegExp(`\\b(?:${verbRegexSource})\\s+(?:"?public"?\\.)?"?${table}"?(?![\\w$])`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(text))) out.push(lineOfIndex(text, m.index));
  return out;
}
