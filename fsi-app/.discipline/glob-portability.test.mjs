// CLASS FIX (recurring issue): the discipline "Run discipline test suite" CI job runs `node --test` with
// NO `npm ci` (deliberate isolation). So a test in that glob that imports jiti, a `.ts` file, or any bare
// npm package PASSES locally (node_modules present) but FAILS in CI with ERR_MODULE_NOT_FOUND — caught only
// after push, as red. This has recurred (audit-gate.test.mjs imported jiti; earlier the meta-gate keyed on
// the working tree not the committed tree). The class cure is a portability guard that runs IN the glob:
// it reads the test list out of discipline.yml and asserts every listed file imports ONLY node: builtins and
// relative .mjs/.js — nothing that needs node_modules. A non-portable test now fails at pre-push (which runs
// this same glob) instead of in CI. Uses only node builtins, so it is itself portable.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."); // .discipline -> fsi-app -> repo root
// SINGLE HOME (guard-fix 1, operator ruling 2026-07-04): the test list lives in run-test-suite.sh — invoked
// by BOTH CI and pre-push. glob-portability reads its source-of-truth from THERE (the list came OUT of
// discipline.yml entirely, so there is no stale second home). If the resolved list is ever empty (the state
// this guard just caught when the list moved), that is a STANDING RED — see the assertion in the test.
const SUITE = resolve(REPO, "fsi-app/.discipline/run-test-suite.sh");

/** Pull every test path/glob token out of run-test-suite.sh (the BASE + FULL_ONLY lists). */
function testGlobFromSuite() {
  const src = readFileSync(SUITE, "utf8");
  // Tokens look like fsi-app/.discipline/lib/*.test.mjs or fsi-app/src/lib/llm/spend-guard.test.mjs.
  const toks = src.match(/fsi-app\/[^\s"'\\]+/g) || [];
  const args = [...new Set(toks.filter((t) => t.endsWith(".test.mjs") || t.includes("*")))];
  assert.ok(args.length > 0, "run-test-suite.sh must list `node --test` files (empty test list = standing red)");
  return args;
}

/** Expand a single-level glob (dir/*.test.mjs) or pass an explicit file through. No `**` is used in the glob. */
function expand(pattern) {
  if (!pattern.includes("*")) return [pattern];
  const slash = pattern.lastIndexOf("/");
  const dir = pattern.slice(0, slash);
  const suffix = pattern.slice(slash + 1).replace(/^\*/, ""); // *.test.mjs -> .test.mjs
  try { return readdirSync(resolve(REPO, dir)).filter((f) => f.endsWith(suffix)).map((f) => `${dir}/${f}`); }
  catch { return []; }
}

// MODULE specifiers only. An ES `from` import is `from "x"` (whitespace then quote, NEVER `from(`), so this
// does not match a Supabase `.from("table")` method call. Dynamic import()/require() use parens.
const MODULE_RES = [
  /\bfrom\s+["']([^"']+)["']/g,                    // import/export ... from "x"
  /\bimport\s+["']([^"']+)["']/g,                  // side-effect import "x"
  /\b(?:import|require)\s*\(\s*["']([^"']+)["']/g,  // import("x") / require("x")
];
/** A specifier is portable (no node_modules needed) iff it is a node: builtin or a relative non-.ts path. */
function nonPortableSpecifiers(src) {
  const noComments = src.replace(/\/\/[^\n]*/g, ""); // drop line comments so "// ...from 'x'..." can't false-trip
  const bad = [];
  for (const re of MODULE_RES) {
    for (const m of noComments.matchAll(re)) {
      const s = m[1];
      if (s.startsWith("node:")) continue;
      if (s.startsWith("./") || s.startsWith("../")) {
        if (/\.ts$/.test(s)) bad.push(`${s} (relative .ts needs a loader — extract a .mjs core)`);
        continue;
      }
      bad.push(`${s} (bare package — unavailable without npm ci)`);
    }
  }
  return bad;
}

test("run-test-suite.sh lists a NON-EMPTY test glob (empty source-of-truth is a standing red)", () => {
  // The permanent guard against the failure this fix was born from: if the test list ever moves/empties,
  // glob-portability fails LOUDLY instead of silently checking nothing.
  assert.ok(testGlobFromSuite().length > 0, "run-test-suite.sh resolved to ZERO test paths");
});

test("every discipline-glob test imports only node: builtins + relative .mjs (portable to the no-npm-ci CI job)", () => {
  const files = [...new Set(testGlobFromSuite().flatMap(expand))];
  assert.ok(files.length >= 10, `expected the discipline glob to expand to many files, got ${files.length}`);
  const violations = [];
  for (const rel of files) {
    let src;
    try { src = readFileSync(resolve(REPO, rel), "utf8"); }
    catch { violations.push(`${rel}: listed in the glob but not readable`); continue; }
    for (const b of nonPortableSpecifiers(src)) violations.push(`${rel}: imports ${b}`);
  }
  assert.equal(
    violations.length, 0,
    `non-portable imports in the discipline test glob (they pass locally but ERR_MODULE_NOT_FOUND in CI):\n  ${violations.join("\n  ")}\n` +
    `Fix: a glob test may import ONLY node: builtins and relative .mjs/.js. Put pure logic in a .mjs core and test that.`,
  );
});
