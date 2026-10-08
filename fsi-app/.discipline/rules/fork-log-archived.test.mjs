// Standing check for invariant RD-50 (the deprecated session-log fork stays out of the live tree).
// Run: node --test fsi-app/.discipline/rules/fork-log-archived.test.mjs
//
// History: commit-time rule 020 rejected any commit that added lines to fsi-app/docs/ops/session-log.md,
// the deprecated fork of the canonical docs/ops/session-log.md, after four sessions wrote to it by mistake
// between 2026-07-17 and 2026-07-20. Lane GATE-1 (2026-10-08) archived the fork to
// docs/archive/fsi-app-session-log-fork-2026-07.md and removed the rule: with no file at the old path there
// is nothing to freeze, and the property "no session can append to the fork" is now structural (the path
// does not exist) instead of detective (a rule on every commit). This test is the one thing that keeps it
// structural: it fails in CI if the old path is recreated, so a session that writes there is caught by the
// unit-test job on the PR instead of landing a second, silent session log.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
const OLD_PATH = join(REPO_ROOT, 'fsi-app', 'docs', 'ops', 'session-log.md');
const ARCHIVED = join(REPO_ROOT, 'docs', 'archive', 'fsi-app-session-log-fork-2026-07.md');
const CANONICAL = join(REPO_ROOT, 'docs', 'ops', 'session-log.md');

test('RD-50: the deprecated fork path does not exist (recreating it fails the unit-test job)', () => {
  assert.equal(
    existsSync(OLD_PATH),
    false,
    'fsi-app/docs/ops/session-log.md was recreated. The canonical session log is docs/ops/session-log.md at the repo root (a lane writes its own docs/ops/session-log.d/ file). The frozen fork lives at docs/archive/fsi-app-session-log-fork-2026-07.md.',
  );
});

test('RD-50: the frozen fork is preserved in the archive with its deprecation header', () => {
  assert.ok(existsSync(ARCHIVED), 'the archived fork was removed; history must not be destroyed');
  const head = readFileSync(ARCHIVED, 'utf-8').slice(0, 400);
  assert.match(head, /DEPRECATED FORK/);
});

test('RD-50: the canonical session log still exists at the repo root', () => {
  assert.ok(existsSync(CANONICAL));
});
