// Defect D14 (docs/plans/defect-fix-plan-2026-09-12.md, 2026-09-12): the SC-13 class table did not
// recognise most national government and legal-publisher hosts. Evidence: of the 489 pending
// `provisional_sources`, 227 hosts matched a government or legal pattern by a coarse regex that was
// missing several real government labels (gv, admin, bund, overheid, gouvernement, regeringen,
// riksdagen), and several curated law portals (irishstatutebook.ie, legifrance.gouv.fr,
// gesetze-im-internet.de, and others) had no institution row and no class-table match at all.
//
// This file is the per-pattern / per-allowlist-entry / negative proof for classTierForHost
// (host-authority.ts), one test per named item in the defect-fix plan, so a future edit that drops a
// label or an allowlist entry fails here rather than silently re-widening the residue.
//
// Runs in the src/lib/sources npm-deps glob (fsi-app/src/**/*.npmtest.mjs, discipline.yml's
// "App unit tests requiring npm deps" step) -- host-authority.ts is TypeScript, loaded via jiti, the
// same convention as host-authority.npmtest.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { classTierForHost } = await jiti.import("./host-authority.ts");

// ── the curated legal-publisher allowlist -> T1, one test per named entry ──────────────────────────

const LEGAL_PUBLISHERS = [
  ["irishstatutebook.ie", "Irish Statute Book, Office of the Attorney General"],
  ["legifrance.gouv.fr", "Legifrance"],
  ["gesetze-im-internet.de", "German federal law, Federal Ministry of Justice"],
  ["retsinformation.dk", "Danish legal information"],
  ["wetten.overheid.nl", "Dutch legislation"],
  ["boe.es", "Spanish official gazette"],
  ["normattiva.it", "Italian legislation"],
  ["lovdata.no", "Norwegian legislation"],
  ["finlex.fi", "Finnish legislation"],
  ["legislation.gov.au", "Australian federal legislation"],
  ["laws-lois.justice.gc.ca", "Canadian federal legislation"],
  ["fedlex.admin.ch", "Swiss federal law"],
  ["ris.bka.gv.at", "Austrian legal information system"],
];

for (const [host, institution] of LEGAL_PUBLISHERS) {
  test(`classTierForHost: ${host} (${institution}) -> T1`, () => {
    assert.equal(classTierForHost(host), 1, host);
  });
}

test("classTierForHost: www-prefixed forms of the legal-publisher allowlist resolve identically", () => {
  for (const [host] of LEGAL_PUBLISHERS) assert.equal(classTierForHost(`www.${host}`), 1, host);
});

test("classTierForHost: the legal-publisher allowlist is exactly the 13 named entries, no silent drift", () => {
  assert.equal(LEGAL_PUBLISHERS.length, 13);
  assert.equal(new Set(LEGAL_PUBLISHERS.map(([h]) => h)).size, 13, "no duplicate host");
});

// ── the widened government second-level label list -> T2, one test per label ───────────────────────

const GOV_LABEL_HOSTS = [
  ["gov", "assets.publishing.service.gov.uk"],
  ["gouv", "info.gouv.fr"],
  ["gob", "economia.gob.mx"],
  ["gc", "canada.gc.ca"],
  ["go", "env.go.jp"],
  ["gv", "bmluk.gv.at"], // Austria -- one of the D13-evidence hosts rule c wrongly rejected
  ["govt", "mfe.govt.nz"],
  ["admin", "bfe.admin.ch"], // Switzerland
  ["bund", "beispiel.bund.de"], // Germany
  ["overheid", "zoek.overheid.nl"], // Netherlands (a DIFFERENT overheid.nl host than the T1 wetten.overheid.nl)
  ["gouvernement", "info.gouvernement.fr"], // France
  ["regeringen", "regeringen.se"], // Sweden
  ["riksdagen", "riksdagen.se"], // Sweden (parliament)
];

for (const [label, host] of GOV_LABEL_HOSTS) {
  test(`classTierForHost: government label "${label}" (${host}) -> T2`, () => {
    assert.equal(classTierForHost(host), 2, host);
  });
}

test("classTierForHost: regeringen.dk and regeringen.no (Denmark, Norway) also resolve to T2, the label is not Sweden-specific", () => {
  assert.equal(classTierForHost("regeringen.dk"), 2);
  assert.equal(classTierForHost("regeringen.no"), 2);
});

test("classTierForHost: a bare two-letter-suffixed government-label domain resolves the same as a subdomain of it", () => {
  assert.equal(classTierForHost("gov.uk"), 2);
  assert.equal(classTierForHost("admin.ch"), 2);
  assert.equal(classTierForHost("overheid.nl"), 2);
});

// ── T1 beats T2 when a host is in the legal-publisher allowlist but also carries a matching gov label ──

test("classTierForHost: legifrance.gouv.fr (gouv label) and wetten.overheid.nl (overheid label) resolve T1, not the coarser T2 stem", () => {
  assert.equal(classTierForHost("legifrance.gouv.fr"), 1);
  assert.equal(classTierForHost("wetten.overheid.nl"), 1);
});

// ── negatives: a lookalike must never match (defect D14's own required negative tests) ─────────────

test("classTierForHost: a government label under a commercial gTLD never matches (gov.com, admin.info, bund.info)", () => {
  for (const h of ["attacker.gov.com", "go.com", "admin.info", "bund.info", "overheid.org", "gouvernement.com"])
    assert.equal(classTierForHost(h), null, h);
});

test("classTierForHost: a government label as a mere PREFIX of an unrelated multi-label domain never matches (gov.example.com)", () => {
  for (const h of ["gov.example.com", "admin.example.com", "bund.example.co.uk", "overheid.customer-portal.io"])
    assert.equal(classTierForHost(h), null, h);
});

test("classTierForHost: a country-TLD suffix longer than two letters, on a REAL government vanity suffix, resolves T2 via the D14 residue ruling's rule 4 (superseding the prior null)", () => {
  // "scot" is a real gTLD-like suffix (Scotland) but is 4 letters, not a 2-letter ISO 3166-1 alpha-2 code,
  // so it never matched THIS file's own GOV_LABEL_UNDER_CC_TLD rule (still true, unchanged above) --
  // transport.gov.scot was exactly the D13-evidence host D14 part 1 did not claim to solve; it stayed in
  // the enumeration residue for the coordinator to rule on (see enumerate-unclassified-hosts.mjs). The
  // coordinator's residue ruling (2026-09-13, defect-fix-plan-2026-09-12.md D14, rule 4) resolved it: the
  // host carries a "gov" label immediately before a real, non-generic trailing suffix (never a commercial
  // gTLD lookalike -- see host-authority-d14-residue-ruling.npmtest.mjs for the adversarial negatives that
  // stay refused). This assertion is corrected IN PLACE per standing rule 13's corollary, not silently
  // dropped: the residue is resolved, not still null.
  assert.equal(classTierForHost("transport.gov.scot"), 2);
  assert.equal(classTierForHost("gov.scot"), 2);
});

test("classTierForHost: a name that merely CONTAINS a government label as a substring, not a registrable label, never matches", () => {
  for (const h of ["mygov.example.com", "govtech.io", "admincenter.com"]) assert.equal(classTierForHost(h), null, h);
});
