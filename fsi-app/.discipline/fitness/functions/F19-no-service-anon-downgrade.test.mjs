// @ts-check
// Red-then-green for F19. The coverage-gaps.ts downgrade shape is RED (either order, across a line break); the
// fail-closed canonical is clean; an override suppresses; and the LIVE census: the whole src tree passes F19
// (the anon-downgrade class is dead — coverage-gaps.ts now routes through getServiceSupabase).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fitnessFunction, findServiceAnonDowngrade } from './F19-no-service-anon-downgrade.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');

test('RED: the coverage-gaps downgrade shape (SERVICE_ROLE || ANON across lines) is flagged', () => {
  const src = 'const key =\n  process.env.SUPABASE_SERVICE_ROLE_KEY ||\n  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;';
  const v = fitnessFunction.check('fsi-app/src/lib/x.ts', src);
  assert.equal(v.length, 1);
  assert.match(v[0].message, /fail-closed/i);
});

test('RED: reverse order (ANON || SERVICE_ROLE) is also flagged', () => {
  const src = 'const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;';
  assert.equal(fitnessFunction.check('fsi-app/src/lib/x.ts', src).length, 1);
});

test('GREEN: the fail-closed canonical (throws on missing key) is clean', () => {
  const src = 'const key = process.env.SUPABASE_SERVICE_ROLE_KEY;\nif (!key) throw new Error("no service key");';
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/supabase-service.ts', src), []);
});

test('override: trailing `// fitness-allow: F19 (reason)` suppresses', () => {
  const src = 'const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; // fitness-allow: F19 (legacy, tracked)';
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/x.ts', src), []);
});

test('findServiceAnonDowngrade returns the 1-indexed line', () => {
  assert.equal(findServiceAnonDowngrade('a\nb\nx SUPABASE_SERVICE_ROLE_KEY || y NEXT_PUBLIC_SUPABASE_ANON_KEY'), 3);
  assert.equal(findServiceAnonDowngrade('const k = process.env.SUPABASE_SERVICE_ROLE_KEY;'), 0);
});

test('LIVE CENSUS: the whole src tree passes F19 — the anon-downgrade class is dead', () => {
  const files = fitnessFunction.enumerate();
  const offenders = [];
  for (const f of files) {
    let content;
    try { content = readFileSync(resolve(REPO_ROOT, f), 'utf8'); } catch { continue; }
    const v = fitnessFunction.check(f, content);
    if (v.length) offenders.push(`${f}:${v[0].line}`);
  }
  assert.deepEqual(offenders, [], `service→anon downgrade must exist nowhere in src; found: ${offenders.join(', ')}`);
});
