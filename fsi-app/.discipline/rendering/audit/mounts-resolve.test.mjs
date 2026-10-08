// node --test proof that the design-audit harness cannot rot silently again (lane DAUDIT-1, 2026-10-08).
//
// WHY. Eleven audit specs failed to mount for a month because `mounts.mjs` imported DetailHeader,
// DetailTimeline and SectionIndex from `@/components/detail/DetailShell`, which stopped exporting them
// when the detail surfaces moved onto ActionCard (PR 800). `audit:design` is not a CI job, so nothing
// was red; the next full run would have deleted 6179 lines of results.json. This test is the CI-side
// half: it reads every mount entry in AUDIT_MOUNTS and proves, with no browser and no npm package, that
// each repo-internal import (`@/...`) resolves to a real file (or to the mount's own alias target) and
// that every named binding the entry imports is actually exported there.
//
// PORTABLE: node builtins + relative .mjs only, so run-test-suite.sh's no-npm job runs it (a `.test.mjs`
// is discovered by construction, lib/test-discovery.mjs). Bare npm specifiers (react, next/*,
// leaflet/...) are out of scope on purpose: the no-npm job has no node_modules to resolve them against,
// and a refactor of OUR source is what rots a mount. The real esbuild bundle of every mount is
// run-audit.mjs's job, and its "Failures the harness itself hit" section must read "None".
//
// PROVEN BY ATTACK (CLAUDE.md rule 15): the resolver below is also run against synthetic entries that
// import a name the target does not export, a file that does not exist, and a default that is absent,
// and each must be reported. A resolver that cannot fail is not a guard.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as mounts from './mounts.mjs';

const { AUDIT_MOUNTS } = mounts;
const RETIRED_AUDIT_SPECS = mounts.RETIRED_AUDIT_SPECS ?? {};
const HERE = fileURLToPath(new URL('.', import.meta.url));
const FSI_APP = join(HERE, '..', '..', '..');
const SRC = join(FSI_APP, 'src');
const SPEC_DIR = join(HERE, 'spec');

const EXTENSIONS = ['.tsx', '.ts', '.mjs', '.js', '.jsx'];

/** `@/a/b` -> an existing file under src, trying the extensions and then `/index.<ext>`. Null if none. */
function resolveSrcFile(specifier) {
  const base = join(SRC, specifier.slice(2));
  if (existsSync(base) && /\.[a-z]+$/.test(base) && !existsSync(`${base}/`)) return base;
  for (const ext of EXTENSIONS) if (existsSync(base + ext)) return base + ext;
  for (const ext of EXTENSIONS) if (existsSync(join(base, `index${ext}`))) return join(base, `index${ext}`);
  return null;
}

function resolveRelative(fromFile, specifier) {
  const base = join(dirname(fromFile), specifier);
  if (existsSync(base) && /\.[a-z]+$/.test(base)) return base;
  for (const ext of EXTENSIONS) if (existsSync(base + ext)) return base + ext;
  for (const ext of EXTENSIONS) if (existsSync(join(base, `index${ext}`))) return join(base, `index${ext}`);
  return null;
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
}

/**
 * The names a module exports, followed through `export * from` and `export { x } from`. Returns
 * `{ names: Set<string>, hasDefault: boolean }`. A textual scan, not a parser: it covers the export
 * forms this codebase uses (function/const/let/var/class/enum/interface/type declarations, export lists
 * with `as`, re-exports, `export *`), which is all a mount entry can import by name.
 */
