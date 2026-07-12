// F18: ONE URL CANONICALIZER. URL-identity normalization (the "make two URLs that mean the same resource
// compare equal" transform) lives in the SINGLE sanctioned home — canonicalizeUrl (src/lib/sources/
// url-canonicalize.ts). No module may re-implement it with an ad-hoc regex chain. The forbidden shapes are
// the two moves the deleted intake `_normUrl` used to build a bare URL-identity string:
//   • BARE SCHEME-STRIP  `.replace(/^https?:\/\/` …)  — dropping the scheme to form a scheme-less identity
//   • QUERY/FRAGMENT DROP `.replace(/[#?]…` / `.replace(/[?#]…`) — dropping the whole query/fragment
// The second is the exact D1 defect: `_normUrl`'s `[#?].*$` strip collapsed every eur-lex …?uri=CELEX:… URL
// to one key, false-deduping distinct EUR-Lex regs (Unit-0c intake dry-proof, 2026-07-12). Routing URL identity
// through canonicalizeUrl (which PRESERVES query content) fixed it; F18 makes the class un-reintroducible.
//
// NOT flagged (deliberately): HOST extraction (`new URL(x).host.replace(/^www\./, "")`) is a different
// operation (registrable-domain / tier / portal-host resolution), not URL-identity; the www-strip does not
// carry the scheme-strip or query-drop shape. canonicalizeCitationUrl (src/lib/agent/url-canon.mjs) is a
// distinct sanctioned transform (the SQL mig-150 mirror, its own drift guard) that PRESERVES the query and uses
// none of the forbidden shapes, so it is clean. canonical-fetch's trailing-slash trim on a base URL and
// verification.ts's `new URL()`-structural source-dedup likewise carry neither forbidden shape.
//
// Scope: fsi-app/src/**/*.{ts,tsx,mjs}, EXCLUDING the sanctioned home (url-canonicalize.ts) + its test and all
// test files. Comment text is stripped before matching (a comment naming the old regex is not a violation).
// Override: trailing `// fitness-allow: F18 (reason)`.
//
// Governing: one-url-canonicalizer doctrine (doctrine-register), invariant RD-13. Source: intake-correctness
// dispatch Step 1.3 (2026-07-12).

import { violation, PASS } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { isOverridden } from '../lib/file-content.mjs';

const SANCTIONED_HOME = 'fsi-app/src/lib/sources/url-canonicalize.ts';

// BARE scheme-strip: `.replace(/^https?://` with NO capture group before `https` (url-canon's scheme-PRESERVING
// `^(https?://)www.` has a `(` after `^` and is NOT matched). The `\/\/` is the `//` after the scheme colon.
const BARE_SCHEME_STRIP_RE = /\.replace\(\s*\/\^https\?:\\?\/\\?\//;
// QUERY / FRAGMENT drop: `.replace(/[#?]…` — a character class made up of ONLY the URL delimiters `#`/`?`
// (the D1 `_normUrl` shape `[#?].*$`). Deliberately TIGHT — the class must be 1-2 chars drawn from {#,?}, so a
// regex-ESCAPING class like `[.*+?^${}()|[\]\\]` (which merely contains `?`), a host www-strip, a markdown-marker
// strip (`[*`]`), and a trailing-punct strip (`[/.,;:]`) are all NOT matched.
const QUERY_FRAGMENT_DROP_RE = /\.replace\(\s*\/\[[#?]{1,2}\]/;

// A whole-line comment (prose naming the old regex) is not a violation. We skip full comment lines rather than
// splitting on `//`, because a code line carrying a regex literal like `/^https?:\/\//` itself contains `//`
// and a naive split would truncate the pattern before it can be matched.
const isCommentLine = (line) => { const t = line.trimStart(); return t.startsWith('//') || t.startsWith('*'); };

/** Return 1-indexed line numbers carrying a forbidden ad-hoc URL-identity normalizer. */
export function findAdHocUrlNormalizers(content) {
  const lines = content.split(/\r?\n/);
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    if (isCommentLine(lines[i])) continue;
    if (isOverridden(lines[i], 'F18')) continue;
    if (BARE_SCHEME_STRIP_RE.test(lines[i]) || QUERY_FRAGMENT_DROP_RE.test(lines[i])) hits.push(i + 1);
  }
  return hits;
}

export const fitnessFunction = {
  id: 'F18',
  name: 'one-url-canonicalizer',
  description:
    'URL-identity normalization lives ONLY in the sanctioned canonicalizeUrl (src/lib/sources/url-canonicalize.ts). A module re-implementing it via ad-hoc regex — bare scheme-strip (/^https?:\\/\\/) or whole query/fragment drop (/[#?]…) — is RED (the _normUrl class that produced the D1 EUR-Lex false-dedup). Host extraction and canonicalizeCitationUrl are NOT flagged.',
  source: 'intake-correctness dispatch Step 1.3 (2026-07-12); one-url-canonicalizer doctrine / RD-13',

  enumerate() {
    return globFiles(['fsi-app/src/**/*.{ts,tsx,mjs}']).filter(
      (p) =>
        p !== SANCTIONED_HOME &&
        !p.includes('/__tests__/') &&
        !/\.(test|selftest)\.(ts|tsx|mjs)$/.test(p)
    );
  },

  check(filepath, content) {
    if (filepath === SANCTIONED_HOME) return PASS;
    const hits = findAdHocUrlNormalizers(content);
    if (hits.length === 0) return PASS;
    return hits.map((line) =>
      violation(
        line,
        `Ad-hoc URL-identity normalizer (bare scheme-strip or whole query/fragment drop). Route URL identity through canonicalizeUrl() (src/lib/sources/url-canonicalize.ts) — it folds noise variants but PRESERVES query content, so it will not collapse distinct eur-lex …?uri=CELEX:… URLs (the D1 defect). For a citation-URL compare use canonicalizeCitationUrl (url-canon.mjs). Override: trailing \`// fitness-allow: F18 (reason)\`. Governing: one-url-canonicalizer doctrine / RD-13.`,
      )
    );
  },
};
