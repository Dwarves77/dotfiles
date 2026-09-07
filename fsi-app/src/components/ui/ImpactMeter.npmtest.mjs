// Structural regression test for src/components/ui/ImpactMeter.tsx's mobile-390 addition (lane
// moblist, 2026-09-07). Text-level, same convention as ListRow.npmtest.mjs's own header explains
// (no JSX mount infra for plain `node --test`; the rendering guard's Playwright smoke specs are
// the real-DOM check for this file, exercised live via the five list pages' row fixtures).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "ImpactMeter.tsx"),
  "utf8"
);

test("row-variant bars grow to heights 5/10/16 for scores 1/2/3 below 768px", () => {
  assert.match(SOURCE, /@media \(max-width: 767px\)/);
  assert.match(SOURCE, /\.cl-impact-bar\[data-score="1"\]\s*\{\s*height:\s*5px/);
  assert.match(SOURCE, /\.cl-impact-bar\[data-score="2"\]\s*\{\s*height:\s*10px/);
  assert.match(SOURCE, /\.cl-impact-bar\[data-score="3"\]\s*\{\s*height:\s*16px/);
});

test("mobile bars sit on a rgba(0,0,0,.25) baseline (from the desktop --line-1 rgba(0,0,0,.12))", () => {
  assert.match(SOURCE, /rgba\(0,0,0,\.25\)/);
});

test("unscored row variant renders via Absence (small-caps reason), not a bare em dash", () => {
  assert.match(SOURCE, /import \{ Absence \} from "@\/components\/ui\/Absence";/);
  assert.match(SOURCE, /variant === "row" \? <Absence reason="unscored" \/>/);
});

test("full variant is untouched — still the bare em-dash unscored render, no Absence/media-query leak", () => {
  assert.match(SOURCE, /: <span style=\{\{ fontSize: "var\(--fs-11\)", color: "var\(--ink-3\)" \}\}>—<\/span>/);
});

test("operator audit item 2.1 (2026-09-07): unscored row-variant baseline is 30px at every viewport, desktop and mobile", () => {
  assert.match(SOURCE, /width: variant === "full" \? 96 : 30/);
  assert.doesNotMatch(SOURCE, /variant === "full" \? 96 : 40/);
});

// Design audit B29-B46 (docs/design/handoff-2026-09-06/AUDIT-2026-09-07.md,
// impactmeter.json, artboard #sys list-row example): desktop row-scored bars are 9px
// wide, heights 6/12/18 for scores 1/2/3, top-only 1px radius, sitting in an 18px
// container on a 1px solid rgba(0,0,0,.25) baseline; the sum label sits margin-left:7px.
test("B29-B31: row-scored bars container is 18px tall with a 1px solid rgba(0,0,0,.25) baseline", () => {
  assert.match(SOURCE, /className="cl-impact-bars"[\s\S]{0,160}height: 18,[\s\S]{0,80}borderBottom: "1px solid rgba\(0,0,0,\.25\)"/);
});

test("B33-B39: row-scored bars are 9px wide, height = score * 6px, top-only radius", () => {
  assert.match(SOURCE, /width: 9,\s*\n\s*height: `\$\{v \* 6\}px`/);
  assert.match(SOURCE, /borderRadius: "1px 1px 0 0"/);
});

test("B40: row-scored sum label sits margin-left:7px from the bars", () => {
  assert.match(SOURCE, /whiteSpace: "nowrap",\s*\n\s*marginLeft: 7,/);
});

test("B41: unscored dashed baseline is rgba(0,0,0,.3), not the --line-1 token", () => {
  assert.match(SOURCE, /borderBottom: "1px dashed rgba\(0,0,0,\.3\)"/);
});

test("B42-B44: full-variant track is 8px tall, 8px radius, gradient mid stop at 55%", () => {
  assert.match(SOURCE, /height: 8,\s*\n\s*borderRadius: 8,\s*\n\s*background:\s*\n\s*"linear-gradient\(90deg, var\(--awareness\), var\(--action\) 55%, var\(--immediate\)\)"/);
});

test("B45-B46: full-variant dimension label is 116px wide at fs-125", () => {
  assert.match(SOURCE, /fontSize: "var\(--fs-125\)", color: "var\(--ink-2\)", width: 116/);
});
