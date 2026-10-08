// SQL source masking for the fitness functions that read migrations (F32, F64, F70; lane GATE-8, 2026-10-08,
// AUD-AT-4 register). They each read the migration text with a regex, and each regex was fooled by the same two
// things: a comment (`-- REVOKE ... FROM PUBLIC`, a block comment holding the whole statement) read as if it
// were a statement, and a `--` inside a string literal read as if it started a comment (it truncated the
// header line before `SECURITY DEFINER`). This is the one reader of "what is SQL and what is a comment or a
// string" for the migration gates.
//
// maskSql(src, { keepStrings }) returns `src` with every character in a comment replaced by a space, and (when
// keepStrings is false) every character inside a single-quoted string as well. Newlines are kept, so indexes
// and line numbers still match the original. Quoted identifiers ("public"."t") are never masked: they are
// identifiers. A dollar-quoted body ($$ ... $$, $fn$ ... $fn$) is code (a function body is SQL), so comments and
// strings inside it are masked the same way; a single-quote that is still open at the end of a line inside a
// dollar-quoted body is treated as prose punctuation (an apostrophe in a COMMENT text), not as a string start.
// Pure, node builtins only (the no-npm discipline glob).

/** @param {string} src @param {{keepStrings?: boolean}} [opts] */
export function maskSql(src, opts = {}) {
  const keepStrings = opts.keepStrings !== false;
  const s = String(src);
  const n = s.length;
  const out = s.split('');
  const blank = (i) => { if (s[i] !== '\n' && s[i] !== '\r') out[i] = ' '; };
  let i = 0;
  const dollarStack = [];

  while (i < n) {
    const c = s[i];
    const d = s[i + 1];
    if (c === '-' && d === '-') {
      while (i < n && s[i] !== '\n') { blank(i); i++; }
      continue;
    }
    if (c === '/' && d === '*') {
      let depth = 0;
      while (i < n) {
        if (s[i] === '/' && s[i + 1] === '*') { depth++; blank(i); blank(i + 1); i += 2; continue; }
        if (s[i] === '*' && s[i + 1] === '/') { depth--; blank(i); blank(i + 1); i += 2; if (depth === 0) break; continue; }
        blank(i); i++;
      }
      continue;
    }
    if (c === '"') {
      i++;
      while (i < n && s[i] !== '"') i++;
      i++;
      continue;
    }
    if (c === "'") {
      const inDollar = dollarStack.length > 0;
      const start = i;
      i++;
      let closed = false;
      while (i < n) {
        if (s[i] === "'" && s[i + 1] === "'") { i += 2; continue; }
        if (s[i] === "'") { closed = true; i++; break; }
        if (inDollar && s[i] === '\n') break;
        i++;
      }
      if (!closed && inDollar) { i = start + 1; continue; } // an apostrophe in prose, not a string
      if (!keepStrings) for (let k = start + 1; k < i - 1; k++) blank(k);
      continue;
    }
    if (c === '$') {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(s.slice(i, i + 64));
      if (m) {
        const tag = m[0];
        if (dollarStack.length && dollarStack[dollarStack.length - 1] === tag) dollarStack.pop();
        else dollarStack.push(tag);
        i += tag.length;
        continue;
      }
    }
    i++;
  }
  return out.join('');
}

/** 1-based line of an index in `text`. */
export function sqlLineOf(text, index) {
  let n = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}
