// F8: Client-server tier boundary. Client-side code must not assign to tier-shaped
// fields in fetch/POST/PUT request bodies. Tier handling occurs server-side only.
// Source: OBS-62 (Phase 1.5 architectural-decision-in-docstring gap) + Sprint
// Architecture dispatch (operator-specified).
//
// Rationale: Phase 1.5 closure preserved the server-centric dual-write design
// (server reads body.tier, writes both base_tier + effective_tier columns) via
// documentation comments only. Absent F8, future client code could write
// body.tier or body.base_tier or body.effective_tier directly, bypassing the
// server-side dual-write mechanism. F8 closes that gap mechanically.
//
// Scope (client-side files; server routes excluded):
//   - fsi-app/src/components/**/*.{ts,tsx}
//   - fsi-app/src/app/**/*.tsx     (page components only; .ts files in app/api/ skipped)
//   - fsi-app/src/stores/**/*.ts
//   - fsi-app/src/hooks/**/*.ts
//   - fsi-app/src/lib/client/**    (lane GATE-8, AUD-AT-4 B1-10: client helpers live outside the component dirs)
//   - any other src file that opens with the "use client" directive
//
// EXCLUDED:
//   - fsi-app/src/app/api/**/*.ts (server route handlers; allowed to dual-write)
//   - fsi-app/src/lib/**/*.ts (server library code; allowed to dual-write) unless it is client code by the rules above
//
// Check pattern: forbid assignments to body.tier, body.base_tier, body.effective_tier (dot or bracket key)
//                AND object literals containing tier/base_tier/effective_tier keys
//                that are passed to fetch/POST/PUT request bodies.
//
// Lane GATE-8 (2026-10-08, AUD-AT-4 B1-07 to B1-11): read on the lexed source instead of line by line. A URL earlier on
// the line no longer truncates the scan (the old `split("//")[0]` cut it), a bracket-key assignment
// (`body["base_tier"] = x`) is the same write, an object literal that spans lines is one object (its key line is
// judged with the whole literal), and an `Object.assign(body, ...)` in a file that spells a tier key is a write.
//
// Override: trailing `// fitness-allow: F8 (reason)` on the matching line.

import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { readFile } from '../lib/file-content.mjs';
import { views, overrideLines, lineOfIndex } from '../lib/code-scan.mjs';
import { matchClose } from '../lib/table-access.mjs';

const KEYS = '(?:tier|base_tier|effective_tier)';
const BODY_NAMES = '(?:body|payload|requestBody|reqBody|bodyData)';

