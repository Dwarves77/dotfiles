// Structural regression test for src/components/ui/FactCard.tsx (lane uidetails, 2026-09-06;
// reshaped per operator audit item 2.4, lane uxfix-system, 2026-09-07). No JSX render harness exists
// in this repo (see WatchButton.npmtest.mjs's own header) — this reads the component's source text
// to guard the three-variant FORM contract the 2.4 ruling binds: sourced = 2px solid #1A1A1A LEFT
// edge + 1px rgba(0,0,0,.12) the other three sides + radius 0 8px 8px 0 + white + quote + link;
// inference = 1px DASHED rgba(0,0,0,.25) all round + #FAFAF8 + italic, NO link ("not citable");
// counsel = 2px solid #F97316 LEFT edge, otherwise shaped exactly like sourced. A uniform grey
// perimeter on all three (the pre-2.4 bug) is exactly what these tests would catch again.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "FactCard.tsx"),
  "utf8"
);

function bodyOf(branchStartMarker) {
  const start = SOURCE.indexOf(branchStartMarker);
  assert.ok(start !== -1, `expected to find ${branchStartMarker}`);
  const nextIf = SOURCE.indexOf("if (variant ===", start + 1);
  const end = nextIf !== -1 ? nextIf : SOURCE.indexOf("// sourced (FACT)");
  return SOURCE.slice(start, end === -1 ? undefined : end);
}

test("three variants are exported/typed: sourced, inference, counsel", () => {
  assert.match(SOURCE, /FactCardVariant = "sourced" \| "inference" \| "counsel"/);
});

test("the inference branch uses a 1px dashed rgba(0,0,0,.25) border, #FAFAF8 (--page), italic text, and never renders a link (not citable)", () => {
  const body = bodyOf('if (variant === "inference")');
  assert.match(body, /border: "1px dashed rgba\(0,0,0,\.25\)"/);
  assert.match(body, /background: "var\(--page\)"/);
  assert.match(body, /fontStyle: "italic"/);
  assert.doesNotMatch(body, /<a\b/);
});

test("the counsel branch uses a 2px solid orange (--action) LEFT edge and the shared sourced shape", () => {
  const body = bodyOf('if (variant === "counsel")');
  assert.match(body, /SOURCED_SHAPE, borderLeft: "2px solid var\(--action\)"/);
});

test("SOURCED_SHAPE (shared by sourced + counsel) is 1px rgba(0,0,0,.12), white, radius 0 8px 8px 0", () => {
  const shape = SOURCE.slice(SOURCE.indexOf("const SOURCED_SHAPE"), SOURCE.indexOf("export function FactCard"));
  assert.match(shape, /background: "var\(--card\)"/);
  assert.match(shape, /border: "1px solid var\(--line-1\)"/);
  assert.match(shape, /borderRadius: "0 8px 8px 0"/);
});

test("the sourced (FACT) branch uses a 2px solid ink LEFT edge and can render a source link + tier chip", () => {
  const body = SOURCE.slice(SOURCE.indexOf("// sourced (FACT)"));
  assert.match(body, /SOURCED_SHAPE, borderLeft: "2px solid var\(--ink\)"/);
  assert.match(body, /Open source/);
  assert.match(body, /source\.tier/);
});

test("sourced-variant text renders as a quote (curly quotes), distinguishing it from inference/counsel prose", () => {
  const body = SOURCE.slice(SOURCE.indexOf("// sourced (FACT)"));
  assert.match(body, /&ldquo;\{text\}&rdquo;/);
});

test("body text is capped at 72ch (README §0.5: 'sections of fact cards at <=72ch')", () => {
  assert.match(SOURCE, /maxWidth: "72ch"/);
});
