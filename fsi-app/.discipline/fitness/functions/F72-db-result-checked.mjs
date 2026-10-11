// F72: db-result-checked (lane DATA-2, 2026-10-11, second-pass audit rows B-0008..B-0045). A Supabase call's
// result is `{ data, error }`. Reading `data` (or `count`) without reading `error`, or discarding the result
// altogether, is one defect with four shapes:
//   DATA-ONLY    `const { data } = await sb.from(...)...`, `{ data: x }`, `{ count }`: no `error` binding.
//   BARE-AWAIT   `await sb.from(...).insert(...)...;` as a statement: the result is thrown away.
//   VOID         `void sb.from(...)...`: fire and forget.
//   PROMISEALL   `const [{ data: a }, { data: b }] = await Promise.all([sb.from(...)..., ...])` where a
//                destructured element has no `error` binding.
// A failed write then answers 2xx and a failed read renders as "nothing there". CLAUDE.md (fsi-app/.claude)
// recorded the first confirmed instance (agent/run, 2026-05-08: a swallowed "column does not exist" error
// disabled four cost-protection gates for an unknown time) and named the code smell; this gate is the
// mechanical backstop the post-mortem lacked.
//
// SCOPE: fsi-app/src/app/api/**/*.ts (DATA-3 widens it to src/lib and src/components in its own lane).
// An awaited expression is a Supabase result when its ROOT chain (the expression head, not an argument or a
// nested callback) contains `.from(` or `.rpc(`; `Array.from(` and any other capitalised receiver is not.
// Source text is read through the one lexer (lib/code-scan.mjs views().code), so a string or a comment can
// neither hide a site nor create one.
//
// OVERRIDE (same convention as F39): a `// fitness-allow: F72 (reason)` marker on the site's own lines, or on
// the line directly above it, with the reason a fact (e.g. best-effort telemetry whose row is re-derived),
// never "legacy". A site that cannot be justified gets fixed in the surrounding code's own idiom.

import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { views, overrideLines } from '../lib/code-scan.mjs';
import { isTestFile } from './F25-module-liveness.mjs';

const SCOPE_GLOBS = ['fsi-app/src/app/api/**/*.ts'];

const OPEN = '([{';
const CLOSE = ')]}';

/** Index just past the bracket that closes the one at `openIdx` (code view, so no strings or comments); -1 if none. */
function matchForward(c, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < c.length; i++) {
    if (OPEN.includes(c[i])) depth++;
    else if (CLOSE.includes(c[i])) { depth--; if (depth === 0) return i + 1; }
  }
  return -1;
}

