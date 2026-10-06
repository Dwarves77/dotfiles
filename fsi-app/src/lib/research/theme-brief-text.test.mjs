import test from "node:test";
import assert from "node:assert/strict";
import { cleanPreContractBriefText as clean } from "./theme-brief-text.mjs";

test("A: the generator stats header line is removed whole", () => {
  const md = "**68 members · market + operations + regulations + research surfaces · 409 grounded intra-theme connections · density 0.180**\n\nThe engine binds it on shared scenarios.";
  assert.equal(clean(md), "The engine binds it on shared scenarios.");
  assert.equal(clean("**2 members · regulations surface · 1 grounded intra-theme connection · density 1.000**\n\nBody."), "Body.");
});

test("B: dominant signal weight goes, with a parenthesis that held only it", () => {
  assert.equal(clean("The engine binds it on shared reporting scenarios (dominant signal weight 104.2): the first."), "The engine binds it on shared reporting scenarios: the first.");
});

test("C: scores and bare three-decimal scores go; other numbers stay", () => {
  const out = clean("Clark County to Missouri DNR scores 0.986, Clark County to Iowa DNR 0.895, Building 0.762. Rates rose 12.5% to 3.2 and 0.5 and 1.0005.");
  assert.ok(!/0\.986|0\.895|0\.762|scores/.test(out), out);
  assert.match(out, /12\.5%/);
  assert.match(out, /3\.2 and 0\.5 and 1\.0005/);
});

test("D: a density phrase in parentheses goes", () => {
  assert.equal(clean("the fully connected graph (density 1.000) is small"), "the fully connected graph is small");
});

test("E: known tag slugs become their human labels in any case; unknown hyphenated words stay", () => {
  const out = clean("**emissions-reporting-Scope3** (30), sustainability-report-CSRD and freight-forwarder, ocean-emissions-MRV; same-source edges, intra-theme links, 2026-08-21.");
  assert.match(out, /Scope 3 emissions reporting/);
  assert.match(out, /CSRD sustainability reporting/);
  assert.match(out, /freight forwarder/);
  assert.match(out, /ocean emissions monitoring and reporting \(MRV\)/);
  assert.match(out, /same-source edges, intra-theme links, 2026-08-21/);
  assert.ok(!/emissions-reporting-Scope3|sustainability-report-CSRD|freight-forwarder/.test(out));
});

test("single-word tag names in ordinary prose are never rewritten", () => {
  assert.equal(clean("A shipper and an importer discuss drayage."), "A shipper and an importer discuss drayage.");
});

test("text with none of the patterns is returned byte-identical; non-strings are safe", () => {
  const md = "Plain prose.\n\n- a bullet\n\n| a | b |\n|---|---|\n| 1 | 2 |";
  assert.equal(clean(md), md);
  assert.equal(clean(null), "");
  assert.equal(clean(undefined), "");
});

test("a slice of the live pre-contract shape reads clean end to end", () => {
  const md = "**57 members · market + research surfaces · 294 grounded intra-theme connections · density 0.184**\n\nThe tag engine binds it on shared reporting and emissions scenarios (dominant signal weight 104.2): **emissions-reporting-Scope3** (14), **sustainability-report-CSRD** (9). Obligated parties: freight-forwarder (16), shipper (9). Strongest edges: Clark County to Missouri DNR scores 0.986, Iowa DNR 0.895.";
  const out = clean(md);
  assert.ok(!/density|weight|0\.\d{3}|grounded|-Scope3|-CSRD|freight-forwarder|57 members/.test(out), out);
  assert.match(out, /Obligated parties: freight forwarder \(16\), shipper \(9\)/);
});
