// Structural regression test for AuxiliaryEnergyPanelView.tsx, absence rule (2026-09-25 close): "a
// value that exists is shown; one that cannot exist yet names the data it needs". The per-row "M
// (missing)" literal discarded label.mjs's own `missing(reason)` string; this lane (W2-C, 2026-09-29)
// surfaces that reason instead, and replaces the "pending (...)" / "M, no grid intensity source
// named" gCO2e branch (which also used the banned word "pending") with a specific needs-phrase.
// Source-text regression, same convention as StateNote.npmtest.mjs's own header.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "AuxiliaryEnergyPanelView.tsx"),
  "utf8"
);

test("the per-row energy figure surfaces label.mjs's own missing-reason instead of the bare 'M (missing)' literal", () => {
  assert.doesNotMatch(SOURCE, /"M \(missing\)"/);
  assert.match(SOURCE, /`needs \$\{energy\.reason\}`/);
});

test("the gCO2e line never renders the banned word 'pending' and names the specific missing input", () => {
  assert.doesNotMatch(SOURCE, /`pending \(/);
  assert.doesNotMatch(SOURCE, /"M \u2014 no grid intensity source named"/); // glyph:verbatim (old literal, must not reappear)
  assert.match(SOURCE, /needs grid-intensity conversion/);
  assert.match(SOURCE, /"needs a grid-intensity source"/);
});

test("the whole-panel empty state still names the specific asset-specific data requirement (unchanged)", () => {
  assert.match(SOURCE, /AUXILIARY_ENERGY_GAP_LINE =\s*\n?\s*"No rows yet \u2014 source: none, auxiliary-load facts are asset-specific/); // glyph:verbatim (pre-existing constant text)
});
