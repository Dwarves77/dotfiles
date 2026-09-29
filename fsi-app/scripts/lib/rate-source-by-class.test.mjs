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