// body.tier = ...   body["base_tier"] = ...
const DOT_ASSIGN_RE = new RegExp(`\\b${BODY_NAMES}\\s*\\.\\s*(${KEYS})\\s*=(?!=)`, 'g');
const BRACKET_ASSIGN_RE = new RegExp(`\\b${BODY_NAMES}\\s*\\[\\s*(["'\`])(${KEYS})\\1\\s*\\]\\s*=(?!=)`, 'g');
// an object-literal key: tier: ...   "base_tier": ...  Unquoted keys are read on the code view (so the text
// "Re-tier: T3" inside a string is not a key); quoted keys are read on the text view and the quote must be a real
// string delimiter. An object key follows `{` or `,`; a key-shaped word inside JSX text, or a parameter or type
// annotation (`tier: number`), is not an object literal.
const OBJECT_KEY_RE = new RegExp(`(?<![\\w.$])(${KEYS})\\s*:(?!:)`, 'g');
const QUOTED_KEY_RE = new RegExp(`(["'])(${KEYS})\\1\\s*:(?!:)`, 'g');
const TYPE_WORD_RE = /^\s*(?:boolean|string|number|unknown|any|null|undefined|never|bigint|Json|Date|Record\b)\s*[;,}\n|]/;
const OBJECT_ASSIGN_RE = new RegExp(`\\bObject\\s*\\.\\s*assign\\s*\\(\\s*${BODY_NAMES}\\s*,`, 'g');
const REQUEST_CONTEXT_RE = /\bfetch\s*\(|\bJSON\s*\.\s*stringify\s*\(|\bmethod\s*:\s*['"`](?:POST|PUT|PATCH)['"`]/i;

/** Start index of the innermost bracket that encloses `index` in `code` (strings blanked) when it is a `{`;
 *  -1 when the innermost bracket is a `(` or `[` (a parameter list or an array) or when there is none. */
function enclosingBrace(code, index) {
  const depth = { '}': 0, ')': 0, ']': 0 };
  const pair = { '{': '}', '(': ')', '[': ']' };
  for (let i = index - 1; i >= 0; i--) {
    const c = code[i];
    if (c === '}' || c === ')' || c === ']') depth[c]++;
    else if (c === '{' || c === '(' || c === '[') {
      if (depth[pair[c]] === 0) return c === '{' ? i : -1;
      depth[pair[c]]--;
    }
  }
  return -1;
}

function prevSignificant(code, index) {
  let i = index - 1;
  while (i >= 0 && /\s/.test(code[i])) i--;
  return i >= 0 ? code[i] : '';
}

function lineSlice(text, fromLine, toLine) {
  const lines = text.split(/\r?\n/);
  return lines.slice(Math.max(0, fromLine - 1), Math.min(lines.length, toLine)).join('\n');
}

function scan(content) {
  const { code, text } = views(content);
  const overridden = overrideLines(content, 'F8');
  const found = [];
  let m;

  DOT_ASSIGN_RE.lastIndex = 0;
  while ((m = DOT_ASSIGN_RE.exec(code))) found.push({ line: lineOfIndex(code, m.index), key: m[1] });
  BRACKET_ASSIGN_RE.lastIndex = 0;
  while ((m = BRACKET_ASSIGN_RE.exec(text))) found.push({ line: lineOfIndex(text, m.index), key: m[2] });

  const keyHits = [];
  OBJECT_KEY_RE.lastIndex = 0;
  while ((m = OBJECT_KEY_RE.exec(code))) keyHits.push({ index: m.index, key: m[1], after: m.index + m[0].length });
  QUOTED_KEY_RE.lastIndex = 0;
  while ((m = QUOTED_KEY_RE.exec(text))) {
    if (code[m.index] !== m[1]) continue; // the opening quote must be a string delimiter, not text inside a string
    keyHits.push({ index: m.index, key: m[2], after: m.index + m[0].length });
  }
  for (const hit of keyHits) {
    const prev = prevSignificant(code, hit.index);
    if (prev !== '{' && prev !== ',') continue; // an object key follows `{` or `,`
    if (TYPE_WORD_RE.test(text.slice(hit.after, hit.after + 40))) continue; // a type member, not a value
    const open = enclosingBrace(code, hit.index);
    if (open < 0) continue;
    const close = matchClose(code, open);
    const startLine = lineOfIndex(code, open);
    const endLine = close < 0 ? lineOfIndex(code, code.length) : lineOfIndex(code, close);
    // a request context in the literal's own lines, the three lines before it, or the five lines after it
    const window = lineSlice(text, startLine - 3, endLine + 5);
    if (REQUEST_CONTEXT_RE.test(window)) found.push({ line: lineOfIndex(text, hit.index), key: hit.key, literal: true });
  }

  OBJECT_ASSIGN_RE.lastIndex = 0;
  while ((m = OBJECT_ASSIGN_RE.exec(code))) {
    const spellsTier = new RegExp(`(?<![\\w.$])["']?${KEYS}["']?\\s*[:=]`).test(text);
    if (spellsTier) found.push({ line: lineOfIndex(code, m.index), key: 'tier', assign: true });
  }

  const seen = new Set();
  return found.filter((f) => {
    if (overridden.has(f.line)) return false;
    const k = `${f.line}:${f.literal ? 'o' : f.assign ? 'a' : 'd'}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export const fitnessFunction = {
  id: 'F8',
  name: 'client-server-tier-boundary',
  description: 'Client-side code must not write tier-shaped fields to request bodies. Server (API routes) handles base_tier + effective_tier dual-write; client sends operator-chosen value via a semantically named field.',
  source: 'OBS-62 (Phase 1.5 architectural-decision-in-docstring gap) + Sprint Architecture dispatch',

  enumerate() {
    const candidates = globFiles([
      'fsi-app/src/components/**/*.{ts,tsx}',
      'fsi-app/src/app/**/*.tsx',
      'fsi-app/src/stores/**/*.ts',
      'fsi-app/src/hooks/**/*.ts',
      'fsi-app/src/lib/client/**/*.{ts,tsx,js,jsx,mjs}',
    ]);
    // any other src file that opens with the "use client" directive is client code, wherever it lives
    const others = globFiles(['fsi-app/src/**/*.{ts,tsx,js,jsx,mjs}']).filter((p) => !candidates.includes(p)).filter((p) => {
      const c = readFile(p);
      return c !== null && /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(c);
    });
    // Defensive: exclude any file that ended up matching but is under app/api/
    return [...candidates, ...others].filter((p) => !p.startsWith('fsi-app/src/app/api/'));
  },

  check(filepath, content) {
    return scan(content).map((f) => violation(
      f.line,
      f.literal
        ? `Object literal contains tier-shaped field "${f.key}" near a fetch/POST/PUT/JSON.stringify call. Client must not include tier fields in request bodies. Override: trailing \`// fitness-allow: F8 (reason)\`.`
        : f.assign
          ? `Object.assign into a request body in a file that spells a tier-shaped key. Client must not write tier-shaped fields; tier handling is server-side only. Override: trailing \`// fitness-allow: F8 (reason)\`.`
          : `Client-side assignment to body.${f.key}. Client must not write tier-shaped fields; tier handling is server-side only. Send a semantically-named field (e.g., body.assignedTier or body.classifierTier) and update the corresponding server handler to read the new field. Override: trailing \`// fitness-allow: F8 (reason)\`.`,
    ));
  },
};
