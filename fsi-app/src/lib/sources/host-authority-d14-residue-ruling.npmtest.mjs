// D14 residue ruling (coordinator, 2026-09-13, defect-fix-plan-2026-09-12.md D14, "Residue ruling"):
// per-rule positive/negative tests, the two named precedence proofs, the "council" carve-out, a spot
// check that the existing curated allowlists/patterns stay untouched, and the table-driven sweep over
// the enumerate-unclassified-hosts artifact (628 hosts, run 34728958591, after PR #657).
//
// Names used below are read from the fixture (fixtures/d14-residue-unclassified-hosts.json, a trimmed
// copy of that artifact -- host + names only) rather than retyped as string literals in this file: many
// of the real registry names carry en/em dashes verbatim (Diario da Republica Eletronico (DRE - Official
// Gazette), Scottish Government - Climate Change Policy, BIMCO - Baltic and International Maritime
// Council, and others). Rule 022 (fsi-app/.discipline/rules/022-no-dash-glyphs.mjs) exempts a file under
// a `fixtures` directory, so the JSON carries them; this .mjs file itself never types a dash character.
//
// Runs in the src/lib/sources npm-deps glob (fsi-app/src/**/*.npmtest.mjs, discipline.yml's "App unit
// tests requiring npm deps" step) -- host-authority.ts is TypeScript, loaded via jiti, the same
// convention as host-authority.npmtest.mjs and host-authority-gov-label-and-legal-publisher.npmtest.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { classTierForHost, classTierForHostAcrossNames, classifyResidueRuling, permanentlyUnregisteredClass } =
  await jiti.import("./host-authority.ts");

const FIXTURE = JSON.parse(readFileSync(resolve(HERE, "fixtures", "d14-residue-unclassified-hosts.json"), "utf8"));
function namesFor(host) {
  const row = FIXTURE.hosts.find((h) => h.host === host);
  assert.ok(row, `fixture is missing host ${host}`);
  return row.names;
}
function firstName(host) {
  return namesFor(host)[0];
}

// ── rule 1: legal publisher (T1) ──────────────────────────────────────────────────────────────────────
test("rule 1 (legal publisher): dre.pt and njt.hu resolve T1 via the extended curated allowlist", () => {
  assert.equal(classTierForHost("dre.pt", firstName("dre.pt")), 1);
  assert.equal(classTierForHost("njt.hu", firstName("njt.hu")), 1);
});
test("rule 1 negative: gov.scot's own government name never resolves T1", () => {
  assert.notEqual(classTierForHost("gov.scot", firstName("gov.scot")), 1);
});

// ── rule 2: academic (T4) ─────────────────────────────────────────────────────────────────────────────
test("rule 2 (academic): eur.nl (Erasmus University Rotterdam) resolves T4 via the university-name stem", () => {
  assert.equal(classTierForHost("eur.nl", firstName("eur.nl")), 4);
  assert.equal(classifyResidueRuling("eur.nl", firstName("eur.nl")).rule, "academic");
});
test("rule 2 negative: fleetnews.co.uk's name is not academic", () => {
  assert.notEqual(classifyResidueRuling("fleetnews.co.uk", firstName("fleetnews.co.uk")).rule, "academic");
});

// ── rule 3: association / standards body (T4) ────────────────────────────────────────────────────────
test("rule 3 (association): afnor.org, bimco.org and acea.auto resolve T4", () => {
  assert.equal(classTierForHost("afnor.org", firstName("afnor.org")), 4);
  // BIMCO's own recorded name is "... Baltic and International Maritime Council" -- non-government,
  // caught by the general "council" word, not curation.
  assert.equal(classTierForHost("bimco.org", namesFor("bimco.org")[1]), 4);
  // ACEA's recorded names never spell out "Association" -- resolves only via the curated addition.
  assert.equal(classTierForHost("acea.auto", firstName("acea.auto")), 4);
});
test("rule 3 negative: guidehouse.com's name/host is not association (it is analysis, rule 6)", () => {
  assert.notEqual(classifyResidueRuling("guidehouse.com", firstName("guidehouse.com")).rule, "association");
});
test("rule 3's council carve-out: a council with no government noun in its name is association", () => {
  const r = classifyResidueRuling("example-maritime-body.test", "International Maritime Council");
  assert.equal(r.tier, 4);
  assert.equal(r.rule, "association");
});
test("rule 3's council carve-out yields to rule 4 when the SAME name also carries a government noun", () => {
  const r = classifyResidueRuling("example-county-body.test", "Example County Council");
  assert.equal(r.tier, 2);
  assert.equal(r.rule, "government");
});

