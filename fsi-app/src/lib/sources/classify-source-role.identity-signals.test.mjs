// Fire-tests for the 2026-08-11 classifier identity-signal fixes.
// Run: node --test fsi-app/src/lib/sources/classify-source-role.identity-signals.test.mjs
//
// ORIGIN. A 2026-08-10 triage demoted 869 sources partly for having "no role". Auditing that
// cohort showed the rows were not undeterminable — 1,719 of 2,549 registry rows simply had
// source_role IS NULL because nothing ever ran the classifier on them (registerSource never called
// it; fixed separately). But re-running the classifier over the residue exposed real blind spots,
// each of which is a CLASS of source, not a one-off:
//
//   1. Government hosts with no gov marker in the TLD, or with "gov" as the FIRST label
//      (gov.mb.ca), which the old anchored /\.gov\.[a-z]{2}$/ could never match.
//   2. Bodies that identify themselves as "Government of X" in the NAME while publishing on a
//      neutral host (climatechange.novascotia.ca).
//   3. Australia's .asn.au association domain — a host-level signal as strong as .edu.
//   4. Commercial hosts under a country code (sevenresiduos.com.br, example.co.uk): `tld` is the
//      LAST label, so these yielded "br"/"uk" and fell through the .com fallback to null. Every
//      non-US commercial source in the registry was unclassifiable.
//   5. WEAK NAME KEYWORDS OVERRIDING STRONG HOST IDENTITY — the worst class, because it produced
//      confidently WRONG answers rather than null: `name` often carries a document title, so
//      "Media Centre" made mpa.gov.sg academic_research, an article headline containing "MIT" made
//      musicweek.com academic_research, and "Council of the EU" made consilium.europa.eu an
//      industry_association. Bare \bmit\b was especially bad — it is also the German word "with".
//
// RED-TEST PROOF (rule 15): revert any one guard in classify-source-role.ts and the matching case
// below fails. The final test pins the "flag, never guess" property so these fixes cannot erode it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { classifySourceRole } from "./classify-source-role.ts";

const role = (name, host) => classifySourceRole(name, `https://${host}/x`);

test("government hosts without a .gov TLD, and gov as first label", () => {
  assert.equal(role("Government of Manitoba — Manitoba Energy Plan", "www.gov.mb.ca"), "primary_legal_authority");
  assert.equal(role("Government of Nova Scotia – Climate Change", "climatechange.novascotia.ca"), "primary_legal_authority");
  assert.equal(role("UK House of Commons Library / Research Briefing", "commonslibrary.parliament.uk"), "primary_legal_authority");
});

test("EU institutions on europa.eu", () => {
  assert.equal(role("Council of the EU - Fit for 55 Policy Overview", "www.consilium.europa.eu"), "primary_legal_authority");
  assert.equal(role("European Economic and Social Committee (EESC)", "www.eesc.europa.eu"), "primary_legal_authority");
});

test(".asn.au is an association domain", () => {
  assert.equal(role("ASBEC — Submission on Melbourne Planning Scheme", "www.asbec.asn.au"), "industry_association");
});

test("commercial hosts under a country code are not null", () => {
  assert.equal(role("Seven Resíduos — Brazil Decree 10936 Analysis", "sevenresiduos.com.br"), "vendor_corporate");
  assert.equal(role("Beaumont Capital Markets - Ship Finance Review", "beaumont-capitalmarkets.co.uk"), "vendor_corporate");
});

test("strong host identity outranks weak name keywords (no confidently-wrong answers)", () => {
  // "Media Centre" must not make a government maritime regulator an academic institute.
  assert.equal(role("MPA Singapore / Media Centre - Green Ship Programme", "www.mpa.gov.sg"), "primary_legal_authority");
  // "Council" in a document title must not make an EU institution a trade body.
  assert.equal(role("Council of the EU - Fit for 55", "www.consilium.europa.eu"), "primary_legal_authority");
  // A headline mentioning MIT must not make a music trade magazine an academic institute.
  assert.notEqual(role("Music Week - MIT Climate Machine Emissions Reporting", "www.musicweek.com"), "academic_research");
  // The guard must NOT suppress genuine academic hosts.
  assert.equal(role("Tyndall Centre for Climate Change Research", "www.tyndall.ac.uk"), "academic_research");
});

test("still flags rather than guesses when the entity is genuinely undeterminable", () => {
  assert.equal(classifySourceRole("", ""), null);
  // Content-probed 2026-08-11 and confirmed undeterminable from name+URL alone: csis.org resolves
  // only by fetching the page (a think tank). The classifier must stay honest and return null
  // rather than acquire a hardcoded domain list.
  assert.equal(role("CSIS / 48th ASEAN Summit Outcomes", "www.csis.org"), null);
});

// ── Origin outranks article titles (operator correction, 2026-08-11) ────────────────────────────
// "Titles of articles often have nothing to do with source tiers. That comes from where the source
// originates." The `name` column stores whatever a fetch captured — usually a DOCUMENT title. Words
// like "News", "Press Release", "Centre" belong to the item, not the publisher, and must never
// outrank the origin host. .eu is an EU-established-entity domain, institutional in this corpus.

test("article-title words never outrank an institutional origin", () => {
  // "News Item" / "Press Briefing" are the document's title; the publisher is an IGO.
  assert.equal(role("UNESCO World Heritage Centre — News Item 1824", "whc.unesco.org"), "intergovernmental_body");
  assert.equal(role("IMO — Revised GHG Strategy Adopted (Press Briefing)", "www.imo.org"), "intergovernmental_body");
  assert.equal(role("UNDP — Biodiversity Finance Work Area", "www.undp.org"), "intergovernmental_body");
  assert.equal(role("UNEP / Active Mobility Colombia", "www.unep.org"), "intergovernmental_body");
  // A national government publishing a press release is still the government.
  assert.equal(role("Norwegian Government – Press Release on Fjords", "www.regjeringen.no"), "primary_legal_authority");
  // ...but the same word on a commercial origin is a vendor's government-affairs page.
  assert.equal(role("Acme Consulting — Government Affairs Update", "acme.com"), "vendor_corporate");
  // Genuine trade press is unaffected.
  assert.equal(role("FreightWaves - Daily Market Update", "www.freightwaves.com"), "trade_press");
});

test(".eu is an institutional origin, never commercial and never null", () => {
  assert.equal(role("Platform for Electromobility / Weights & Dimensions", "www.platformelectromobility.eu"), "industry_association");
  // A self-describing name still wins over the .eu fallback.
  assert.equal(role("eFuel Alliance — Political Demands: Aviation", "www.efuel-alliance.eu"), "industry_association");
  // europa.eu remains an EU institution, not merely an association.
  assert.equal(role("Clean Hydrogen Partnership – H2Accelerate TRUCKS", "www.clean-hydrogen.europa.eu"), "primary_legal_authority");
});
