// Proves C5 (program-anchors reality, invariant RG-1): passes GREEN against the live tree, and
// actually CATCHES every drift shape it exists to catch (CLAUDE.md rule 15: proven by attack, not by
// presence).
//
// ISOLATION (lane TESTFIX-1, 2026-10-08). The negative cases used to write a throwaway edit into the LIVE
// docs/program/GOVERNING-PROGRAM.md (and rename it away) for the length of each test, restoring it in a
// finally block. That left a window in which the real working tree was changed, the GATE-5 race class (a
// concurrent reader sees the fixture). C5 reads its root through getRepoRoot(), which honours
// DISCIPLINE_REPO_ROOT, so the negative cases now run C5 against a throwaway root under the OS temp
// directory holding a copy of the doc and of the one source file the anchors point at; the real tree is
// only ever read (the GREEN-on-live-tree test). The last test proves it: the real doc is byte-identical
// and was never renamed.
//
// The present/absent drift cases point their anchors at C5's own sibling module
// (C5-program-anchors-reality.mjs) and assert against substrings already known true/false there (a
// guaranteed-present export name, a guaranteed-absent fixture token), so a real run() exercises the real
// present/absent comparison.
//
// Run: node --test fsi-app/.discipline/consistency/checks/C5-program-anchors-reality.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync, mkdtempSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { getRepoRoot, _clearRepoRootCache } from '../../lib/context.mjs';
import { consistencyCheck } from './C5-program-anchors-reality.mjs';

const ROOT = getRepoRoot();
const DOC_PATH_REL = 'fsi-app/docs/program/GOVERNING-PROGRAM.md';
const DOC_PATH = resolve(ROOT, DOC_PATH_REL);
const REAL_DOC_BEFORE = readFileSync(DOC_PATH, 'utf8');

// A target file guaranteed to exist and be stable for the duration of this test run: C5's own sibling
// module. ANCHOR_PRESENT_SUBSTR is a real export this file declares (so a "present" anchor against it is
// genuinely true); ANCHOR_ABSENT_SUBSTR is a fixture token guaranteed never to appear in real source
// (rule 012's own convention for a marker that must never collide with real content).
const ANCHOR_FILE_REL = 'fsi-app/.discipline/consistency/checks/C5-program-anchors-reality.mjs';
const ANCHOR_PRESENT_SUBSTR = 'export const consistencyCheck';
const ANCHOR_ABSENT_SUBSTR = 'ZZZ_C5_TEST_FIXTURE_TOKEN_NEVER_IN_REAL_SOURCE';

// Run `fn` with C5's repo root pointed at a throwaway tree under the OS temp directory: the anchor file
// is copied in, the governing doc is `content` (or absent when `content` is null). The env override and
// the root cache are restored whatever `fn` does.
function withDoc(content, fn) {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'c5-test-'));
  const anchorDst = join(tmpRoot, ANCHOR_FILE_REL);
  mkdirSync(dirname(anchorDst), { recursive: true });
  copyFileSync(resolve(ROOT, ANCHOR_FILE_REL), anchorDst);
  if (content !== null) {
    const docDst = join(tmpRoot, DOC_PATH_REL);
    mkdirSync(dirname(docDst), { recursive: true });
    writeFileSync(docDst, content);
  }
  const saved = process.env.DISCIPLINE_REPO_ROOT;
  process.env.DISCIPLINE_REPO_ROOT = tmpRoot;
  _clearRepoRootCache();
  try {
    // In flight, not only afterwards: the real doc is untouched and in place while the case runs.
    assert.equal(readFileSync(DOC_PATH, 'utf8'), REAL_DOC_BEFORE, 'the real governing doc is untouched while a negative case runs');
    return fn();
  } finally {
    if (saved === undefined) delete process.env.DISCIPLINE_REPO_ROOT; else process.env.DISCIPLINE_REPO_ROOT = saved;
    _clearRepoRootCache();
    rmSync(tmpRoot, { recursive: true, force: true });
  }
}

function buildDoc({ activePhaseLine = 'ACTIVE_PHASE: fixture-phase', anchorsBlock } = {}) {
  const fence = anchorsBlock === undefined
    ? `\`\`\`anchors\npresent :: ${ANCHOR_FILE_REL} :: ${ANCHOR_PRESENT_SUBSTR}\nabsent :: ${ANCHOR_FILE_REL} :: ${ANCHOR_ABSENT_SUBSTR}\n\`\`\``
    : anchorsBlock;
  return `# Fixture governing program doc\n\n${activePhaseLine}\n\n## fixture-phase\n\n${fence}\n`;
}

test('C5 passes GREEN against the live tree', () => {
  const drifts = consistencyCheck.run();
  assert.deepEqual(drifts, [], `C5 found drift on the live tree:\n${drifts.map((d) => '  - ' + d.detail).join('\n')}`);
});

test('ACTIVE_PHASE: none is a no-op (between phases), even with a malformed anchors block present', () => {
  withDoc(buildDoc({ activePhaseLine: 'ACTIVE_PHASE: none', anchorsBlock: '```anchors\nnot a real line\n```' }), () => {
    assert.deepEqual(consistencyCheck.run(), []);
  });
  assert.deepEqual(consistencyCheck.run(), []);
});

