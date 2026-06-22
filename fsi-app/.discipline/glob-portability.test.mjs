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
const YML = resolve(REPO, ".github/workflows/discipline.yml");

/** Pull the file/glob arguments of the `node --test \ ...` invocation out of discipline.yml. */
function testGlobFromYml() {
  const lines = readFileSync(YML, "utf8").split(/\r?\n/);
  const start = lines.findIndex((l) => /^\s*node\s+--test\b/.test(l)); // the command line, NOT the "# node --test" comment
  assert.ok(start >= 0, "discipline.yml must contain a `node --test` invocation");
  const args = [];
  // the `node --test \` line ends with a backslash; collect following continuation lines until one does not.
  for (let i = start; i < lines.length; i++) {
    const raw = lines[i];
    const continues = /\\\s*$/.test(raw);
    const tok = raw.replace(/^.*node\s+--test\s*/, "").replace(/\\\s*$/, "").trim();
    if (tok && /[/.].*\.(test\.)?mjs|\*/.test(tok)) args.push(tok);
    if (i > start && !continues) break;
  }
  assert.ok(args.length > 0, "could not parse any test paths from the `node --test` glob");
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

test("every discipline-glob test imports only node: builtins + relative .mjs (portable to the no-npm-ci CI job)", () => {
  const files = [...new Set(testGlobFromYml().flatMap(expand))];
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
