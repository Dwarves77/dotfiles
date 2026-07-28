// Identity-verification module tests (B1). Deterministic: no network, no DB. Locks the identifier
// scheme classifier and URL-shape parser against the real corpus shapes (EUR-Lex CELEX,
// legislation.gov.uk UK-SI, ELI paths, feed-entry url-only rows).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInstrumentUrl, classifyIdentifier, deterministicIdentity } from "./identity.mjs";

test("parseInstrumentUrl: https instrument page", () => {
  const r = parseInstrumentUrl("https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32011L0037");
  assert.equal(r.ok, true);
  assert.equal(r.https, true);
  assert.equal(r.host, "eur-lex.europa.eu");
});
test("parseInstrumentUrl: strips www", () => {
  assert.equal(parseInstrumentUrl("https://www.legislation.gov.uk/uksi/2021/1095").host, "legislation.gov.uk");
});
test("parseInstrumentUrl: http is ok but not https", () => {
  const r = parseInstrumentUrl("http://example.gov/doc");
  assert.equal(r.ok, true);
  assert.equal(r.https, false);
});
test("parseInstrumentUrl: rejects empty and malformed", () => {
  assert.equal(parseInstrumentUrl("").ok, false);
  assert.equal(parseInstrumentUrl("not a url").ok, false);
  assert.equal(parseInstrumentUrl("ftp://host/x").ok, false); // non-http scheme
});

test("classifyIdentifier: CELEX shapes", () => {
  assert.deepEqual(classifyIdentifier("32011L0037"), { scheme: "celex", shapeValid: true, normalized: "32011L0037" });
  assert.equal(classifyIdentifier("32019R1242").scheme, "celex");
  assert.equal(classifyIdentifier("32007D0431").scheme, "celex");
  assert.equal(classifyIdentifier("32023R1115").shapeValid, true);
  assert.equal(classifyIdentifier("C2020/123").scheme !== "celex", true); // slash → not compact CELEX
});
test("classifyIdentifier: ELI path", () => {
  const r = classifyIdentifier("http://data.europa.eu/eli/reg/2019/1242/oj");
  assert.equal(r.scheme, "eli");
  assert.equal(r.shapeValid, true);
});
test("classifyIdentifier: UK legislation, with and without 'UK' label", () => {
  assert.deepEqual(classifyIdentifier("UK uksi 2021/1095"), { scheme: "uk-legislation", shapeValid: true, normalized: "uksi/2021/1095" });
  assert.equal(classifyIdentifier("ukpga 2008 27").scheme, "uk-legislation");
  assert.equal(classifyIdentifier("ssi 2020/34").scheme, "uk-legislation");
});
test("classifyIdentifier: unknown UK-like type is NOT promoted", () => {
  assert.equal(classifyIdentifier("zzz 2020 1").scheme, "generic"); // not a real series code
});
test("classifyIdentifier: generic non-empty id → shapeValid false (worklist, never invented-valid)", () => {
  const r = classifyIdentifier("some-portal-ref-123");
  assert.equal(r.scheme, "generic");
  assert.equal(r.shapeValid, false);
});
test("classifyIdentifier: empty → none", () => {
  assert.deepEqual(classifyIdentifier(""), { scheme: "none", shapeValid: false, normalized: "" });
  assert.deepEqual(classifyIdentifier(null), { scheme: "none", shapeValid: false, normalized: "" });
});

test("deterministicIdentity: CELEX instrument page → well-formed pointer, shape-valid id", () => {
  const r = deterministicIdentity("32011L0037", "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32011L0037");
  assert.equal(r.pointerWellFormed, true);
  assert.equal(r.identifierShapeValid, true);
  assert.equal(r.scheme, "celex");
  assert.equal(r.host, "eur-lex.europa.eu");
});
test("deterministicIdentity: url-only feed entry → well-formed pointer, no shape id", () => {
  const r = deterministicIdentity(null, "https://www.imo.org/en/some-feed-entry");
  assert.equal(r.pointerWellFormed, true);
  assert.equal(r.identifierShapeValid, false);
  assert.equal(r.scheme, "none");
});
test("deterministicIdentity: malformed URL → not well-formed even with a valid id", () => {
  const r = deterministicIdentity("32011L0037", "://broken");
  assert.equal(r.pointerWellFormed, false);
  assert.equal(r.urlOk, false);
});
