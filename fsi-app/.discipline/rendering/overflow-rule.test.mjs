// overflow-rule.test.mjs (lane GATES-2, 2026-10-05): pure proof of the shared phone-width overflow rule,
// including the production defect shape (a 1108px strip inside a 375px screen whose <main> scrolls).
import test from "node:test";
import assert from "node:assert/strict";
import {
  OVERFLOW_ALLOW_ATTRS,
  NARROW_VIEWPORT_MAX_PX,
  isNarrowViewport,
  detectContainerOverflows,
  formatContainerOverflows,
} from "./overflow-rule.mjs";

const VW = 375;
const doc = (over = {}) => ({ name: "document", kind: "document", scrollWidth: 375, clientWidth: 375, boxRight: 375, allowed: false, ...over });

test("the allowance vocabulary names the new attribute and reuses the house strip declaration", () => {
  assert.deepEqual([...OVERFLOW_ALLOW_ATTRS], ["data-overflow-allowed", "data-guard-strip"]);
  assert.equal(NARROW_VIEWPORT_MAX_PX, 480);
  assert.equal(isNarrowViewport(375), true);
  assert.equal(isNarrowViewport(768), false);
  assert.equal(isNarrowViewport(0), false);
});

test("CLEAN: document, main and a scroller that all fit pass", () => {
  const hits = detectContainerOverflows(
    [doc(), { name: "main", kind: "main", scrollWidth: 375, clientWidth: 375, boxRight: 375 }, { name: "div.x", kind: "scroller", scrollWidth: 300, clientWidth: 300, boxRight: 300 }],
    { viewportWidth: VW },
  );
  assert.deepEqual(hits, []);
});

test("ATTACK (production defect): the document passes but <main> scrolls sideways, so main is flagged", () => {
  const hits = detectContainerOverflows(
    [doc(), { name: "main", kind: "main", scrollWidth: 1108, clientWidth: 375, boxRight: 375 }],
    { viewportWidth: VW },
  );
  assert.equal(hits.length, 1);
  assert.equal(hits[0].name, "main");
  assert.equal(hits[0].overflowBy, 733);
});

test("ATTACK: an overflow-x:auto parent whose inner wrapper overflows is flagged", () => {
  const hits = detectContainerOverflows(
    [doc(), { name: "div.cards", kind: "scroller", scrollWidth: 900, clientWidth: 340, boxRight: 357, allowed: false }],
    { viewportWidth: VW },
  );
  assert.deepEqual(hits.map((h) => h.name), ["div.cards"]);
});

test("a declared strip may scroll inside its own box when the box fits the screen", () => {
  const hits = detectContainerOverflows(
    [doc(), { name: "div[strip]", kind: "scroller", scrollWidth: 1108, clientWidth: 339, boxRight: 357, allowed: true }],
    { viewportWidth: VW },
  );
  assert.deepEqual(hits, []);
});

test("ATTACK: a declared strip whose own box is 1108px wide on a 375px screen still fails", () => {
  const hits = detectContainerOverflows(
    [doc(), { name: "div[strip]", kind: "scroller", scrollWidth: 1108, clientWidth: 1108, boxRight: 1144, allowed: true }],
    { viewportWidth: VW },
  );
  assert.equal(hits.length, 1);
  assert.match(hits[0].reason, /declared scroller's own box runs 769px past the 375px viewport/);
});

test("ATTACK: the ancestors of a declared strip are still held to the rule", () => {
  const hits = detectContainerOverflows(
    [
      doc(),
      { name: "main", kind: "main", scrollWidth: 1144, clientWidth: 375, boxRight: 375, allowed: false },
      { name: "div[strip]", kind: "scroller", scrollWidth: 1108, clientWidth: 339, boxRight: 357, allowed: true },
    ],
    { viewportWidth: VW },
  );
  assert.deepEqual(hits.map((h) => h.name), ["main"]);
});

test("the document itself is held to the rule, one pixel of slack is tolerated, two is not", () => {
  assert.deepEqual(detectContainerOverflows([doc({ scrollWidth: 376 })], { viewportWidth: VW }), []);
  assert.equal(detectContainerOverflows([doc({ scrollWidth: 377 })], { viewportWidth: VW }).length, 1);
});

test("a leaflet container pans internally by design and is excluded", () => {
  const hits = detectContainerOverflows(
    [{ name: "div.leaflet-container", kind: "scroller", scrollWidth: 5000, clientWidth: 375, boxRight: 375, className: "leaflet-container" }],
    { viewportWidth: VW },
  );
  assert.deepEqual(hits, []);
});

test("non-array input is clean; formatContainerOverflows names the label and every container", () => {
  assert.deepEqual(detectContainerOverflows(null, { viewportWidth: VW }), []);
  assert.deepEqual(formatContainerOverflows("x", []), []);
  const lines = formatContainerOverflows("spec:state@375", [{ name: "main", kind: "main", reason: "why", overflowBy: 1 }]);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^spec:state@375: 1 scroll container\(s\) overflow at phone width, main: why/);
});
