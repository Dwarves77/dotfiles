// Tests for the skill-load detection primitive (skill-token.mjs) — the g2b scoped-slug fix.
// Run: node --test fsi-app/.discipline/governance/skill-token.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skillLoadedInTranscript, missingFromTranscript } from './skill-token.mjs';

const SLUG = 'sprint-followups-discipline';
const shape = (skillValue) => `{"type":"tool_use","name":"Skill","input":{"skill":"${skillValue}"}}`;

test('BARE slug in a Skill tool_use counts as loaded', () => {
  assert.equal(skillLoadedInTranscript(shape(SLUG), SLUG), true);
});

test('DIRECTORY-SCOPED slug counts as loaded (the harness form that wrongly DENIED)', () => {
  assert.equal(skillLoadedInTranscript(shape(`dotfiles/fsi-app:${SLUG}`), SLUG), true);
});

test('WORKTREE-prefixed scoped slug counts as loaded', () => {
  const scoped = `dotfiles/.claude/worktrees/agent-a1bbd422127473064/fsi-app:${SLUG}`;
  assert.equal(skillLoadedInTranscript(shape(scoped), SLUG), true);
});

test('a PASSIVE prose mention (not inside the tool_use shape) does NOT count', () => {
  const passive = `The user asked me to load ${SLUG} but I only mentioned it in text: "${SLUG}".`;
  assert.equal(skillLoadedInTranscript(passive, SLUG), false);
});

test('a DIFFERENT skill that merely ends in the slug chars (no ":" boundary) does NOT count', () => {
  // "foo-remediation-discipline" must not satisfy "remediation-discipline"
  assert.equal(skillLoadedInTranscript(shape('foo-remediation-discipline'), 'remediation-discipline'), false);
});

test('a scoped OTHER skill does not satisfy an unrelated slug', () => {
  assert.equal(skillLoadedInTranscript(shape('dotfiles/fsi-app:source-credibility-model'), SLUG), false);
});

test('regex-special characters in the slug are escaped (no accidental wildcard match)', () => {
  // A hypothetical slug with a dot must match literally, not as "any char".
  assert.equal(skillLoadedInTranscript(shape('a.b'), 'a.b'), true);
  assert.equal(skillLoadedInTranscript(shape('axb'), 'a.b'), false);
});

test('missingFromTranscript returns only the unloaded slugs (mixed bare + scoped present)', () => {
  const t = shape(`dotfiles/fsi-app:${SLUG}`) + '\n' + shape('remediation-discipline');
  const missing = missingFromTranscript(t, [SLUG, 'remediation-discipline', 'source-credibility-model']);
  assert.deepEqual(missing, ['source-credibility-model']);
});

test('empty transcript / empty slug are safe (no throw, treated as not-loaded)', () => {
  assert.equal(skillLoadedInTranscript('', SLUG), false);
  assert.equal(skillLoadedInTranscript(shape(SLUG), ''), false);
});
