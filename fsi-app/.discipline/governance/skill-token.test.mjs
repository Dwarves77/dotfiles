// Tests for the skill-load detection primitive (skill-token.mjs).
// Covers the g2b scoped-slug fix AND the G-12 resolution requirement (an ERRORED Skill invocation no
// longer satisfies the gate — dormant-systems audit, operator ruling R4, 2026-07-18).
// Run: node --test fsi-app/.discipline/governance/skill-token.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skillLoadedInTranscript, missingFromTranscript } from './skill-token.mjs';

const SLUG = 'sprint-followups-discipline';
let idSeq = 0;
const nextId = () => `toolu_${++idSeq}`;

// A full, RESOLVED (successful) Skill invocation: a tool_use line + a non-errored tool_result line for it.
const shape = (skillValue) => {
  const id = nextId();
  return [
    `{"type":"assistant","message":{"content":[{"type":"tool_use","id":"${id}","name":"Skill","input":{"skill":"${skillValue}"}}]}}`,
    `{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"${id}","content":"Launching skill: ${skillValue}"}]}}`,
  ].join('\n');
};

// An ERRORED Skill invocation: the tool_use is present, but its tool_result carries is_error:true.
const erroredShape = (skillValue) => {
  const id = nextId();
  return [
    `{"type":"assistant","message":{"content":[{"type":"tool_use","id":"${id}","name":"Skill","input":{"skill":"${skillValue}"}}]}}`,
    `{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"${id}","is_error":true,"content":"Unknown skill: ${skillValue}"}]}}`,
  ].join('\n');
};

// An IN-FLIGHT invocation: a tool_use with NO matching tool_result (not yet resolved / compacted away).
const noResultShape = (skillValue) => {
  const id = nextId();
  return `{"type":"assistant","message":{"content":[{"type":"tool_use","id":"${id}","name":"Skill","input":{"skill":"${skillValue}"}}]}}`;
};

// ── The G-12 fix: resolution is required ──

test('RESOLVED Skill invocation counts as loaded', () => {
  assert.equal(skillLoadedInTranscript(shape(SLUG), SLUG), true);
});

test('ERRORED Skill invocation (is_error:true) does NOT count — the G-12 fix', () => {
  assert.equal(skillLoadedInTranscript(erroredShape(SLUG), SLUG), false);
});

test('IN-FLIGHT Skill invocation (tool_use, no tool_result) does NOT count (fail-closed)', () => {
  assert.equal(skillLoadedInTranscript(noResultShape(SLUG), SLUG), false);
});

test('an ERRORED invocation followed by a RESOLVED one DOES count (the retry succeeded)', () => {
  assert.equal(skillLoadedInTranscript(erroredShape(SLUG) + '\n' + shape(SLUG), SLUG), true);
});

// ── Preserved discrimination (scoped slugs, prose, suffix collisions, literal match) ──

test('DIRECTORY-SCOPED slug counts when resolved (the harness form that wrongly DENIED)', () => {
  assert.equal(skillLoadedInTranscript(shape(`dotfiles/fsi-app:${SLUG}`), SLUG), true);
});

test('WORKTREE-prefixed scoped slug counts when resolved', () => {
  const scoped = `dotfiles/.claude/worktrees/agent-a1bbd422127473064/fsi-app:${SLUG}`;
  assert.equal(skillLoadedInTranscript(shape(scoped), SLUG), true);
});

test('a PASSIVE prose mention (not inside a tool_use block) does NOT count', () => {
  const passive = `{"type":"assistant","message":{"content":"The user asked me to load ${SLUG} but I only mentioned it: ${SLUG}."}}`;
  assert.equal(skillLoadedInTranscript(passive, SLUG), false);
});

test('a DIFFERENT skill that merely ends in the slug chars (no ":" boundary) does NOT count', () => {
  assert.equal(skillLoadedInTranscript(shape('foo-remediation-discipline'), 'remediation-discipline'), false);
});

test('a scoped OTHER skill does not satisfy an unrelated slug', () => {
  assert.equal(skillLoadedInTranscript(shape('dotfiles/fsi-app:source-credibility-model'), SLUG), false);
});

test('slug is matched literally, never as a regex (a dot is not a wildcard)', () => {
  assert.equal(skillLoadedInTranscript(shape('a.b'), 'a.b'), true);
  assert.equal(skillLoadedInTranscript(shape('axb'), 'a.b'), false);
});

test('missingFromTranscript returns only the unloaded slugs (resolved bare + scoped present; one errored)', () => {
  const t = [
    shape(`dotfiles/fsi-app:${SLUG}`),        // resolved, scoped
    shape('remediation-discipline'),          // resolved, bare
    erroredShape('source-credibility-model'), // invoked but ERRORED → still missing
  ].join('\n');
  const missing = missingFromTranscript(t, [SLUG, 'remediation-discipline', 'source-credibility-model']);
  assert.deepEqual(missing, ['source-credibility-model']);
});

test('empty transcript / empty slug are safe (no throw, treated as not-loaded)', () => {
  assert.equal(skillLoadedInTranscript('', SLUG), false);
  assert.equal(skillLoadedInTranscript(shape(SLUG), ''), false);
});
