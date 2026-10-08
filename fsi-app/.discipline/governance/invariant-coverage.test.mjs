// Wires the invariant-coverage meta-gate into `node --test` (pre-push step 3 + CI), AND proves the
// gate actually CATCHES unwiring (the negative test). Without the negative test the gate could become
// a silent no-op and everything underneath would look "wired" falsely — the turtle-at-the-top.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInvariantCoverage, auditInvariants, auditDoctrines, auditMarkerBaselines } from './invariant-coverage.mjs';

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
// ── NEGATIVE: doctrine-register gate (unenforced doctrine = FAIL) must catch each bad shape ──
const docEnv = {
  allInvariantIds: new Set(['RD-4-quarantine-disposition', 'EP-6-cause-effect']),
  enforcedInvariantIds: new Set(['RD-4-quarantine-disposition']), // EP-6 is EXEMPT → not here
  doctrineIds: new Set(['real-doctrine']),
};

test('NEGATIVE(doctrine): a doctrine with no enforcedBy and no exempt is flagged UNENFORCED', () => {
  const { problems } = auditDoctrines([{ id: 'd1' }], docEnv);
  assert.ok(problems.some((p) => p.includes('UNENFORCED DOCTRINE')), problems.join('\n'));
});

test('NEGATIVE(doctrine): a doctrine mapped to an EXEMPT invariant is flagged (no live mechanism)', () => {
  const { problems } = auditDoctrines([{ id: 'd2', enforcedBy: ['EP-6-cause-effect'] }], docEnv);
  assert.ok(problems.some((p) => p.includes('ENFORCED BY EXEMPT INVARIANT')), problems.join('\n'));
});

test('NEGATIVE(doctrine): a doctrine mapped to an unknown invariant id is flagged', () => {
  const { problems } = auditDoctrines([{ id: 'd3', enforcedBy: ['NOPE-999'] }], docEnv);
  assert.ok(problems.some((p) => p.includes('UNKNOWN INVARIANT')), problems.join('\n'));
});

test('NEGATIVE(doctrine): a dangling conflict reference is flagged', () => {
  const { problems } = auditDoctrines([{ id: 'd4', exempt: { reason: 'x' }, conflicts: ['ghost'] }], docEnv);
  assert.ok(problems.some((p) => p.includes('DANGLING CONFLICT')), problems.join('\n'));
});

test('CONTROL(doctrine): enforced-by-a-live-invariant yields zero problems', () => {
  const { problems } = auditDoctrines(
    [{ id: 'real-doctrine', enforcedBy: ['RD-4-quarantine-disposition'], conflicts: ['real-doctrine'] }],
    docEnv
  );
  assert.equal(problems.length, 0, problems.join('\n'));
});

test('CONTROL: a correctly enforced invariant with a present anchor yields zero problems', () => {
  const { problems } = auditInvariants([{ id: 'G', skill: 's', anchor: 'anchor-text', enforcedBy: ['rule:REAL'] }], env);
  assert.equal(problems.length, 0, `expected no problems, got: ${problems.join(' | ')}`);
});

// ── NEGATIVE: marker-FLOOR gate (check 4, plan 6.8 Rule B, lane N4) must catch each seeded-drift shape,
// the same "a seeded drift must redden it" proof execution-wiring.test.mjs establishes, applied to check
// 4, which (unlike checks 1-3) had never been extracted into a pure/injectable, negative-tested core. No
// stored baseline any more: HEAD's marker count is compared to the SAME count on the merge-base tree,
// injected here as `getBaseSkillContent` so this stays git-free and fixture-driven.
const countMustLines = (c) => c.split(/\r?\n/).filter((l) => /MUST/.test(l)).length;

test('NEGATIVE(marker): live count DROPS below the merge-base tree count is flagged MARKER DRIFT', () => {
  const env = {
    getSkillContent: (s) => (s === 's' ? 'MUST one\nline two' : null),
    getBaseSkillContent: (s) => (s === 's' ? 'MUST one\nMUST two\nline three' : null),
    countMarkers: countMustLines,
  };
  const { problems } = auditMarkerBaselines({ s: 'fake/path' }, env);
  assert.ok(problems.some((p) => p.includes('MARKER DRIFT')), `expected MARKER DRIFT, got: ${problems.join(' | ')}`);
});

test('CONTROL(marker): live count EQUAL to the merge-base tree count yields zero problems', () => {
  const env = {
    getSkillContent: (s) => (s === 's' ? 'MUST one\nline two' : null),
    getBaseSkillContent: (s) => (s === 's' ? 'MUST one\nline two' : null),
    countMarkers: countMustLines,
  };
  const { problems } = auditMarkerBaselines({ s: 'fake/path' }, env);
  assert.equal(problems.length, 0, `expected no problems, got: ${problems.join(' | ')}`);
});

test('CONTROL(marker): live count RISES above the merge-base tree count yields zero problems (a new marker needs no gate here)', () => {
  const env = {
    getSkillContent: (s) => (s === 's' ? 'MUST one\nMUST two' : null),
    getBaseSkillContent: (s) => (s === 's' ? 'MUST one' : null),
    countMarkers: countMustLines,
  };
  const { problems } = auditMarkerBaselines({ s: 'fake/path' }, env);
  assert.equal(problems.length, 0, `expected no problems, got: ${problems.join(' | ')}`);
});

