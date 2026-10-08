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
  // EMPTY IS THE GOAL STATE, and as of the 2026-08-14 dead-code sweep it is the ACTUAL state.
  // This assertion used to be `files.length > 0` ("allowlist should be explicit, not empty"), written
  // when the list was shrinking and an accidentally-cleared list would have silently disabled the
  // exemption audit. The sweep removed all 16 entries because every one named a script the manifest
  // deleted — so the list is legitimately empty and F22 now enforces with ZERO exemptions, which is
  // what an A2-pattern shrinking allowlist is FOR. Asserting non-emptiness here would have forced a
  // fake entry to be invented to keep a green build, which is the defect this suite exists to catch.
  // What still must hold on every entry, if one is ever re-added, is asserted below.
  assert.ok(
    files.every((f) => f.startsWith('fsi-app/scripts/')),
    'No src/ path may be allowlisted — the live app must always be enforced.'
  );
  assert.ok(
    LEGACY_ALLOWLIST.every((e) => e.reason && e.reviewByPhase),
    'Every allowlist entry carries a reason + reviewByPhase, same as F15.'
  );
});

// ---- lane GATE-8 (2026-10-08): the honest forms the AUD-AT-4 register found ACCEPTED, red then green ----

test('F22 B2-33: a comment elsewhere in the file naming classifySourceRole is not a classification', () => {
  const src = `// we should call classifySourceRole(name, url) one day\nawait supabase.from("sources").insert(row);`;
  assert.equal(isRolelessSourceInsert(src).length, 1);
});

test('F22 B2-34: a string literal naming classifySourceRole is not a classification', () => {
  const src = `const note = "classifySourceRole is not wired yet";\nawait supabase.from("sources").insert(row);`;
  assert.equal(isRolelessSourceInsert(src).length, 1);
});

test('F22 B2-35: .from( and the table name on separate lines', () => {
  const src = `await supabase\n  .from(\n    "sources"\n  )\n  .insert(row);`;
  assert.equal(isRolelessSourceInsert(src).length, 1);
});

test('F22 B2-36: the table name through a constant', () => {
  const src = `const T = "sources";\nawait supabase.from(T).insert(row);`;
  assert.equal(isRolelessSourceInsert(src).length, 1);
});

test('F22 B2-37: a URL earlier on the line does not truncate the scan', () => {
  const src = `const u = "https://example.com/a"; await supabase.from("sources").insert(row);`;
  assert.equal(isRolelessSourceInsert(src).length, 1);
});

test('F22 B2-38: raw SQL INSERT INTO sources through a pg client', () => {
  const src = 'await client.query("INSERT INTO sources (name, url) VALUES ($1, $2)", [n, u]);';
  assert.equal(isRolelessSourceInsert(src).length, 1);
});

test('F22 B2-39: scripts written as .ts, .cjs or .js are in scope', () => {
  const globs = fitnessFunction.enumerate.toString();
  assert.match(globs, /cjs/);
});

test('F22: an insert that is the far end of a long chain is still the sources insert', () => {
  const src = `await supabase.from("sources")\n  .select("id")\n  .eq("a", 1)\n  .eq("b", 2)\n  .eq("c", 3)\n  .insert(row);`;
  assert.equal(isRolelessSourceInsert(src).length, 1);
});

test('F22: a real classifier call in code still passes, and a forged marker inside a string does not override', () => {
  assert.equal(isRolelessSourceInsert(`import { classifySourceRole } from "./classify-source-role";\nconst r = classifySourceRole(n, u);\nawait supabase.from("sources").insert(r);`).length, 0);
  assert.equal(isRolelessSourceInsert(`const m = "// fitness-allow: F22 (forged)"; await supabase.from("sources").insert(row);`).length, 1);
});
