// jurisdiction-rollup — the invariant this file exists to pin: /map's masthead figure and /map's
// register figure are the SAME number, because they are the same function.
//
// The production defect this would have caught (click-through audit 2026-09-08): the masthead read
// "6 jurisdictions live" while the register beneath it read "8 jurisdictions", and the masthead's
// "4 jurisdictions with immediate items" sat beside a rail card headed "IMMEDIATE · 3
// JURISDICTIONS". The two surfaces keyed the same rows two different ways. Case 3 below is that
// exact shape: an item whose `jurisdiction` column is blank but whose text names one. Under the old
// masthead key it collapsed to "global"; under the register's key it resolved. Any future surface
// that reintroduces a second key derivation fails this file.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// jiti resolves the module under test's own tsconfig path aliases (`@/lib/...`), which
// `node --test` cannot follow on its own. Same pattern every other src/**/*.npmtest.mjs uses.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { jurisdictionKeyOf, jurisdictionKeys, jurisdictionCount, jurisdictionCountInBand } =
  jiti("./jurisdiction-rollup.ts");

const item = (over = {}) => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  title: "",
  note: "",
  tags: [],
  sub: "",
  jurisdiction: "",
  priority: "LOW",
  ...over,
});

test("the stored jurisdiction column wins when the corpus has one", () => {
  assert.equal(jurisdictionKeyOf(item({ jurisdiction: "EU" })), "eu");
});

test("a blank jurisdiction column resolves from the item's own text, never to global", () => {
  // This is the row class that produced the 6-vs-8 split in production.
  assert.equal(jurisdictionKeyOf(item({ title: "CBAM transitional reporting" })), "eu");
  assert.equal(jurisdictionKeyOf(item({ title: "EPA heavy-duty NOx rule" })), "us");
});

test("an item naming no jurisdiction anywhere is global", () => {
  assert.equal(jurisdictionKeyOf(item({ title: "Quarterly fuel note" })), "global");
});

test("masthead and register cannot disagree: one rollup over one row set", () => {
  const rows = [
    item({ jurisdiction: "eu", priority: "CRITICAL" }),
    // Blank column, text names the jurisdiction — the divergent class. `us` is reachable ONLY
    // through this row, so the old masthead key loses the whole jurisdiction, not just one row.
    item({ title: "CBAM definitive regime", priority: "CRITICAL" }),
    item({ title: "CARB Advanced Clean Fleets", priority: "LOW" }),
    item({ title: "Quarterly fuel note", priority: "LOW" }),
  ];

  // The register groups by key and counts its groups; the masthead counts distinct keys. Same set.
  const registerGroups = new Set(rows.map(jurisdictionKeyOf));
  assert.equal(jurisdictionCount(rows), registerGroups.size);
  assert.deepEqual(jurisdictionKeys(rows).sort(), ["eu", "global", "us"]);

  // The pre-fix masthead key. Kept here as the counter-example so the regression is legible: it
  // under-counts, which is precisely the "6 live" beneath a register of "8".
  const oldMastheadKeys = new Set(rows.map((r) => (r.jurisdiction || "global").toLowerCase()));
  assert.ok(oldMastheadKeys.size < registerGroups.size, "the old key under-counts; that was the bug");
});

test("immediate-jurisdiction count is one derivation for both the masthead line and the rail card", () => {
  const rows = [
    item({ jurisdiction: "eu", priority: "CRITICAL" }),
    item({ jurisdiction: "eu", priority: "LOW" }),
    item({ title: "CARB Advanced Clean Fleets", priority: "CRITICAL" }),
    item({ jurisdiction: "uk", priority: "MODERATE" }),
  ];
  // The rail card's own rule is "jurisdictions whose HIGHEST band is immediate", which is the same
  // set as "jurisdictions holding at least one immediate item" (immediate is first in BAND_ORDER).
  assert.equal(jurisdictionCountInBand(rows, "immediate"), 2);
  const railSet = new Set(
    jurisdictionKeys(rows).filter((k) =>
      rows.some((r) => jurisdictionKeyOf(r) === k && r.priority === "CRITICAL")
    )
  );
  assert.equal(jurisdictionCountInBand(rows, "immediate"), railSet.size);
});
