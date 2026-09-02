// Tests for institution-key.mjs (Lane HELD, 2026-09-02). node:test + node:assert/strict, no I/O.
// Run: node --test scripts/lib/institution-key.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { hostOf, institutionKey, sameInstitution, SHARED_PORTAL_KEYDEPTH } from "./institution-key.mjs";

test("hostOf: lowercases, strips leading www., empty string for an unparseable URL", () => {
  assert.equal(hostOf("https://WWW.Sdir.No/x"), "sdir.no");
  assert.equal(hostOf("https://eur-lex.europa.eu/legal-content"), "eur-lex.europa.eu");
  assert.equal(hostOf("not a url"), "");
  assert.equal(hostOf(null), "");
  assert.equal(hostOf(undefined), "");
});

test("institutionKey: bare host for a non-portal host, host+path-prefix for a SHARED_PORTAL_KEYDEPTH host", () => {
  assert.equal(institutionKey("https://sdir.no/some/deep/path.pdf"), "sdir.no");
  assert.equal(institutionKey("https://climate.ec.europa.eu/document/download/x"), "climate.ec.europa.eu");
  assert.equal(institutionKey("https://gob.mx/semarnat/algo"), "gob.mx/semarnat");
  assert.equal(institutionKey("https://gob.mx/economia/algo"), "gob.mx/economia");
  assert.equal(institutionKey("https://gob.mx/"), "gob.mx"); // no path segment to key on
  assert.equal(institutionKey("https://gov.si/drzavni-organi/ministrstva/ministrstvo-za-okolje/x"), "gov.si/drzavni-organi/ministrstva/ministrstvo-za-okolje");
});

test("institutionKey: unparseable URL returns empty string", () => {
  assert.equal(institutionKey("not a url"), "");
  assert.equal(institutionKey(null), "");
});

test("SHARED_PORTAL_KEYDEPTH: every listed host has a positive integer depth", () => {
  for (const [host, depth] of Object.entries(SHARED_PORTAL_KEYDEPTH)) {
    assert.ok(typeof host === "string" && host.length > 0);
    assert.ok(Number.isInteger(depth) && depth > 0, `${host} depth must be a positive integer`);
  }
});

// ── sameInstitution (Lane HELD's own addition) ──────────────────────────────────────────────────────────

test("sameInstitution: true when both URLs key to the same bare host", () => {
  assert.equal(sameInstitution("https://sdir.no/a/b.pdf", "https://sdir.no/"), true);
  assert.equal(sameInstitution("https://www.sdir.no/a/b.pdf", "https://sdir.no/"), true); // www. stripped both sides
});

test("sameInstitution: true for the exact evidence hosts this lane's fix was root-caused against", () => {
  const hosts = [
    "sdir.no",
    "climate.ec.europa.eu",
    "rules.cityofnewyork.us",
    "www.mlit.go.jp",
    "participate.melbourne.vic.gov.au",
    "epa.nsw.gov.au",
    "chp.ca.gov",
  ];
  for (const h of hosts) {
    assert.equal(sameInstitution(`https://${h}/some/document.pdf`, `https://${h}/`), true, h);
  }
});

test("sameInstitution: false when the hosts genuinely differ", () => {
  assert.equal(sameInstitution("https://mlit.go.jp/x", "https://transport.gov.example/"), false);
});

test("sameInstitution: false on a shared-portal host when the path prefix (institution slug) differs", () => {
  assert.equal(sameInstitution("https://gob.mx/economia/algo", "https://gob.mx/semarnat/otro"), false);
});

test("sameInstitution: true on a shared-portal host when the path prefix matches", () => {
  assert.equal(sameInstitution("https://gob.mx/semarnat/algo", "https://gob.mx/semarnat/otro"), true);
});

test("sameInstitution: false when either URL is unparseable, even though both institutionKeys would be '' (never a false match on empty string)", () => {
  assert.equal(sameInstitution("not a url", "also not a url"), false);
  assert.equal(sameInstitution("not a url", "https://sdir.no/"), false);
  assert.equal(sameInstitution("https://sdir.no/", "not a url"), false);
  assert.equal(sameInstitution(null, null), false);
});

test("sameInstitution: false when either argument is missing entirely (e.g. a null source.url)", () => {
  assert.equal(sameInstitution("https://sdir.no/x", undefined), false);
  assert.equal(sameInstitution(undefined, "https://sdir.no/x"), false);
});