// ── fix round 1 for L9b (review-l9b.md finding F2, defect-fix-plan-2026-09-12.md D14) ────────────────
// "city council" and its kin (borough/town/regional/district/municipal) were not in the government
// noun list, although the code's own comment named that exact case as intended government; a bare
// "council" carve-out check also mis-fired on a think-tank name whose OWN think-tank phrase happens to
// contain the word "council" (e.g. "Council on Foreign Relations"), since residueGovernmentTier's null
// there is for the WRONG reason (its own think-tank exclusion, not "not a government host").
test("F2: 'Philadelphia City Council' resolves T2 (a real city government's legislative body)", () => {
  const r = classifyResidueRuling("phlcouncil.com", firstName("phlcouncil.com"));
  assert.equal(r.tier, 2);
  assert.equal(r.rule, "government");
});
test("F2: 'Council on Foreign Relations' resolves T6 (a think tank), never T2 or T4", () => {
  const r = classifyResidueRuling("example-think-tank-council.test", "Council on Foreign Relations");
  assert.equal(r.tier, 6);
  assert.equal(r.rule, "analysis");
});
test("F2: the new '<noun> council' phrases each resolve T2", () => {
  for (const name of [
    "Example Borough Council", "Example Town Council", "Example Regional Council",
    "Example District Council", "Example Municipal Council",
  ]) {
    const r = classifyResidueRuling("example-council-body.test", name);
    assert.equal(r.tier, 2, name);
    assert.equal(r.rule, "government", name);
  }
});
test("F2 regression: the existing council carve-out tests above are unaffected by the noun-list and think-tank-guard additions", () => {
  assert.deepEqual(classifyResidueRuling("example-maritime-body.test", "International Maritime Council"), { tier: 4, rule: "association" });
  assert.deepEqual(classifyResidueRuling("example-county-body.test", "Example County Council"), { tier: 2, rule: "government" });
  // bimco.org's second recorded name is its own ("... Baltic and International Maritime Council"); its
  // first name ("BIMCO Standard ETS Mandate 2024") carries no rule keyword at all and correctly falls
  // through to company (T7) alone -- namesFor(...)[1] is deliberate here, matching the rule 3 test above.
  assert.equal(classTierForHost("bimco.org", namesFor("bimco.org")[1]), 4);
});

// ── rule 4: government (T2) ───────────────────────────────────────────────────────────────────────────
test("rule 4 (government): gov.scot, mmediu.ro and emissionsauthority.nl resolve T2", () => {
  assert.equal(classTierForHost("gov.scot", firstName("gov.scot")), 2);
  assert.equal(classTierForHost("mmediu.ro", firstName("mmediu.ro")), 2); // Romanian "Ministerul"
  assert.equal(classTierForHost("emissionsauthority.nl", firstName("emissionsauthority.nl")), 2);
});
test("rule 4's host-label branch alone (no name needed) resolves transport.gov.scot and commonslibrary.parliament.uk", () => {
  assert.equal(classTierForHost("transport.gov.scot"), 2);
  assert.equal(classTierForHost("commonslibrary.parliament.uk"), 2);
});
test("rule 4 negative, the ruling's own precedence proof: enotrans.org names a transport body but is analysis (T6), never government", () => {
  assert.notEqual(classTierForHost("enotrans.org", firstName("enotrans.org")), 2);
  assert.equal(classifyResidueRuling("enotrans.org", firstName("enotrans.org")).rule, "analysis");
});

// ── rule 5: news / press (T7) ─────────────────────────────────────────────────────────────────────────
test("rule 5 (news): fleetnews.co.uk resolves T7 via the news-name stem", () => {
  assert.equal(classTierForHost("fleetnews.co.uk", firstName("fleetnews.co.uk")), 7);
  assert.equal(classifyResidueRuling("fleetnews.co.uk", firstName("fleetnews.co.uk")).rule, "news");
});
test("rule 5 negative: masdar.ae's 'Newsroom' name is a corporate press room, not news (rule 7's company class instead)", () => {
  const r = classifyResidueRuling("masdar.ae", firstName("masdar.ae"));
  assert.notEqual(r.rule, "news");
  assert.equal(r.rule, "company");
});

// ── rule 6: analysis (T6) ─────────────────────────────────────────────────────────────────────────────
test("rule 6 (analysis): guidehouse.com (Big-4/advisory host) and enotrans.org (name keyword) resolve T6", () => {
  assert.equal(classTierForHost("guidehouse.com", firstName("guidehouse.com")), 6);
  assert.equal(classTierForHost("enotrans.org", firstName("enotrans.org")), 6);
});
test("rule 6 negative: afnor.org is not analysis (it is association, rule 3)", () => {
  assert.notEqual(classifyResidueRuling("afnor.org", firstName("afnor.org")).rule, "analysis");
});

// ── rule 7: company (T7, new class) ───────────────────────────────────────────────────────────────────
test("rule 7 (company): masdar.ae resolves T7 with no rule 1-6 match", () => {
  const r = classifyResidueRuling("masdar.ae", firstName("masdar.ae"));
  assert.equal(r.tier, 7);
  assert.equal(r.rule, "company");
});
test("rule 7 negative: a host with no stored name at all never resolves company (it worklists, rule 8)", () => {
  const r = classifyResidueRuling("no-name-host.example", undefined);
  assert.notEqual(r.rule, "company");
});