function exportsOf(file, seen = new Set()) {
  const out = { names: new Set(), hasDefault: false };
  if (!file || seen.has(file)) return out;
  seen.add(file);
  const src = stripComments(readFileSync(file, 'utf8'));

  for (const m of src.matchAll(/^[ \t]*export\s+(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|enum|interface|type|abstract\s+class)\s+([A-Za-z_$][\w$]*)/gm)) {
    out.names.add(m[1]);
  }
  if (/^[ \t]*export\s+default\b/m.test(src)) out.hasDefault = true;

  for (const m of src.matchAll(/^[ \t]*export\s+(?:type\s+)?\{([^}]*)\}\s*(?:from\s*['"]([^'"]+)['"])?/gm)) {
    for (const part of m[1].split(',')) {
      const item = part.trim().replace(/^type\s+/, '');
      if (!item) continue;
      const as = item.split(/\s+as\s+/);
      const exported = (as[1] ?? as[0]).trim();
      if (exported === 'default') out.hasDefault = true;
      else out.names.add(exported);
    }
  }
  for (const m of src.matchAll(/^[ \t]*export\s+\*\s+from\s*['"]([^'"]+)['"]/gm)) {
    const target = m[1].startsWith('@/') ? resolveSrcFile(m[1]) : m[1].startsWith('.') ? resolveRelative(file, m[1]) : null;
    const inner = exportsOf(target, seen);
    for (const n of inner.names) out.names.add(n);
  }
  return out;
}

/** Every `import ... from '<specifier>'` in an entry string: { specifier, named[], defaultName, namespace }. */
function importsOfEntry(entry) {
  const found = [];
  const re = /^[ \t]*import\s+([^;'"`]*?)\s+from\s*['"]([^'"]+)['"]/gm;
  for (const m of stripComments(entry).matchAll(re)) {
    const clause = m[1].trim();
    const rec = { specifier: m[2], named: [], defaultName: null, namespace: false, typeOnly: /^type\s/.test(clause) };
    const braces = clause.match(/\{([^}]*)\}/);
    if (braces) {
      for (const part of braces[1].split(',')) {
        const item = part.trim();
        if (!item) continue;
        const isType = /^type\s+/.test(item);
        const name = item.replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
        if (!isType) rec.named.push(name);
      }
    }
    const head = clause.replace(/\{[^}]*\}/, '').replace(/,/g, ' ').trim();
    if (head.startsWith('* as')) rec.namespace = true;
    else if (head) rec.defaultName = head.split(/\s+/)[0];
    found.push(rec);
  }
  return found;
}

/**
 * The problems with one mount's repo-internal imports. `alias` is the mount's own esbuild alias table
 * (a specifier replaced by a stub file), which is honoured exactly the way the bundler honours it.
 */
function mountImportProblems(id, entry, alias = {}) {
  const problems = [];
  for (const imp of importsOfEntry(entry)) {
    if (!imp.specifier.startsWith('@/')) continue; // npm and node specifiers: not resolvable in the no-npm job
    if (Object.prototype.hasOwnProperty.call(alias, imp.specifier)) {
      if (!existsSync(alias[imp.specifier])) problems.push(`${id}: alias target for ${imp.specifier} does not exist (${alias[imp.specifier]})`);
      continue;
    }
    const file = resolveSrcFile(imp.specifier);
    if (!file) {
      problems.push(`${id}: ${imp.specifier} does not resolve to a file under fsi-app/src`);
      continue;
    }
    if (!/\.(tsx?|jsx?|mjs)$/.test(file)) continue; // a stylesheet or asset: existence is all that can be proven
    const ex = exportsOf(file);
    for (const name of imp.named) {
      if (!ex.names.has(name)) problems.push(`${id}: ${imp.specifier} does not export ${name}`);
    }
    if (imp.defaultName && !ex.hasDefault) problems.push(`${id}: ${imp.specifier} has no default export (imported as ${imp.defaultName})`);
  }
  return problems;
}

test('every mount in AUDIT_MOUNTS resolves: each repo-internal import exists and exports what the entry names', () => {
  const ids = Object.keys(AUDIT_MOUNTS);
  assert.ok(ids.length > 30, `expected the full mount registry, found ${ids.length}`);
  const problems = ids.flatMap((id) => mountImportProblems(id, AUDIT_MOUNTS[id].entry, AUDIT_MOUNTS[id].alias || {}));
  assert.deepEqual(problems, [], `unresolvable mount imports:\n  ${problems.join('\n  ')}`);
});

