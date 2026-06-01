// Durable known-answer + mutation selftest for the entity gate (the portal-as-item leak fix).
// Includes the line-191 bug-class case: an unclassifiable candidate must NOT mint a confident
// document — honest-inconclusive, not defaulted to "regulation".
import { test } from "node:test";
import assert from "node:assert/strict";
import { ENTITY, urlIsRoot, entityVerdict, shouldMintItem } from "../../src/lib/sources/entity-gate.mjs";

test("urlIsRoot: real portal homepages are root", () => {
  for (const u of [
    "https://umweltbundesamt.de/", "https://legis.delaware.gov/", "https://flk.npc.gov.cn/",
    "https://nebraskalegislature.gov", "https://senat.fr/", "https://epa.ie/", "https://ndep.nv.gov/",
    "https://example.gov/en", "https://example.gov/home", "https://example.gov/index.html",
  ]) assert.equal(urlIsRoot(u), true, u);
});
test("urlIsRoot: deep document URLs are NOT root", () => {
  for (const u of [
    "https://epa.gov/regulations-emissions-vehicles-and-engines/final-rule-greenhouse-gas-emissions-standards-heavy-duty",
    "https://nyc.gov/site/buildings/codes/ll97-greenhouse-gas-emissions-reductions.page",
    "https://legislation.gov.au/Details/C2022C00255",
    "https://eur-lex.europa.eu/legal-content/EN/TXT?uri=CELEX:32023R0956",
  ]) assert.equal(urlIsRoot(u), false, u);
});

test("entityVerdict: deterministic portal (root URL) -> PORTAL, no AI needed", () => {
  assert.equal(entityVerdict({ url: "https://umweltbundesamt.de/" }), ENTITY.PORTAL);
  assert.equal(entityVerdict({ url: "https://umweltbundesamt.de/", haikuVerdict: "specific_document" }), ENTITY.PORTAL); // root wins
});
test("entityVerdict: deep URL + Haiku verdict", () => {
  const url = "https://epa.gov/.../final-rule-heavy-duty";
  assert.equal(entityVerdict({ url, haikuVerdict: "specific_document" }), ENTITY.DOCUMENT);
  assert.equal(entityVerdict({ url, haikuVerdict: "portal" }), ENTITY.PORTAL);
});
test("LINE-191 BUG-CLASS: deep URL + Haiku unsure/absent -> UNCERTAIN (honest), NOT a confident mint", () => {
  const url = "https://example.org/some/deep/ambiguous/page";
  assert.equal(entityVerdict({ url, haikuVerdict: "uncertain" }), ENTITY.UNCERTAIN);
  assert.equal(entityVerdict({ url }), ENTITY.UNCERTAIN); // Haiku absent (failed) -> uncertain, not document
});

test("shouldMintItem: ONLY a confident specific document mints; portal + uncertain do NOT", () => {
  assert.equal(shouldMintItem({ url: "https://epa.gov/x/final-rule", haikuVerdict: "specific_document" }), true);
  assert.equal(shouldMintItem({ url: "https://umweltbundesamt.de/" }), false);              // portal
  assert.equal(shouldMintItem({ url: "https://x.org/deep/page", haikuVerdict: "uncertain" }), false); // honest-inconclusive
  assert.equal(shouldMintItem({ url: "https://x.org/deep/page" }), false);                   // Haiku absent
});

// MUTATION baseline: the pre-fix behavior was "always mint" (every source -> item) with the
// item_type defaulting to "regulation" on uncertainty. Assert the gate DIFFERS from that.
test("MUTATION: pre-fix 'always mint' minted a portal + minted on uncertainty; the gate does NOT", () => {
  const alwaysMint = () => true; // pre-fix: seedStubIntelligenceItem ran unconditionally
  const portal = { url: "https://umweltbundesamt.de/" };
  const uncertain = { url: "https://x.org/deep/page", haikuVerdict: "uncertain" };
  assert.equal(alwaysMint(portal), true);
  assert.equal(shouldMintItem(portal), false);     // FIXED skips the portal
  assert.equal(alwaysMint(uncertain), true);
  assert.equal(shouldMintItem(uncertain), false);  // FIXED skips the uncertain (no default-positive)
  assert.notEqual(shouldMintItem(portal), alwaysMint(portal)); // discriminates
});
