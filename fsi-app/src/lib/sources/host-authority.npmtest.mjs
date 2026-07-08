// Unit test for defaultTierForHost — the deterministic source-TYPE tier classifier used to register
// grounding-pool corroborator hosts at a tier the authority floor can evaluate (not NULL). The risky
// part is the host-pattern matching; this fixes its behaviour so a refactor cannot silently mis-tier.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { defaultTierForHost, PROVISIONAL_DEFAULT_TIER } = await jiti.import("./host-authority.ts");

test("legal-primary enacted hosts -> T1", () => {
  for (const h of ["eur-lex.europa.eu", "www.federalregister.gov", "ecfr.gov", "govinfo.gov", "legislation.gov.uk"])
    assert.equal(defaultTierForHost(h), 1, h);
});

test("government / regulator / intergov hosts -> T2", () => {
  for (const h of ["irs.gov", "epa.gov", "assets.publishing.service.gov.uk", "english.icfre.gov.in",
    "economia.gob.mx", "legifrance.gouv.fr", "mfe.govt.nz", "env.go.jp", "canada.gc.ca",
    "europa.eu", "un.org", "oecd.org", "imo.org", "icao.int"])
    assert.equal(defaultTierForHost(h), 2, h);
});

test("commercial / analysis / law-firm hosts -> provisional sub-floor (the masked class)", () => {
  for (const h of ["searoutes.com", "truckinginfo.com", "globalpetrolprices.com", "dieselnet.com",
    "aoshearman.com", "mayerbrown.com", "cms-lawnow.com", "climatecatalyst.org", "mainelegislature.org"])
    assert.equal(defaultTierForHost(h), PROVISIONAL_DEFAULT_TIER, h);
});

test("legislation.gov.uk beats the .gov.uk gov rule (T1, not T2) — order matters", () => {
  assert.equal(defaultTierForHost("legislation.gov.uk"), 1);
  assert.equal(defaultTierForHost("gov.uk"), 2);
});

test("empty / unparseable -> provisional default (never null)", () => {
  for (const h of ["", null, undefined]) assert.equal(defaultTierForHost(h), PROVISIONAL_DEFAULT_TIER);
});
