// Red-then-green for F64 (rls-admin-gate-class). Rule 15: a guard is proven by attack, not by
// presence -- every RED case below is a fixture that MUST fail; every GREEN case is a shape that must
// never be flagged, including the real org-scoped and is_platform_admin patterns this repo already
// ships. See this function's own header for the defect class and the calibration disclosure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  fitnessFunction,
  findCreateTables,
  hasRlsEnableAnywhere,
  checkRlsEnableGap,
  findCreatePolicies,
  looksLikeOrgMembershipsAdminCheck,
  checkAdminGateClass,
  RLS_ENABLE_ALLOWLIST,
  ADMIN_GATE_PREEXISTING_ALLOWLIST,
} from './F64-rls-admin-gate-class.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');

// ── CHECK 1: RLS-enable gap ──────────────────────────────────────────────────────────────────────

test('findCreateTables: extracts table name and line, case-insensitive, IF NOT EXISTS optional', () => {
  const content = [
    'CREATE TABLE IF NOT EXISTS public.widgets (',
    '  id uuid PRIMARY KEY',
    ');',
    '',
    'create table Gadgets (id uuid);',
  ].join('\n');
  const found = findCreateTables(content);
  assert.deepEqual(found, [
    { table: 'widgets', line: 1 },
    { table: 'gadgets', line: 5 },
  ]);
});

test('hasRlsEnableAnywhere: true when ANY file in the set carries the enabling statement', () => {
  const allFiles = [
    { path: 'a.sql', text: 'CREATE TABLE widgets (id uuid);' },
    { path: 'b.sql', text: 'ALTER TABLE public.widgets ENABLE ROW LEVEL SECURITY;' },
  ];
  assert.equal(hasRlsEnableAnywhere(allFiles, 'widgets'), true);
  assert.equal(hasRlsEnableAnywhere(allFiles, 'gizmos'), false);
});

test('RED (fixture migration that MUST fail, rule 15): a new CREATE TABLE with RLS enabled nowhere in the set is a violation', () => {
  const content = 'CREATE TABLE IF NOT EXISTS public.new_fixture_widgets (\n  id uuid PRIMARY KEY\n);\n';
  const allFiles = [{ path: '999_fixture.sql', text: content }];
  const violations = checkRlsEnableGap({ content, allFiles, allowlist: {} });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 1);
  assert.match(violations[0].message, /new_fixture_widgets/);
  assert.match(violations[0].message, /ENABLE ROW LEVEL SECURITY/);
});

test('GREEN: a CREATE TABLE whose enabling statement lives in a DIFFERENT companion file is never flagged', () => {
  const content = 'CREATE TABLE IF NOT EXISTS public.new_fixture_widgets (\n  id uuid PRIMARY KEY\n);\n';
  const allFiles = [
    { path: '999_fixture.sql', text: content },
    { path: '999_rls_fixture.sql', text: 'ALTER TABLE public.new_fixture_widgets ENABLE ROW LEVEL SECURITY;' },
  ];
  assert.deepEqual(checkRlsEnableGap({ content, allFiles, allowlist: {} }), []);
});

test('GREEN: an allowlisted table name is never flagged even with RLS enabled nowhere', () => {
  const content = 'CREATE TABLE IF NOT EXISTS public.system_state (\n  id uuid PRIMARY KEY\n);\n';
  const allFiles = [{ path: '016_add_processing_pause.sql', text: content }];
  assert.deepEqual(
    checkRlsEnableGap({ content, allFiles, allowlist: { system_state: { decidedOn: '2026-10-01', reason: 'test' } } }),
    [],
  );
});

test('every RLS_ENABLE_ALLOWLIST entry carries a decidedOn date and a non-empty reason', () => {
  for (const [table, entry] of Object.entries(RLS_ENABLE_ALLOWLIST)) {
    assert.match(entry.decidedOn, /^\d{4}-\d{2}-\d{2}$/, `${table} missing a dated decidedOn`);
    assert.ok(entry.reason && entry.reason.length > 10, `${table} missing a reason`);
  }
});

