// Tests for the skill-load detection primitive (skill-token.mjs).
// Covers the g2b scoped-slug fix AND the G-12 resolution requirement (an ERRORED Skill invocation no
// longer satisfies the gate — dormant-systems audit, operator ruling R4, 2026-07-18).
// Run: node --test fsi-app/.discipline/governance/skill-token.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  skillLoadedInTranscript,
  missingFromTranscript,
  skillUnresolvableInTranscript,
  skillFileReadInTranscript,
} from './skill-token.mjs';

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

// ── Deadlock-escape primitives (2026-08-09, operator-directed) ────────────────────────────────
// Context: a skill the session cannot REGISTER can never be invoked successfully, so the gate's
// demand becomes unsatisfiable and denies forever (it blocked a legitimate CI-green `git push`).
// These two primitives give the gate POSITIVE EVIDENCE that the demand is impossible-here, so it
// can ASK (human confirms) instead of denying — while a session that merely SKIPPED the skill
// still gets the hard deny. Both properties are asserted below.

// A Read tool_use of a skill's own SKILL.md (substantive consultation).
const readShape = (path) => {
  const id = nextId();
  return [
    `{"type":"assistant","message":{"content":[{"type":"tool_use","id":"${id}","name":"Read","input":{"file_path":"${path.replace(/\\/g, '\\\\')}"}}]}}`,
    `{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"${id}","content":"# SKILL"}]}}`,
  ].join('\n');
};

test('unresolvable: an ERRORED Skill invocation is positive evidence the demand is impossible here', () => {
  assert.equal(skillUnresolvableInTranscript(erroredShape(SLUG), SLUG), true);
});

test('unresolvable: a SUCCESSFUL invocation is not "unresolvable" (it loaded)', () => {
  assert.equal(skillUnresolvableInTranscript(shape(SLUG), SLUG), false);
});

test('unresolvable: DISCIPLINE PRESERVED — a session that never tried gets no escape', () => {
  assert.equal(skillUnresolvableInTranscript('', SLUG), false);
  assert.equal(skillUnresolvableInTranscript(shape('some-other-skill'), SLUG), false);
});

test('unresolvable: an errored invocation of ANOTHER skill does not excuse this slug', () => {
  assert.equal(skillUnresolvableInTranscript(erroredShape('source-credibility-model'), SLUG), false);
});

test('unresolvable: scoped slug form is recognized', () => {
  assert.equal(skillUnresolvableInTranscript(erroredShape(`dotfiles/fsi-app:${SLUG}`), SLUG), true);
});

test('file-read: reading the skill SKILL.md counts as substantive consultation (posix + windows)', () => {
  assert.equal(
    skillFileReadInTranscript(readShape(`/repo/fsi-app/.claude/skills/${SLUG}/SKILL.md`), SLUG), true);
  assert.equal(
    skillFileReadInTranscript(readShape(`C:\\Users\\jason\\dotfiles\\fsi-app\\.claude\\skills\\${SLUG}\\SKILL.md`), SLUG), true);
});

test('file-read: DISCIPLINE PRESERVED — reading an unrelated file is not consultation', () => {
  assert.equal(skillFileReadInTranscript(readShape('/repo/fsi-app/src/lib/data.ts'), SLUG), false);
  assert.equal(skillFileReadInTranscript(readShape(`/repo/fsi-app/.claude/skills/other-skill/SKILL.md`), SLUG), false);
});

test('file-read: a Skill invocation is not a Read (the two primitives stay distinct)', () => {
  assert.equal(skillFileReadInTranscript(shape(SLUG), SLUG), false);
});
