// Tests for the shared child-session and lane-branch predicate (lane GATE-8, 2026-10-08, AUD-AT-4 B7-28).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isChildSession, isLaneBranch } from './session-context.mjs';

test('B7-28: the variable absent, 0, false, empty or whitespace all mean "not a child"', () => {
  for (const env of [
    {},
    { CLAUDE_CODE_CHILD_SESSION: '0' },
    { CLAUDE_CODE_CHILD_SESSION: 'false' },
    { CLAUDE_CODE_CHILD_SESSION: 'False' },
    { CLAUDE_CODE_CHILD_SESSION: '' },
    { CLAUDE_CODE_CHILD_SESSION: '  ' },
    { CLAUDE_CODE_CHILD_SESSION: ' 0 ' },
    { CLAUDE_CODE_CHILD_SESSION: 'no' },
    { CLAUDE_CODE_CHILD_SESSION: 'off' },
    { CLAUDE_CODE_CHILD_SESSION: undefined },
    { CLAUDE_CODE_CHILD_SESSION: null },
    { CLAUDE_CODE_CHILD_SESSION: 0 },
    { CLAUDE_CODE_CHILD_SESSION: false },
  ]) {
    assert.equal(isChildSession(env), false, JSON.stringify(env));
  }
});

test('B7-28: any other value marks a child session', () => {
  for (const v of ['1', 'true', 'TRUE', 'yes', ' 1 ', 'agent', 1, true]) {
    assert.equal(isChildSession({ CLAUDE_CODE_CHILD_SESSION: v }), true, String(v));
  }
});

test('the AI_AGENT marker is not the signal (it is set in both the orchestrator and a child)', () => {
  assert.equal(isChildSession({ AI_AGENT: 'claude-code_2-1-204_agent' }), false);
});

test('isLaneBranch: lane/<id> is a lane branch; look-alikes are not', () => {
  assert.equal(isLaneBranch('lane/gate8-fitness-honest-forms'), true);
  assert.equal(isLaneBranch(' lane/x '), true);
  for (const b of ['master', 'lane', 'lane/', 'lanes/x', 'feat/lane/x', 'coord/x', '', null, undefined]) {
    assert.equal(isLaneBranch(b), false, String(b));
  }
});
