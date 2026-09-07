// Structural regression test for src/components/list-surface/ListSurfaceShell.tsx's ruling 5.1
// fix on the facets card (lane fix58-lists, 2026-09-07, design audit B165/B164: list-surface.json
// "facets card — the 3px graduated rule above the card" / "facets card — padding"). Text-level,
// same convention as ListRow.npmtest.mjs's own header explains (no JSX mount infra for plain
// `node --test`; the audit harness's own `list-surface-1440` mount and the rendering guard's
// smoke specs are the real-DOM check).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "ListSurfaceShell.tsx"),
  "utf8"
);

test("both facets cards (primary and secondary) mount SectionRule before their padded content wrapper", () => {
  const matches = SOURCE.match(/<SectionRule \/>\s*\n\s*<div style=\{\{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 16px 14px" \}\}>/g) || [];
  assert.equal(matches.length, 2, "both the primary and secondary .cl-facets-desktop cards must mount SectionRule + a 12px 16px 14px content wrapper");
});

test("the facets card's content padding is 12px 16px 14px (p2's own stated value), not the old uniform 12px 16px", () => {
  assert.doesNotMatch(SOURCE, /padding: "12px 16px",/, "the old, unringed padding shorthand must not remain anywhere in this file");
});

test(".cl-facets-desktop stays the outer card's own class hook (mobile CSS still hides it as a whole)", () => {
  const occurrences = SOURCE.match(/className="cl-facets-desktop"/g) || [];
  assert.equal(occurrences.length, 2, "one per facets card (primary + secondary)");
});
