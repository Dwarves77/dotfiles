// Structural regression test for Spec09CsvUpload.tsx's UPLOAD_TABLES display labels, R12 (Market
// Intel nav label): the coordinator ruled (2026-09-29, write-set extension for lane W2-C) that these
// two `label` fields are user-visible (rendered into a <select> option and a confirmation sentence,
// per this file's own `.label` usages at the <option> and the "You are about to import into
// <strong>{activeTable.label}</strong>" line), never CSV column keys (those are `key` and
// `requiredHeaders`, untouched). Source-text regression, same convention as StateNote.npmtest.mjs's
// own header (no JSX render harness in this repo).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "Spec09CsvUpload.tsx"),
  "utf8"
);

test("the two Market-tagged UPLOAD_TABLES labels say 'Market Intel', not the unapproved 'Market' short form", () => {
  assert.match(SOURCE, /label: "Surcharge audits \(Market Intel\)"/);
  assert.match(SOURCE, /label: "Indexation clauses \(Market Intel\)"/);
  assert.doesNotMatch(SOURCE, /label: "Surcharge audits \(Market\)"/);
  assert.doesNotMatch(SOURCE, /label: "Indexation clauses \(Market\)"/);
});

test("the table `key` and `requiredHeaders` (real CSV column names) are untouched, only the display label changed", () => {
  assert.match(SOURCE, /key: "surcharge_audits", label: "Surcharge audits \(Market Intel\)", requiredHeaders: "corridor_id, carrier_id, invoice_line, billed_eur, statutory_eur, statutory_basis"/);
  assert.match(SOURCE, /key: "indexation_clauses", label: "Indexation clauses \(Market Intel\)", requiredHeaders: "index_id, base_value, base_date, passthrough_pct, review_cadence, rounding_rule"/);
});
