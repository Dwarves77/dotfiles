// Fire-tests for F32 (statutory purity mirror). Two independent concerns, each proven against constructed
// input: (1) assertStatutoryPurity() agrees with migration 286's SQL trigger body on every named case;
// (2) checkTriggerPresence() catches every regression shape (function missing, trigger missing, trigger
// not BEFORE/not on the right table) against constructed migration text, never only the live file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NON_CONTRACTABLE_DERIVATIONS,
  assertStatutoryPurity,
  checkTriggerPresence,
  fitnessFunction,
} from './F32-statutory-purity.mjs';

// ── assertStatutoryPurity ────────────────────────────────────────────────────────────────────────────

function lookup({ estimatedIds = [], derivedDerivations = {} } = {}) {
  return {
    estimatedValueExists: (pk) => estimatedIds.includes(pk),
    derivedValueDerivation: (pk) => derivedDerivations[pk] ?? null,
  };
}

test('assertStatutoryPurity: an empty inputs array is pure (nothing to object to)', () => {
  assert.deepEqual(assertStatutoryPurity([], lookup()), { ok: true });
});

test('assertStatutoryPurity: inputs citing only contractable derivations pass', () => {
  const inputs = [{ table: 'derived_values', pk: 'v1' }, { table: 'emission_factors', pk: 'ef-1' }];
  const result = assertStatutoryPurity(inputs, lookup({ derivedDerivations: { v1: 'calculated' } }));
  assert.deepEqual(result, { ok: true });
});

test('assertStatutoryPurity RED: an input naming a LIVE estimated_values row refuses', () => {
  const inputs = [{ table: 'estimated_values', pk: 'e1' }];
  const result = assertStatutoryPurity(inputs, lookup({ estimatedIds: ['e1'] }));
  assert.equal(result.ok, false);
  assert.match(result.reason, /non-contractable input/);
  assert.match(result.reason, /spec 08 §4 Layer 3/);
});

test('assertStatutoryPurity: an input naming estimated_values but for a pk with NO live row passes (mirrors the SQL EXISTS check exactly)', () => {
  const inputs = [{ table: 'estimated_values', pk: 'gone' }];
  const result = assertStatutoryPurity(inputs, lookup({ estimatedIds: [] }));
  assert.deepEqual(result, { ok: true });
});

test('assertStatutoryPurity RED: each of the three non-contractable derivations refuses', () => {
  for (const derivation of ['modelled', 'estimated', 'interpolated']) {
    const inputs = [{ table: 'derived_values', pk: 'v1' }];
    const result = assertStatutoryPurity(inputs, lookup({ derivedDerivations: { v1: derivation } }));
    assert.equal(result.ok, false, `${derivation} should refuse`);
  }
});

test('assertStatutoryPurity: every contractable derivation passes', () => {
  for (const derivation of ['statutory_fixed', 'statutory_formula', 'observed', 'transacted_index', 'assessed', 'calculated']) {
    const inputs = [{ table: 'derived_values', pk: 'v1' }];
    const result = assertStatutoryPurity(inputs, lookup({ derivedDerivations: { v1: derivation } }));
    assert.equal(result.ok, true, `${derivation} should pass`);
  }
});

test('assertStatutoryPurity: a derived_values reference to a pk with NO row (derivation unknown) does not refuse (mirrors the SQL JOIN, which finds nothing to match IN (...) against)', () => {
  const inputs = [{ table: 'derived_values', pk: 'nonexistent' }];
  const result = assertStatutoryPurity(inputs, lookup({ derivedDerivations: {} }));
  assert.deepEqual(result, { ok: true });
});

test('assertStatutoryPurity: multiple inputs, only ONE bad, still refuses (any() semantics, matching SQL EXISTS)', () => {
  const inputs = [
    { table: 'emission_factors', pk: 'ef-1' },
    { table: 'derived_values', pk: 'v1' },
    { table: 'derived_values', pk: 'v2' },
  ];
  const result = assertStatutoryPurity(inputs, lookup({ derivedDerivations: { v1: 'calculated', v2: 'modelled' } }));
  assert.equal(result.ok, false);
});

test('NON_CONTRACTABLE_DERIVATIONS is exactly the three non-contractable classes', () => {
  assert.deepEqual([...NON_CONTRACTABLE_DERIVATIONS].sort(), ['estimated', 'interpolated', 'modelled']);
});

// ── checkTriggerPresence ─────────────────────────────────────────────────────────────────────────────

const VALID_MIGRATION_TEXT = `
CREATE OR REPLACE FUNCTION public.assert_statutory_purity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RETURN NEW;
END $$;

CREATE TRIGGER statutory_purity_trg
  BEFORE INSERT OR UPDATE ON public.statutory_computations
  FOR EACH ROW EXECUTE FUNCTION public.assert_statutory_purity();
`;

test('checkTriggerPresence: passes against well-formed migration text', () => {
  assert.deepEqual(checkTriggerPresence(VALID_MIGRATION_TEXT), []);
});

test('checkTriggerPresence RED: missing function definition is caught', () => {
  const text = VALID_MIGRATION_TEXT.replace('CREATE OR REPLACE FUNCTION public.assert_statutory_purity()', '-- removed --');
  const problems = checkTriggerPresence(text);
  assert.ok(problems.some((p) => p.includes('function definition is missing')));
});

test('checkTriggerPresence RED: missing trigger definition is caught', () => {
  const text = VALID_MIGRATION_TEXT.replace('CREATE TRIGGER statutory_purity_trg', '-- removed --');
  const problems = checkTriggerPresence(text);
  assert.ok(problems.some((p) => p.includes('trigger definition is missing')));
});

test('checkTriggerPresence RED: a trigger downgraded to AFTER (not BEFORE) is caught', () => {
  const text = VALID_MIGRATION_TEXT.replace('BEFORE INSERT OR UPDATE', 'AFTER INSERT OR UPDATE');
  const problems = checkTriggerPresence(text);
  assert.ok(problems.some((p) => p.includes('not wired as a BEFORE')));
});

test('checkTriggerPresence RED: a trigger moved onto a different table is caught', () => {
  const text = VALID_MIGRATION_TEXT.replace('ON public.statutory_computations', 'ON public.some_other_table');
  const problems = checkTriggerPresence(text);
  assert.ok(problems.some((p) => p.includes('not wired as a BEFORE')));
});

// ── fitnessFunction shape ────────────────────────────────────────────────────────────────────────────

test('fitnessFunction: id F32, holistic (single-sentinel enumerate)', () => {
  assert.equal(fitnessFunction.id, 'F32');
  assert.equal(fitnessFunction.name, 'statutory-purity');
  const files = fitnessFunction.enumerate();
  assert.equal(files.length, 1);
  assert.equal(files[0], 'fsi-app/supabase/migrations/286_statutory_and_estimates.sql');
});

test('fitnessFunction.check(): runs against the LIVE migration 286 and passes', () => {
  const problems = fitnessFunction.check();
  assert.deepEqual(problems, []);
});
