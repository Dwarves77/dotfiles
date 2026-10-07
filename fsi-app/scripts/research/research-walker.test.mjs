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
  holdingsNeedsFromFlags,
  readHoldingsNeeds,
  readOpenNeeds,
  searchHoldingsNeeds,
  MAX_HOLDINGS_NEEDS,
  describeRunKind,
  buildWalkerConfig,
  FIXTURE_RUN_BANNER,
  LIVE_SEARCH_RUN_BANNER,
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
  assert.equal(c.sourceUrl, "https://its.example-univ.edu/freight-decarb-corridors", "the record's landing page wins over its DOI link");
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
  assert.equal(candidates[0].sourceUrl, "https://its.example-univ.edu/freight-decarb-corridors");
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

test("resolveOpenAlexPublisher: a DOI-resolver-only candidate is residue 'publisher host unresolved from DOI' and names no host", async () => {
  const doiOnly = normalizeOpenAlexWork(FIXTURE_OPENALEX_CANDIDATES[1]);
  assert.equal(doiOnly.sourceUrl, "https://doi.org/10.1000/example-marine-fuels");
  const r = await resolveOpenAlexPublisher(doiOnly, { mode: "dry", hostVerdicts: new Map([["doi.org", { class: "company", batch: "x" }]]) });
  assert.equal(r.placed, false);
  assert.equal(r.reason, "publisher host unresolved from DOI");
  assert.equal(r.host, "", "the resolver host is not reported as an unplaced publisher host");
});

test("resolveOpenAlexPublisher: a record with a publisher landing page takes its host from it, not from its DOI link", async () => {
  const c = normalizeOpenAlexWork(FIXTURE_OPENALEX_CANDIDATES[0]);
  const r = await resolveOpenAlexPublisher(c, { mode: "dry", hostVerdicts: new Map() });
  assert.equal(r.placed, true);
  assert.equal(r.host, "its.example-univ.edu");
  assert.equal(r.tier, 4);
});

// ── lane L4-B: open holdings-need targets as search inputs (ADR-044 decision 2) ───────────────────────────

const needFlag = (ref, need, extra = {}) => ({
  id: `f-${ref}`, subject_ref: ref, created_by: "holdings-need:what", status: "open",
  recommended_actions: [{ action: "find-source", need, item_id: "item-1", surface: "regulations", product_question: "what" }],
  ...extra,
});
const okFetch = (recorder) => async (url) => {
  recorder.push(String(url));
  return { status: 200, statusText: "OK", ok: true, headers: { get: () => null }, json: async () => FIXTURE_OPENALEX_WORKS_RESPONSE };
};

test("holdingsNeedsFromFlags: structured needs only, in subject_ref order, bounded", () => {
  const flags = [needFlag("b:x:what", "need B"), needFlag("a:x:what", "need A"), { id: "f-bare", subject_ref: "c:x:what", recommended_actions: [] }];
  assert.deepEqual(holdingsNeedsFromFlags(flags).map((n) => [n.subject_ref, n.need]), [["a:x:what", "need A"], ["b:x:what", "need B"]]);
  assert.equal(holdingsNeedsFromFlags(flags, 1).length, 1);
  assert.equal(holdingsNeedsFromFlags(Array.from({ length: 30 }, (_, i) => needFlag(`r${String(i).padStart(2, "0")}:x:what`, `need ${i}`))).length, MAX_HOLDINGS_NEEDS);
  assert.deepEqual(holdingsNeedsFromFlags(null), []);
});

test("readHoldingsNeeds reads only OPEN holdings-need flags through the shared reader", async () => {
  const calls = [];
  const readAll = async (table, cols, opts) => {
    calls.push(table);
    const q = { filters: [], in(c, v) { this.filters.push([c, v]); return this; } };
    opts.match(q);
    assert.ok(q.filters.some(([c, v]) => c === "created_by" && v.every((x) => x.startsWith("holdings-need:"))));
    assert.ok(q.filters.some(([c, v]) => c === "status" && v.includes("open")));
    return [needFlag("a:x:what", "need A")];
  };
  const needs = await readHoldingsNeeds({ readAll });
  assert.deepEqual(calls, ["integrity_flags"]);
  assert.equal(needs[0].need, "need A");
});

