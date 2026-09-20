// CLASS FIX (recurring issue): the discipline "Run discipline test suite" CI job runs `node --test` with
// NO `npm ci` (deliberate isolation). So a test in that glob that imports jiti, a `.ts` file, or any bare
// npm package PASSES locally (node_modules present) but FAILS in CI with ERR_MODULE_NOT_FOUND, caught only
// after push, as red. This has recurred (audit-gate.test.mjs imported jiti; earlier the meta-gate keyed on
// the working tree not the committed tree). The class cure is a portability guard that runs IN the suite:
// it reads the SAME file list the suite runs and asserts every listed file imports ONLY node: builtins and
// relative .mjs/.js, nothing that needs node_modules. A non-portable test now fails at pre-push (which runs
// this same suite) instead of in CI. Uses only node builtins, so it is itself portable.
//
// SOURCE OF TRUTH (lane T3, 2026-09-20, superseding the 2026-07-04 "reads run-test-suite.sh's text"
// mechanism). run-test-suite.sh no longer carries a literal glob list to regex-parse: it computes its
// `node --test` argument list by calling `discoverTests()` in `.discipline/lib/test-discovery.mjs`. This
// file now imports that SAME function, so the file list checked here is the file list the suite actually
// runs, not a text-scrape of the shell script (the two could never drift, because there is only one
// function now, not a resolver plus a parser of the resolver's caller).
//
// CONFIRMED historical gap this closes: the old text-scrape regex (`/fsi-app\/[^\s"'\\]+/g`, filtered to
// tokens ending `.test.mjs` or containing `*`) never matched a BARE `.selftest.mjs` filename with no
// wildcard, because such a token neither ends in `.test.mjs` nor contains `*`. run-test-suite.sh named the
// two `src/lib/sources/` selftests that way (no glob, exact filenames), so this guard's portability check
// silently never ran on `classify-source-role.selftest.mjs` or `instrument-identity.selftest.mjs` for as
// long as that mechanism existed (verified by running the old regex against the pre-lane-T3 committed
// `run-test-suite.sh`: it produces 80 tokens, none containing either filename). `discoverTests()` returns
// those two files as ordinary members of its discovered set, so they are portability-checked like every
// other file now, by construction, not by a fix to the old regex.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverTests } from "./lib/test-discovery.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."); // .discipline -> fsi-app -> repo root
const SUITE = resolve(REPO, "fsi-app/.discipline/run-test-suite.sh");

/** The exact file list run-test-suite.sh feeds to `node --test`. STANDING RED if ever empty. */
function suiteFiles() {
  const files = discoverTests({ repoRoot: REPO });
  assert.ok(files.length > 0, "test-discovery.mjs resolved to ZERO test paths (empty discovered set = standing red)");
  return files;
}

