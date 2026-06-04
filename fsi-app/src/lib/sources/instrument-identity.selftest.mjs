// instrument-identity.selftest.mjs — node --test. Proves the parser resolves the EU flagships
// from their canonical eur-lex URLs and that item_type branching is correct.
// Run: node --test src/lib/sources/instrument-identity.selftest.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInstrumentIdentity, classifyIdentity } from "./instrument-identity.ts";

test("ELI flagships resolve", () => {
  const cases = [
    ["https://eur-lex.europa.eu/eli/reg/2023/1804/oj/eng", "eu_regulation", "2023/1804"], // AFIR
    ["https://eur-lex.europa.eu/eli/reg/2023/1805/oj", "eu_regulation", "2023/1805"],      // FuelEU Maritime
    ["https://eur-lex.europa.eu/eli/reg/2023/2405/oj/eng", "eu_regulation", "2023/2405"],  // ReFuelEU Aviation
    ["https://eur-lex.europa.eu/eli/reg/2023/956/oj", "eu_regulation", "2023/956"],        // CBAM
    ["https://eur-lex.europa.eu/eli/dir/2023/959/oj/eng", "eu_directive", "2023/959"],     // ETS amend dir
  ];
  for (const [url, type, id] of cases) {
    const r = parseInstrumentIdentity(url);
    assert.equal(r?.instrumentType, type, url);
    assert.equal(r?.instrumentIdentifier, id, url);
  }
});

test("CELEX resolves (incl. directives), leading zeros normalized", () => {
  assert.deepEqual(parseInstrumentIdentity("https://eur-lex.europa.eu/legal-content/EN/TXT?uri=CELEX:32022L2464"),
    { instrumentType: "eu_directive", instrumentIdentifier: "2022/2464", scheme: "CELEX" }); // CSRD
  assert.equal(parseInstrumentIdentity("uri=CELEX:32023R0956")?.instrumentIdentifier, "2023/956"); // CBAM via CELEX
});

test("non-instrument schemes return null (no wrong id)", () => {
  assert.equal(parseInstrumentIdentity("https://eur-lex.europa.eu/legal-content/EN/TXT?uri=comnat:COM_2023_0441_FIN"), null); // proposal
  assert.equal(parseInstrumentIdentity("https://eur-lex.europa.eu/legal-content/EN/TXT?uri=CELEX:32023D0001"), null);          // decision (no enum slot)
  assert.equal(parseInstrumentIdentity("https://taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism_en"), null);  // bare portal
  assert.equal(parseInstrumentIdentity(null), null);
});

test("classifyIdentity branches on item_type", () => {
  assert.equal(classifyIdentity("regulation", "https://eur-lex.europa.eu/eli/reg/2023/1804/oj").status, "resolved");
  assert.equal(classifyIdentity("regulation", "https://taxation-customs.ec.europa.eu/cbam_en").status, "pending_parse"); // instrument, no citation
  assert.equal(classifyIdentity("guidance", "https://imo.org/whatever").status, "pending_parse");
  assert.equal(classifyIdentity("market_signal", "https://example.com").status, "not_applicable"); // never an instrument
  assert.equal(classifyIdentity("regional_data", "https://example.com").status, "not_applicable");
  assert.equal(classifyIdentity("technology", "https://example.com").status, "not_applicable");
  assert.equal(classifyIdentity("research_finding", "https://example.com").status, "not_applicable");
});
