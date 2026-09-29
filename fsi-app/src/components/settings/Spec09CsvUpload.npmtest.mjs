// Structural regression test for Spec09CsvUpload.tsx's UPLOAD_TABLES display labels, R12 (Market
// Intel nav label): the coordinator ruled (2026-09-29, write-set extension for lane W2-C) that these
// two `label` fields are user-visible (rendered into a <select> option and a confirmation sentence,
// per this file's own `.label` usages at the <option> and the "You are about to import into
// <strong>{activeTable.label}</strong>" line), never CSV column keys (those are `key` and
// `requiredHeaders`, untouched). A second coordinator ruling the same session extended the write set
// to this component's server-side twin, `src/lib/spec09/csv-upload-contract.mjs`'s
// `TABLE_CONTRACTS.<key>.label` (the file this component's own header comment says it mirrors as
// plain display data, per that header's own words: "Mirrors ... UPLOAD_TABLES/TABLE_CONTRACTS keys
// and labels"), and asked for a cross-check assertion so client and server label text cannot drift
// apart again. Source-text regression, same convention as StateNote.npmtest.mjs's own header (no JSX
// render harness in this repo).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(resolve(DIR, "Spec09CsvUpload.tsx"), "utf8");
const CONTRACT_SOURCE = readFileSync(
  resolve(DIR, "../../lib/spec09/csv-upload-contract.mjs"),
  "utf8"
);

/** Pull the `label` string that follows `key: "<tableKey>"` in the client's UPLOAD_TABLES array. */
function clientLabelFor(tableKey) {
  const m = SOURCE.match(new RegExp(`key: "${tableKey}", label: "([^"]+)"`));
  return m ? m[1] : null;
}

/** Pull the `label` string inside the server's `<tableKey>: { label: "..." }` contract block. */
function serverLabelFor(tableKey) {
  const m = CONTRACT_SOURCE.match(new RegExp(`${tableKey}: \\{\\s*\\n\\s*label: "([^"]+)"`));
  return m ? m[1] : null;
}

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

// Coordinator ruling (2026-09-29): "Add the assertion that client and server label text match to
// your new npmtest so they cannot drift again." Checked across all six UPLOAD_TABLES/TABLE_CONTRACTS
// keys, not only the two Market Intel ones, since the header comment's mirror claim covers all six.
const ALL_TABLE_KEYS = [
  "surcharge_audits",
  "tce_data_quality",
  "auxiliary_energy_profiles",
  "eudr_plot_claims",
  "custody_chains",
  "indexation_clauses",
];

test("client (Spec09CsvUpload.tsx) and server (csv-upload-contract.mjs) label text match, for every table key", () => {
  for (const key of ALL_TABLE_KEYS) {
    const clientLabel = clientLabelFor(key);
    const serverLabel = serverLabelFor(key);
    assert.ok(clientLabel, `client label not found for "${key}"`);
    assert.ok(serverLabel, `server label not found for "${key}"`);
    assert.equal(clientLabel, serverLabel, `label text drifted for "${key}": client "${clientLabel}" vs server "${serverLabel}"`);
  }
});

test("both Market Intel labels are identical, byte for byte, between client and server", () => {
  assert.equal(clientLabelFor("surcharge_audits"), "Surcharge audits (Market Intel)");
  assert.equal(serverLabelFor("surcharge_audits"), "Surcharge audits (Market Intel)");
  assert.equal(clientLabelFor("indexation_clauses"), "Indexation clauses (Market Intel)");
  assert.equal(serverLabelFor("indexation_clauses"), "Indexation clauses (Market Intel)");
});
