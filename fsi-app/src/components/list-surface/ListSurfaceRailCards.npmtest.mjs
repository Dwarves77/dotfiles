// Structural regression test for src/components/list-surface/ListSurfaceRailCards.tsx's ruling
// 5.1 fix (lane fix58-lists, 2026-09-07, design audit B163/B170: list-surface.json /
// section-card-lists.json). Text-level, same convention as ListRow.npmtest.mjs's own header
// explains (no JSX mount infra for plain `node --test`; the audit harness's own `railcard`/
// `list-surface-1440` mounts and the rendering guard's smoke specs are the real-DOM check).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "ListSurfaceRailCards.tsx"),
  "utf8"
);

test("imports the shared SectionRule, ruling 5.1's own part", () => {
  assert.match(SOURCE, /import \{ SectionRule \} from "@\/components\/ui\/SectionRule";/);
});

test("RailCard mounts SectionRule as the outer card's first child, before a separate padded content wrapper", () => {
  assert.match(SOURCE, /<SectionRule \/>\s*\n\s*<div style=\{\{ padding: "14px 16px" \}\}>/);
});

test("the outer card div carries no padding of its own (moved to the inner wrapper so the rule sits at the true top edge)", () => {
  const cardBlock = SOURCE.slice(SOURCE.indexOf("export function RailCard"), SOURCE.indexOf("<SectionRule"));
  assert.doesNotMatch(cardBlock, /padding:/);
  assert.match(cardBlock, /overflow: "hidden",/);
});
