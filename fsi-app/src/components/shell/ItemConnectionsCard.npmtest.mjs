// Structural regression test for ItemConnectionsCard.tsx (lane opsclip, train 61, defect 6).
//
// RED: the 2026-09-08 production click-through, V27: "/regulations/[slug] CONNECTIONS rail entries
// render full untruncated regulation titles running 8-12 lines each, turning the rail into a wall
// of text. The artboard truncates to a scannable line." Nothing in the suite failed on it.
//
// Text-level check, the same convention Absence.npmtest.mjs's own header explains: the file is pure
// inline style, so its declarations ARE the product values.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "ItemConnectionsCard.tsx"),
  "utf8",
);

test("a connection's title is clamped to two lines, with the full title reachable on `title`", () => {
  const block = SOURCE.slice(SOURCE.indexOf("{row.label}"), SOURCE.indexOf("row.basisSummary.length > 0"));
  assert.match(block, /WebkitLineClamp: 2/, "a clamp draws its own ellipsis, so nothing is cut without a sign");
  assert.match(block, /WebkitBoxOrient: "vertical"/);
  assert.match(block, /overflow: "hidden"/);
  assert.match(block, /title=\{row\.title\}/, "the full title stays reachable");
});

test("the rail's own count goes through the locale-pinned formatter (defect 4)", () => {
  assert.match(SOURCE, /formatNumber\(rows\.length\)/);
  assert.match(SOURCE, /from "@\/lib\/format"/);
});