// ── CHECK 2: admin-gate class ────────────────────────────────────────────────────────────────────

test('findCreatePolicies: extracts policy name, body, and line', () => {
  const content = [
    'CREATE POLICY "my_policy"',
    '  ON public.widgets',
    '  FOR SELECT',
    '  USING (true);',
  ].join('\n');
  const found = findCreatePolicies(content);
  assert.equal(found.length, 1);
  assert.equal(found[0].name, 'my_policy');
  assert.equal(found[0].line, 1);
  assert.match(found[0].stmt, /USING \(true\)/);
});

test('looksLikeOrgMembershipsAdminCheck: true for a global role check with no org_id tie-back', () => {
  const stmt = `
    EXISTS (
      SELECT 1 FROM org_memberships m
      WHERE m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
  `;
  assert.equal(looksLikeOrgMembershipsAdminCheck(stmt), true);
});

test('looksLikeOrgMembershipsAdminCheck: false when the statement ties back to org_id (legitimate per-org scoping)', () => {
  const stmt = `
    EXISTS (
      SELECT 1 FROM public.org_memberships m
      WHERE m.org_id = org_invitations.org_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
  `;
  assert.equal(looksLikeOrgMembershipsAdminCheck(stmt), false);
});

test('looksLikeOrgMembershipsAdminCheck: false for a profiles.is_platform_admin check (no org_memberships at all)', () => {
  const stmt = `
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_platform_admin = true)
  `;
  assert.equal(looksLikeOrgMembershipsAdminCheck(stmt), false);
});

test('RED (fixture migration that MUST fail, rule 15): a fresh org_memberships global admin-check policy is a violation', () => {
  const content = [
    'CREATE TABLE IF NOT EXISTS public.fixture_secrets (id uuid PRIMARY KEY);',
    'ALTER TABLE public.fixture_secrets ENABLE ROW LEVEL SECURITY;',
    'CREATE POLICY "fixture_secrets_admin_read"',
    '  ON public.fixture_secrets',
    '  FOR SELECT',
    '  USING (',
    '    EXISTS (',
    '      SELECT 1 FROM org_memberships m',
    "      WHERE m.user_id = auth.uid() AND m.role IN ('owner', 'admin')",
    '    )',
    '  );',
  ].join('\n');
  const allFiles = [{ path: '999_fixture.sql', text: content }];
  const violations = checkAdminGateClass({ filepath: '999_fixture.sql', content, allFiles, allowlist: {} });
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /fixture_secrets_admin_read/);
  assert.match(violations[0].message, /is_platform_admin/);
});

test('GREEN: an org-scoped admin check tying back to org_id is never flagged', () => {
  const content = [
    'CREATE POLICY "org_invitations_admin_read"',
    '  ON public.org_invitations',
    '  FOR SELECT',
    '  USING (',
    '    EXISTS (',
    '      SELECT 1 FROM public.org_memberships m',
    '      WHERE m.org_id = org_invitations.org_id',
    '        AND m.user_id = auth.uid()',
    "        AND m.role IN ('owner', 'admin')",
    '    )',
    '  );',
  ].join('\n');
  const allFiles = [{ path: '076_org_invitations.sql', text: content }];
  assert.deepEqual(
    checkAdminGateClass({ filepath: '076_org_invitations.sql', content, allFiles, allowlist: {} }),
    [],
  );
});

test('GREEN: a profiles.is_platform_admin policy is never flagged', () => {
  const content = [
    'CREATE POLICY "integrity_flags_admin_read" ON public.integrity_flags FOR SELECT',
    '  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_platform_admin = true));',
  ].join('\n');
  const allFiles = [{ path: '249_platform_admin_rls_alignment_2026_08_09.sql', text: content }];
  assert.deepEqual(
    checkAdminGateClass({ filepath: '249_platform_admin_rls_alignment_2026_08_09.sql', content, allFiles, allowlist: {} }),
    [],
  );
});

