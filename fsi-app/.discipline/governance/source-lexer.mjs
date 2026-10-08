// The ONE source lexer (lane GATE-8, 2026-10-08). Lives in its own dependency-free module so that
// execution-wiring.mjs can use it without an import cycle through coverage-scan.mjs (which imports
// execution-wiring.mjs); coverage-scan.mjs re-exports every name here, and the fitness functions import it
// from coverage-scan.mjs, the one site. Node builtins only (the no-npm discipline glob).

// ONE SOURCE LEXER FOR THE FITNESS FUNCTIONS (lane GATE-8, 2026-10-08, AUD-AT-4 register). The functions
// used to read a line with `line.split("//")[0]` (a URL earlier on the line truncated the scan), skip any
// line starting with `*` (a continuation line of real code), and look for an override marker anywhere on a
// line (a string literal containing the marker passed). Those are one defect: the question "is this text
// code, a comment or a string literal?" was answered by a regex per function. It is answered here, once, by a
// tokenizer: every character of the source is CODE, LIT (the content of a string, template text or regex
// body; the delimiters stay CODE) or COM (a comment). The views below keep one or more classes and blank the
// rest with spaces, so every index and every line number stays aligned with the original.
export const CODE = 0;
export const LIT = 1;
export const COM = 2;
const REGEX_PREV_WORDS = new Set(['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'yield', 'else', 'do', 'new', 'await']);

/** Class of every character of `src`: CODE, LIT or COM. Pure; node builtins only. */
export function classifySource(src) {
  const s = String(src);
  const n = s.length;
  const cls = new Uint8Array(n);
  const interp = []; // brace depth at which each open template `${` began
  let depth = 0;
  let i = 0;
  let inTemplate = false;
  const isWs = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r';
  const isId = (c) => c !== undefined && /[\w$]/.test(c);
  function prevSig() {
    let k = i - 1;
    while (k >= 0 && (cls[k] === COM || isWs(s[k]))) k--;
    return k;
  }
  function regexAllowed() {
    const k = prevSig();
    if (k < 0) return true;
    const c = s[k];
    if (cls[k] === CODE && '(,=:[!&|?{};+-*%<>~^'.includes(c)) return true;
    if (cls[k] === CODE && isId(c)) {
      let b = k;
      while (b >= 0 && isId(s[b])) b--;
      return REGEX_PREV_WORDS.has(s.slice(b + 1, k + 1));
    }
    return false;
  }
  if (s.startsWith('#!')) { while (i < n && s[i] !== '\n') { cls[i] = COM; i++; } }
  while (i < n) {
    const c = s[i];
    const d = s[i + 1];
    if (inTemplate) {
      if (c === '\\') { cls[i] = LIT; i++; if (i < n) { cls[i] = LIT; i++; } continue; }
      if (c === '`') { cls[i] = CODE; i++; inTemplate = false; continue; }
      if (c === '$' && d === '{') { cls[i] = CODE; cls[i + 1] = CODE; i += 2; interp.push(depth); inTemplate = false; continue; }
      cls[i] = LIT; i++; continue;
    }
    if (c === '/' && d === '/') { while (i < n && s[i] !== '\n') { cls[i] = COM; i++; } continue; }
    if (c === '/' && d === '*') {
      cls[i] = COM; cls[i + 1] = COM; i += 2;
      while (i < n && !(s[i] === '*' && s[i + 1] === '/')) { cls[i] = COM; i++; }
      if (i < n) { cls[i] = COM; cls[i + 1] = COM; i += 2; }
      continue;
    }
    if (c === '"' || c === "'") {
      cls[i] = CODE; i++;
      while (i < n && s[i] !== c && s[i] !== '\n') {
        if (s[i] === '\\') { cls[i] = LIT; i++; if (i < n) { cls[i] = LIT; i++; } continue; }
        cls[i] = LIT; i++;
      }
      if (i < n && s[i] === c) { cls[i] = CODE; i++; }
      continue;
    }
    if (c === '`') { cls[i] = CODE; i++; inTemplate = true; continue; }
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
      if (ok) {
        cls[i] = CODE;
        for (let b = i + 1; b < k; b++) cls[b] = LIT;
        cls[k] = CODE;
        i = k + 1;
        continue;
      }
    }
    if (c === '{') depth++;
    if (c === '}') {
      if (interp.length && interp[interp.length - 1] === depth) { interp.pop(); cls[i] = CODE; i++; inTemplate = true; continue; }
      depth--;
    }
    cls[i] = CODE; i++;
  }
  return cls;
}

/** `src` with every character whose class is not in `keep` replaced by a space (newlines are kept, so
 *  indexes and line numbers stay aligned). keep: any of CODE, LIT, COM. */
export function viewSource(src, keep) {
  const s = String(src);
  const cls = classifySource(s);
  const want = new Set(keep);
  const out = new Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    out[i] = want.has(cls[i]) || ch === '\n' || ch === '\r' ? ch : ' ';
  }
  return out.join('');
}

/** Code only: comments, string and template text, regex bodies blanked (what a CALL or an IMPORT looks like). */
export const codeOnly = (src) => viewSource(src, [CODE]);
/** Code and string content, comments blanked (what a host, a table name or a path literal looks like). */
export const codeAndStrings = (src) => viewSource(src, [CODE, LIT]);
/** Comments only (what an override marker looks like: a marker inside a string is not one). */
export const commentsOnly = (src) => viewSource(src, [COM]);

/**
 * Strip comments so a MENTION is never read as a CALL. Lexer-based (lane GATE-8): a `//` inside a string or a
 * URL is not a comment, a line that starts with `*` is not a comment unless a block comment is open, and a
 * comment opener inside a string is not one. Comment text is replaced by spaces, so indexes and line numbers
 * still match the original. Exported for the test, which pins the URL half and the trailing half.
 */
export function stripComments(src) {
  return codeAndStrings(src);
}

/** Fold adjacent string-literal concatenation into one literal, so a value split across a `+` is read as it
 *  is built: `"api." + "anthropic.com"` becomes `"api.anthropic.com"`. Newlines inside the fold are moved to
 *  just after the merged literal, so the line count of the text is unchanged. Run to a fixed point. Pure. */
export function foldStringConcat(text) {
  const re = /(["'`])([ \t]*(?:\r?\n)?[ \t]*)\+([ \t]*(?:\r?\n)?[ \t]*)(["'`])/;
  let cur = String(text ?? '');
  for (let guard = 0; guard < 500; guard++) {
    const m = re.exec(cur);
    if (!m) break;
    const nls = ((m[2] + m[3]).match(/\r?\n/g) || []).join('');
    const q = m[4];
    const start = m.index + m[0].length;
    let end = start;
    while (end < cur.length && cur[end] !== q && cur[end] !== '\n') { if (cur[end] === '\\') end++; end++; }
    const closed = cur[end] === q;
    cur = cur.slice(0, m.index) + cur.slice(start, end) + (closed ? m[1] : '') + nls + cur.slice(end + (closed ? 1 : 0));
  }
  return cur;
}
