// rendering-guard assertion self-test (RENDER-1, 2026-07-11) — runs in the no-npm `node --test`
// discipline suite (portable: node builtins + relative .mjs/.ts only). This is the RED-THEN-GREEN
// proof of the guard's three detectors, and the harness self-test the mission requires: feed each
// detector a defect (must fire) and a fix (must pass). The Playwright runner reuses these SAME
// detectors over real browser measurements, so a green browser run cannot disagree with this proof.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isHorizontalOverflow,
  detectOverflows,
  findPlaceholderLiterals,
  PLACEHOLDER_LITERALS,
  hydrationAgrees,
  isNowIndependent,
} from "./assertions.mjs";
import {
  buildFixtures,
  markdownToHtml,
  stripSourcesSectionPreFix,
  BRIEF_WITH_SOURCES_ARTIFACT,
} from "./fixtures.mjs";
import { stripSourcesSection } from "../../src/lib/agent/brief-section-strip.mjs";
// The REAL V-07 formatters (extracted JSX-free so this portable suite can import them).
import { stableDateLabel, relativeTimeLabel } from "../../src/components/ui/relative-time-format.ts";

/** Pull visible <th>/<td> cell texts out of the fixture HTML (mirrors the browser text scan). */
function cellTexts(html) {
  const out = [];
  for (const m of html.matchAll(/>([^<>]+)<\/(?:th|td)>/g)) out.push(m[1].trim());
  return out;
}

// ── 1. Overflow detector (the harness self-test: overflowing DOM fails, fitting DOM passes) ─────

test("overflow detector: scrollWidth > clientWidth fires; fitting does not", () => {
  assert.equal(isHorizontalOverflow({ scrollWidth: 1619, clientWidth: 390 }), true); // the PPWR strip
  assert.equal(isHorizontalOverflow({ scrollWidth: 390, clientWidth: 390 }), false);
  assert.equal(isHorizontalOverflow({ scrollWidth: 391, clientWidth: 390 }), false); // 1px tolerance
  assert.equal(isHorizontalOverflow({ scrollWidth: 392, clientWidth: 390 }), true);
});

test("detectOverflows flags overflowing containers and EXCLUDES .leaflet-container", () => {
  const measurements = [
    { name: "body", scrollWidth: 400, clientWidth: 390, className: "" }, // overflow
    { name: "card", scrollWidth: 390, clientWidth: 390, className: "" }, // fits
    { name: "map", scrollWidth: 5000, clientWidth: 390, className: "leaflet-container" }, // excluded
  ];
  const hits = detectOverflows(measurements);
  assert.deepEqual(hits.map((h) => h.name), ["body"]);
  assert.equal(hits[0].overflowBy, 10);
});

// ── 2. Placeholder-literal detector (F-1) — reuses the REAL strip + isPlaceholderText ───────────

test("PLACEHOLDER_LITERALS carries the F-1 header literals (reused SoT, not hand-copied)", () => {
  for (const lit of ["source name", "url", "tier estimate", "why this source matters"]) {
    assert.ok(PLACEHOLDER_LITERALS.includes(lit), `missing literal: ${lit}`);
  }
});

test("F-1 RED: pre-fix strip leaves 'New Sources Identified' → header literals render as cells", () => {
  const rendered = markdownToHtml(stripSourcesSectionPreFix(BRIEF_WITH_SOURCES_ARTIFACT));
  const hits = findPlaceholderLiterals(cellTexts(rendered));
  // The reconstructed pre-fix behaviour renders "Source Name", "URL", "Tier estimate", … verbatim.
  assert.ok(hits.length >= 3, `expected placeholder literals to render, got ${JSON.stringify(hits)}`);
  assert.ok(hits.some((h) => /source name/i.test(h)));
});

test("F-1 GREEN: current stripSourcesSection removes the artifact → no placeholder literals", () => {
  const rendered = markdownToHtml(stripSourcesSection(BRIEF_WITH_SOURCES_ARTIFACT));
  const hits = findPlaceholderLiterals(cellTexts(rendered));
  assert.deepEqual(hits, []);
  assert.ok(!/New Sources Identified/i.test(rendered));
});

// ── 3. Hydration detector (V-07) — uses the REAL formatters ─────────────────────────────────────

test("V-07 GREEN: stableDateLabel (initial-render formatter) is now-independent → hydration agrees", () => {
  const iso = "2026-03-15T12:00:00.000Z";
  assert.equal(isNowIndependent(stableDateLabel, iso), true);
  // Server render and first client render both use stableDateLabel → identical → agree.
  assert.equal(hydrationAgrees(stableDateLabel(iso), stableDateLabel(iso)), true);
});

test("V-07 RED: relativeTimeLabel (pre-fix render formatter) is now-DEPENDENT → hydration mismatch", () => {
  const iso = new Date(1_000_000_000_000 - 30_000).toISOString(); // 30s before the stub's first 'now'
  assert.equal(isNowIndependent(relativeTimeLabel, iso), false);
  // Simulate SSR at instant A and hydration at instant B (different minute/day) with the pre-fix
  // render-time formatter → the two outputs differ → the React #418 mismatch the guard forbids.
  const realNow = Date.now;
  try {
    Date.now = () => 1_000_000_000_000;
    const server = relativeTimeLabel(iso);
    Date.now = () => 1_000_000_000_000 + 2 * 86_400_000;
    const clientFirst = relativeTimeLabel(iso);
    assert.equal(hydrationAgrees(server, clientFirst), false);
  } finally {
    Date.now = realNow;
  }
});

// ── 4. Fixture-set integrity: every RED fixture has a GREEN sibling in its class ─────────────────

test("fixture set: each layout class has a RED (defect) and a GREEN (fix) fixture", () => {
  const fx = buildFixtures();
  assert.ok(fx.length >= 6, `expected the fixture set to cover the classes, got ${fx.length}`);
  // Overflow classes L-1 and L-4 each need a red + a green; F-1 needs a placeholder red + green.
  const reds = fx.filter((f) => f.red);
  assert.ok(reds.some((f) => f.cls === "L-1" && f.expectOverflow));
  assert.ok(reds.some((f) => f.cls === "L-4" && f.expectOverflow));
  assert.ok(reds.some((f) => f.cls === "F-1" && f.expectPlaceholder));
  for (const cls of ["L-1", "L-4", "F-1"]) {
    assert.ok(fx.some((f) => f.cls === cls && !f.red), `class ${cls} lacks a GREEN fixture`);
  }
});
