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
    "economia.gob.mx", "mfe.govt.nz", "env.go.jp", "canada.gc.ca",
    "europa.eu", "un.org", "oecd.org", "imo.org", "icao.int"])
    assert.equal(defaultTierForHost(h), 2, h);
});

// Defect D14 fix (docs/plans/defect-fix-plan-2026-09-12.md, 2026-09-12): legifrance.gouv.fr moved from
// this T2 list to the curated legal-publisher allowlist -> T1 (it IS France's official law portal, the
// same "enacted primary legal text" class as legislation.gov.uk, not a generic ministry). It carries a
// "gouv" label the T2 rule below would also match; LEGAL_PUBLISHER_ALLOW is checked first in
// codifiedTierForHost, so T1 wins (the same "legal beats gov" order legislation.gov.uk already proves).
test("legifrance.gouv.fr is France's own law portal -> T1, not the generic gouv.fr T2 stem (D14)", () => {
  assert.equal(defaultTierForHost("legifrance.gouv.fr"), 1);
});

// Defect D14: the government second-level label list widened beyond gov/gob/gouv/govt/go/gc to the
// labels the 489-row pending-provisional audit surfaced -- gv (Austria), admin (Switzerland),
// bund (Germany), overheid (Netherlands), gouvernement (France), regeringen (Sweden/Denmark/Norway),
// riksdagen (Sweden). One representative host per label, none of them the curated T1 law portal for
// that country (see the allowlist test file for those).
test("defect D14: the widened government-label list resolves generic ministry/parliament hosts to T2", () => {
  for (const h of ["bmluk.gv.at", "bfe.admin.ch", "beispiel.bund.de", "zoek.overheid.nl",
    "info.gouvernement.fr", "regeringen.se", "regeringen.dk", "regeringen.no", "riksdagen.se"])
    assert.equal(defaultTierForHost(h), 2, h);
});

// Defect D14's own required negative tests: a lookalike must never match. Every real ISO 3166-1 alpha-2
// ccTLD is exactly two letters, so a government label immediately followed by a 3-letter commercial
// gTLD (gov.com), or a government label that is merely a PREFIX of an unrelated multi-label domain
// (gov.example.com), must resolve to the provisional sub-floor, never T1/T2.
test("defect D14: a government-label lookalike under a commercial TLD or a multi-label domain never matches", () => {
  for (const h of ["gov.example.com", "attacker.gov.com", "go.com", "admin.info", "bund.info",
    "overheid.example.com", "notgov.uk.example.com"])
    assert.equal(defaultTierForHost(h), PROVISIONAL_DEFAULT_TIER, h);
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
