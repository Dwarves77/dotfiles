// research-walker.test.mjs -- dry-run fixture tests for lane L7. Zero network, zero DB credential, zero
// npm dependency (no-npm discipline glob: run-test-suite.sh discovers this file directly). Tests the
// PURE exports (normalizeOpenAlexWork, buildMintSeed, buildFixtureSbClient, decideApply) and the
// institution-class resolution for the 3 named grey-lit sources. The actual mint-chokepoint pass-through
// proof (which needs jiti to resolve mint-item.ts's `@/` imports) lives in research-walker.npmtest.mjs,
// per the lane-common-contract's own rule for this exact shape.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeOpenAlexWork,
  buildMintSeed,
  buildFixtureSbClient,
  decideApply,
  resolveGreyLitSource,
} from "./research-walker.mjs";
import { FIXTURE_GREY_LIT_SOURCES, FIXTURE_OPENALEX_CANDIDATES } from "./fixtures/research-walker-fixtures.mjs";

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
