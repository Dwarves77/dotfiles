import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mintUuid } from './start.mjs';

test('start: mintUuid produces YYYY-MM-DD-HEX-SLUG format', () => {
  const uuid = mintUuid('sprint-architecture', { date: '2026-05-20', hex: 'abcdef12' });
  assert.equal(uuid, '2026-05-20-abcdef12-sprint-architecture');
});

test('start: slugify lowercases and hyphenates', () => {
  const uuid = mintUuid('Sprint Architecture Phase 4', { date: '2026-05-20', hex: 'aaaaaaaa' });
  assert.equal(uuid, '2026-05-20-aaaaaaaa-sprint-architecture-phase-4');
});

test('start: slugify strips special chars', () => {
  const uuid = mintUuid('Q2 (tier-split)!', { date: '2026-05-20', hex: 'bbbbbbbb' });
  assert.equal(uuid, '2026-05-20-bbbbbbbb-q2-tier-split');
});

test('start: throws on empty slug', () => {
  assert.throws(() => mintUuid('', { date: '2026-05-20', hex: 'cc' }), /slug required/);
});

test('start: throws on all-special-chars slug', () => {
  assert.throws(() => mintUuid('   !@#$   ', { date: '2026-05-20', hex: 'dd' }), /slug required/);
});

test('start: real invocation produces today date + 8-char hex', () => {
  const uuid = mintUuid('test-slug');
  assert.match(uuid, /^\d{4}-\d{2}-\d{2}-[a-f0-9]{8}-test-slug$/);
});
