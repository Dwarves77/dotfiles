// format-locale-sweep.test.mjs — RECONCILE (2026-09-04, item 4b-ii) enforcement.
//
// THE BUG CLASS [CONFIRMED this lane, HYDRATION-418]: a React component under src/app/ or
// src/components/ — server component or "use client" component whose first render is the
// SSR/hydration pass — that calls `.toLocaleString()` / `.toLocaleDateString()` directly renders
// TEXT whose formatting depends on the CALLING RUNTIME's own default Intl locale (when no locale
// argument is given) or duplicates a hand-copied locale literal (when one is). Either way the exact
// same defect class format-fixed-date.ts (timeZone axis) and obligation-register-locale.npmtest.mjs
// (locale axis, ~70 call sites [CONFIRMED, grep, 2026-09-04]) already document: a server render and a
// client hydration render can disagree, which is React's minified error #418.
//
// THE FIX (this pass): every one of those ~70 call sites across ~40 files now routes through
// src/lib/format.ts's `formatNumber` / `formatLocaleDate` / `formatLocaleDateTime` — ONE shared
// formatter module, one place to change FIXED_LOCALE later, per that file's own header. This test is
// the regression guard: it fails the build the moment a NEW bare `.toLocaleString(`/
// `.toLocaleDateString(` call is added anywhere under src/app/ or src/components/ outside the
// formatter module itself, so the sweep cannot silently erode call by call.
//
// WHY SCOPED TO src/app + src/components (not "every .mjs/.ts in the repo"): those two trees are
// exactly the React rendering surface where a call's OUTPUT can reach a browser hydration diff. A
// handful of src/lib/**/*.mjs helpers outside this scope (an audit-trail statement formatter, a
// sitemap crawler's byte-count error message, a market-series build-time aggregator) also call these
// methods, but their output is either never rendered into a component (log/error text) or already
// baked once into non-reactive server-computed HTML with no client-side re-formatting path — genuinely
// out of the hydration-mismatch bug class this sweep exists to close, not silently missed. Widening
// scope to those would risk breaking build/audit scripts that were never part of this pass's ~30-70
// site inventory.
//
// EXCLUDED FILES: this file's own module (n/a — outside scan roots), any *.test.mjs / *.npmtest.mjs /
// *.selftest.mjs (test files legitimately reference the string in assertions/comments), and
// src/lib/format.ts is outside the scan roots entirely (the ONE permitted home).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, ".."); // .discipline -> fsi-app
const SCAN_ROOTS = ["src/app", "src/components"];
const SCAN_EXTS = new Set([".ts", ".tsx"]);
const EXCLUDED_DIR_NAMES = new Set(["node_modules", ".next"]);

function isTestFile(name) {
  return /\.(test|npmtest|selftest)\.mjs$/i.test(name) || /\btest\b/i.test(name.replace(/\.[^.]+$/, ""));
}

/** Recursively collect every scannable file path (relative to ROOT) under the given scan roots. */
function collectFiles(root, scanRoots, excludedDirNames) {
  const out = [];
  const walk = (absDir) => {
    let entries;
    try {
      entries = readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      if (e.isDirectory()) {
        if (excludedDirNames.has(e.name)) continue;
        walk(join(absDir, e.name));
        continue;
      }
      if (!e.isFile()) continue;
      const dot = e.name.lastIndexOf(".");
      const ext = dot === -1 ? "" : e.name.slice(dot);
      if (!SCAN_EXTS.has(ext)) continue;
      if (isTestFile(e.name)) continue;
      out.push(relative(root, join(absDir, e.name)));
    }
  };
  for (const r of scanRoots) walk(resolve(root, r));
  return out;
}

/** Find every `.toLocaleString(`/`.toLocaleDateString(` call in `source`, excluding // comment lines
 *  and matches inside /* block comments (line-based: this repo's own comment style is always //, so a
 *  line whose trimmed text starts with // is a comment; block comments are rare enough here that a
 *  false negative on one is an acceptable trade for a simple, auditable scan). Returns the matching
 *  line numbers (1-indexed) for a useful failure message. */
function findLiveCalls(source) {
  const lines = source.split("\n");
  const hits = [];
  const pattern = /\.toLocaleString\(|\.toLocaleDateString\(/;
  let inBlockComment = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (inBlockComment) {
      if (trimmed.includes("*/")) inBlockComment = false;
      continue;
    }
    if (trimmed.startsWith("/*")) {
      if (!trimmed.includes("*/")) inBlockComment = true;
      continue;
    }
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue; // line comment, or JSDoc body line
    if (pattern.test(raw)) hits.push(i + 1);
  }
  return hits;
}

test("no bare .toLocaleString()/.toLocaleDateString() call remains under src/app or src/components", () => {
  const files = collectFiles(ROOT, SCAN_ROOTS, EXCLUDED_DIR_NAMES);
  assert.ok(files.length > 50, `sanity: expected 50+ scannable files under ${SCAN_ROOTS.join(", ")}, found ${files.length} — scan roots may be wrong`);

  const offenders = [];
  for (const rel of files) {
    const abs = resolve(ROOT, rel);
    const source = readFileSync(abs, "utf8");
    const hits = findLiveCalls(source);
    if (hits.length > 0) offenders.push({ rel, lines: hits });
  }

  assert.equal(
    offenders.length,
    0,
    "found live .toLocaleString()/.toLocaleDateString() call(s) outside src/lib/format.ts — each is a " +
      "HYDRATION-418 risk (server-vs-client Intl locale/timezone disagreement) on any surface that can " +
      "render this file during SSR. Route through formatNumber()/formatLocaleDate()/formatLocaleDateTime() " +
      "from @/lib/format instead:\n" +
      offenders.map((o) => `  ${o.rel}: line(s) ${o.lines.join(", ")}`).join("\n"),
  );
});

test("sanity: this scan actually finds a call when one is deliberately present (proves the scan itself is not vacuous)", () => {
  const sourceWithCall = 'export function f(n) { return n.toLocaleString("en-US"); }\n';
  assert.deepEqual(findLiveCalls(sourceWithCall), [1]);
});

test("sanity: the scan ignores // comment lines and /* block */ comments (no false positives)", () => {
  const commented = [
    "// see toLocaleDateString(\"en-US\") for the old shape",
    "/* toLocaleString( multi",
    "   line block comment */",
    "const x = 1;",
  ].join("\n");
  assert.deepEqual(findLiveCalls(commented), []);
});

test("src/lib/format.ts itself is the one permitted home (not scanned, but sanity-checked it still defines the wrappers)", () => {
  const formatTs = readFileSync(resolve(ROOT, "src/lib/format.ts"), "utf8");
  assert.match(formatTs, /export function formatNumber\(/);
  assert.match(formatTs, /export function formatLocaleDate\(/);
  assert.match(formatTs, /export function formatLocaleDateTime\(/);
});
