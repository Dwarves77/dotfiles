// GOLDEN CONTRACT (RD-14) for the canonical institution identity — hostInstitution (the eTLD+1 grouping the
// tier resolver keys on). C4 (2026-07-12): the DIVERGENT SLD backfill mis-merged 17 europa.eu institutions
// (incl. eur-lex T1) + canada.ca into single groupings; the canonical TWO_LEVEL set keeps them DISTINCT. This
// table pins the discrimination so the naive `slice(-2)` mis-grouping cannot return. (institution.selftest.mjs
// existed but was NOT in the suite glob; this .test.mjs runs in pre-push + CI.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { hostInstitution, hostOf } from "./institution.ts";

// The naive eTLD+1 (what the SLD backfill effectively did for these) — for CONTRAST only.
const naive = (h) => { const p = h.replace(/^www\./, "").toLowerCase().split("."); return p.length <= 2 ? p.join(".") : p.slice(-2).join("."); };

test("SUPER-DOMAIN: europa.eu subdomains are DISTINCT institutions (eur-lex T1 ≠ ec T2 ≠ eea T3)", () => {
  assert.equal(hostInstitution("eur-lex.europa.eu"), "eur-lex.europa.eu");
  assert.equal(hostInstitution("ec.europa.eu"), "ec.europa.eu");
  assert.equal(hostInstitution("eea.europa.eu"), "eea.europa.eu");
  assert.equal(hostInstitution("esma.europa.eu"), "esma.europa.eu");
  // the deep ec.europa.eu sub-paths still group to their eTLD+1 super-domain member
  assert.equal(hostInstitution("climate.ec.europa.eu"), "ec.europa.eu");
  // they MUST NOT collapse to one institution
  const distinct = new Set(["eur-lex.europa.eu", "ec.europa.eu", "eea.europa.eu"].map(hostInstitution));
  assert.equal(distinct.size, 3, "three distinct europa.eu institutions, never one");
  // CONTRAST: the naive slice(-2) is exactly the bug — it merges them to 'europa.eu'
  assert.equal(naive("eur-lex.europa.eu"), "europa.eu");
  assert.equal(naive("ec.europa.eu"), "europa.eu");
});

test("SUPER-DOMAIN: canada.ca / gov.uk / *.gov keep the institution subdomain", () => {
  assert.equal(hostInstitution("tc.canada.ca"), "tc.canada.ca");   // Transport Canada ≠ canada.ca
  assert.equal(hostInstitution("canada.ca"), "canada.ca");
  assert.equal(hostInstitution("legislation.gov.uk"), "legislation.gov.uk"); // T1 legal text
  assert.equal(hostInstitution("cabinet-office.gov.uk"), "cabinet-office.gov.uk");
  assert.notEqual(hostInstitution("legislation.gov.uk"), hostInstitution("cabinet-office.gov.uk"));
  assert.equal(hostInstitution("arb.ca.gov"), "arb.ca.gov"); // CARB ≠ ca.gov
});

test("ccTLD second-level (co.uk / com.au / co.jp) groups the org, not the SLD", () => {
  assert.equal(hostInstitution("acme.co.uk"), "acme.co.uk");
  assert.equal(hostInstitution("sub.acme.co.uk"), "acme.co.uk");   // subdomains group to the org
  assert.equal(hostInstitution("dept.example.com.au"), "example.com.au");
  assert.equal(hostInstitution("x.foo.co.jp"), "foo.co.jp");
});

test("plain gTLD (2 labels) is its own institution", () => {
  assert.equal(hostInstitution("iea.org"), "iea.org");
  assert.equal(hostInstitution("reuters.com"), "reuters.com");
  assert.equal(hostInstitution("sub.reuters.com"), "reuters.com");
});

test("hostOf extracts the www-stripped lowercased host from a URL", () => {
  assert.equal(hostOf("https://WWW.Eur-Lex.Europa.EU/legal-content/EN/TXT?uri=CELEX:32020R1056"), "eur-lex.europa.eu");
  assert.equal(hostOf("not a url"), "");
});
