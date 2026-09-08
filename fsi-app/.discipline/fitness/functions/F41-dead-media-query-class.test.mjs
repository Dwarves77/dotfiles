// @ts-check
// Red-then-green for F41 (dead-media-query-class), including the EXACT source that shipped the
// defect: MapPageView.tsx's `@media (max-width:1280px) { .cl-map-grid { ... } }` against an outer
// grid classed `.cl-map-outer`. CLAUDE.md rule 15: a guard is proven by attack, not by presence —
// this file attacks it with the real regression and with the shapes that must stay green.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getRepoRoot } from "../../lib/context.mjs";
import { fitnessFunction, mediaBlocks, classNamesRendered } from "./F41-dead-media-query-class.mjs";

const FILE = "fsi-app/src/components/map/MapPageView.tsx";

test("RED: the exact defect that shipped — the rule names .cl-map-grid, the grid is .cl-map-outer", () => {
  const src = [
    'return (',
    '  <div style={{ gridTemplateColumns: "minmax(0,1fr) 300px" }} className="cl-map-outer">',
    '    <style>{`',
    '      @media (max-width: 1280px) {',
    '        .cl-map-grid { grid-template-columns: 1fr !important; }',
    '      }',
    '    `}</style>',
    '  </div>',
    ');',
  ].join("\n");
  const v = fitnessFunction.check(FILE, src);
  assert.equal(v.length, 1);
  assert.match(v[0].message, /\.cl-map-grid, which no element in this file carries/);
  assert.match(v[0].message, /D-M3/);
  assert.equal(v[0].line, 4, "the violation points at the @media rule, not at the file");
});

test("GREEN: the fix — the media query names the class the element actually carries", () => {
  const src = [
    '<div className="cl-map-outer">',
    '  <style>{`',
    '    @media (max-width: 1280px) { .cl-map-outer { grid-template-columns: minmax(0, 1fr) !important; } }',
    '  `}</style>',
    '</div>',
  ].join("\n");
  assert.deepEqual(fitnessFunction.check(FILE, src), []);
});

test("GREEN: a class built into a conditional className expression still counts as rendered", () => {
  const src = [
    'className={groups.length > 0 ? "cl-list-surface-grid cl-list-surface-grid--mobile-facets" : "cl-list-surface-grid"}',
    '<style>{`@media (max-width: 767px) { .cl-list-surface-grid { padding: 14px 16px 16px !important; } }`}</style>',
  ].join("\n");
  assert.deepEqual(fitnessFunction.check(FILE, src), []);
});

test("GREEN: a known shared-part class rendered by ANOTHER component is not a dead rule", () => {
  const src = '<style>{`@media (max-width: 767px) { .cl-band-tile { padding: 12px 14px 0 !important; } }`}</style>';
  assert.deepEqual(fitnessFunction.check("fsi-app/src/components/ui/BandTile.tsx", src), []);
});

test("GREEN: an explicit fitness-allow: F41 marker above the rule exempts it", () => {
  const src = [
    '// fitness-allow: F41 (.cl-somewhere-else is rendered by SomeOtherPart.tsx)',
    '<style>{`@media (max-width: 767px) { .cl-somewhere-else { display: none !important; } }`}</style>',
  ].join("\n");
  assert.deepEqual(fitnessFunction.check(FILE, src), []);
});

test("a rule OUTSIDE any @media block is out of scope — only responsive rules are checked", () => {
  const src = '<style>{`.cl-not-rendered:hover { background: red; }`}</style>';
  assert.deepEqual(fitnessFunction.check(FILE, src), []);
});

test("a selector inside the style block cannot vouch for itself", () => {
  // The class appears in the file only as a selector, never on an element. Were classNamesRendered
  // to read the style block too, every dead rule would self-certify and the gate would be vacuous.
  const src = '<style>{`@media (max-width: 767px) { .cl-ghost { display: none; } }`}</style>';
  assert.equal(fitnessFunction.check(FILE, src).length, 1);
  assert.equal(classNamesRendered(src).has("cl-ghost"), false);
});

test("mediaBlocks is brace-balanced — nested rules do not truncate the block", () => {
  const blocks = mediaBlocks("@media (max-width: 767px) {\n  .a { color: red; }\n  .b { color: blue; }\n}\n.c { color: green; }");
  assert.equal(blocks.length, 1);
  assert.match(blocks[0].text, /\.a/);
  assert.match(blocks[0].text, /\.b/);
  assert.doesNotMatch(blocks[0].text, /\.c/, "the block must end at its own closing brace");
});

test("the live tree is clean — F41 is green on every .tsx it enumerates", () => {
  const files = fitnessFunction.enumerate();
  assert.ok(files.length > 0, "the gate must actually enumerate files");
  // FOLD-61 (rule 15): this test asserted only that enumerate() returned SOMETHING, so it would
  // have stayed green with every file in the tree violating. It now runs check() over each of
  // them, which is what its own name claims. Proven by attack at the fold: renaming
  // MapPageView's `.cl-map-outer` selector inside its 1280 media query to a class no element
  // carries turns this test RED with one violation at that line, and restoring it turns it green.
  const violations = [];
  for (const f of files) {
    const abs = `${getRepoRoot()}/${f}`;
    for (const v of fitnessFunction.check(f, readFileSync(abs, "utf8"))) {
      violations.push(`${f}:${v.line} ${v.message.slice(0, 120)}`);
    }
  }
  assert.deepEqual(violations, [], `F41 must be green on the live tree:\n${violations.join("\n")}`);
});