/** Index of the bracket that opens the one closing at `closeIdx`; -1 if none. */
function matchBackward(c, closeIdx) {
  let depth = 0;
  for (let i = closeIdx; i >= 0; i--) {
    if (CLOSE.includes(c[i])) depth++;
    else if (OPEN.includes(c[i])) { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/** Split `text` on commas at depth 0. Pure. */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    if (OPEN.includes(text[i])) depth++;
    else if (CLOSE.includes(text[i])) depth--;
    else if (text[i] === ',' && depth === 0) { parts.push(text.slice(from, i)); from = i + 1; }
  }
  parts.push(text.slice(from));
  return parts;
}

/** End index (exclusive) of the expression that starts at `start`: the first depth-0 `;`, `,` or `:`, the first
 *  closing bracket that closes an enclosing group, or a depth-0 newline that ends a statement written without a
 *  semicolon (previous token ends a value, next token does not continue a chain or an operator). */
function expressionEnd(c, start) {
  let depth = 0;
  for (let i = start; i < c.length; i++) {
    const ch = c[i];
    if (OPEN.includes(ch)) depth++;
    else if (CLOSE.includes(ch)) { depth--; if (depth < 0) return i; }
    else if (depth === 0 && (ch === ';' || ch === ',' || ch === ':')) return i;
    else if (depth === 0 && ch === '\n') {
      let p = i - 1;
      while (p > start && /\s/.test(c[p])) p--;
      let q = i + 1;
      while (q < c.length && /\s/.test(c[q])) q++;
      if (/[)\]\w$"'`]/.test(c[p]) && q < c.length && !/[.?&|+*\/=,:<>]/.test(c[q])) return i;
    }
  }
  return c.length;
}

/** True when the head of `expr` is a Supabase query: `.from(` or `.rpc(` at nesting depth 0, with a receiver that
 *  is not a capitalised identifier (Array.from, Buffer.from, Observable.from and the like are not queries). */
function rootIsSupabase(expr) {
  const re = /\.\s*(?:from|rpc)\s*\(/g;
  let m;
  while ((m = re.exec(expr)) !== null) {
    let depth = 0;
    for (let i = 0; i < m.index; i++) {
      if (OPEN.includes(expr[i])) depth++;
      else if (CLOSE.includes(expr[i])) depth--;
    }
    if (depth !== 0) return false;
    const recv = /([A-Za-z_$][\w$]*)\s*$/.exec(expr.slice(0, m.index));
    if (recv && /^[A-Z]/.test(recv[1])) continue;
    return true;
  }
  return false;
}

/** For an object pattern `{ data, error: e }` : does it bind `error`? A rest element counts (it carries it). */
function objectPatternBindsError(pattern) {
  const inner = pattern.trim().slice(1, -1);
  for (const raw of splitTopLevel(inner)) {
    const part = raw.trim();
    if (!part) continue;
    if (part.startsWith('...')) return true;
    const key = /^([A-Za-z_$][\w$]*)/.exec(part);
    if (key && key[1] === 'error') return true;
  }
  return false;
}

/** The text of the binding pattern assigned to the `await` at `awaitIdx`, or a tag when there is none.
 *  { kind: 'object' | 'array', text } | { kind: 'ident' } | { kind: 'statement' } | { kind: 'flows' } */
function leftHandSide(c, awaitIdx) {
  let j = awaitIdx - 1;
  while (j >= 0 && /\s/.test(c[j])) j--;
  if (j < 0) return { kind: 'statement', start: awaitIdx };
  const ch = c[j];
  if (ch === '=' && !'=!<>'.includes(c[j - 1] ?? '')) {
    let k = j - 1;
    while (k >= 0 && /\s/.test(c[k])) k--;
    if (c[k] === '}' || c[k] === ']') {
      const open = matchBackward(c, k);
      if (open !== -1) return { kind: c[k] === '}' ? 'object' : 'array', text: c.slice(open, k + 1), start: open };
    }
    return { kind: 'ident', start: k };
  }
  if (ch === ';' || ch === '{' || ch === '}') return { kind: 'statement', start: awaitIdx };
  if (ch === ')') return { kind: 'statement', start: awaitIdx }; // `if (x) await ...` (a statement body)
  if (/[\w$]/.test(ch)) {
    let s = j;
    while (s > 0 && /[\w$]/.test(c[s - 1])) s--;
    if (c.slice(s, j + 1) === 'else' || c.slice(s, j + 1) === 'do') return { kind: 'statement', start: awaitIdx };
  }
  if (ch === '?' || ch === ':' || ch === '&' || ch === '|') {
    // `const { data } = cond ? await sb.from(...) : fallback`: the await is an arm of an expression whose own
    // assignment binds the result. Find that statement's first top-level `=` and read the pattern before it.
    let depth = 0;
    let st = awaitIdx - 1;
    for (; st >= 0; st--) {
      if (CLOSE.includes(c[st])) depth++;
      else if (OPEN.includes(c[st])) { depth--; if (depth < 0) break; }
      else if (c[st] === ';' && depth === 0) break;
    }
    depth = 0;
    for (let k = st + 1; k < awaitIdx; k++) {
      if (OPEN.includes(c[k])) depth++;
      else if (CLOSE.includes(c[k])) depth--;
      else if (depth === 0 && c[k] === '=' && !'=>'.includes(c[k + 1] ?? '') && !'=!<>'.includes(c[k - 1] ?? '')) {
        let e = k - 1;
        while (e >= 0 && /\s/.test(c[e])) e--;
        if (c[e] === '}' || c[e] === ']') {
          const open = matchBackward(c, e);
          if (open !== -1) return { kind: c[e] === '}' ? 'object' : 'array', text: c.slice(open, e + 1), start: open };
        }
        return { kind: 'ident', start: e };
      }
    }
  }
  return { kind: 'flows' }; // return, arrow body, argument, object value: the result goes somewhere
}

/** Pure: every unchecked Supabase result in `content`. Returns `[{ start, end, shape, detail }]` as character spans
 *  of the code view (`end` exclusive). */
export function findDroppedResults(content) {
  const c = views(content).code;
  const out = [];

  const awaitRe = /(?<![\w$.])await\b/g;
  let m;
  while ((m = awaitRe.exec(c)) !== null) {
    const exprStart = m.index + m[0].length;
    const exprEnd = expressionEnd(c, exprStart);
    const expr = c.slice(exprStart, exprEnd).trim();
    const lhs = leftHandSide(c, m.index);
    const span = { start: lhs.start ?? m.index, end: exprEnd };

    const all = /^Promise\s*\.\s*all\s*\(\s*\[/.exec(expr);
    if (all) {
      const arrOpen = expr.indexOf('[', all[0].length - 1);
      const arrClose = matchForward(expr, arrOpen);
      if (arrClose === -1) continue;
      const elements = splitTopLevel(expr.slice(arrOpen + 1, arrClose - 1)).map((e) => e.trim());
      const supabase = elements.map((e) => !e.startsWith('...') && rootIsSupabase(e));
      if (!supabase.some(Boolean)) continue;
      if (lhs.kind === 'statement') {
        out.push({ ...span, shape: 'BARE-AWAIT', detail: 'await Promise.all([...]) of Supabase calls as a statement: every result is discarded' });
      } else if (lhs.kind === 'array') {
        const slots = splitTopLevel(lhs.text.slice(1, -1)).map((s) => s.trim());
        const lacking = [];
        slots.forEach((slot, i) => {
          if (supabase[i] && slot.startsWith('{') && !objectPatternBindsError(slot)) lacking.push(i);
        });
        if (lacking.length) {
          out.push({ ...span, shape: 'PROMISEALL', detail: `Promise.all element${lacking.length > 1 ? 's' : ''} ${lacking.join(', ')} destructured without an error binding` });
        }
      }
      continue;
    }

    if (!rootIsSupabase(expr)) continue;
    if (lhs.kind === 'statement') {
      out.push({ ...span, shape: 'BARE-AWAIT', detail: 'the awaited Supabase call is a statement: its result (data and error) is discarded' });
    } else if (lhs.kind === 'object' && !objectPatternBindsError(lhs.text)) {
      out.push({ ...span, shape: 'DATA-ONLY', detail: `${lhs.text.replace(/\s+/g, ' ')} reads the result without binding error` });
    }
  }

  const voidRe = /(?<![\w$.])void\s+/g;
  while ((m = voidRe.exec(c)) !== null) {
    const exprStart = m.index + m[0].length;
    const exprEnd = expressionEnd(c, exprStart);
    if (rootIsSupabase(c.slice(exprStart, exprEnd))) {
      out.push({ start: m.index, end: exprEnd, shape: 'VOID', detail: 'void on a Supabase call: fire and forget, the error is never read' });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Pure: violations for one file. */
export function checkDroppedResults(filepath, content) {
  const code = views(content).code;
  const lineStarts = [0];
  for (let i = 0; i < code.length; i++) if (code.charCodeAt(i) === 10) lineStarts.push(i + 1);
  const lineOf = (idx) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= idx) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };
  const allowed = overrideLines(content, 'F72');
  const out = [];
  for (const site of findDroppedResults(content)) {
    const first = lineOf(site.start);
    const last = lineOf(Math.max(site.start, site.end - 1));
    let marked = false;
    for (let l = first - 1; l <= last; l++) if (allowed.has(l)) marked = true;
    if (marked) continue;
    out.push(
      violation(
        first,
        `F72 ${site.shape}: ${site.detail}. A failed write then answers 2xx and a failed read renders as "nothing ` +
          'there". Bind and handle the error in this file\'s own idiom: a main-path write returns ' +
          '`NextResponse.json({ error: error.message }, { status: 500 })`; a write after the main write committed logs ' +
          'a console.warn and adds `warnings` to the response; a read that only decorates logs and yields null. If the ' +
          'site must stay, mark it `// fitness-allow: F72 (reason)` with the reason a fact, never "legacy".',
      ),
    );
  }
  return out;
}

export const fitnessFunction = {
  id: 'F72',
  name: 'db-result-checked',
  description:
    'Every Supabase result in an API route is read with its error: no data-only destructure, no bare-awaited ' +
    'write, no fire-and-forget. Shapes DATA-ONLY, BARE-AWAIT, VOID and PROMISEALL on an awaited expression whose ' +
    'root chain contains .from( or .rpc(, in fsi-app/src/app/api/**/*.ts. Override: `// fitness-allow: F72 (reason)`.',
  source: 'DATA-2, 2026-10-11 (second-pass audit rows B-0008..B-0045; agent/run post-mortem 2026-05-08)',

  enumerate() {
    return globFiles(SCOPE_GLOBS).filter((f) => !isTestFile(f) && !f.includes('/_archive/'));
  },

  check(filepath, content) {
    return checkDroppedResults(filepath, content);
  },
};