test("searchHoldingsNeeds: the need in words is the OpenAlex query; a failed search is recorded on its need and the others still run", async () => {
  const urls = [];
  let n = 0;
  const fetchStub = async (url) => {
    urls.push(String(url));
    if (n++ === 0) return { status: 500, statusText: "boom", ok: false, headers: { get: () => null }, json: async () => ({}), text: async () => "boom" };
    return { status: 200, statusText: "OK", ok: true, headers: { get: () => null }, json: async () => FIXTURE_OPENALEX_WORKS_RESPONSE };
  };
  const res = await searchHoldingsNeeds(
    [{ subject_ref: "a:x:what", need: "customs filing form for revised storage plans" }, { subject_ref: "b:x:what", need: "penalty schedule" }],
    { perNeed: 3 }, { fetch: fetchStub, maxRetries: 0, sleep: async () => {} },
  );
  assert.equal(new URL(urls[0]).searchParams.get("search"), "customs filing form for revised storage plans");
  assert.match(urls[0], /per_page=3/);
  assert.ok(res[0].error, "the failed need carries its error");
  assert.equal(res[0].candidates.length, 0);
  assert.equal(res[1].error, null);
  assert.ok(res[1].candidates.length > 0);
});

test("searchHoldingsNeeds: no needs, no calls", async () => {
  const urls = [];
  assert.deepEqual(await searchHoldingsNeeds([], {}, { fetch: okFetch(urls) }), []);
  assert.equal(urls.length, 0);
});

// ── lane G5-NEED: one reader, both need namespaces ────────────────────────────────────────────────────────
const termNeedFlag = (ref, need) => ({
  id: `f-${ref}`, subject_ref: ref, created_by: "term-need:standard", status: "open",
  recommended_actions: [{ action: "find-source", need, kind: "standard", term_key: "k" }],
});

test("readOpenNeeds reads open holdings-need AND term-need flags through the one reader, and reports how many it read before the cap", async () => {
  const readAll = async (_table, _cols, opts) => {
    const q = { filters: [], in(c, v) { this.filters.push([c, v]); return this; } };
    opts.match(q);
    const cb = q.filters.find(([c]) => c === "created_by")[1];
    assert.ok(cb.some((x) => x.startsWith("holdings-need:")) && cb.some((x) => x.startsWith("term-need:")));
    assert.ok(q.filters.some(([c, v]) => c === "status" && v.includes("open")));
    return [needFlag("a:x:what", "need A"), termNeedFlag("t-1", "ISO 14083 standard authoritative source"), termNeedFlag("t-2", "another standard authoritative source")];
  };
  const r = await readOpenNeeds({ readAll }, 2);
  assert.equal(r.read, 3);
  assert.equal(r.needs.length, 2, "bounded");
  const all = await readOpenNeeds({ readAll });
  assert.deepEqual(all.needs.map((n) => n.namespace ?? "holdings-need").sort(), ["holdings-need", "term-need", "term-need"]);
  assert.equal(all.needs.find((n) => n.subject_ref === "t-1").need, "ISO 14083 standard authoritative source");
});

test("readHoldingsNeeds is unchanged: holdings needs only", async () => {
  let seen = null;
  const readAll = async (_t, _c, opts) => {
    const q = { filters: [], in(c, v) { this.filters.push([c, v]); return this; } };
    opts.match(q);
    seen = q.filters.find(([c]) => c === "created_by")[1];
    return [];
  };
  await readHoldingsNeeds({ readAll });
  assert.ok(seen.every((x) => x.startsWith("holdings-need:")));
});

// Lane OPS-1 (chain-fire report F7): a green run can never be read as a live walk.
test("describeRunKind: the default and every non-live combination is a FIXTURE run with the exact banner", () => {
  for (const flags of [{}, { live: false, readNeedsFromDb: false }, { live: true, readNeedsFromDb: false }, { live: false, readNeedsFromDb: true }]) {
    const k = describeRunKind(flags);
    assert.equal(k.runMode, "fixture");
    assert.equal(k.openAlexLive, false);
    assert.equal(k.banner, "FIXTURE RUN: no live corpus; counts are fixture counts");
  }
  assert.equal(FIXTURE_RUN_BANNER, "FIXTURE RUN: no live corpus; counts are fixture counts");
});

test("describeRunKind: only --live together with --holdings-needs is a live_search run, and it never claims to be a fixture run", () => {
  const k = describeRunKind({ live: true, readNeedsFromDb: true });
  assert.equal(k.runMode, "live_search");
  assert.equal(k.openAlexLive, true);
  assert.equal(k.banner, LIVE_SEARCH_RUN_BANNER);
  assert.ok(!k.banner.includes("FIXTURE RUN"));
});

test("buildWalkerConfig: the artifact carries run_mode fixture and the banner, and config.mode stays dry (ledger and assemble-train read it)", () => {
  const c = buildWalkerConfig(describeRunKind({}), true);
  assert.equal(c.run_mode, "fixture");
  assert.equal(c.banner, FIXTURE_RUN_BANNER);
  assert.equal(c.mode, "dry");
  assert.equal(c.dispatch, true);
});
