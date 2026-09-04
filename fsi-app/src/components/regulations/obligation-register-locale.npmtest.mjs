// obligation-register-locale.npmtest.mjs — HYDRATION-418 regression proof (PERF-MERGE, 2026-09-04;
// updated RECONCILE 2026-09-04 item 4b-ii when the fix moved from an inline "en-US" literal to the
// shared formatter module).
//
// Named *.npmtest.mjs to match this directory's existing convention (format-fixed-date.npmtest.mjs,
// band-empty-state.npmtest.mjs) so it is picked up by the same glob-by-construction CI step.
//
// THE BUG [CONFIRMED this lane]: ObligationRegisterFilterBar.tsx's "Load more (N more)" text and its
// empty-state "N dated forward events" text both called `.toLocaleString()` with NO explicit locale
// argument. On train 43 (PERF-11, pre-PERF-MERGE) ObligationRegister.tsx was an async SERVER component
// that rendered this ("use client") component synchronously into the SSR HTML with real data — so that
// text rendered once server-side using the Node runtime's default Intl locale, and again client-side
// during hydration using the BROWSER's own default locale. Node's default in this environment resolves
// to "en-US" (see the first assertion below); a browser whose default Intl locale is anything else
// produces a genuinely different formatted string for the exact same number, which is React's minified
// error #418 (hydration text mismatch) — deterministic per non-en-US-locale viewer, on every /regulations
// load (the register always has more rows than the first page, so "Load more" always renders).
//
// THE FIX, twice over: first (PERF-MERGE) an inline `.toLocaleString("en-US")` literal at each call
// site; then (RECONCILE item 4b-ii, this pass) both call sites were moved onto `formatNumber()`
// (src/lib/format.ts), the ONE shared formatter module every repo-wide `.toLocaleString`/
// `.toLocaleDateString` call site now routes through — see format-locale-sweep.npmtest.mjs for the
// repo-wide enforcement. This file keeps its own narrower assertions (the exact two call sites, by
// name) as a closer-grained regression proof for the specific component that motivated the sweep.
//
// Unlike format-fixed-date.npmtest.mjs's `TZ` env var (which V8 re-reads live, per call), this Node
// build's `Intl` default locale is fixed at process start and cannot be overridden per-call from a test
// (confirmed this session: setting LANG/LC_ALL mid-process, and node's own --icu-default-locale flag, both
// had no effect on `new Intl.NumberFormat().resolvedOptions().locale`). So this proof instead (a) shows
// the underlying platform API disagrees across explicit locales for the exact live value, proving the
// class of bug is real and not vacuous, and (b) statically pins the actual fix — both call sites in the
// source now route through `formatNumber()` (which itself pins "en-US", see format.ts) — so a
// regression that reverts to a bare `.toLocaleString()` call is caught by this test without needing to
// fork a second Node process with a different default locale.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SOURCE_PATH = fileURLToPath(new URL("./ObligationRegisterFilterBar.tsx", import.meta.url));
const source = readFileSync(SOURCE_PATH, "utf8");

test("sanity: Number.prototype.toLocaleString() DOES disagree across locales for the live 'Load more' value (proves the bug class is real, not vacuous)", () => {
  const n = 1141 - 60; // 1081 — the exact live value (total - rows.length) on /regulations' first load, 2026-09-04
  assert.equal(n.toLocaleString("en-US"), "1,081");
  assert.equal(n.toLocaleString("de-DE"), "1.081");
  assert.equal(n.toLocaleString("fr-FR"), "1 081");
  assert.equal(n.toLocaleString("pl-PL"), "1081");
  // Every one of these differs from the en-US string a server always produces — any viewer whose
  // browser's default locale resolves to one of these (or similar) would hydrate a different DOM text
  // node than the server sent.
  assert.notEqual(n.toLocaleString("de-DE"), n.toLocaleString("en-US"));
  assert.notEqual(n.toLocaleString("fr-FR"), n.toLocaleString("en-US"));
});

test("sanity: this Node runtime's own default locale resolves to en-US (the value the server-side render used pre-fix, unpinned)", () => {
  assert.equal(new Intl.NumberFormat().resolvedOptions().locale, "en-US");
});

test("fix: the 'Load more' count routes through the shared formatNumber() (no bare .toLocaleString())", () => {
  assert.match(
    source,
    /Load more \(\$\{formatNumber\(total - rows\.length\)\} more\)/,
    "expected the Load more button to call formatNumber(total - rows.length) — a bare .toLocaleString() " +
      "reintroduces HYDRATION-418 (the runtime's default locale, not necessarily the viewer's, is used for " +
      "the server-rendered pass)"
  );
});

test("fix: the empty-state sourceEventCount routes through the shared formatNumber()", () => {
  assert.match(
    source,
    /\{formatNumber\(sourceEventCount\)\}/,
    "expected the empty-state forward-event count to call formatNumber(sourceEventCount)"
  );
});

test("fix: formatNumber is imported from the ONE shared formatter module", () => {
  assert.match(
    source,
    /import\s*\{\s*formatNumber\s*\}\s*from\s*"@\/lib\/format"/,
    "expected formatNumber to be imported from @/lib/format, not reimplemented locally"
  );
});

test("regression guard: no bare (unlocaled) .toLocaleString() call remains anywhere in this file", () => {
  const bareCalls = [...source.matchAll(/\.toLocaleString\(\)/g)];
  assert.equal(
    bareCalls.length,
    0,
    `found ${bareCalls.length} bare .toLocaleString() call(s) with no locale argument — each is a ` +
      "HYDRATION-418 risk on any surface that can render this component during SSR"
  );
});
