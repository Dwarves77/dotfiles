// research-walker.test.mjs -- dry-run fixture tests for lane L7. Zero network, zero DB credential, zero
// npm dependency (no-npm discipline glob: run-test-suite.sh discovers this file directly). Tests the
// PURE exports (normalizeOpenAlexWork, buildMintSeed, buildFixtureSbClient, decideApply), the
// institution-class resolution for the 3 named grey-lit sources, and searchOpenAlexWorks's reuse of
// lane L3's openalex-client.mjs (openAlexGet) via an injected deps.fetch stub -- openalex-client.mjs
// itself carries no npm import, so this stays safe on the no-npm glob. The actual mint-chokepoint
// pass-through proof (which needs jiti to resolve mint-item.ts's `@/` imports) lives in
// research-walker.npmtest.mjs, per the lane-common-contract's own rule for this exact shape.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeOpenAlexWork,
  searchOpenAlexWorks,
  buildMintSeed,
  buildFixtureSbClient,
  decideApply,
  resolveGreyLitSource,
  resolveOpenAlexPublisher,
} from "./research-walker.mjs";
import { loadHostVerdicts, HOST_VERDICTS_DIR } from "../maintenance/host-verdicts/load-host-verdicts.mjs";
import { join } from "node:path";
import {
  FIXTURE_GREY_LIT_SOURCES,
  FIXTURE_OPENALEX_CANDIDATES,
  FIXTURE_OPENALEX_PUBLISHER_CANDIDATES,
  FIXTURE_OPENALEX_WORKS_RESPONSE,
} from "./fixtures/research-walker-fixtures.mjs";

test("normalizeOpenAlexWork: a work with a landing page URL and a title normalizes", () => {
  const c = normalizeOpenAlexWork(FIXTURE_OPENALEX_CANDIDATES[0]);
  assert.ok(c);
  assert.equal(c.title, FIXTURE_OPENALEX_CANDIDATES[0].title);
  assert.equal(c.sourceUrl, "https://doi.org/10.1000/example-freight-decarb");
  assert.equal(c.publishedDate, "2026-08-15");
});

test("normalizeOpenAlexWork: a work with no landing page falls back to its DOI", () => {
  const c = normalizeOpenAlexWork(FIXTURE_OPENALEX_CANDIDATES[1]);
  assert.ok(c);
  assert.equal(c.sourceUrl, "https://doi.org/10.1000/example-marine-fuels");
});

test("normalizeOpenAlexWork: a work with neither a landing page nor a DOI returns null (never minted)", () => {
  const c = normalizeOpenAlexWork(FIXTURE_OPENALEX_CANDIDATES[2]);
  assert.equal(c, null);
});

test("normalizeOpenAlexWork: a work with no title returns null", () => {
  assert.equal(normalizeOpenAlexWork({ doi: "https://doi.org/x", primary_location: {} }), null);
});

test("searchOpenAlexWorks: reuses lane L3's openAlexGet (deps.fetch injected, zero network) and normalizes the results, dropping the no-URL fixture", async () => {
  let capturedUrl = null;
  const fetchStub = async (url) => {
    capturedUrl = url;
    return {
      status: 200,
      statusText: "OK",
      ok: true,
      headers: { get: () => null },
      json: async () => FIXTURE_OPENALEX_WORKS_RESPONSE,
    };
  };
  const candidates = await searchOpenAlexWorks({ query: "freight decarbonisation", perPage: 10 }, { fetch: fetchStub });
  assert.equal(candidates.length, 5, "the 3 publisher-host fixtures plus the 2 DOI fixtures; the no-URL work is dropped");
  assert.equal(candidates[0].sourceUrl, "https://doi.org/10.1000/example-freight-decarb");
  // L3's openAlexGet (reused, not reimplemented) is what appends mailto + search params -- confirms
  // this wrapper really called through it rather than hand-rolling its own URL.
  assert.match(capturedUrl, /\/works\?/);
  assert.match(capturedUrl, /search=freight/);
  assert.match(capturedUrl, /mailto=/);
});

test("buildMintSeed: item_type/domain are fixed for research_finding; no source_id when none resolved", () => {
  const seed = buildMintSeed({ title: "T", sourceUrl: "https://example.org/a", publishedDate: "2026-01-01" });
  assert.equal(seed.item_type, "research_finding");
  assert.equal(seed.domain, 7);
  assert.equal(seed.title, "T");
  assert.equal(seed.source_url, "https://example.org/a");
  assert.equal(seed.added_date, "2026-01-01");
  assert.equal("source_id" in seed, false);
});

test("buildMintSeed: carries a resolved source_id through when given one", () => {
  const seed = buildMintSeed({ title: "T", sourceUrl: "https://iea.org/x" }, { sourceId: "src-123" });
  assert.equal(seed.source_id, "src-123");
});

test("resolveGreyLitSource: the 3 named sources resolve through the institution class table, no hand-typed tier", async () => {
  for (const src of FIXTURE_GREY_LIT_SOURCES) {
    const r = await resolveGreyLitSource(src, { mode: "dry" });
    assert.equal(r.ok, true, `${src.name} (${src.url}) should classify: ${r.reason ?? ""}`);
    assert.equal(typeof r.tier, "number");
    assert.ok(r.source_id.startsWith("preview:"), "dry mode never touches the DB");
  }
});

