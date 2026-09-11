// Red-then-green-adjacent tests for is-main.mjs (task 0.3b). isMainModule() is a pure helper (no RED
// phase required for a pure helper), but the "true" case is proven by a REAL `node <file>` invocation
// (execFileSync spawning is-main-fixture.mjs), not a mocked process.argv[1] override in-process, because
// the Windows defect this primitive fixes only reproduces under a genuine spawn: Node itself supplies the
// native argv[1] path shape (backslashes on Windows) and the real import.meta.url (forward-slash file://
// URL) only when it launches the process.
//
// The last test is the fitness-style regression guard named in the brief: it greps every git-tracked file
// under scripts/** and .discipline/** for the literal broken idiom and fails if any remain. This mirrors
// F44 (broken-main-guard, .discipline/fitness/functions/F44-broken-main-guard.mjs) at a different layer
// (this file runs in the no-npm-ci pre-push suite; F44 runs in the fitness runner) so the guard is
// enforced twice, the same belt-and-suspenders shape the repo already uses elsewhere in this suite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMainModule } from './is-main.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..'); // scripts/lib -> scripts -> fsi-app -> repo root

test('isMainModule: true for a real `node <file>` invocation of itself (Windows argv[1]/import.meta.url parity)', () => {
  const fixture = resolve(HERE, 'is-main-fixture.mjs');
  const out = execFileSync(process.execPath, [fixture], { encoding: 'utf8' });
  assert.equal(out.trim(), 'main');
});

test('isMainModule: false when the module is merely imported, not the entry point', () => {
  // This test file is itself run under node:test, so process.argv[1] here is the test-runner's own
  // entry (or this file, depending on invocation), never is-main.mjs's path. Calling isMainModule with
  // is-main.mjs's own URL must be false in this context.
  const selfUrl = pathToFileURL(resolve(HERE, 'is-main.mjs')).href;
  assert.equal(isMainModule(selfUrl), false);
});

test('isMainModule: false when process.argv[1] is absent (e.g. a worker/REPL context)', () => {
  const saved = process.argv[1];
  try {
    process.argv[1] = undefined;
    assert.equal(isMainModule('file:///whatever'), false);
  } finally {
    process.argv[1] = saved;
  }
});

test('isMainModule: true when argv[1] resolves to the same file as the given import.meta.url, independent of separator style', () => {
  const target = resolve(HERE, 'is-main-fixture.mjs');
  const saved = process.argv[1];
  try {
    process.argv[1] = target;
    assert.equal(isMainModule(pathToFileURL(target).href), true);
  } finally {
    process.argv[1] = saved;
  }
});

test('regression guard: no git-tracked file under scripts/** or .discipline/** still uses the broken `import.meta.url === file://${argv[1]}` idiom', () => {
  const tracked = execSync('git ls-files', { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 26 })
    .split('\n')
    .filter(Boolean)
    .filter((p) => (p.startsWith('fsi-app/scripts/') || p.startsWith('fsi-app/.discipline/')) && p.endsWith('.mjs'));
  // Detects the broken comparison regardless of a trailing `|| argv[1]?.endsWith(...)` fallback some
  // files had already grown as a partial workaround for the same defect.
  const BROKEN = /import\.meta\.url\s*===\s*`file:\/\/\$\{\s*process\.argv\[1\]\s*\}`/;
  const offenders = [];
  for (const rel of tracked) {
    const content = readFileSync(resolve(REPO, rel), 'utf8');
    for (const [i, line] of content.split(/\r?\n/).entries()) {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
      if (BROKEN.test(line)) offenders.push(`${rel}:${i + 1}`);
    }
  }
  assert.deepEqual(offenders, [], `broken main guard idiom still present: ${offenders.join(', ')}`);
});