test('every mount carries an entry that defines window.__mount (the contract run-audit.mjs mounts through)', () => {
  const missing = Object.entries(AUDIT_MOUNTS)
    .filter(([, m]) => typeof m.entry !== 'string' || !/window\.__mount\s*=/.test(m.entry))
    .map(([id]) => id);
  assert.deepEqual(missing, []);
});

test('every spec JSON names a mount that exists, and none names a retired spec id', () => {
  const files = readdirSync(SPEC_DIR).filter((f) => f.endsWith('.json'));
  const orphans = [];
  for (const f of files) {
    const spec = JSON.parse(readFileSync(join(SPEC_DIR, f), 'utf8'));
    if (!Object.prototype.hasOwnProperty.call(AUDIT_MOUNTS, spec.mount)) orphans.push(`${f} names unknown mount "${spec.mount}"`);
    const id = f.replace(/\.json$/, '');
    if (Object.prototype.hasOwnProperty.call(RETIRED_AUDIT_SPECS, id)) orphans.push(`${f} is retired in mounts.mjs but the spec file still exists`);
  }
  assert.deepEqual(orphans, []);
});

test('mounts.mjs exports the retired-spec table (an empty table is fine, a missing one is not)', () => {
  assert.equal(typeof mounts.RETIRED_AUDIT_SPECS, 'object');
  assert.ok(mounts.RETIRED_AUDIT_SPECS !== null);
});

test('every retired spec carries a one-line reason, so a retirement is never a silent drop', () => {
  for (const [id, reason] of Object.entries(RETIRED_AUDIT_SPECS)) {
    assert.equal(typeof reason, 'string', `${id}: reason must be a string`);
    assert.ok(reason.trim().length >= 20, `${id}: reason too short to be a reason`);
    assert.ok(!reason.includes('\n'), `${id}: reason must be one line`);
  }
});

// ── Attack: the resolver must fail on the exact defect it exists for ───────────────────────────────

test('ATTACK: an entry importing a name the module no longer exports is reported (the DetailShell defect)', () => {
  const entry = "import { DetailHeader, SummaryDepthSwitch } from '@/components/detail/DetailShell';\nwindow.__mount = () => {};";
  const problems = mountImportProblems('attack', entry);
  assert.deepEqual(problems, ['attack: @/components/detail/DetailShell does not export DetailHeader']);
});

test('ATTACK: an import of a file that does not exist is reported', () => {
  const problems = mountImportProblems('attack', "import { Gone } from '@/components/ui/NoSuchPart';");
  assert.equal(problems.length, 1);
  assert.match(problems[0], /does not resolve to a file/);
});

test('ATTACK: a default import from a module with no default export is reported', () => {
  const problems = mountImportProblems('attack', "import Shell from '@/components/detail/DetailShell';");
  assert.equal(problems.length, 1);
  assert.match(problems[0], /no default export/);
});

test('ATTACK: a mount alias that points at a missing stub is reported, and a valid alias suppresses resolution', () => {
  const missing = mountImportProblems('attack', "import { X } from '@/lib/supabase-browser';", { '@/lib/supabase-browser': join(HERE, 'no-such-stub.mjs') });
  assert.equal(missing.length, 1);
  assert.match(missing[0], /alias target/);
  const ok = mountImportProblems('attack', "import { X } from '@/lib/supabase-browser';", { '@/lib/supabase-browser': join(HERE, 'normalise.mjs') });
  assert.deepEqual(ok, []);
});

test('CONTROL: names the resolver must accept (declaration, export list, type-only, default-less named) pass', () => {
  const entry = [
    "import { SummaryDepthSwitch, DetailSection } from '@/components/detail/DetailShell';",
    "import { SectionIndex } from '@/components/ui/SectionIndex';",
    "import { ActionRow, ActionButton } from '@/components/ui/ActionRow';",
  ].join('\n');
  assert.deepEqual(mountImportProblems('control', entry), []);
});