test("resolveGreyLitSource: IEA resolves to the intergov tier (2), ICCT to the analysis tier (6), the university institute to the academic tier (4)", async () => {
  const [iea, icct, uni] = await Promise.all(FIXTURE_GREY_LIT_SOURCES.map((s) => resolveGreyLitSource(s, { mode: "dry" })));
  assert.equal(iea.tier, 2);
  assert.equal(icct.tier, 6);
  assert.equal(uni.tier, 4);
});

test("buildFixtureSbClient: a fixture mint-item.ts-shaped client answers sources/intelligence_items reads and captures the insert", async () => {
  const sb = buildFixtureSbClient({ registeredSources: [{ id: "src-1", url: "https://iea.org/x" }], corpus: [] });
  const srcRows = await sb.from("sources").select("id").in("url", ["https://iea.org/x"]).limit(1);
  assert.deepEqual(srcRows.data, [{ id: "src-1", url: "https://iea.org/x" }]);
  const dup = await sb.from("intelligence_items").select("id").eq("source_url", "https://iea.org/x").maybeSingle();
  assert.equal(dup.data, null);
  await sb.from("intelligence_items").insert({ title: "x" }).select("id").single();
  assert.deepEqual(sb.insertedSeed(), { title: "x" });
});

test("decideApply: no --dispatch is always dry, regardless of the other gates", () => {
  const d = decideApply({ dispatch: false, enabled: true, killSwitchOn: true, hasCreds: true });
  assert.equal(d.canWrite, false);
});

test("decideApply: --dispatch without the kill switch refuses", () => {
  const d = decideApply({ dispatch: true, enabled: true, killSwitchOn: false, hasCreds: true });
  assert.equal(d.canWrite, false);
  assert.match(d.reason, /kill switch/);
});

test("decideApply: --dispatch with every gate open but no DB creds refuses (this worktree has none)", () => {
  const d = decideApply({ dispatch: true, enabled: true, killSwitchOn: true, hasCreds: false });
  assert.equal(d.canWrite, false);
  assert.match(d.reason, /DB creds/);
});

test("decideApply: every gate open and creds present can write", () => {
  const d = decideApply({ dispatch: true, enabled: true, killSwitchOn: true, hasCreds: true });
  assert.equal(d.canWrite, true);
});

// ── lane S1-D: the walker registers and rates an OpenAlex publisher host (rule 18) ───────────────────────

const FIXTURE_VERDICTS = loadHostVerdicts({ files: [join(HOST_VERDICTS_DIR, "host-verdicts-000.fixture.json")] }).verdicts;
const [BUILTIN_WORK, VERDICT_WORK, UNPLACED_WORK] = FIXTURE_OPENALEX_PUBLISHER_CANDIDATES.map(normalizeOpenAlexWork);

test("resolveOpenAlexPublisher (dry): a built-in-placed publisher host places at its class tier", async () => {
  const r = await resolveOpenAlexPublisher(BUILTIN_WORK, { mode: "dry", hostVerdicts: FIXTURE_VERDICTS });
  assert.equal(r.placed, true);
  assert.equal(r.placedBy, "built-in rule");
  assert.equal(r.tier, 4);
  assert.equal(r.verdictBatch, null);
  assert.equal(r.sourceId, "preview:eprints.soton.ac.uk");
});

test("resolveOpenAlexPublisher (dry): a host placed only by a fixture verdict names the batch and reads the tier from the class table", async () => {
  const r = await resolveOpenAlexPublisher(VERDICT_WORK, { mode: "dry", hostVerdicts: FIXTURE_VERDICTS });
  assert.equal(r.placed, true);
  assert.equal(r.placedBy, "host verdict");
  assert.equal(r.verdictBatch, "host-verdicts-000.fixture");
  assert.equal(r.tier, 4);
});

test("resolveOpenAlexPublisher: without the verdict batch the same host does not place", async () => {
  const r = await resolveOpenAlexPublisher(VERDICT_WORK, { mode: "dry", hostVerdicts: new Map() });
  assert.equal(r.placed, false);
});

test("resolveOpenAlexPublisher (dry): an unplaced publisher is residue 'awaiting host verdict batch' with its host named", async () => {
  const r = await resolveOpenAlexPublisher(UNPLACED_WORK, { mode: "dry", hostVerdicts: FIXTURE_VERDICTS });
  assert.equal(r.placed, false);
  assert.equal(r.reason, "awaiting host verdict batch");
  assert.equal(r.host, "unlisted-journal.example");
});

test("resolveOpenAlexPublisher (apply): registers through registerSourceFn at the class tier with provisional status, built-in and verdict paths", async () => {
  const calls = [];
  const registerSourceFn = async (src, opts) => {
    calls.push({ src, opts });
    return { source_id: `src-${calls.length}` };
  };
  const a = await resolveOpenAlexPublisher(BUILTIN_WORK, { mode: "apply", registerSourceFn, hostVerdicts: FIXTURE_VERDICTS });
  const b = await resolveOpenAlexPublisher(VERDICT_WORK, { mode: "apply", registerSourceFn, hostVerdicts: FIXTURE_VERDICTS });
  const c = await resolveOpenAlexPublisher(UNPLACED_WORK, { mode: "apply", registerSourceFn, hostVerdicts: FIXTURE_VERDICTS });
  assert.equal(a.sourceId, "src-1");
  assert.equal(b.sourceId, "src-2");
  assert.equal(c.placed, false);
  assert.equal(calls.length, 2, "an unplaced host is never registered");
  for (const { src, opts } of calls) {
    assert.equal(src.base_tier, 4);
    assert.deepEqual(src.extra, { status: "provisional" });
    assert.ok(opts.cite, "registerSource requires a cite");
  }
});
