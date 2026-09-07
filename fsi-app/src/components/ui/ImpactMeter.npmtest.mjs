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
