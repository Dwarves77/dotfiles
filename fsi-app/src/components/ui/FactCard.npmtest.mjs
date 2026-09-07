// Structural regression test for src/components/ui/FactCard.tsx (lane uidetails, 2026-09-06).
// No JSX render harness exists in this repo (see WatchButton.npmtest.mjs's own header) — this reads
// the component's source text to guard the three-variant contract README §0.4 binds: "told apart by
// form, not just colour" — sourced = solid ink edge + quote + link; inference = dashed border, italic,
// NO link ("not citable"); counsel = orange edge.
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

test("the inference branch uses a dashed border and italic text, and never renders a link (not citable)", () => {
  const body = bodyOf('if (variant === "inference")');
  assert.match(body, /border: "1px dashed var\(--line-1\)"/);
  assert.match(body, /fontStyle: "italic"/);
  assert.doesNotMatch(body, /<a\b/);
});

test("the counsel branch uses an orange (--action) edge", () => {
  const body = bodyOf('if (variant === "counsel")');
  assert.match(body, /var\(--action\)/);
});

test("the sourced (FACT) branch uses a solid ink border and can render a source link + tier chip", () => {
  const body = SOURCE.slice(SOURCE.indexOf("// sourced (FACT)"));
  assert.match(body, /border: "1px solid var\(--ink\)"/);
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
