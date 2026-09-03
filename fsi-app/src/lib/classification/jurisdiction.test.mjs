// jurisdiction.test.mjs — proves classifySourceJurisdiction: host-derived, deterministic, never guesses.
import test from "node:test";
import assert from "node:assert/strict";
import { classifySourceJurisdiction } from "./jurisdiction.mjs";
import { isValidJurisdictionValue } from "./vocab.mjs";

test("intergovernmental source_role -> GLOBAL, regardless of host", () => {
  const r = classifySourceJurisdiction({ url: "https://www.imo.org/en/about", sourceRole: "intergovernmental_body" });
  assert.equal(r.value, "GLOBAL");
  assert.equal(r.confidence, "high");
  assert.match(r.basis, /source_role=intergovernmental_body/);
});

test(".int host -> GLOBAL even without an intergovernmental source_role", () => {
  const r = classifySourceJurisdiction({ url: "https://www.imo.int/rules", sourceRole: null });
  assert.equal(r.value, "GLOBAL");
  assert.match(r.basis, /\.int treaty-organization domain/);
});

test("europa.eu host -> EU", () => {
  const r = classifySourceJurisdiction({ url: "https://finance.ec.europa.eu/publications" });
  assert.equal(r.value, "EU");
});

test("national .gov.<cc> hosts resolve to the specific country, not bare US", () => {
  assert.equal(classifySourceJurisdiction({ url: "https://www.legislation.gov.uk/ukpga" }).value, "GB");
  assert.equal(classifySourceJurisdiction({ url: "https://www.gouv.fr/actualite" }).value, "FR");
  assert.equal(classifySourceJurisdiction({ url: "https://www.bund.de/Content" }).value, "DE");
  assert.equal(classifySourceJurisdiction({ url: "https://www.gob.mx/normativa" }).value, "MX");
});

test("bare .gov -> US (checked after the more specific .gov.<cc> suffixes)", () => {
  assert.equal(classifySourceJurisdiction({ url: "https://www.epa.gov/regulations" }).value, "US");
});

test("www. prefix and mixed case are normalized before matching", () => {
  const r = classifySourceJurisdiction({ url: "https://WWW.Gouv.Fr/path" });
  assert.equal(r.value, "FR");
});

test("every table entry is a vocab-valid token (belt-and-braces assertion holds)", () => {
  const hosts = [
    "https://www.legislation.gov.uk", "https://www.gouv.fr", "https://www.bund.de",
    "https://www.bundestag.de", "https://www.gob.mx", "https://www.gob.es", "https://www.gc.ca",
    "https://www.gov.au", "https://www.govt.nz", "https://www.go.jp", "https://www.gov.sg",
    "https://www.gov.hk", "https://www.gov.in", "https://www.gov.cn", "https://www.gov.za",
    "https://www.gov.br", "https://www.gov.ie", "https://www.epa.gov",
  ];
  for (const url of hosts) {
    const r = classifySourceJurisdiction({ url });
    assert.ok(r, `expected a result for ${url}`);
    assert.ok(isValidJurisdictionValue(r.value), `${r.value} for ${url} must be vocab-valid`);
  }
});

test("no URL, unparseable URL, or an ordinary commercial/unrecognized host -> null (never guessed)", () => {
  assert.equal(classifySourceJurisdiction({}), null);
  assert.equal(classifySourceJurisdiction({ url: "not a url" }), null);
  assert.equal(classifySourceJurisdiction({ url: "https://www.freightwaves.com/news" }), null);
});

test("a commercial .de/.fr/.uk domain is NOT assigned that country's jurisdiction (only the operating institution's legal domicile counts, per the framework rule)", () => {
  assert.equal(classifySourceJurisdiction({ url: "https://www.somecompany.de/news" }), null);
  assert.equal(classifySourceJurisdiction({ url: "https://www.somecompany.co.uk/news" }), null);
});

test("REGRESSION: a bare second-level gov domain (no subdomain) matches, not just a subdomain of it — " +
  "the anchor bug this file's fix closed (a plain \\.gouv\\.fr$ required a '.' before 'gouv', which a " +
  "bare 'gouv.fr' host (post-www-strip) does not have; classify-source-role.ts documents the identical " +
  "class for gov.mb.ca)", () => {
  assert.equal(classifySourceJurisdiction({ url: "https://www.gouv.fr/actualite" }).value, "FR");
  assert.equal(classifySourceJurisdiction({ url: "https://www.bund.de/Content" }).value, "DE");
  assert.equal(classifySourceJurisdiction({ url: "https://www.gob.mx/normativa" }).value, "MX");
  assert.equal(classifySourceJurisdiction({ url: "https://www.gov.au/service" }).value, "AU");
  assert.equal(classifySourceJurisdiction({ url: "https://www.gob.es/" }).value, "ES");
  assert.equal(classifySourceJurisdiction({ url: "https://www.gc.ca/" }).value, "CA");
  assert.equal(classifySourceJurisdiction({ url: "https://www.govt.nz/" }).value, "NZ");
  assert.equal(classifySourceJurisdiction({ url: "https://www.go.jp/" }).value, "JP");
  assert.equal(classifySourceJurisdiction({ url: "https://www.bundestag.de/" }).value, "DE");
});

test("a real subdomain of a bare gov domain still matches too (the anchor is (^|.), not only ^)", () => {
  assert.equal(classifySourceJurisdiction({ url: "https://www.ecologie.gouv.fr/plan" }).value, "FR");
});
