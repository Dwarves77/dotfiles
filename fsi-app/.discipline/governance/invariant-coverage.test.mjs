// Wires the invariant-coverage meta-gate into `node --test` (pre-push step 3 + CI), AND proves the
// gate actually CATCHES unwiring (the negative test). Without the negative test the gate could become
// a silent no-op and everything underneath would look "wired" falsely — the turtle-at-the-top.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInvariantCoverage, auditInvariants } from './invariant-coverage.mjs';

// ── POSITIVE: the real registry is fully wired ──
test('real registry: every invariant enforced-or-exempt, enforcements resolve, anchors + baselines hold', () => {
  const { ok, problems, summary } = runInvariantCoverage();
  assert.ok(
    ok,
    `invariant-coverage meta-gate FAILED (${problems.length} problem(s)):\n` +
      problems.map((p) => '  - ' + p).join('\n') +
      `\n(summary: ${JSON.stringify(summary)})`
  );
});

// ── NEGATIVE: the gate must REPORT a problem for each unwired shape (proves it isn't a no-op) ──
const env = {
  resolveToken: (tok) => (tok === 'rule:REAL' ? { ok: true, detail: 'ok' } : { ok: false, detail: 'unresolved' }),
  getSkillContent: () => 'anchor-text is present here',
};

test('NEGATIVE: an invariant with neither enforcedBy nor exempt is flagged UNWIRED', () => {
  const { problems } = auditInvariants([{ id: 'X', skill: 's', anchor: 'anchor-text' }], env);
  assert.ok(problems.some((p) => p.includes('UNWIRED')), `expected UNWIRED, got: ${problems.join(' | ')}`);
});

test('NEGATIVE: an enforcedBy token that does not resolve is flagged UNRESOLVED', () => {
  const { problems } = auditInvariants([{ id: 'Y', skill: 's', anchor: 'anchor-text', enforcedBy: ['rule:999'] }], env);
  assert.ok(problems.some((p) => p.includes('UNRESOLVED ENFORCEMENT')), `expected UNRESOLVED, got: ${problems.join(' | ')}`);
});

test('NEGATIVE: enforced AND exempt is flagged CONTRADICTORY', () => {
  const { problems } = auditInvariants([{ id: 'Z', skill: 's', anchor: 'anchor-text', enforcedBy: ['rule:REAL'], exempt: { reason: 'x' } }], env);
  assert.ok(problems.some((p) => p.includes('CONTRADICTORY')), `expected CONTRADICTORY, got: ${problems.join(' | ')}`);
});

test('NEGATIVE: an anchor missing from the skill text is flagged ANCHOR DRIFT', () => {
  const { problems } = auditInvariants(
    [{ id: 'A', skill: 's', anchor: 'NOT IN THE TEXT', enforcedBy: ['rule:REAL'] }],
    env
  );
  assert.ok(problems.some((p) => p.includes('ANCHOR DRIFT')), `expected ANCHOR DRIFT, got: ${problems.join(' | ')}`);
});

test('NEGATIVE: empty exemption reason is flagged EMPTY-EXEMPTION', () => {
  const { problems } = auditInvariants([{ id: 'E', skill: 's', anchor: 'anchor-text', exempt: { reason: '   ' } }], env);
  assert.ok(problems.some((p) => p.includes('EMPTY-EXEMPTION') || p.includes('UNWIRED')), `expected EMPTY-EXEMPTION/UNWIRED, got: ${problems.join(' | ')}`);
});

// ── POSITIVE control: a correctly-wired invariant yields NO problems (gate isn't trigger-happy) ──
test('CONTROL: a correctly enforced invariant with a present anchor yields zero problems', () => {
  const { problems } = auditInvariants([{ id: 'G', skill: 's', anchor: 'anchor-text', enforcedBy: ['rule:REAL'] }], env);
  assert.equal(problems.length, 0, `expected no problems, got: ${problems.join(' | ')}`);
});
