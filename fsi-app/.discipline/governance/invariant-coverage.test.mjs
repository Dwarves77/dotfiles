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

// ── NEGATIVE: marker-baseline gate (check 4, U8) must catch each seeded-drift shape — the same
// "a seeded drift must redden it" proof execution-wiring.test.mjs establishes, applied to check 4,
// which (unlike checks 1-3) had never been extracted into a pure/injectable, negative-tested core.
const markerEnv = {
  getSkillContent: (s) => (s === 's' ? 'line one\nMUST do the thing\nline three' : null),
  countMarkers: (c) => c.split(/\r?\n/).filter((l) => /MUST/.test(l)).length,
};

test('NEGATIVE(marker): a skill in the file map with no baseline entry is flagged NO BASELINE', () => {
  const { problems } = auditMarkerBaselines({ s: 'fake/path' }, {}, markerEnv);
  assert.ok(problems.some((p) => p.includes('NO BASELINE')), `expected NO BASELINE, got: ${problems.join(' | ')}`);
});

test('NEGATIVE(marker): a skill whose live marker count no longer matches its baseline is flagged MARKER DRIFT', () => {
  const { problems } = auditMarkerBaselines({ s: 'fake/path' }, { s: 99 }, markerEnv);
  assert.ok(problems.some((p) => p.includes('MARKER DRIFT')), `expected MARKER DRIFT, got: ${problems.join(' | ')}`);
});

test('CONTROL(marker): a skill whose live marker count matches its baseline yields zero problems', () => {
  const { problems } = auditMarkerBaselines({ s: 'fake/path' }, { s: 1 }, markerEnv);
  assert.equal(problems.length, 0, `expected no problems, got: ${problems.join(' | ')}`);
});

test('CONTROL(marker): a skill with null content (file missing, reported elsewhere) is skipped, not flagged', () => {
  const { problems } = auditMarkerBaselines({ missing: 'fake/path' }, {}, markerEnv);
  assert.equal(problems.length, 0, `expected no problems (skipped), got: ${problems.join(' | ')}`);
});