// THE HAZARD THIS PREVENTS FROM RETURNING: run-test-suite.sh used to carry `dir/*.test.mjs` /
// `dir/*.selftest.mjs` tokens that the INVOKING SHELL expanded before `node --test` ever ran, so the file
// list silently differed (or collapsed to zero, on a shell that failed to expand an unmatched glob) by
// WHICH SHELL ran the script, not by what the suite intended to run. Lane T3 removed every such token in
// favour of `discoverTests()`; this assertion makes reintroducing one a failing test, not a silent hazard.
// PURE, takes the script's raw text (never the live file directly), so the attack test below can feed it
// a synthetic fixture string instead of mutating a real file.
export function findInlineTestGlobTokens(scriptText) {
  const noComments = scriptText
    .split("\n")
    .map((line) => (line.trim().startsWith("#") ? "" : line.replace(/(^|\s)#.*$/, "$1")))
    .join("\n");
  const toks = noComments.match(/\S*\*\S*\.(?:test|selftest)\.mjs\b/g) || [];
  return [...new Set(toks)];
}

// MODULE specifiers only. Dynamic import()/require() use parens. Side-effect import is `import "x"` (no
// `from`). The `from "x"` form (lane T3, 2026-09-20, coordinator amendment 2) is anchored to a STATEMENT
// START with the `import`/`export` keyword, not a bare `from` anywhere in the text: the prior unanchored
// `/\bfrom\s+["']([^"']+)["']/g` matched English prose containing the words "from 'x'" (a test-name string
// reading "...is counted separately from 'authored'" false-tripped it, CONFIRMED against
// fsi-app/scripts/producers/regional/run-envelope-producer.test.mjs when lane T3's discovery-by-construction
// fix first made that directory reachable by this guard). The statement anchor spans multiple lines up to
// its own `from` (a multi-line `import {\n  a,\n} from "x"` must still be caught), excludes `;`/quote/backtick
// characters so it cannot cross a real statement boundary into an unrelated later `from`, and does NOT match
// a Supabase `.from("table")` method call (which never starts a line with `import`/`export`).
const MODULE_RES = [
  /^[ \t]*(?:import|export)\b[^;'"`]*?\bfrom\s*["']([^"']+)["']/gm, // import/export ... from "x" (statement-anchored)
  /\bimport\s+["']([^"']+)["']/g,                  // side-effect import "x"
  /\b(?:import|require)\s*\(\s*["']([^"']+)["']/g,  // import("x") / require("x")
];
/** A specifier is portable (no node_modules needed) iff it is a node: builtin or a relative path.
 *  Relative .ts is portable since Node >=23.6 native type-stripping (CI pins node '24' — see
 *  discipline.yml setup-node); erasable-syntax-only TS imports run loaderless. A .ts file using
 *  NON-erasable syntax (enum/namespace/parameter properties) would still fail at CI runtime —
 *  the suite run itself is the check for that. */
function nonPortableSpecifiers(src) {
  const noComments = src.replace(/\/\/[^\n]*/g, ""); // drop line comments so "// ...from 'x'..." can't false-trip
  const bad = [];
  for (const re of MODULE_RES) {
    for (const m of noComments.matchAll(re)) {
      const s = m[1];
      if (s.startsWith("node:")) continue;
      if (s.startsWith("./") || s.startsWith("../")) continue;
      bad.push(`${s} (bare package — unavailable without npm ci)`);
    }
  }
  return bad;
}

test("ATTACK: nonPortableSpecifiers does not read English prose as an import (the run-envelope-producer false positive, verbatim)", () => {
  const src = "test(\"authorAutomateVsHireForRegions: 'skipped-already-authored' is counted separately from 'authored'\", async () => {});";
  assert.deepEqual(nonPortableSpecifiers(src), []);
});

test("ATTACK: nonPortableSpecifiers still catches a single-line `import x from \"some-pkg\"`", () => {
  const src = 'import x from "some-pkg";';
  const found = nonPortableSpecifiers(src);
  assert.equal(found.length, 1);
  assert.match(found[0], /^some-pkg /);
});

test("ATTACK: nonPortableSpecifiers still catches a MULTI-LINE `import { a, b } from \"some-pkg\"`", () => {
  const src = 'import {\n  a,\n  b,\n} from "some-pkg";';
  const found = nonPortableSpecifiers(src);
  assert.equal(found.length, 1);
  assert.match(found[0], /^some-pkg /);
});

test("ATTACK: nonPortableSpecifiers still catches `export { a } from \"some-pkg\"`", () => {
  const src = 'export { a } from "some-pkg";';
  const found = nonPortableSpecifiers(src);
  assert.equal(found.length, 1);
  assert.match(found[0], /^some-pkg /);
});

test("ATTACK: nonPortableSpecifiers still passes relative and node: specifiers (import/export/side-effect/dynamic forms)", () => {
  const src = [
    'import a from "./relative.mjs";',
    'export { b } from "../other/relative.mjs";',
    'import c from "node:fs";',
    'import "./side-effect.mjs";',
    'const d = await import("./dynamic-relative.mjs");',
  ].join("\n");
  assert.deepEqual(nonPortableSpecifiers(src), []);
});

// TRANSITIVE CHECK (2026-09-12). The direct-import check above missed two CI reds in one day: layout-guard.test.mjs
// (PR #632) reached esbuild through run-layout-guard.mjs and the smoke harness, and apply-record-briefs.test.mjs
// (PR #640) reached @supabase/supabase-js through the driver it imports. Both passed locally because node_modules
// exists here. So every suite test is now walked through its RELATIVE static imports (.mjs/.js/.ts) and every
// module on that graph must itself have only node: builtins or relative STATIC imports. Dynamic import()/require()
// inside a function are allowed on transitive modules (they load on call, not at module load; db.mjs's lazy
// require is the sanctioned shape). A tsconfig alias ("@/...") is a bare specifier here: it needs a loader.
// Two deliberate exclusions, each a false positive the first run of this check produced: `import type` /
// `export type` (erased by type-stripping, so `import type { SupabaseClient } from "@supabase/supabase-js"`
// in a .ts module loads nothing), and `from "x"` inside a string literal (F40's HELPER_IMPORT message,
// perf-budget's "'shell painted' from 'content painted'" prose), so only STATEMENT-POSITION imports count.
// One deliberate inclusion: the ROOT test's own dynamic relative imports are followed too, because a test
// body executes when the suite runs (#632's exact shape: layout-guard.test.mjs did `await import(
// './run-layout-guard.mjs')` inside a test, and that module statically imports the esbuild harness).
const STATIC_MODULE_RES = [
  /^[ \t]*import\s+(?!type\b)[^;'"]*?\bfrom\s+["']([^"']+)["']/gm, // import x / {x} / * as x from "y"
  /^[ \t]*export\s+(?!type\b)[*{][^;'"]*?\bfrom\s+["']([^"']+)["']/gm, // export * / {x} from "y" (re-export)
  /^[ \t]*import\s+["']([^"']+)["']/gm,                             // side-effect import "y"
];
const DYNAMIC_RELATIVE_RE = /\b(?:import|require)\s*\(\s*["'](\.\.?\/[^"']+)["']/g;
function staticSpecifiers(src, { includeDynamicRelative = false } = {}) {
  const noComments = src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const out = [];
  for (const re of STATIC_MODULE_RES) for (const m of noComments.matchAll(re)) out.push(m[1]);
  if (includeDynamicRelative) for (const m of noComments.matchAll(DYNAMIC_RELATIVE_RE)) out.push(m[1]);
  return out;
}
function resolveRelative(fromFile, spec) {
  const base = resolve(dirname(fromFile), spec);
  for (const cand of [base, `${base}.mjs`, `${base}.js`, `${base}.ts`, resolve(base, "index.mjs")]) {
    try { if (readFileSync(cand)) return cand; } catch { /* next */ }
  }
  return null;
}
/** Walk a test file's relative import graph; return "chain: imports x" strings for every bare specifier
 *  reached through STATIC imports of any module on the graph (the root test itself is checked by the
 *  stricter direct rule above). */
function transitiveNonPortable(rootAbs) {
  const seen = new Set([rootAbs]);
  const queue = [[rootAbs, [rootAbs]]];
  const bad = [];
  while (queue.length) {
    const [file, chain] = queue.shift();
    let src;
    try { src = readFileSync(file, "utf8"); } catch { continue; }
    for (const s of staticSpecifiers(src, { includeDynamicRelative: file === rootAbs })) {
      if (s.startsWith("node:")) continue;
      if (s.startsWith("./") || s.startsWith("../")) {
        const next = resolveRelative(file, s);
        if (next && !seen.has(next)) { seen.add(next); queue.push([next, [...chain, next]]); }
        continue;
      }
      if (file === rootAbs) continue; // the root's own bare imports are reported by the direct check
      bad.push(`${chain.map((f) => f.slice(REPO.length + 1)).join(" -> ")}: imports ${s} (bare package or alias, unavailable without npm ci)`);
    }
  }
  return [...new Set(bad)]; // a module importing the same package in several statements reports once
}

test("test-discovery.mjs resolves a NON-EMPTY test list (empty source-of-truth is a standing red)", () => {
  // The permanent guard against the failure this fix was born from: if the discovered list ever empties,
  // glob-portability fails LOUDLY instead of silently checking nothing.
  assert.ok(suiteFiles().length > 0, "discoverTests() resolved to ZERO test paths");
});

test("every discipline-suite test imports only node: builtins + relative .mjs (portable to the no-npm-ci CI job)", () => {
  const files = suiteFiles();
  assert.ok(files.length >= 10, `expected the discipline glob to expand to many files, got ${files.length}`);
  const violations = [];
  for (const rel of files) {
    let src;
    try { src = readFileSync(resolve(REPO, rel), "utf8"); }
    catch { violations.push(`${rel}: listed in the suite but not readable`); continue; }
    for (const b of nonPortableSpecifiers(src)) violations.push(`${rel}: imports ${b}`);
  }
  assert.equal(
    violations.length, 0,
    `non-portable imports in the discipline test suite (they pass locally but ERR_MODULE_NOT_FOUND in CI):\n  ${violations.join("\n  ")}\n` +
    `Fix: a suite test may import ONLY node: builtins and relative .mjs/.js. Put pure logic in a .mjs core and test that.`,
  );
});

test("every discipline-suite test's TRANSITIVE relative-import graph reaches no bare package or alias (the class behind PRs #632 and #640)", () => {
  const files = suiteFiles();
  const violations = [];
  for (const rel of files) violations.push(...transitiveNonPortable(resolve(REPO, rel)));
  assert.equal(
    violations.length, 0,
    `transitive non-portable imports reachable from the discipline test suite (green locally, ERR_MODULE_NOT_FOUND in CI):\n  ${violations.join("\n  ")}\n` +
    `Fix: make the npm import lazy (dynamic import() or require() inside the function that needs it, the db.mjs shape), ` +
    `or list the test by name in discipline.yml's npm-deps step instead of the no-npm suite.`,
  );
});

test("run-test-suite.sh passes NO shell-expanded */.test.mjs or */.selftest.mjs glob token to `node --test` (the file list comes ONLY from discoverTests())", () => {
  const src = readFileSync(SUITE, "utf8");
  const found = findInlineTestGlobTokens(src);
  assert.deepEqual(
    found, [],
    `run-test-suite.sh contains a shell-expanded test glob token again: ${JSON.stringify(found)}. ` +
    `This is the exact hazard lane T3 removed (the file list silently differing, or collapsing to zero, ` +
    `depending on which shell expands the glob). The list must come only from ` +
    `\`node .discipline/lib/test-discovery.mjs\`.`,
  );
});

test("ATTACK: findInlineTestGlobTokens catches a reintroduced glob token in a fixture script (never a real file)", () => {
  const fixtureWithGlob = [
    "#!/bin/sh",
    "# a comment mentioning fsi-app/foo/*.test.mjs must NOT trip this (it is not code)",
    "node --test \\",
    "  fsi-app/.discipline/lib/*.test.mjs \\",
    "  fsi-app/scripts/lib/*.selftest.mjs",
  ].join("\n");
  const found = findInlineTestGlobTokens(fixtureWithGlob);
  assert.deepEqual(found.sort(), [
    "fsi-app/.discipline/lib/*.test.mjs",
    "fsi-app/scripts/lib/*.selftest.mjs",
  ]);

  const fixtureClean = [
    "#!/bin/sh",
    "# a comment mentioning fsi-app/foo/*.test.mjs must NOT trip this (it is not code)",
    "node \"$DISCOVERY\" --print0 | xargs -0 node --test",
  ].join("\n");
  assert.deepEqual(findInlineTestGlobTokens(fixtureClean), []);
});
