// Structural regression test for ObligationRegisterFilterBar.tsx's per-row Binding/Jurisdiction/Mode
// cells, absence rule (2026-09-25 close): "a value that exists is shown; one that cannot exist yet
// names the data it needs". This lane (W2-C, 2026-09-29) replaced the generic "Not classified" label
// and the two bare, unexplained em-dash cells with a specific needs-phrase (Binding) or the narrow-cell
// dash convention carrying the needs-phrase on aria-label/title (Jurisdiction, Mode), matching
// Absence.tsx's own convention. Source-text regression, same convention as StateNote.npmtest.mjs's
// own header (no JSX render harness in this repo).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "ObligationRegisterFilterBar.tsx"),
  "utf8"
);

test("the Binding cell no longer renders the generic 'Not classified' label", () => {
  assert.doesNotMatch(SOURCE, />Not classified</);
  assert.match(SOURCE, />needs binding classification</);
});

test("the Jurisdiction and Mode cells no longer render a bare, unexplained em dash", () => {
  assert.doesNotMatch(SOURCE, /\.join\(", "\) \|\| "\u2014"/); // glyph:verbatim (checking the old literal is gone)
});

test("the Jurisdiction and Mode empty cells carry the narrow-cell dash convention: data-absence, aria-label/title naming the specific need, glyph via JS escape", () => {
  assert.match(SOURCE, /aria-label="needs jurisdiction" title="needs jurisdiction"/);
  assert.match(SOURCE, /aria-label="needs transport mode" title="needs transport mode"/);
  const dashSpans = SOURCE.match(/data-absence="dash"[^>]*>\{"\\u2014"\}/g) ?? [];
  assert.equal(dashSpans.length, 2, "expected one declared dash span each for Jurisdiction and Mode");
});
