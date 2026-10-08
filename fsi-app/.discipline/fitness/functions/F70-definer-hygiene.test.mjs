// Red-then-green for F70 (definer-hygiene). Rule 15: a guard is proven by attack, not by presence. Every RED case
// below is a fixture migration that MUST fail; every GREEN case is a shape that must never be flagged, including the
// real migration 371. See the function's own header for the defect class.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  fitnessFunction,
  findDefinerFunctions,
  checkDefinerHygiene,
  MIN_MIGRATION_NUMBER,
} from './F70-definer-hygiene.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');

const CLEAN = [
  'CREATE OR REPLACE FUNCTION public.widget_count(p_org uuid)',
  'RETURNS integer',
  'LANGUAGE sql',
  'STABLE SECURITY DEFINER',
  'SET search_path = public, pg_temp',
  'AS $$ SELECT 1 $$;',
  '',
  'REVOKE EXECUTE ON FUNCTION public.widget_count(uuid) FROM PUBLIC, anon;',
  'GRANT EXECUTE ON FUNCTION public.widget_count(uuid) TO authenticated;',
].join('\n');

test('findDefinerFunctions: finds a SECURITY DEFINER in the header and in the tail after the body, ignores invokers and comments', () => {
  const content = [
    '-- CREATE FUNCTION public.commented_out() SECURITY DEFINER',
    'CREATE FUNCTION public.in_header() RETURNS int LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;',
    'CREATE FUNCTION public.in_tail() RETURNS int AS $f$ SELECT 1 $f$ LANGUAGE sql SECURITY DEFINER;',
    'CREATE FUNCTION public.invoker() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;',
    "CREATE FUNCTION public.mentions_it() RETURNS text LANGUAGE sql AS $$ SELECT 'SECURITY DEFINER' $$;",
  ].join('\n');
  const found = findDefinerFunctions(content);
  assert.deepEqual(found.map((f) => f.name), ['in_header', 'in_tail']);
  assert.deepEqual(found.map((f) => f.line), [2, 3]);
});

test('findDefinerFunctions: reports whether a definer returns trigger and whether it pins the path inline', () => {
  const content = [
    'CREATE FUNCTION public.t() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$ BEGIN RETURN NEW; END $$;',
    'CREATE FUNCTION public.f() RETURNS int LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;',
  ].join('\n');
  assert.deepEqual(
    findDefinerFunctions(content).map((f) => [f.name, f.returnsTrigger, f.inlineSearchPath]),
    [['t', true, true], ['f', false, false]],
  );
});

test('GREEN: a SECURITY DEFINER function with REVOKE ... FROM PUBLIC and a header search_path is never flagged', () => {
  assert.deepEqual(checkDefinerHygiene({ filepath: '999_fixture.sql', content: CLEAN }), []);
});

test('GREEN: ALTER FUNCTION ... SET search_path in the same file satisfies the search_path half, and REVOKE ALL satisfies the revoke half', () => {
  const content = [
    'CREATE FUNCTION public.widget_count(p_org uuid) RETURNS integer LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;',
    'REVOKE ALL ON FUNCTION public.widget_count(uuid) FROM PUBLIC;',
    'ALTER FUNCTION public.widget_count(uuid) SET search_path = public, pg_temp;',
  ].join('\n');
  assert.deepEqual(checkDefinerHygiene({ filepath: '999_fixture.sql', content }), []);
});

test('RED (fixture migration that MUST fail, rule 15): a SECURITY DEFINER function with neither half is a violation naming the file, the function and both missing halves', () => {
  const content = 'CREATE FUNCTION public.leaky() RETURNS int LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;\n';
  const v = checkDefinerHygiene({ filepath: 'fsi-app/supabase/migrations/999_fixture.sql', content });
  assert.equal(v.length, 1);
  assert.equal(v[0].line, 1);
  assert.match(v[0].message, /999_fixture\.sql/);
  assert.match(v[0].message, /public\.leaky|leaky/);
  assert.match(v[0].message, /REVOKE EXECUTE/);
  assert.match(v[0].message, /search_path/);
});

test('RED: a definer with a search_path but no REVOKE ... FROM PUBLIC names only the REVOKE', () => {
  const content = 'CREATE FUNCTION public.leaky() RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$ SELECT 1 $$;\n';
  const v = checkDefinerHygiene({ filepath: '999_fixture.sql', content });
  assert.equal(v.length, 1);
  assert.match(v[0].message, /REVOKE EXECUTE/);
  assert.doesNotMatch(v[0].message, /missing:[^.]*search_path/);
});

