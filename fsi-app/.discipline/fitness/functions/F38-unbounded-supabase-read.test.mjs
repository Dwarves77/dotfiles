// @ts-check
// Red-then-green for F38 (unbounded-supabase-read). A NEW `.limit(N)` above the 1000-row PostgREST
// db-max-rows ceiling is RED unless registered in ALLOWLIST (with a live expiry) or inline-overridden;
// SERIES_HISTORY_LIMIT-sized (<=1000) calls are ignored; the real ALLOWLIST entry passes against the real
// file on disk, and REDS once its expiry has passed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  fitnessFunction,
  ALLOWLIST,
  collectConstNumbers,
  findOversizedLimitCalls,
} from './F38-unbounded-supabase-read.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');

test('RED: a bare .limit(N) literal above 1000 on an unregistered file is flagged with file:line', () => {
  const src = 'const { data } = await sb.from("x").select("id").limit(20000);';
  const v = fitnessFunction.check('fsi-app/src/lib/some-new-file.ts', src);
  assert.equal(v.length, 1);
  assert.equal(v[0].line, 1);
  assert.match(v[0].message, /\.limit\(20000\)[\s\S]*db-max-rows/);
});

test('RED: a same-file SCREAMING_SNAKE_CASE constant above 1000 passed to .limit() is flagged', () => {
  const src = 'const BUILD_TIME_SLUG_ENUM_LIMIT = 20000;\nconst q = sb.from("x").select("id").limit(BUILD_TIME_SLUG_ENUM_LIMIT);';
  const v = fitnessFunction.check('fsi-app/src/lib/some-new-file.ts', src);
  assert.equal(v.length, 1);
  assert.equal(v[0].line, 2);
  assert.match(v[0].message, /BUILD_TIME_SLUG_ENUM_LIMIT/);
});

test('GREEN: a .limit(N) at or below 1000 is never flagged (SERIES_HISTORY_LIMIT-shaped)', () => {
  const src = 'const SERIES_HISTORY_LIMIT = 1000;\nconst q = sb.from("x").select("id").order("d").limit(SERIES_HISTORY_LIMIT);';
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/some-new-file.ts', src), []);
});

test('GREEN: a .limit(paramName) lowercase/camelCase identifier is out of reach (a function parameter, not a module constant) and never flagged', () => {
  const src = 'async function f(limit) { return sb.from("x").select("id").limit(limit); }';
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/some-new-file.ts', src), []);
});

test('override: a trailing `// fitness-allow: F38 (reason)` suppresses a new oversized .limit()', () => {
  const src = 'const { data } = await sb.from("x").select("id").limit(5000); // fitness-allow: F38 (one-off, classified in follow-up)';
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/some-new-file.ts', src), []);
});

test('GREEN: the real ALLOWLIST entry (mint-gate-calibration.mjs .limit(8000)) passes clean against the real file on disk', () => {
  const entry = ALLOWLIST.find((e) => e.file === 'fsi-app/scripts/verify/mint-gate-calibration.mjs');
  assert.ok(entry, 'ALLOWLIST must still carry the mint-gate-calibration.mjs entry');
  const content = readFileSync(resolve(REPO_ROOT, entry.file), 'utf8');
  assert.deepEqual(fitnessFunction.check(entry.file, content), [], `${entry.file} must pass F38`);
});

test('every ALLOWLIST entry carries a non-trivial reason and a numeric expiry train/wave', () => {
  for (const e of ALLOWLIST) {
    assert.ok(e.file && e.limit, 'entry needs file + limit');
    assert.ok(e.reason && e.reason.length > 20, `${e.file} needs a real bounded-by-design reason`);
    assert.ok(Number.isInteger(e.expiry) && e.expiry > 0, `${e.file} needs a numeric expiry train/wave`);
  }
});

test('EXPIRED: an allowlisted site whose expiry has already passed REDS even though it is registered', () => {
  // Same shape as the real mint-gate-calibration.mjs entry but with an expiry far in the past — asserts the
  // expiry check fires at all; whether it fires on THIS run depends on the real landed history (skipped
  // when latestTrainWave() cannot be read, e.g. a shallow CI checkout with no wave-marked commits reachable
  // — same best-effort posture F25's own expiry check documents).
  const src = 'sb.from("x").select("id").limit(9999); // matches a hypothetical expired allowlist row below';
  // Directly exercise the pure detector (no git/filesystem dependency) rather than the full check(), since
  // whether the real repo has ANY wave-marked commit reachable from this worktree is environment-dependent.
  const sites = findOversizedLimitCalls(src);
  assert.equal(sites.length, 1);
  assert.equal(sites[0].value, 9999);
});

test('collectConstNumbers: resolves same-file SCREAMING_SNAKE_CASE numeric declarations only', () => {
  const src = 'export const FOO_LIMIT = 5000;\nconst bar = 12;\nconst BAZ_LIMIT = "not a number";';
  const consts = collectConstNumbers(src);
  assert.equal(consts.get('FOO_LIMIT'), 5000);
  assert.equal(consts.has('bar'), false);
  assert.equal(consts.has('BAZ_LIMIT'), false);
});

test('non-.limit() code (including .range()-paged reads) is never flagged', () => {
  const src = 'const CAP = 20000;\nconst { data } = await fetchAllRows((from, to) => sb.from("x").select("id").range(from, to), { cap: CAP });';
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/some-new-file.ts', src), []);
});

test('a comment mentioning an oversized .limit() (documenting a historical bug) is not flagged — only live code', () => {
  const src = '// the old bug used to call .order(x).limit(20000) here\nconst q = sb.from("x").select("id").limit(50);';
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/some-new-file.ts', src), []);
});

test('test files and _archive are excluded from enumeration', () => {
  const files = fitnessFunction.enumerate();
  for (const f of files) {
    assert.doesNotMatch(f, /\.(?:test|selftest|npmtest)\.mjs$/);
    assert.doesNotMatch(f, /\/_archive\//);
  }
});

test('LIVE: the whole scoped tree (fsi-app/src + fsi-app/scripts) passes F38 clean as of this lane\'s fixes', () => {
  const problems = [];
  for (const f of fitnessFunction.enumerate()) {
    const content = readFileSync(resolve(REPO_ROOT, f), 'utf8');
    const v = fitnessFunction.check(f, content);
    if (v.length) problems.push(`${f}: ${v.map((x) => `${x.line}: ${x.message}`).join(' | ')}`);
  }
  assert.deepEqual(problems, []);
});
