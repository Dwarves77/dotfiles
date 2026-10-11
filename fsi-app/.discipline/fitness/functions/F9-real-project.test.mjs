// F9 on the REAL app project (lane TESTS-2, 2026-10-10; AUD-AT-4 "Owed legs": F9 on the real app project).
//
// AUD-AT-4 proved F9's tsconfig-exclude and @ts-nocheck guards on a two-file fixture project. This file runs the same pure
// guard (staticTypecheckViolations) over the REAL fsi-app/tsconfig.json and the REAL .ts and .tsx files under fsi-app/src,
// and attacks it with the two edits that make a type-broken file pass `tsc --noEmit`:
//   1. an `exclude` entry in tsconfig.json that hides a real file from the compiler;
//   2. a `@ts-nocheck` directive at the top of a real source file.
// The compiler half (a type error in a real file turns the real F9 red) needs the installed app and runs in CI:
// scripts/verify/attacks/f9-real-project-attack.mjs, wired by .github/workflows/ci.yml (the static job, lane PIPE-1).
//
// Reads files only; writes nothing. Node built-ins and relative imports, so it runs in the no-npm suite.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { staticTypecheckViolations, ALLOWED_TSCONFIG_EXCLUDES } from './F9-build-compiles.mjs';

const FSI_APP = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const TSCONFIG = readFileSync(join(FSI_APP, 'tsconfig.json'), 'utf8');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
const SRC = walk(join(FSI_APP, 'src')).map((p) => ({ path: relative(FSI_APP, p).replace(/\\/g, '/'), content: readFileSync(p, 'utf8') }));

test('the real project is large enough that an empty glob cannot pass this file', () => {
  assert.ok(SRC.length > 400, `found only ${SRC.length} source files under fsi-app/src`);
});

test('CONTROL: the real tsconfig and the real source carry no static F9 violation', () => {
  assert.deepEqual(staticTypecheckViolations({ tsconfigText: TSCONFIG, srcFiles: SRC }), []);
});

test('the real tsconfig still includes every .ts and .tsx and excludes only documented directories', () => {
  const cfg = JSON.parse(TSCONFIG.replace(/^\s*\/\/.*$/gm, ''));
  assert.ok(cfg.include.includes('**/*.ts') && cfg.include.includes('**/*.tsx'));
  for (const e of cfg.exclude ?? []) assert.ok(ALLOWED_TSCONFIG_EXCLUDES.includes(String(e).replace(/^\.\//, '').replace(/\/+$/, '')), `undocumented exclude ${e}`);
});

test('ATTACK: excluding a real source file in the real tsconfig is reported, naming the entry', () => {
  const victim = SRC.find((f) => f.path.startsWith('src/lib/api/'));
  const cfg = JSON.parse(TSCONFIG.replace(/^\s*\/\/.*$/gm, ''));
  cfg.exclude = [...(cfg.exclude ?? []), victim.path];
  const out = staticTypecheckViolations({ tsconfigText: JSON.stringify(cfg), srcFiles: SRC });
  assert.ok(out.some((m) => m.includes(victim.path) && /excludes/.test(m)), out.join('\n'));
});

test('ATTACK: excluding the whole src tree is reported, and so is dropping the ts and tsx include globs', () => {
  const cfg = JSON.parse(TSCONFIG.replace(/^\s*\/\/.*$/gm, ''));
  const wide = staticTypecheckViolations({ tsconfigText: JSON.stringify({ ...cfg, exclude: [...(cfg.exclude ?? []), 'src'] }), srcFiles: SRC });
  assert.ok(wide.some((m) => /excludes "src"/.test(m)), wide.join('\n'));
  const narrow = staticTypecheckViolations({ tsconfigText: JSON.stringify({ ...cfg, include: ['next-env.d.ts'] }), srcFiles: SRC });
  assert.ok(narrow.some((m) => /include no longer lists "\*\*\/\*\.ts"/.test(m)) && narrow.some((m) => /"\*\*\/\*\.tsx"/.test(m)), narrow.join('\n'));
});

test('ATTACK: a @ts-nocheck directive at the top of a real source file is reported, naming the file', () => {
  for (const victim of [SRC.find((f) => f.path.endsWith('.ts')), SRC.find((f) => f.path.endsWith('.tsx'))]) {
    const attacked = SRC.map((f) => (f === victim ? { ...f, content: `// @ts-nocheck\n${f.content}` } : f));
    const out = staticTypecheckViolations({ tsconfigText: TSCONFIG, srcFiles: attacked });
    assert.ok(out.some((m) => m.includes(victim.path) && /@ts-nocheck/.test(m)), `${victim.path}: ${out.join('\n')}`);
  }
});

test('ATTACK: a block-comment @ts-nocheck is reported; the word inside a string literal is not (no false positive on the real tree)', () => {
  const victim = SRC.find((f) => f.path.endsWith('.ts'));
  const block = SRC.map((f) => (f === victim ? { ...f, content: `/* @ts-nocheck */\n${f.content}` } : f));
  assert.ok(staticTypecheckViolations({ tsconfigText: TSCONFIG, srcFiles: block }).some((m) => m.includes(victim.path)));
  const asString = SRC.map((f) => (f === victim ? { ...f, content: `${f.content}\nexport const __attackWord = "@ts-nocheck";\n` } : f));
  assert.deepEqual(staticTypecheckViolations({ tsconfigText: TSCONFIG, srcFiles: asString }), []);
});