test('RED: a definer with a REVOKE but no search_path names only the search_path', () => {
  const content = [
    'CREATE FUNCTION public.leaky() RETURNS int LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;',
    'REVOKE EXECUTE ON FUNCTION public.leaky() FROM PUBLIC;',
  ].join('\n');
  const v = checkDefinerHygiene({ filepath: '999_fixture.sql', content });
  assert.equal(v.length, 1);
  assert.match(v[0].message, /search_path/);
  assert.doesNotMatch(v[0].message, /missing:[^.]*REVOKE/);
});

test('RED: a REVOKE that names only anon or authenticated does not satisfy the PUBLIC half', () => {
  const content = [
    'CREATE FUNCTION public.leaky() RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$ SELECT 1 $$;',
    'REVOKE EXECUTE ON FUNCTION public.leaky() FROM anon, authenticated;',
  ].join('\n');
  assert.equal(checkDefinerHygiene({ filepath: '999_fixture.sql', content }).length, 1);
});

test('RED: a REVOKE for a different function does not satisfy the half for this one', () => {
  const content = [
    'CREATE FUNCTION public.leaky() RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$ SELECT 1 $$;',
    'REVOKE EXECUTE ON FUNCTION public.other() FROM PUBLIC;',
  ].join('\n');
  assert.equal(checkDefinerHygiene({ filepath: '999_fixture.sql', content }).length, 1);
});

test('RED: a commented-out REVOKE or search_path does not count', () => {
  const content = [
    'CREATE FUNCTION public.leaky() RETURNS int LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;',
    '-- REVOKE EXECUTE ON FUNCTION public.leaky() FROM PUBLIC;',
    '-- ALTER FUNCTION public.leaky() SET search_path = public, pg_temp;',
  ].join('\n');
  assert.equal(checkDefinerHygiene({ filepath: '999_fixture.sql', content })[0].message.includes('REVOKE'), true);
});

test('RED: a trigger function that is SECURITY DEFINER is held to the same rule', () => {
  const content = 'CREATE FUNCTION public.trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN NEW; END $$;\n';
  assert.equal(checkDefinerHygiene({ filepath: '999_fixture.sql', content }).length, 1);
});

test('each definer in a file is judged on its own: one clean and one leaky function give one violation', () => {
  const content = `${CLEAN}\n\nCREATE FUNCTION public.leaky() RETURNS int LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;\n`;
  const v = checkDefinerHygiene({ filepath: '999_fixture.sql', content });
  assert.equal(v.length, 1);
  assert.match(v[0].message, /leaky/);
});

test('GREEN: a migration numbered below the threshold is out of scope by number, not by allowlist', () => {
  assert.equal(MIN_MIGRATION_NUMBER, 371);
  const content = 'CREATE FUNCTION public.leaky() RETURNS int LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;\n';
  assert.deepEqual(fitnessFunction.check('fsi-app/supabase/migrations/370_fixture.sql', content), []);
  assert.deepEqual(fitnessFunction.check('fsi-app/supabase/migrations/001_schema.sql', content), []);
  assert.equal(fitnessFunction.check('fsi-app/supabase/migrations/371_fixture.sql', content).length, 1);
  assert.equal(fitnessFunction.check('fsi-app/supabase/migrations/999_fixture.sql', content).length, 1);
});

test('the function is registered under the id the filename declares and enumerates only migrations at or above the threshold', () => {
  assert.equal(fitnessFunction.id, 'F70');
  assert.equal(fitnessFunction.name, 'definer-hygiene');
  const files = fitnessFunction.enumerate();
  assert.ok(files.length >= 1, 'enumerates at least migration 371');
  for (const f of files) {
    const n = Number(/(\d+)_[^/]*\.sql$/.exec(f)?.[1]);
    assert.ok(n >= MIN_MIGRATION_NUMBER, `${f} is below the threshold`);
  }
});

test('LIVE: every real migration at or above the threshold passes F70, including 371', () => {
  const dir = resolve(REPO_ROOT, 'fsi-app/supabase/migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).map((f) => `fsi-app/supabase/migrations/${f}`);
  assert.ok(files.some((f) => f.includes('/371_definer_hygiene.sql')), 'migration 371 exists');
  const problems = [];
  for (const f of files) {
    const v = fitnessFunction.check(f, readFileSync(resolve(REPO_ROOT, f), 'utf8'));
    if (v.length) problems.push(`${f}: ${v.map((x) => `${x.line}: ${x.message}`).join(' | ')}`);
  }
  assert.deepEqual(problems, []);
});
