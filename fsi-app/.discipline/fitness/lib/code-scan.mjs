// Shared reading helpers for the fitness functions that scan JavaScript or TypeScript source (lane GATE-8,
// 2026-10-08, AUD-AT-4 register). They sit on the one source lexer (governance/source-lexer.mjs, re-exported
// by governance/coverage-scan.mjs) so that no function answers "is this text code, a comment or a string?"
// with a regex of its own.
//
//   views(content)               { code, text, comments }: three index-aligned copies of the source.
//                                code = strings and comments blanked; text = comments blanked, strings kept;
//                                comments = only comment text. Memoised for the last source asked for.
//   overrideLines(content, id)   1-based line numbers carrying a real `fitness-allow: <id> (reason)` marker.
//                                A marker inside a string literal is not a marker.
//   lineOfIndex(text, index)     1-based line of an index.
//   foldedText(content)          `text` with adjacent string literals joined, so a host split over a `+` is
//                                one literal (newlines relocated, the line count is unchanged).
//   hasCodeIdentifier(c, name)   the identifier appears in CODE (not in a comment, not in a string).
//   isTestOrFixturePath(path)    a test, selftest, npmtest, golden or __tests__ path.

import { codeOnly, codeAndStrings, commentsOnly, foldStringConcat } from '../../governance/coverage-scan.mjs';

let lastSrc = null;
let lastViews = null;

export function views(content) {
  const src = String(content ?? '');
  if (lastViews && lastSrc === src) return lastViews;
  lastViews = { code: codeOnly(src), text: codeAndStrings(src), comments: commentsOnly(src) };
  lastSrc = src;
  return lastViews;
}

export function lineOfIndex(text, index) {
  let n = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

function markerRe(id) {
  return new RegExp(`\\bfitness-allow:\\s*${id}\\s*\\(([^)]+)\\)`);
}

export function overrideLines(content, id) {
  const re = markerRe(id);
  const out = new Set();
  const lines = views(content).comments.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) out.add(i + 1);
  return out;
}

export function foldedText(content) {
  return foldStringConcat(views(content).text);
}

export function hasCodeIdentifier(content, name) {
  const esc = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\w$])${esc}(?![\\w$])`).test(views(content).code);
}

export function isTestOrFixturePath(path) {
  const p = String(path).replace(/\\/g, '/');
  return /\.(test|selftest|npmtest|golden)\.(ts|tsx|mjs|js|cjs)$/.test(p) || /-golden\.mjs$/.test(p) || p.includes('/__tests__/');
}
