// The commit rules' ONE source tokenizer (lane GATE-7, 2026-10-08).
//
// maskNonCode was written for rule 015 (lane RULES-1, 2026-10-07) so a method name inside a comment, a string
// or a regex literal is never read as a call. Rules 019 and 021 and the string-concatenation folding in
// 012 and 019 need the same answer ("is this text code, a comment, or a string?"), so the lexer moved here
// and the rules import it: one copy, not one per rule. Rule 015 re-exports maskNonCode for its existing
// importers. Pure, node builtins only (the no-npm discipline glob).

export const isIdent = (c) => c !== undefined && /[\w$]/.test(c);
export const isWs = (c) => c !== undefined && /\s/.test(c);

const REGEX_PREV_WORDS = new Set(['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'yield', 'else', 'do', 'new', 'await']);

/** Replace comments and the CONTENT of string, template and regex literals with spaces (newlines kept so
 *  indexes and line numbers stay aligned). Code inside a template `${ ... }` is kept.
 *  `opts.keepStrings`: keep the content of string and template literals (comments and regex literals are
 *  still masked). A caller that needs "is this specifier or word in real code or in a comment?" reads the
 *  strings-kept form: an import path is a string, a comment that names it is not code. */
export function maskNonCode(src, opts = {}) {
  const keepStrings = Boolean(opts.keepStrings);
  const s = String(src);
  const n = s.length;
  const out = new Array(n).fill(' ');
  const keep = (k) => { out[k] = s[k]; };
  const nl = (k) => { if (s[k] === '\n' || s[k] === '\r') out[k] = s[k]; };
  const body = (k) => { if (keepStrings) keep(k); else nl(k); };
  let i = 0;

  function lastWord() {
    let k = i - 1;
    while (k >= 0 && isWs(out[k])) k--;
    const e = k;
    while (k >= 0 && isIdent(out[k])) k--;
    return e > k ? out.slice(k + 1, e + 1).join('') : '';
  }
  function prevSig() {
    let k = i - 1;
    while (k >= 0 && isWs(out[k])) k--;
    return k >= 0 ? out[k] : '';
  }
  function regexAllowed() {
    const p = prevSig();
    if (p === '') return true;
    if ('(,=:[!&|?{};+-*%<>~^'.includes(p)) return true;
    return isIdent(p) && REGEX_PREV_WORDS.has(lastWord());
  }
  function template() {
    while (i < n) {
      const c = s[i];
      if (c === '\\') { body(i); i++; if (i < n) { body(i); i++; } continue; }
      if (c === '`') { keep(i); i++; return; }
      if (c === '$' && s[i + 1] === '{') {
        i += 2;
        code(true);
        if (i < n) i++; // the closing brace of the interpolation (left masked)
        continue;
      }
      body(i); i++;
    }
  }
  function code(stopAtBrace) {
    let depth = 0;
    while (i < n) {
      const c = s[i];
      const d = s[i + 1];
      if (c === '/' && d === '/') { while (i < n && s[i] !== '\n') i++; continue; }
      if (c === '/' && d === '*') {
        i += 2;
        while (i < n && !(s[i] === '*' && s[i + 1] === '/')) { nl(i); i++; }
        i += 2;
        continue;
      }
      if (c === '"' || c === "'") {
        keep(i); i++;
        while (i < n && s[i] !== c && s[i] !== '\n') {
          if (s[i] === '\\') { body(i); i++; if (i < n) { body(i); i++; } continue; }
          body(i); i++;
        }
        if (i < n && s[i] === c) { keep(i); i++; }
        continue;
      }
      if (c === '`') { keep(i); i++; template(); continue; }
      if (c === '/' && regexAllowed()) {
        let k = i + 1;
        let inClass = false;
        let ok = false;
        while (k < n && s[k] !== '\n') {
          if (s[k] === '\\') { k += 2; continue; }
          if (s[k] === '[') inClass = true;
          else if (s[k] === ']') inClass = false;
          else if (s[k] === '/' && !inClass) { ok = true; break; }
          k++;
        }
        if (ok) { keep(i); keep(k); i = k + 1; continue; }
      }
      if (c === '{') depth++;
      if (c === '}') { if (stopAtBrace && depth === 0) return; depth--; }
      keep(i); i++;
    }
  }
  code(false);
  return out.join('');
}

/** Fold adjacent string-literal concatenation into one literal, so a value split across a `+` is read as
 *  written: `"C:" + "\\Users"` becomes `"C:\\Users"`, `'a' +\n 'b'` becomes `'ab'`. The quotes of the second
 *  literal are dropped and the first literal's quote kept (the content of two different quote styles is
 *  joined as is). Run to a fixed point so a three-way split folds fully. Pure; used on source text or on one
 *  added line. A concatenation with a non-literal operand (`"a" + x + "b"`) is left alone. */
export function foldStringConcat(text) {
  let prev;
  let cur = String(text ?? '');
  do {
    prev = cur;
    cur = cur.replace(/(["'`])\s*\+\s*(["'`])/g, '');
  } while (cur !== prev);
  return cur;
}
