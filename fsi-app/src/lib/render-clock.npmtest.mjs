// render-clock guard (lane HYDRATION-59, 2026-09-07). GOVERNING skill: caros-ledge-platform-intent.
//
// THE CLASS THIS CATCHES. A `"use client"` module that evaluates `new Date()` or `Date.now()` is
// evaluated TWICE with two different clocks — once on the server producing the SSR HTML, once in
// the browser during hydration. Any rendered text derived from that value can differ between the
// two passes, which is React's minified error #418 ("the server rendered text didn't match the
// client"), and a #418 makes React throw the streamed tree away and re-render it client-side —
// which is what leaves the fizz segment-reveal script (`$RS`) reaching for DOM nodes that are no
// longer there, i.e. `TypeError: Cannot read properties of null (reading 'parentNode')`.
// Both were observed on production /regulations and /map by the 2026-09-07 clickthrough audit.
//
// WHY A TEXT SCAN AND NOT A TYPE. There is no type that expresses "not evaluated during render",
// and the hazard is one grep-visible token. This gate is deliberately dumb and therefore
// unambiguous: inside the SURFACE render trees listed below, every `new Date()` / `Date.now()`
// occurrence must carry an explicit `clock-ok:` annotation on its own line or the line above,
// naming why THAT occurrence cannot differ between the two passes (the annotation may sit on the
// line itself or in the comment block directly above it) — it runs in an event handler or
// an effect, it is a documented fallback, the component is not mounted, and so on. An un-annotated
// occurrence fails. The correct fix is almost never an annotation: it is to take the instant as a
// prop from the server (src/lib/render-now.ts).
//
// SCOPE. The customer surface render trees — the pages the audit covers. Community/admin/auth
// subtrees are deliberately out of scope for now rather than annotated en masse; extending the
// list is a one-line change and the right move for the lane that touches them.
//
// Run: node --test src/lib/render-clock.npmtest.mjs (and via the repo's npmtest glob).

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

const SCOPE = [
  "components/ui",
  "components/dashboard",
  "components/list-surface",
  "components/regulations",
  "components/market",
  "components/research",
  "components/operations",
  "components/watchlist",
  "components/map",
  "components/pages",
  "components/profile",
  "components/home",
];

const HAZARD = /(new\s+Date\s*\(\s*\)|Date\s*\.\s*now\s*\(\s*\))/;
const ANNOTATION = /clock-ok:/;

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx") || p.endsWith(".ts")) out.push(p);
  }
  return out;
}

/** Strip block and line comments so a hazard token quoted inside prose (this repo's headers quote
 *  `Date.now()` constantly when explaining the defect) is never mistaken for a live call. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));
}

test("no un-annotated clock read in a client component's render path", () => {
  const offenders = [];
  for (const rel of SCOPE) {
    for (const file of walk(join(SRC, rel))) {
      if (file.includes(".npmtest.") || file.includes(".test.")) continue;
      const raw = readFileSync(file, "utf8");
      if (!/^\s*["']use client["']/m.test(raw)) continue;
      const rawLines = raw.split("\n");
      const codeLines = stripComments(raw).split("\n");
      codeLines.forEach((line, i) => {
        if (!HAZARD.test(line)) return;
        // The annotation may sit on the line itself or anywhere in the comment block immediately
        // above it (these reasons are usually two or three lines of prose, not a trailing tag).
        const annotated =
          ANNOTATION.test(rawLines[i] ?? "") ||
          rawLines.slice(Math.max(0, i - 6), i).some((l) => ANNOTATION.test(l));
        if (!annotated) offenders.push(`${file.slice(SRC.length + 1)}:${i + 1}: ${line.trim()}`);
      });
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "A client component may not read the host clock without saying why it is hydration-safe.\n" +
      "Take the instant as a prop from the server (src/lib/render-now.ts `renderNowIso()`), or add\n" +
      "`clock-ok: <reason>` naming why this occurrence cannot differ between the SSR and hydration\n" +
      "passes.\n\n" +
      offenders.join("\n"),
  );
});

test("the scanner actually fires (red control)", () => {
  // Rule 15: a guard is proven by attack, not by presence. This is the pre-fix DashboardBrief line,
  // verbatim, run through the same predicate — it must be caught.
  const red = '  const weekOfLabel = useMemo(() => formatLocaleDate(new Date(), { month: "short" }), []);';
  assert.ok(HAZARD.test(red), "the hazard pattern must match the defect this lane fixed");
  assert.ok(!ANNOTATION.test(red), "and it must not count as annotated");
  // ...and prose that merely NAMES the hazard must not be caught (the false-positive direction).
  const prose = " * Variable input such as `Date.now()` which changes each time it is called.";
  assert.ok(!HAZARD.test(stripComments(`/*\n${prose}\n*/`).split("\n")[1]), "comment prose is not a call");
});

// ── The SIBLING axis: locale ───────────────────────────────────────────────────────────────────
// `x.toLocaleString()` / `.toLocaleDateString()` / `new Intl.NumberFormat()` with no locale (or an
// explicit `undefined`) resolves to the HOST's default locale — the container's on the server, the
// VIEWER's in the browser. That is a DETERMINISTIC text mismatch on every load for every viewer
// whose browser language is not the server's, not a race: /operations rendered
// `USD 375,545` server-side and `USD 375.545` in a de-DE browser, reproduced verbatim this lane
// (src/lib/figures/format-range.mjs, via EstimatedFigure / AutomateVsHireCalculator).
// The one home for pinned formatting is src/lib/format.ts (`FIXED_LOCALE`, `formatNumber`,
// `formatLocaleDate`); src/lib/figures/format-range.mjs carries the same constant because it is
// `.mjs` and cannot import the `.ts` module.
//
// SCOPE: everything under src/ that can reach a render — excluding scripts that only ever run
// server-side in a worker (`src/lib/sources/**`, whose output is an error message, never DOM).

const UNPINNED = /\.toLocale(?:String|DateString|TimeString)\s*\(\s*(?:\)|undefined)|new\s+Intl\.(?:NumberFormat|DateTimeFormat)\s*\(\s*(?:\)|undefined)/;
const LOCALE_EXEMPT_DIRS = ["lib/sources/"];

test("no unpinned-locale formatter anywhere a render can reach", () => {
  const offenders = [];
  for (const file of walk(SRC)) {
    if (file.includes(".npmtest.") || file.includes(".test.")) continue;
    const rel = file.slice(SRC.length + 1);
    if (LOCALE_EXEMPT_DIRS.some((d) => rel.startsWith(d))) continue;
    stripComments(readFileSync(file, "utf8"))
      .split("\n")
      .forEach((line, i) => {
        if (UNPINNED.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
      });
  }
  assert.deepEqual(
    offenders,
    [],
    "Pin the locale. Use formatNumber/formatLocaleDate from src/lib/format.ts (FIXED_LOCALE), never\n" +
      "the host default — the server's default and the viewer's are different locales, and the two\n" +
      "renders then disagree on every load (React #418).\n\n" +
      offenders.join("\n"),
  );
});

test("the locale scanner actually fires (red control)", () => {
  assert.ok(UNPINNED.test('  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });'), "explicit undefined");
  assert.ok(UNPINNED.test('  const s = value.toLocaleString();'), "no argument at all");
  assert.ok(UNPINNED.test('  const f = new Intl.NumberFormat();'), "bare Intl constructor");
  assert.ok(!UNPINNED.test('  return n.toLocaleString(FIXED_LOCALE, { maximumFractionDigits: 0 });'), "pinned is clean");
  assert.ok(!UNPINNED.test('  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC" }).format(d);'), "pinned is clean");
});
