// GOLDEN — register-at-grounding is DETERMINISTIC-ONLY (SC-13, operator ruling 2026-07-13, register-step-gap
// unit). Proves the PURE decision red-then-green: a codified host-class rule registers at its deterministic
// tier; an AMBIGUOUS host is worklisted (never minted a guessed tier — the fake-cert the old sub-floor default
// produced, which could hollow-pass the technology floor=5); an already-resolving institution is inherited.
// Runs in the no-npm discipline node --test glob (relative .ts import, Node 24 type-stripping — no jiti).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  codifiedTierForHost,
  defaultTierForHost,
  decidePoolHostRegistration,
  PROVISIONAL_DEFAULT_TIER,
} from "./host-authority.ts";

const LEGAL = ["eur-lex.europa.eu", "www.federalregister.gov", "ecfr.gov", "govinfo.gov", "legislation.gov.uk"];
const GOV = ["irs.gov", "epa.gov", "assets.publishing.service.gov.uk", "economia.gob.mx",
  "legifrance.gouv.fr", "mfe.govt.nz", "canada.gc.ca", "europa.eu", "un.org", "oecd.org", "imo.org", "icao.int"];
// The AMBIGUOUS class — commercial / analysis / law-firm / advocacy hosts the old path minted at a guessed 5.
const AMBIGUOUS = ["searoutes.com", "truckinginfo.com", "globalpetrolprices.com", "dieselnet.com",
  "aoshearman.com", "mayerbrown.com", "cms-lawnow.com", "climatecatalyst.org", "mainelegislature.org"];

test("codifiedTierForHost: legal-primary -> 1", () => {
  for (const h of LEGAL) assert.equal(codifiedTierForHost(h), 1, h);
});

test("codifiedTierForHost: gov / regulator / intergov -> 2", () => {
  for (const h of GOV) assert.equal(codifiedTierForHost(h), 2, h);
});

test("codifiedTierForHost: AMBIGUOUS -> null (NOT a guessed default) — the SC-13 core", () => {
  // This is the register-step-gap fix: an unclassifiable host returns null, never PROVISIONAL_DEFAULT_TIER.
  for (const h of AMBIGUOUS) assert.equal(codifiedTierForHost(h), null, h);
  for (const h of ["", null, undefined]) assert.equal(codifiedTierForHost(h), null);
});

test("legislation.gov.uk (T1) beats the .gov.uk gov rule (T2) — order preserved", () => {
  assert.equal(codifiedTierForHost("legislation.gov.uk"), 1);
  assert.equal(codifiedTierForHost("gov.uk"), 2);
});

test("defaultTierForHost is the NON-grounding compat wrapper (codified ?? sub-floor) — unchanged behaviour", () => {
  assert.equal(defaultTierForHost("eur-lex.europa.eu"), 1);
  assert.equal(defaultTierForHost("epa.gov"), 2);
  for (const h of AMBIGUOUS) assert.equal(defaultTierForHost(h), PROVISIONAL_DEFAULT_TIER, h);
  for (const h of ["", null, undefined]) assert.equal(defaultTierForHost(h), PROVISIONAL_DEFAULT_TIER);
});

test("decidePoolHostRegistration: codified + unregistered -> register at the deterministic tier", () => {
  assert.deepEqual(decidePoolHostRegistration("eur-lex.europa.eu", null), { action: "register", tier: 1 });
  assert.deepEqual(decidePoolHostRegistration("epa.gov", null), { action: "register", tier: 2 });
});

test("decidePoolHostRegistration: AMBIGUOUS + unregistered -> worklist, NEVER a guessed tier", () => {
  for (const h of AMBIGUOUS) {
    const d = decidePoolHostRegistration(h, null);
    assert.equal(d.action, "worklist", h);
    assert.equal(d.tier, null, h); // the guarantee: no tier is minted for an ambiguous host
  }
});

test("decidePoolHostRegistration: already-resolving institution -> inherit its canonical tier (no new row)", () => {
  // A host whose institution already resolves inherits — even an ambiguous host (a per-institution tier
  // set once), and even a codified one (never a divergent per-row tier).
  assert.deepEqual(decidePoolHostRegistration("searoutes.com", 3), { action: "inherit", tier: 3 });
  assert.deepEqual(decidePoolHostRegistration("eur-lex.europa.eu", 1), { action: "inherit", tier: 1 });
  assert.deepEqual(decidePoolHostRegistration("some-registered-host.org", 6), { action: "inherit", tier: 6 });
});
