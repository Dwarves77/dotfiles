// resolve-dep.mjs resolves from fsi-app/ the way Node does: an in-tree install first, otherwise a parent
// directory's node_modules (the linked-worktree layout, RD-85), and null when neither holds the package.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveAppDep, tryResolveAppDep } from './resolve-dep.mjs';

function layout(fn) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'resolve-dep-')));
  try {
    const repo = join(base, 'worktrees', 'lane');
    mkdirSync(join(repo, 'fsi-app'), { recursive: true });
    writeFileSync(join(repo, 'fsi-app', 'package.json'), '{"name":"fsi-app","private":true}');
    fn({ base, repo, parentNm: join(base, 'worktrees', 'node_modules') });
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

function pkg(nm, name, file, body) {
  mkdirSync(join(nm, name, 'dist'), { recursive: true });
  writeFileSync(join(nm, name, 'package.json'), JSON.stringify({ name, version: '1.0.0' }));
  writeFileSync(join(nm, name, file), body);
}

test('resolves through a PARENT directory node_modules when fsi-app/ has none (the linked-worktree layout)', () => {
  layout(({ repo, parentNm }) => {
    pkg(parentNm, 'leafy', 'dist/leafy.css', '.a{}');
    assert.equal(resolveAppDep('leafy/dist/leafy.css', { repoRoot: repo }), join(parentNm, 'leafy', 'dist', 'leafy.css'));
  });
});

test('an in-tree fsi-app/node_modules wins over a parent one (the normal npm ci layout is unchanged)', () => {
  layout(({ repo, parentNm }) => {
    pkg(parentNm, 'leafy', 'dist/leafy.css', 'parent');
    const inTree = join(repo, 'fsi-app', 'node_modules');
    pkg(inTree, 'leafy', 'dist/leafy.css', 'in-tree');
    assert.equal(resolveAppDep('leafy/dist/leafy.css', { repoRoot: repo }), join(inTree, 'leafy', 'dist', 'leafy.css'));
  });
});

test('a missing dependency: resolveAppDep throws MODULE_NOT_FOUND, tryResolveAppDep returns null', () => {
  layout(({ repo }) => {
    assert.throws(() => resolveAppDep('no-such-pkg/x.js', { repoRoot: repo }), { code: 'MODULE_NOT_FOUND' });
    assert.equal(tryResolveAppDep('no-such-pkg/x.js', { repoRoot: repo }), null);
  });
});
