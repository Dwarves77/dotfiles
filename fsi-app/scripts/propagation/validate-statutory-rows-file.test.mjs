// validate-statutory-rows-file.test.mjs — RED-then-GREEN proof for the production-apply gate (lane
// FUELEU-ROWS, 2026-09-06). RED: the tree's own existing fixture rows-file (scripts/_worklists/
// statutory-fueleu-annex-iv-2026-09-05.json), read from disk not re-typed inline, is proven to FAIL this
// validator — it is exactly the file audit finding 3 named as "must never reach write-statutory.mjs
// --apply", so a validator that passed it would be worthless. GREEN: a row shaped like a real filing
// (real-looking citation text, a `source` block pointing at eur-lex.europa.eu) passes cleanly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateRowsFile, validateRow, validateSourceBlock } from "./validate-statutory-rows-file.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(HERE, "..", "_worklists", "statutory-fueleu-annex-iv-2026-09-05.json");

test("RED — the tree's existing FIXTURE rows-file fails this validator (it must never apply-gate clean)", () => {
  const raw = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
  const violations = validateRowsFile(raw);
  assert.ok(violations.length > 0, "the FIXTURE file must produce at least one violation");
  assert.ok(
    violations.some((v) => /_file_status carries a placeholder marker/.test(v)),
    "expected the _file_status FIXTURE marker to be caught"
  );
  assert.ok(
    violations.some((v) => /citation carries a placeholder marker/.test(v)),
    "expected at least one SYNTHETIC FIXTURE VALUE citation to be caught"
  );
  assert.ok(
    violations.some((v) => /missing a `source` block/.test(v)),
    "the fixture's StatutoryInputs carry only a citation string, no structured `source` block — expected to be caught"
  );
});

test("GREEN — a row shaped like a real filing (real citation text, source block at eur-lex.europa.eu) passes", () => {
  const goodInput = (value, unit) => ({
    value,
    unit,
    citation: `Ship XYZ's ${unit} figure as reported to the flag administration under Regulation (EU) 2015/757, verified emissions report, reporting period 2025.`,
    asOf: { eventDate: "2026-01-15" },
    derivation: "observed",
    originClass: "verified",
    lifecycle: "verified",
    admissibility: "filing_ok",
    baseConfidence: 0.95,
    source: {
      url: "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023R1805",
      article: "Article 4(2)",
      quote: "an illustrative but real-shaped quote for the test",
      verified_at: "2026-09-06",
    },
  });
  const row = {
    shipKey: "IMO9999999",
    targetYear: 2025,
    ghgIntensityActual: goodInput(95.0, "gCO2eq/MJ"),
    energyUsedMJ: goodInput(500_000_000, "MJ"),
    consecutiveDeficitYears: goodInput(1, "count"),
  };
  const violations = validateRow(row, 0);
  assert.deepEqual(violations, []);
});

test("validateSourceBlock refuses a missing source block by name", () => {
  const violations = validateSourceBlock(undefined, "row[0].ghgIntensityActual");
  assert.equal(violations.length, 1);
  assert.match(violations[0], /missing a `source` block/);
});

test("validateSourceBlock refuses a source with a missing required field, naming the exact field", () => {
  const violations = validateSourceBlock({ url: "https://eur-lex.europa.eu/x", article: "Art. 4", quote: "" }, "row[0].x");
  assert.ok(violations.some((v) => /source\.quote is required/.test(v)));
  assert.ok(violations.some((v) => /source\.verified_at is required/.test(v)));
});

test("validateSourceBlock refuses an ambiguous (non-codified) host, never guessing a tier", () => {
  const violations = validateSourceBlock(
    { url: "https://some-random-blog.example.com/fueleu", article: "n/a", quote: "n/a", verified_at: "2026-09-06" },
    "row[0].x"
  );
  assert.ok(violations.some((v) => /does not resolve to a codified class/.test(v)));
});

test("validateSourceBlock accepts eur-lex.europa.eu (T1, LEGAL_PRIMARY) and mrv.emsa.europa.eu (T2, GOV_INTERGOV)", () => {
  for (const url of ["https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023R1805", "https://mrv.emsa.europa.eu/#public/emission-report"]) {
    const violations = validateSourceBlock({ url, article: "n/a", quote: "n/a", verified_at: "2026-09-06" }, "row[0].x");
    assert.deepEqual(violations, [], `expected ${url} to pass host classification`);
  }
});

test("validateRowsFile refuses an empty rows[] array rather than treating it as trivially apply-ready", () => {
  const violations = validateRowsFile({ rows: [] });
  assert.ok(violations.some((v) => /empty/.test(v)));
});