// ── rule 8: worklist (the true residue) ───────────────────────────────────────────────────────────────
test("rule 8 (worklist): a host with no stored name and no host-only match worklists (null)", () => {
  assert.equal(classTierForHost("no-name-host.example", undefined), null);
  assert.equal(classifyResidueRuling("no-name-host.example", undefined).rule, "worklist");
});
test("rule 8 negative: the SAME host resolves (company) once ANY name is supplied", () => {
  assert.notEqual(classTierForHost("no-name-host.example", "Some Corporation Press Kit"), null);
});

// ── precedence proofs (the ruling's own required proofs) ─────────────────────────────────────────────
test("precedence: a legal publisher whose name contains the word 'government' still resolves T1, not T2", () => {
  const r = classifyResidueRuling("example-gazette.test", "Government Official Gazette of Testland");
  assert.equal(r.tier, 1);
  assert.equal(r.rule, "legal");
});
test("precedence: a think tank named 'Institute for X' resolves T6, never T2", () => {
  const r = classifyResidueRuling("example-think-tank.test", "Institute for Sustainable Transport Policy");
  assert.equal(r.tier, 6);
  assert.equal(r.rule, "analysis");
});

// ── existing class-table behaviour is untouched (a spot check; the full suites are run separately) ────
test("existing curated allowlists and patterns resolve exactly as before the residue ruling", () => {
  assert.equal(classTierForHost("eur-lex.europa.eu"), 1);
  assert.equal(classTierForHost("epa.gov"), 2);
  assert.equal(classTierForHost("dnv.com"), 4);
  assert.equal(classTierForHost("eng.cam.ac.uk"), 4);
  assert.equal(classTierForHost("mayerbrown.com"), 7);
  assert.equal(classTierForHost("freightwaves.com"), 7);
  assert.equal(classTierForHost("ammoniaenergy.org"), 6);
  assert.equal(classTierForHost("legiscan.com"), null); // permanent worklist, unaffected
  assert.equal(classTierForHost("en.wikipedia.org"), null); // still ambiguous, unaffected
});

// ── table-driven sweep over the full enumeration artifact ───────────────────────────────────────────
// Fix round 1 for L9b (review-l9b.md finding F1): this sweep now uses `classTierForHostAcrossNames`
// over EVERY name the artifact recorded for a host, the SAME order-independent decision resolve-
// provisional-sources.mjs itself now makes (it previously used the single-name `classTierForHost` on
// just one row's name, mirroring the pre-fix per-row behaviour, which is no longer what production does).
//
// classTierForHostAcrossNames also returns null for a host permanentlyUnregisteredClass rules an
// aggregator or a hosting platform (LEGAL_AGGREGATOR/HOSTING_PLATFORM above) -- a PRE-EXISTING, correct
// exclusion, checked before ANY of the 8 D14 residue rules run, unrelated to whether the host has a
// stored name (a republisher does not become the publisher by having a name on file). The artifact's own
// 628 hosts include 8 such hosts (the justia/legiscan/Cornell-LII/mondaq/npcobserver/legalclarity
// aggregator family and one Citizen Space hosting-platform host), every one of them WITH a stored name.
// Rule 8's own invariant -- "worklist stays only for hosts with no stored name at all" -- is about the 8
// D14 rules specifically, so the sweep below counts the two null-producing reasons SEPARATELY and asserts
// the invariant against the genuine rule-8 residue only, never conflating it with the pre-existing
// aggregator class (a mis-count here would be a false report, not a bug in the ruling).
test("table-driven: every host in the enumerate-unclassified-hosts artifact classifies (across all its recorded names); the rule-8 (worklist) residue equals the empty-name count", () => {
  const perClass = new Map();
  let genuineWorklist = 0;
  let permanentlyUnregistered = 0;
  let emptyName = 0;
  for (const row of FIXTURE.hosts) {
    if (row.names.length === 0) emptyName += 1;
    const tier = classTierForHostAcrossNames(row.host, row.names);
    const key = tier == null ? "worklist" : `T${tier}`;
    perClass.set(key, (perClass.get(key) ?? 0) + 1);
    if (tier == null) {
      if (permanentlyUnregisteredClass(row.host) != null) permanentlyUnregistered += 1;
      else genuineWorklist += 1;
    }
  }
  console.log(`D14 residue ruling table-driven sweep (fix round 1, across-names): ${FIXTURE.hosts.length} hosts (artifact run ${FIXTURE.source_run_id})`);
  for (const [key, count] of [...perClass.entries()].sort()) console.log(`  ${key}: ${count}`);
  console.log(`  of which pre-existing permanently-unregistered (aggregator/platform, unrelated to D14): ${permanentlyUnregistered}`);
  console.log(`  genuine rule-8 worklist residue (no rule 1-7 match): ${genuineWorklist}`);
  console.log(`  hosts with an empty names array: ${emptyName}`);
  assert.equal(
    genuineWorklist,
    emptyName,
    "the genuine rule-8 worklist residue must equal the count of hosts with no stored name at all",
  );
});
