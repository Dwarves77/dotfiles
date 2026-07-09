// F-1 forbidden-class regression: a null/placeholder-field source entry must produce NO
// renderable row (no fabricated text). RED on the pre-fix behaviour (a "Source Name" header
// row and empty-name rows rendered); GREEN once they are suppressed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isPlaceholderSourceName, renderableSourceEntries } from "./source-entry-filter.mjs";

test("null / empty / whitespace names are placeholders", () => {
  for (const n of [null, undefined, "", "   ", "\t"]) assert.equal(isPlaceholderSourceName(n), true);
});

test("table-header literals are placeholders (the PPWR 'Source Name' fabrication)", () => {
  for (const n of ["Source Name", "source name", "URL", "Tier estimate", "Title", "#", "Why this source matters", "Issuing Body", "Date"]) {
    assert.equal(isPlaceholderSourceName(n), true, `${n} should be a placeholder`);
  }
});

test("no-data / separator tokens are placeholders", () => {
  for (const n of ["—", "-", "N/A", "TBD", "...", "| : - |", "null", "none"]) {
    assert.equal(isPlaceholderSourceName(n), true, `${n} should be a placeholder`);
  }
});

test("real source names are NOT placeholders (incl. a real name with no URL)", () => {
  for (const n of ["European Commission DG ENV — PPWR Presentation", "Latham & Watkins", "EUR-Lex", "IMO MEPC 80 Report"]) {
    assert.equal(isPlaceholderSourceName(n), false, `${n} should render`);
  }
});

test("renderableSourceEntries drops placeholder rows, keeps real ones", () => {
  const entries = [
    { tier: 2, name: "European Commission DG ENV", url: "https://environment.ec.europa.eu", meta: "" },
    { tier: null, name: "Source Name", url: "https://x", meta: "URL · Tier estimate" }, // 2nd-table header artifact
    { tier: 7, name: "", url: null, meta: "" },                                          // empty-name + tier badge junk row
    { tier: 4, name: "Latham & Watkins", url: null, meta: "Law firm analysis" },         // real, no URL → keep
  ];
  const out = renderableSourceEntries(entries);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((e) => e.name), ["European Commission DG ENV", "Latham & Watkins"]);
});

test("non-array input never throws", () => {
  assert.deepEqual(renderableSourceEntries(null), []);
  assert.deepEqual(renderableSourceEntries(undefined), []);
});
