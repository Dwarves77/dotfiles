// Fire-tests for F22 (source role at birth).
// Run: node --test fsi-app/.discipline/fitness/functions/F22-source-role-at-birth.test.mjs
//
// Behavioural, in the style of the F13/F15/F21 selftests: exercise the detector against constructed
// fixtures rather than the live tree, so the test states the RULE and cannot drift into merely
// re-asserting whatever the repo currently happens to contain.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRolelessSourceInsert, fitnessFunction, LEGACY_ALLOWLIST } from './F22-source-role-at-birth.mjs';

test('F22 flags a sources INSERT in a file that never classifies the role', () => {
  const src = `
    const { error } = await supabase.from("sources").insert(update.proposed_changes ?? {});
  `;
  assert.equal(isRolelessSourceInsert(src).length, 1);
});

// NOTE ON FIXTURE CONSTRUCTION (same convention as rules/012's test, which builds its offending
// strings from fragments so the rule does not flag its own test): this file needs fixture text that
// LOOKS like an aliased module import. The discipline-glob portability gate scans test files for
// bare-package imports — they pass locally but ERR_MODULE_NOT_FOUND in the no-npm-ci CI job — and it
// matches on the specifier, so BOTH the keyword and the alias have to be split. Naively splitting
// only the keyword still tripped it; the gate was right and the first two attempts were wrong.
const ALIAS = '@' + '/lib/sources/classify-source-role';
const IMPORT_FIXTURE = 'im' + 'port { classifySourceRole } fr' + 'om "' + ALIAS + '";';

test('F22 passes when the file classifies the role', () => {
  const src = `
    ${IMPORT_FIXTURE}
    const row = { ...proposed, source_role: proposed.source_role ?? classifySourceRole(name, url) };
    const { error } = await supabase.from("sources").insert(row);
  `;
  assert.equal(isRolelessSourceInsert(src).length, 0);
});

test('F22 catches a wrapped chained call (supabase-js multi-line)', () => {
  const src = `
    const { data, error } = await supabase.from("sources")
      .insert({ name, url, base_tier: t })
      .select("id").single();
  `;
  assert.equal(isRolelessSourceInsert(src).length, 1);
});

test('F22 also covers upsert, not just insert', () => {
  const src = `await supabase.from("sources").upsert({ name, url }, { onConflict: "url" });`;
  assert.equal(isRolelessSourceInsert(src).length, 1);
});

// The false positive the first draft of this check actually produced, pinned so it cannot return:
// an UPDATE on sources is not a creation, and an unrelated insert on ANOTHER table further down the
// file must never be attributed to the sources anchor.
test('F22 does NOT flag a sources UPDATE followed by an insert on a different table', () => {
  const src = `
    await supabase.from("sources").update(updates).eq("id", source.id);
    await supabase.from("source_trust_events").insert({
      source_id: source.id,
      event_type: "accessibility_check",
    });
  `;
  assert.equal(isRolelessSourceInsert(src).length, 0);
});

test('F22 honours the trailing fitness-allow override', () => {
  const src = `await supabase.from("sources").insert(row); // fitness-allow: F22 (one-shot, already executed)`;
  assert.equal(isRolelessSourceInsert(src).length, 0);
});

test('F22 ignores a commented-out call', () => {
  const src = `// await supabase.from("sources").insert({ name, url });`;
  assert.equal(isRolelessSourceInsert(src).length, 0);
});

test('F22 scope includes scripts/ (registerSource is a live creation path)', () => {
  const globs = fitnessFunction.enumerate();
  assert.ok(
    globs.some((p) => p.startsWith('fsi-app/scripts/')),
    'F22 must enumerate scripts/ — unlike F13, scripts/lib/db.mjs registerSource creates real rows.'
  );
  assert.ok(globs.some((p) => p.startsWith('fsi-app/src/')), 'F22 must enumerate src/.');
});

test('F22 exempts the classifier itself and test files', () => {
  const globs = fitnessFunction.enumerate();
  assert.ok(!globs.includes('fsi-app/src/lib/sources/classify-source-role.ts'));
  assert.ok(!globs.some((p) => /\.(test|selftest|npmtest)\.(ts|tsx|mjs)$/.test(p)));
});

test('F22 legacy allowlist covers only already-executed one-shot scripts, never src/', () => {
  const files = LEGACY_ALLOWLIST.map((e) => e.file);
  assert.ok(files.length > 0, 'allowlist should be explicit, not empty');
  assert.ok(
    files.every((f) => f.startsWith('fsi-app/scripts/')),
    'No src/ path may be allowlisted — the live app must always be enforced.'
  );
  assert.ok(
    LEGACY_ALLOWLIST.every((e) => e.reason && e.reviewByPhase),
    'Every allowlist entry carries a reason + reviewByPhase, same as F15.'
  );
});
