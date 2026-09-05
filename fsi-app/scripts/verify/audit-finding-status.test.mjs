// audit-finding-status.test.mjs — red-then-green proof for the rule-14 enforcer's own logic (this
// lane's scope is wiring the script into a real runner, not relabeling the historical backlog, so the
// test drives the exported, pure pieces against fixtures rather than the live docs/audits/ tree).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listAuditFiles } from './audit-finding-status.mjs';

function withTmpAuditsDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'audit-finding-status-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('listAuditFiles finds a top-level .md file', () => {
  withTmpAuditsDir((dir) => {
    writeFileSync(join(dir, 'top.md'), '# top');
    assert.deepEqual(listAuditFiles(dir), ['top.md']);
  });
});

test('listAuditFiles RECURSES into dated subdirectories (the bug this lane fixed: a non-recursive ' +
  'readdirSync silently skipped every subdirectory audit — 27 of 101 tracked files, docs/audits/ ' +
  'wiring-audit-2026-09-04/ and full-read-2026-08-31/ among them)', () => {
  withTmpAuditsDir((dir) => {
    mkdirSync(join(dir, 'nested-2026-09-04'));
    writeFileSync(join(dir, 'nested-2026-09-04', 'B1-modules.md'), '# nested');
    writeFileSync(join(dir, 'top.md'), '# top');
    const found = listAuditFiles(dir).sort();
    assert.deepEqual(found, [join('nested-2026-09-04', 'B1-modules.md'), 'top.md'].sort());
  });
});

test('listAuditFiles ignores non-.md files at any depth', () => {
  withTmpAuditsDir((dir) => {
    mkdirSync(join(dir, 'sub'));
    writeFileSync(join(dir, 'notes.txt'), 'not markdown');
    writeFileSync(join(dir, 'sub', 'raw.json'), '{}');
    writeFileSync(join(dir, 'sub', 'real.md'), '# real');
    assert.deepEqual(listAuditFiles(dir), [join('sub', 'real.md')]);
  });
});

test('listAuditFiles on a missing directory throws (caller handles the exit-0 no-audits-dir case)', () => {
  assert.throws(() => listAuditFiles(join(tmpdir(), 'definitely-does-not-exist-' + Date.now())), /ENOENT/);
});