test('CONTROL(marker): a skill with null content (file missing, reported elsewhere) is skipped, not flagged', () => {
  const env = {
    getSkillContent: () => null,
    getBaseSkillContent: () => 'MUST one',
    countMarkers: countMustLines,
  };
  const { problems } = auditMarkerBaselines({ missing: 'fake/path' }, env);
  assert.equal(problems.length, 0, `expected no problems (skipped), got: ${problems.join(' | ')}`);
});

test('CONTROL(marker): null base content (no baseline to compare -- new skill file, or an unavailable range) is skipped, not flagged', () => {
  const env = {
    getSkillContent: (s) => (s === 's' ? 'MUST one' : null),
    getBaseSkillContent: () => null,
    countMarkers: countMustLines,
  };
  const { problems } = auditMarkerBaselines({ s: 'fake/path' }, env);
  assert.equal(problems.length, 0, `expected no problems (skipped), got: ${problems.join(' | ')}`);
});

// ---- lane GATE-8 (2026-10-08): the honest forms the AUD-AT-4 register found ACCEPTED, red then green ----

import { auditRemovedInvariants, isMeaningfulReason, MIN_REASON_CHARS } from './invariant-coverage.mjs';

test('INVCOV B7-17: a one-character exemption reason is a THIN-EXEMPTION, for an invariant and for a doctrine', () => {
  const { problems } = auditInvariants([{ id: 'T', skill: 's', anchor: 'anchor-text', exempt: { reason: 'x' } }], env);
  assert.ok(problems.some((p) => p.includes('THIN-EXEMPTION')), problems.join(' | '));
  const d = auditDoctrines([{ id: 'D', exempt: { reason: 'n/a' } }], { enforcedInvariantIds: new Set(), allInvariantIds: new Set(), doctrineIds: new Set() });
  assert.ok(d.problems.some((p) => p.includes('THIN-EXEMPTION')), d.problems.join(' | '));
  const ok = auditInvariants([{ id: 'T', skill: 's', anchor: 'anchor-text', exempt: { reason: 'A semantic generation property: no static signal separates a faithful paraphrase from a drifted one.' } }], env);
  assert.deepEqual(ok.problems, []);
  assert.equal(isMeaningfulReason('x'), false);
  assert.equal(isMeaningfulReason('a'.repeat(MIN_REASON_CHARS)), false, 'forty characters of one word is not a reason');
});

test('INVCOV B7-16: a NEW invariant whose enforcer never names it is flagged; an existing one is not retrofitted', () => {
  const inv = { id: 'NEW-1', skill: 's', anchor: 'anchor-text', enforcedBy: ['rule:REAL'] };
  const withSource = (src, isNew) => ({ ...env, isNewInvariant: () => isNew, enforcerSource: () => src });
  const unrelated = auditInvariants([inv], withSource('// F44 broken main guard, nothing about the invariant', true));
  assert.ok(unrelated.problems.some((p) => p.includes('ENFORCER DOES NOT NAME THE INVARIANT')), unrelated.problems.join(' | '));
  const named = auditInvariants([inv], withSource('// enforces NEW-1: the thing', true));
  assert.deepEqual(named.problems, []);
  const existing = auditInvariants([inv], withSource('// unrelated', false));
  assert.deepEqual(existing.problems, [], 'an invariant already on the merge-base is not judged');
  const noSource = auditInvariants([inv], { ...env, isNewInvariant: () => true, enforcerSource: () => null });
  assert.ok(noSource.problems.some((p) => p.includes('ENFORCER DOES NOT NAME THE INVARIANT')), 'an enforcer that cannot be read does not name it');
});

test('INVCOV B7-15 B7-15b: an invariant that disappeared since the merge-base needs a RETIRED_INVARIANTS entry, doctrine or not', () => {
  const gone = auditRemovedInvariants(['A-1', 'B-2'], ['A-1']);
  assert.equal(gone.problems.length, 1);
  assert.match(gone.problems[0], /REMOVED INVARIANT: B-2/);
  const retired = auditRemovedInvariants(['A-1', 'B-2'], ['A-1'], { 'B-2': { reason: 'Superseded by A-1, which carries the same rule with a stronger mechanism.', retiredOn: '2026-10-08' } });
  assert.deepEqual(retired.problems, []);
  const thin = auditRemovedInvariants(['A-1', 'B-2'], ['A-1'], { 'B-2': { reason: 'old', retiredOn: '2026-10-08' } });
  assert.equal(thin.problems.length, 1);
  const stale = auditRemovedInvariants(['A-1'], ['A-1'], { 'A-1': { reason: 'Superseded by something that never happened, so this entry is stale.', retiredOn: '2026-10-08' } });
  assert.match(stale.problems[0], /STALE RETIREMENT/);
  assert.deepEqual(auditRemovedInvariants(['A-1'], ['A-1', 'NEW-3']).problems, [], 'a new invariant is not a removal');
});

test('INVCOV: the real RETIRED_INVARIANTS map is empty or well formed, and the gate reads it', async () => {
  const { RETIRED_INVARIANTS } = await import('./invariants.mjs');
  for (const [id, r] of Object.entries(RETIRED_INVARIANTS)) {
    assert.ok(isMeaningfulReason(r.reason) && !Number.isNaN(Date.parse(r.retiredOn)), id);
  }
});
