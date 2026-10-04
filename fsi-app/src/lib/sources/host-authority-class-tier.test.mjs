// Class-tier agreement (lane S1-D, 2026-10-04). HOST_CLASS_TIER is the one table that says what tier a
// host class is; the built-in rules in host-authority.ts read from it. This pins one representative host
// per class, resolved through the public resolver, to the table, so a class tier changed in one place only
// (a literal re-introduced in a rule, or a table edit the rules do not follow) fails here.
// No-npm: node builtins and a relative .ts only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { classTierForHost, classifyResidueRuling, HOST_CLASS_TIER } from "./host-authority.ts";

// [class, host, stored name]. A name is passed only for the class that is name-derived (company).
const REPRESENTATIVES = [
  ["legal", "eur-lex.europa.eu", null],
  ["gov", "iea.org", null],
  ["verifier", "dnv.com", null],
  ["academic", "tti.tamu.edu", null],
  ["association", "cer.be", null],
  ["standards_body", "iso.org", null],
  ["analysis", "theicct.org", null],
  ["lawfirm", "dlapiper.com", null],
  ["news", "reuters.com", null],
  ["company", "unlisted-widgets.example", "Acme Widgets"],
];

test("every class in HOST_CLASS_TIER has a representative host in this test", () => {
  assert.deepEqual(REPRESENTATIVES.map((r) => r[0]).sort(), Object.keys(HOST_CLASS_TIER).sort());
});

for (const [cls, host, name] of REPRESENTATIVES) {
  test(`class ${cls}: classTierForHost(${host}) equals HOST_CLASS_TIER.${cls}`, () => {
    assert.equal(classTierForHost(host, name), HOST_CLASS_TIER[cls]);
  });
}

test("the residue rules read their tier from the table (name-derived paths)", () => {
  assert.equal(classifyResidueRuling("x.example", "Example Official Gazette").tier, HOST_CLASS_TIER.legal);
  assert.equal(classifyResidueRuling("x.example", "Example University").tier, HOST_CLASS_TIER.academic);
  assert.equal(classifyResidueRuling("x.example", "Example Shippers Association").tier, HOST_CLASS_TIER.association);
  assert.equal(classifyResidueRuling("x.example", "Ministry of Example").tier, HOST_CLASS_TIER.gov);
  assert.equal(classifyResidueRuling("x.example", "Example Daily News").tier, HOST_CLASS_TIER.news);
  assert.equal(classifyResidueRuling("x.example", "Institute for Example Research").tier, HOST_CLASS_TIER.analysis);
  assert.equal(classifyResidueRuling("x.example", "Acme Widgets").tier, HOST_CLASS_TIER.company);
});

// ── DOI resolvers are never-register (lane S1-D, coordinator ruling 2026-10-04) ──────────────────────────
import { permanentlyUnregisteredClass, verdictPlacementForHost } from "./host-authority.ts";

for (const host of ["doi.org", "dx.doi.org", "hdl.handle.net"]) {
  test(`DOI resolver ${host}: never-register, no tier even with a stored name, and a host verdict naming it is refused`, () => {
    assert.notEqual(permanentlyUnregisteredClass(host), null);
    assert.equal(classTierForHost(host, "Some Publisher"), null);
    const verdicts = new Map([[host, { class: "association", batch: "host-verdicts-999" }]]);
    assert.equal(verdictPlacementForHost(host, verdicts), null);
  });
}

test("a real publisher host ending in similar text is not caught by the resolver pattern", () => {
  assert.equal(permanentlyUnregisteredClass("notdoi.org.example.com"), null);
  assert.equal(permanentlyUnregisteredClass("mydoi.org"), null);
});
