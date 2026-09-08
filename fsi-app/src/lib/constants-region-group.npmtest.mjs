// constants-region-group.npmtest.mjs — proof for `regionGroupForLabel` (lane details60, 2026-09-08).
//
// Named *.npmtest.mjs, not *.test.mjs: src/lib/ matches no glob in .discipline/run-test-suite.sh
// (that list is explicit), so a *.test.mjs here would be an orphaned proof. The npmtest glob
// (`git ls-files '**/*.npmtest.mjs'`) is wired into CI, which is what makes this actually run —
// the same reasoning src/lib/research/theme-brief.npmtest.mjs states for itself.
//
// WHY IT EXISTS. Artboard 09 labels the operations profile's region chip, breadcrumb and rail card
// with a continental grouping ("Asia"). An earlier lane logged that grouping as a field this build
// has no data for; it does, on the JURISDICTIONS table, and this is the lookup that reads it. The
// two cases that matter are the resolved one and the UNKNOWN one: an unknown label must yield ""
// so the caller falls back to the country label, never to a guessed region.

import { test } from "node:test";
import assert from "node:assert/strict";
import { regionGroupForLabel, JURISDICTIONS } from "./constants.ts";

test("a known jurisdiction label resolves to its region group", () => {
  assert.equal(regionGroupForLabel("Singapore"), "Asia-Pacific");
  assert.equal(regionGroupForLabel("Germany"), "Europe");
  assert.equal(regionGroupForLabel("United States"), "Americas");
});

test("an unknown or empty label yields the empty string, never a guessed region", () => {
  assert.equal(regionGroupForLabel("Atlantis"), "");
  assert.equal(regionGroupForLabel(""), "");
  assert.equal(regionGroupForLabel(undefined), "");
  assert.equal(regionGroupForLabel(null), "");
});

test("every jurisdiction in the table resolves to a non-empty region", () => {
  for (const j of JURISDICTIONS) {
    assert.notEqual(regionGroupForLabel(j.label), "", `no region for ${j.label}`);
  }
});
