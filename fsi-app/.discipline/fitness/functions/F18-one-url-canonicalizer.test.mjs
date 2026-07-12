// @ts-check
// Red-then-green for F18 (one-url-canonicalizer). The deleted intake `_normUrl` shape is RED; the sanctioned
// canonicalizer + host-extractors + the citation-URL mirror are clean; comments naming the regex don't trip;
// override suppresses. Plus the LIVE census: the whole shipped src/ tree passes F18 (the _normUrl class is dead).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fitnessFunction, findAdHocUrlNormalizers } from './F18-one-url-canonicalizer.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');
const F = (path, content) => fitnessFunction.check(path, content);

test('RED: the deleted _normUrl shape (bare scheme-strip + whole query drop) is flagged', () => {
  const src = 'const _normUrl = (u) => String(u).toLowerCase().replace(/^https?:\\/\\//, "").replace(/^www\\./, "").replace(/[#?].*$/, "").replace(/\\/+$/, "");';
  const v = F('fsi-app/src/lib/entities/entity-resolve.mjs', src);
  assert.equal(v.length, 1, 'the _normUrl line is flagged once');
  assert.equal(v[0].line, 1);
  assert.match(v[0].message, /canonicalizeUrl/);
});

test('RED: a whole query/fragment drop alone is flagged (the D1 defect core)', () => {
  assert.equal(F('fsi-app/src/lib/x.ts', 'const k = url.replace(/[#?].*$/, "");').length, 1);
  assert.equal(F('fsi-app/src/lib/x.ts', 'const k = url.replace(/[?#].*/, "");').length, 1);
});

test('GREEN: host extraction (new URL(x).host.replace(/^www./)) is NOT a URL-identity normalizer', () => {
  assert.deepEqual(F('fsi-app/src/lib/sources/institution.ts', 'const h = new URL(u).host.replace(/^www\\./, "").toLowerCase();'), []);
});

test('GREEN: canonicalizeCitationUrl-style transforms (scheme-preserving www strip, punct/markdown strip) are clean', () => {
  const src = [
    's = s.replace(/^(https?:\\/\\/)www\\./, "$1");',
    's = s.replace(/[*`]+$/, "");',
    's = s.replace(/[/.,;:]+$/, "");',
  ].join('\n');
  assert.deepEqual(F('fsi-app/src/lib/agent/url-canon.mjs', src), []);
});

test('GREEN: trailing-slash trim on a base URL is clean', () => {
  assert.deepEqual(F('fsi-app/src/lib/sources/canonical-fetch.mjs', 'const base = X.replace(/\\/+$/, "");'), []);
});

test('comment-stripped: a comment NAMING the old regex is not a violation', () => {
  const src = '// the prior _normUrl stripped the whole query ([#?].*$) — collapsing eur-lex URLs\nconst ok = 1;';
  assert.deepEqual(F('fsi-app/src/lib/entities/entity-resolve.mjs', src), []);
});

test('override: trailing `// fitness-allow: F18 (reason)` suppresses', () => {
  const src = 'const k = url.replace(/[#?].*$/, ""); // fitness-allow: F18 (one-off legacy, tracked)';
  assert.deepEqual(F('fsi-app/src/lib/x.ts', src), []);
});

test('the sanctioned home (url-canonicalize.ts) is exempt from the scan', () => {
  // even a raw scheme-strip in the sanctioned home is allowed (it OWNS URL normalization)
  assert.deepEqual(F('fsi-app/src/lib/sources/url-canonicalize.ts', 'x.replace(/^https?:\\/\\//, "")'), []);
});

test('RED (C8): URL reassembly `${scheme}//${host}${path}` outside the home is flagged (URL()-class)', () => {
  const v = F('fsi-app/src/lib/x.ts', 'const key = `${u.protocol}//${host}${u.pathname}${u.search}`;');
  assert.equal(v.length, 1, 'a rebuilt normalized URL identity string is a duplicate canonicalizer');
});

test('GREEN (C8): field COMPARISON (host===host && path===path, no rebuilt string) is NOT flagged', () => {
  // verification.ts checkDuplicate compares extracted parts; it never reassembles → not a canonicalizer.
  assert.deepEqual(F('fsi-app/src/lib/sources/verification.ts', 'if (existingHost === host) { if (existingPath === pathname) return true; }'), []);
  assert.deepEqual(F('fsi-app/src/lib/sources/verification.ts', 'pathname = u.pathname.replace(/\\/+$/, "") || "/";'), []);
});

test('GREEN (C8): host EXTRACTION (new URL(x).host) is a single field, not reassembly', () => {
  assert.deepEqual(F('fsi-app/src/lib/x.ts', 'const h = new URL(u).host.replace(/^www\\./, "").toLowerCase();'), []);
});

test('the sanctioned home (url-canonicalize.ts) reassembly is exempt', () => {
  assert.deepEqual(F('fsi-app/src/lib/sources/url-canonicalize.ts', 'return `${scheme}//${authority}${path}${query}`;'), []);
});

test('LIVE CENSUS: the whole shipped src/ tree passes F18 — the _normUrl class is dead everywhere', () => {
  const files = fitnessFunction.enumerate();
  assert.ok(files.length > 50, `enumerate must find the src tree (got ${files.length})`);
  const offenders = [];
  for (const f of files) {
    let content;
    try { content = readFileSync(resolve(REPO_ROOT, f), 'utf8'); } catch { continue; }
    const v = fitnessFunction.check(f, content);
    if (v.length) offenders.push(`${f}:${v.map((x) => x.line).join(',')}`);
  }
  assert.deepEqual(offenders, [], `ad-hoc URL normalizers must exist nowhere but the sanctioned home; found: ${offenders.join(' | ')}`);
});

test('LIVE: the fixed entity-resolve.mjs passes F18 (routes through canonicalizeUrl)', () => {
  const content = readFileSync(resolve(REPO_ROOT, 'fsi-app/src/lib/entities/entity-resolve.mjs'), 'utf8');
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/entities/entity-resolve.mjs', content), []);
  assert.match(content, /canonicalizeUrl/, 'entity-resolve.mjs imports the sanctioned canonicalizer');
  assert.doesNotMatch(content.split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n'), /_normUrl/, 'no _normUrl in code');
});

test('exported findAdHocUrlNormalizers returns line numbers', () => {
  assert.deepEqual(findAdHocUrlNormalizers('a\nb.replace(/^https?:\\/\\//,"")\nc'), [2]);
});
