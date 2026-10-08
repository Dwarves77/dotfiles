import { test } from "node:test";
import assert from "node:assert/strict";
import { rateSourceByInstitutionClass, makeResolveSource } from "./rate-source-by-class.mjs";

test("rateSourceByInstitutionClass: dry preview, company class, never writes", async () => {
  const r = await rateSourceByInstitutionClass(
    { url: "https://www.maersk.com/news/x", name: "Maersk" },
    { mode: "dry", registerSourceFn: null },
  );
  assert.equal(r.ok, true);
  assert.equal(r.tier, 7);
  assert.match(r.source_id, /^preview:/);
});

test("rateSourceByInstitutionClass: refuses an unparseable url", async () => {
  const r = await rateSourceByInstitutionClass({ url: "not a url", name: "X" }, { mode: "dry" });
  assert.equal(r.ok, false);
  assert.match(r.reason, /cannot parse a host/);
});

test("makeResolveSource: builds a function that maps a producer's own field names", async () => {
  const resolveSource = makeResolveSource({
    urlField: "sourceUrl",
    nameField: "carrierName",
    cite: { skill: "test", reason: "test" },
    sourceKeyFor: (host) => `${host.replace(/\./g, "_")}_notice`,
  });
  const r = await resolveSource({ sourceUrl: "https://www.msc.com/x", carrierName: "MSC" }, { mode: "dry" });
  assert.equal(r.ok, true);
  assert.equal(r.tier, 7);
  assert.equal(r.source_key, "msc_com_notice");
});

test("makeResolveSource: a second producer's config maps DIFFERENT field names to the same contract", async () => {
  const resolveSource = makeResolveSource({
    urlField: "source_url",
    nameField: "source_name",
    cite: { skill: "test", reason: "test" },
  });
  const r = await resolveSource({ source_url: "https://www.dir.ca.gov/x", source_name: "CA DIR" }, { mode: "dry" });
  assert.equal(r.ok, true);
  assert.equal(r.source_key, null);
});

test("makeResolveSource: apply mode calls the injected registerSourceFn with the mapped fields", async () => {
  const calls = [];
  const resolveSource = makeResolveSource({
    urlField: "url",
    nameField: "name",
    cite: { skill: "test", reason: "test" },
  });
  const registerSourceFn = async (source, opts) => {
    calls.push({ source, opts });
    return { source_id: "real-id-1", source_key: "real_key" };
  };
  const r = await resolveSource({ url: "https://example.gov/x", name: "Example Gov" }, { mode: "apply", registerSourceFn });
  assert.equal(r.ok, true);
  assert.equal(r.source_id, "real-id-1");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].source.url, "https://example.gov/x");
});

// ── a host verdict outranks the residue name rule (lane S8-E5, 2026-10-08) ─────────────────────────────
// [CONFIRMED, six-name probe] the D14 residue ruling's rule 7 (company, tier 7) places ANY host that carries a
// non-empty stored name, so a committed verdict was unreachable for a named host. The probe, run with
// classifyResidueRuling("carbonintensity.org.uk", name): null -> worklist; "NESO", "Carbon Intensity API",
// "National Energy System Operator", "National Energy System Operator (NESO) Carbon Intensity API" and
// "Carbon Intensity" -> company 7. A host with a verdict now rates by the verdict whatever its stored name.
const NESO_URL = "https://carbonintensity.org.uk/";
const NESO_NAMES = [
  null,
  "NESO",
  "Carbon Intensity API",
  "National Energy System Operator",
  "National Energy System Operator (NESO) Carbon Intensity API",
  "Carbon Intensity",
];
const GOV_VERDICT = new Map([["carbonintensity.org.uk", { class: "gov", batch: "host-verdicts-001" }]]);

test("a host with a verdict rates by the verdict regardless of its stored name (the six-name probe)", async () => {
  for (const name of NESO_NAMES) {
    const r = await rateSourceByInstitutionClass({ url: NESO_URL, name }, { mode: "dry", hostVerdicts: GOV_VERDICT });
    assert.equal(r.ok, true, `name ${JSON.stringify(name)}`);
    assert.equal(r.tier, 2, `name ${JSON.stringify(name)} rates by the verdict (gov), not the company residue rule`);
  }
});

test("without a verdict the named host stays on the residue rule (tier 7) and the nameless host is refused: the verdict is what changes the answer", async () => {
  const named = await rateSourceByInstitutionClass({ url: NESO_URL, name: "NESO" }, { mode: "dry", hostVerdicts: new Map() });
  assert.equal(named.tier, 7);
  const nameless = await rateSourceByInstitutionClass({ url: NESO_URL, name: null }, { mode: "dry", hostVerdicts: new Map() });
  assert.equal(nameless.ok, false);
});

test("a curated host-only rule still outranks a verdict, and an aggregator is never placed by one", async () => {
  const verdicts = new Map([["epa.gov", { class: "news" }], ["law.justia.com", { class: "legal" }]]);
  const gov = await rateSourceByInstitutionClass({ url: "https://www.epa.gov/x", name: "EPA" }, { mode: "dry", hostVerdicts: verdicts });
  assert.equal(gov.tier, 2);
  const agg = await rateSourceByInstitutionClass({ url: "https://law.justia.com/x", name: "Justia" }, { mode: "dry", hostVerdicts: verdicts });
  assert.equal(agg.ok, false);
});

test("the default is the committed verdict batches: this host rates gov through the shared path with no verdict argument", async () => {
  const r = await rateSourceByInstitutionClass({ url: NESO_URL, name: "National Energy System Operator (NESO) Carbon Intensity API" }, { mode: "dry" });
  assert.equal(r.ok, true);
  assert.equal(r.tier, 2);
});

test("makeResolveSource forwards hostVerdicts to the shared rating step", async () => {
  const resolveSource = makeResolveSource({ urlField: "url", nameField: "name", cite: { skill: "test", reason: "test" } });
  const r = await resolveSource({ url: NESO_URL, name: "NESO" }, { mode: "dry", hostVerdicts: GOV_VERDICT });
  assert.equal(r.tier, 2);
  const none = await resolveSource({ url: NESO_URL, name: "NESO" }, { mode: "dry", hostVerdicts: new Map() });
  assert.equal(none.tier, 7);
});