test('NEGATIVE (well-formedness): a doc missing the governing file entirely is caught as an orphan claim', () => {
  // The throwaway root simply has no governing doc (content null), the real file is never renamed away.
  withDoc(null, () => {
    const drifts = consistencyCheck.run();
    assert.ok(
      drifts.some((d) => d.kind === 'orphan-claim' && d.location === DOC_PATH_REL),
      `expected an orphan-claim drift for the missing doc, got: ${JSON.stringify(drifts)}`,
    );
  });
  assert.equal(existsSync(DOC_PATH), true, 'the real governing program doc must survive this test');
  assert.deepEqual(consistencyCheck.run(), []);
});

test('NEGATIVE (well-formedness): no parseable ACTIVE_PHASE line is caught', () => {
  withDoc('# Fixture governing program doc\n\nNo ACTIVE_PHASE line in this fixture at all.\n', () => {
    const drifts = consistencyCheck.run();
    assert.ok(
      drifts.some((d) => d.kind === 'malformed' && d.location === DOC_PATH_REL && d.detail.includes('ACTIVE_PHASE')),
      `expected a malformed ACTIVE_PHASE drift, got: ${JSON.stringify(drifts)}`,
    );
  });
  assert.deepEqual(consistencyCheck.run(), []);
});

test('NEGATIVE (well-formedness): ACTIVE_PHASE set but no matching heading/anchors block is caught', () => {
  withDoc('# Fixture governing program doc\n\nACTIVE_PHASE: phase-nowhere\n\nNo heading names this phase at all.\n', () => {
    const drifts = consistencyCheck.run();
    assert.ok(
      drifts.some((d) => d.kind === 'malformed' && d.location === DOC_PATH_REL && d.detail.includes('phase-nowhere')),
      `expected a malformed "no anchors block" drift, got: ${JSON.stringify(drifts)}`,
    );
  });
  assert.deepEqual(consistencyCheck.run(), []);
});

test('NEGATIVE (well-formedness): an anchors block with zero parseable lines is caught', () => {
  withDoc(buildDoc({ anchorsBlock: '```anchors\njust prose, no present/absent lines\n```' }), () => {
    const drifts = consistencyCheck.run();
    assert.ok(
      drifts.some((d) => d.kind === 'malformed' && d.location === DOC_PATH_REL && d.detail.includes('no parseable')),
      `expected an empty-anchors malformed drift, got: ${JSON.stringify(drifts)}`,
    );
  });
  assert.deepEqual(consistencyCheck.run(), []);
});

test('NEGATIVE (dead reference): an anchor naming a file that does not exist is caught', () => {
  withDoc(
    buildDoc({ anchorsBlock: '```anchors\npresent :: fsi-app/does/not/exist/at/all.mjs :: anything\n```' }),
    () => {
      const drifts = consistencyCheck.run();
      assert.ok(
        drifts.some((d) => d.kind === 'reference-dead' && d.location === 'fsi-app/does/not/exist/at/all.mjs'),
        `expected a reference-dead drift, got: ${JSON.stringify(drifts)}`,
      );
    },
  );
  assert.deepEqual(consistencyCheck.run(), []);
});

test('NEGATIVE (plan-vs-code drift, "present" anchor): a substring expected PRESENT but actually absent is caught', () => {
  withDoc(
    buildDoc({ anchorsBlock: `\`\`\`anchors\npresent :: ${ANCHOR_FILE_REL} :: ${ANCHOR_ABSENT_SUBSTR}\n\`\`\`` }),
    () => {
      const drifts = consistencyCheck.run();
      assert.ok(
        drifts.some((d) => d.kind === 'stale-status' && d.location === ANCHOR_FILE_REL && d.detail.includes('GONE')),
        `expected a stale-status "GONE" drift, got: ${JSON.stringify(drifts)}`,
      );
    },
  );
  assert.deepEqual(consistencyCheck.run(), []);
});

test('NEGATIVE (plan-vs-code drift, "absent" anchor): a substring expected ABSENT but actually present is caught', () => {
  withDoc(
    buildDoc({ anchorsBlock: `\`\`\`anchors\nabsent :: ${ANCHOR_FILE_REL} :: ${ANCHOR_PRESENT_SUBSTR}\n\`\`\`` }),
    () => {
      const drifts = consistencyCheck.run();
      assert.ok(
        drifts.some((d) => d.kind === 'stale-status' && d.location === ANCHOR_FILE_REL && d.detail.includes('PRESENT')),
        `expected a stale-status "PRESENT" drift, got: ${JSON.stringify(drifts)}`,
      );
    },
  );
  assert.deepEqual(consistencyCheck.run(), []);
});

test('CONTROL: a correctly matched present+absent anchor pair against a real file yields zero drift', () => {
  withDoc(buildDoc(), () => {
    assert.deepEqual(consistencyCheck.run(), []);
  });
  assert.deepEqual(consistencyCheck.run(), []);
});

test('ISOLATION: the real governing program doc is byte-identical after every negative case and was never renamed', () => {
  assert.equal(readFileSync(DOC_PATH, 'utf8'), REAL_DOC_BEFORE, 'the real doc was never written');
  assert.equal(existsSync(DOC_PATH + '.r23-test-backup'), false, 'no rename backup was ever made beside the real doc');
});