test('GREEN: a superseded bad definition is not re-flagged once a later migration redefines the same policy name cleanly', () => {
  const oldContent = [
    'CREATE POLICY "integrity_flags_admin_read" ON public.integrity_flags FOR SELECT',
    '  USING (EXISTS (SELECT 1 FROM org_memberships m WHERE m.user_id = auth.uid() AND m.role IN (\'owner\', \'admin\')));',
  ].join('\n');
  const newContent = [
    'CREATE POLICY "integrity_flags_admin_read" ON public.integrity_flags FOR SELECT',
    '  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_platform_admin = true));',
  ].join('\n');
  const allFiles = [
    { path: '048_integrity_flags_platform.sql', text: oldContent },
    { path: '249_platform_admin_rls_alignment_2026_08_09.sql', text: newContent },
  ];
  // the OLD file's superseded definition is not flagged when its own file is checked
  assert.deepEqual(
    checkAdminGateClass({ filepath: '048_integrity_flags_platform.sql', content: oldContent, allFiles, allowlist: {} }),
    [],
  );
  // the NEW (current) definition is clean, so checking it also returns nothing
  assert.deepEqual(
    checkAdminGateClass({ filepath: '249_platform_admin_rls_alignment_2026_08_09.sql', content: newContent, allFiles, allowlist: {} }),
    [],
  );
});

test('RED: a bad definition that is still the CURRENT (highest-numbered) one is flagged even if an EARLIER file also defined it badly', () => {
  const badOld = [
    'CREATE POLICY "fixture_thing_admin" ON public.fixture_thing FOR SELECT',
    '  USING (EXISTS (SELECT 1 FROM org_memberships m WHERE m.user_id = auth.uid() AND m.role IN (\'owner\', \'admin\')));',
  ].join('\n');
  const badNew = [
    'CREATE POLICY "fixture_thing_admin" ON public.fixture_thing FOR ALL',
    '  USING (EXISTS (SELECT 1 FROM org_memberships m WHERE m.user_id = auth.uid() AND m.role IN (\'owner\', \'admin\')));',
  ].join('\n');
  const allFiles = [
    { path: '100_fixture_old.sql', text: badOld },
    { path: '200_fixture_new.sql', text: badNew },
  ];
  assert.deepEqual(
    checkAdminGateClass({ filepath: '100_fixture_old.sql', content: badOld, allFiles, allowlist: {} }),
    [],
  );
  const v = checkAdminGateClass({ filepath: '200_fixture_new.sql', content: badNew, allFiles, allowlist: {} });
  assert.equal(v.length, 1);
});

test('every ADMIN_GATE_PREEXISTING_ALLOWLIST entry carries a decidedOn date and a non-empty reason, and is disclosed as not-asserted-safe', () => {
  for (const [name, entry] of Object.entries(ADMIN_GATE_PREEXISTING_ALLOWLIST)) {
    assert.match(entry.decidedOn, /^\d{4}-\d{2}-\d{2}$/, `${name} missing a dated decidedOn`);
    assert.ok(entry.reason && entry.reason.length > 10, `${name} missing a reason`);
  }
});

// ── LIVE: the real corpus, with both allowlists, is clean ──────────────────────────────────────────

test('LIVE: the real migration corpus passes F64 clean under the two dated allowlists', () => {
  const migrationsDir = resolve(REPO_ROOT, 'fsi-app/supabase/migrations');
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => `fsi-app/supabase/migrations/${f}`);
  const allFiles = files.map((f) => ({ path: f, text: readFileSync(resolve(REPO_ROOT, f), 'utf8') }));

  const problems = [];
  for (const f of allFiles) {
    const v = fitnessFunction.check(f.path, f.text);
    if (v.length) problems.push(`${f.path}: ${v.map((x) => `${x.line}: ${x.message}`).join(' | ')}`);
  }
  assert.deepEqual(problems, []);
});

test('enumerate() returns the real migration file list', () => {
  const files = fitnessFunction.enumerate();
  assert.ok(files.length > 0);
  assert.ok(files.every((f) => f.endsWith('.sql')));
  assert.ok(files.every((f) => f.includes('supabase/migrations/')));
});
