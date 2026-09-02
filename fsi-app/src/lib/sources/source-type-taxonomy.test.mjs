// source-type-taxonomy.test.mjs — proves the vocabulary matches migration 288's CHECK constraint
// byte-for-byte (drift guard), and that classifySourceType() reproduces the STOPGAP's own verdicts on
// real registry examples the STOPGAP was built against (docs/plans/SOURCE-TYPE-TAXONOMY-PROPOSAL.md §1's
// false-flag table + §3's example sources) — the port-verbatim claim in this module's header, checked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SOURCE_TYPES,
  SOURCE_TYPE_VALUES,
  CLASSIFIABLE_SOURCE_TYPE_VALUES,
  sourceTypeLabel,
  isValidSourceTypeArray,
  classifySourceType,
} from "./source-type-taxonomy.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = resolve(HERE, "../../../supabase/migrations/288_source_type_taxonomy.sql");

test("SOURCE_TYPES: exactly 11 values, each with a value/label/definition/classifiable shape", () => {
  assert.equal(SOURCE_TYPES.length, 11);
  for (const t of SOURCE_TYPES) {
    assert.equal(typeof t.value, "string");
    assert.equal(typeof t.label, "string");
    assert.equal(typeof t.definition, "string");
    assert.equal(typeof t.classifiable, "boolean");
  }
  // No duplicate values.
  assert.equal(new Set(SOURCE_TYPE_VALUES).size, SOURCE_TYPE_VALUES.length);
});

test("SOURCE_TYPE_VALUES matches migration 288's CHECK constraint array byte-for-byte (drift guard)", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8");
  const m = sql.match(/source_type\s*<@\s*ARRAY\[([\s\S]*?)\]::TEXT\[\]/);
  assert.ok(m, "migration 288 must contain a `source_type <@ ARRAY[...]::TEXT[]` CHECK clause");
  const migrationValues = m[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/^'/, "").replace(/'$/, ""));
  assert.deepEqual(
    migrationValues,
    [...SOURCE_TYPE_VALUES],
    "source-type-taxonomy.mjs SOURCE_TYPE_VALUES has drifted from migration 288's CHECK constraint — " +
      "edit both together, this is the one enforced pairing.",
  );
});

test("CLASSIFIABLE_SOURCE_TYPE_VALUES is exactly {environmental_body, legislature} today (scope is explicit, not silent)", () => {
  assert.deepEqual([...CLASSIFIABLE_SOURCE_TYPE_VALUES], ["environmental_body", "legislature"]);
});

test("sourceTypeLabel: known token -> label, unknown token -> itself", () => {
  assert.equal(sourceTypeLabel("environmental_body"), "Environmental body");
  assert.equal(sourceTypeLabel("legislature"), "Legislature");
  assert.equal(sourceTypeLabel("not_a_real_type"), "not_a_real_type");
});

test("isValidSourceTypeArray: null/undefined pass (not-yet-classified); known values pass; unknown values fail", () => {
  assert.equal(isValidSourceTypeArray(null), true);
  assert.equal(isValidSourceTypeArray(undefined), true);
  assert.equal(isValidSourceTypeArray([]), true);
  assert.equal(isValidSourceTypeArray(["environmental_body"]), true);
  assert.equal(isValidSourceTypeArray(["environmental_body", "regulatory_executive"]), true);
  assert.equal(isValidSourceTypeArray(["not_a_real_type"]), false);
  assert.equal(isValidSourceTypeArray("environmental_body"), false); // not an array
});

// ── classifySourceType — real registry examples from the proposal doc ──────────────────────────────────

test("classifySourceType: US EPA -> environmental_body", () => {
  assert.deepEqual(classifySourceType({ name: "US Environmental Protection Agency", url: "https://www.epa.gov" }), ["environmental_body"]);
});

test("classifySourceType: UK Defra -> environmental_body", () => {
  assert.deepEqual(classifySourceType({ name: "Defra", url: "https://www.gov.uk/government/organisations/department-for-environment-food-rural-affairs" }), ["environmental_body"]);
});

test("classifySourceType: Umweltbundesamt (DE) -> environmental_body (the proposal's own non-Anglo false-flag example, now caught)", () => {
  assert.deepEqual(classifySourceType({ name: "Umweltbundesamt", url: "https://www.umweltbundesamt.de" }), ["environmental_body"]);
});

test("classifySourceType: US Congress -> legislature", () => {
  assert.deepEqual(classifySourceType({ name: "US Congress", url: "https://www.congress.gov" }), ["legislature"]);
});

test("classifySourceType: Assemblée Nationale (FR) -> legislature (the proposal's own FR false-flag example, now caught)", () => {
  assert.deepEqual(classifySourceType({ name: "Assemblée Nationale", url: "https://www.assemblee-nationale.fr" }), ["legislature"]);
});

test("classifySourceType: Bundestag (DE) -> legislature", () => {
  assert.deepEqual(classifySourceType({ name: "Bundestag", url: "https://www.bundestag.de" }), ["legislature"]);
});

test("classifySourceType: CARB -> [] (name/host carry neither pattern set's tokens — a known STOPGAP miss ported unchanged, not a regression introduced here; proposal §3.1 lists CARB as env_body+regulatory_executive, neither of which this classifier's ported patterns catch for this exact naming)", () => {
  const types = classifySourceType({ name: "California Air Resources Board", url: "https://ww2.arb.ca.gov" });
  assert.deepEqual(types, []);
});

test("classifySourceType: a trade-press source with no env/legislature signal -> [] (unclassifiable by the ported 2 categories, honest empty result)", () => {
  assert.deepEqual(classifySourceType({ name: "FreightWaves", url: "https://www.freightwaves.com" }), []);
});

test("classifySourceType: EUR-Lex -> [] (gazette, not yet a classifiable category)", () => {
  assert.deepEqual(classifySourceType({ name: "EUR-Lex", url: "https://eur-lex.europa.eu" }), []);
});

test("classifySourceType: handles missing name/url without throwing", () => {
  assert.deepEqual(classifySourceType({}), []);
  assert.deepEqual(classifySourceType({ name: null, url: null }), []);
  assert.deepEqual(classifySourceType(), []);
});

test("classifySourceType: returns [] for empty registration (not null) — always an array", () => {
  const result = classifySourceType({ name: "Nothing Matches Co", url: "https://example.com" });
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 0);
});
