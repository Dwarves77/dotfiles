// research-walker.npmtest.mjs -- the actual mint-chokepoint pass-through proof for lane L7's acceptance
// test ("a dry run against the 3 named research-role sources produces candidate items that pass the
// existing mint chokepoint's gates"). Named `.npmtest.mjs`, not `.test.mjs`, because it needs jiti to
// resolve mint-item.ts's `@/` imports -- the lane-common-contract's own rule for this exact shape
// ("anything that needs jiti ... is a *.npmtest.mjs named in .github/workflows/discipline.yml's
// npm-deps step instead"). That step discovers every `fsi-app/**/*.npmtest.mjs` by a generic
// `git ls-files` glob (confirmed by reading run-test-suite.sh's own header before this file was added),
// so no edit to discipline.yml is needed to pick this file up.
//
// Mirrors mint-dryrun-equivalence.npmtest.mjs's own jiti+alias setup exactly (read in full before this
// file was written).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildFixtureSbClient,
  buildMintSeed,
  mintCandidateDryRun,
  resolveGreyLitSource,
  normalizeOpenAlexWork,
  runWalk,
} from "./research-walker.mjs";
import { loadHostVerdicts, HOST_VERDICTS_DIR } from "../maintenance/host-verdicts/load-host-verdicts.mjs";
import { join } from "node:path";
import {
  FIXTURE_GREY_LIT_SOURCES,
  FIXTURE_OPENALEX_CANDIDATES,
  FIXTURE_OPENALEX_PUBLISHER_CANDIDATES,
} from "./fixtures/research-walker-fixtures.mjs";

test("mint chokepoint: a grey-lit candidate whose source is registered would_mint under dryRun, and the dry run never inserts", async () => {
  const iea = FIXTURE_GREY_LIT_SOURCES[0];
  const resolved = await resolveGreyLitSource(iea, { mode: "dry" });
  assert.equal(resolved.ok, true);

  const sb = buildFixtureSbClient({ registeredSources: [{ id: resolved.source_id, url: iea.url }] });
  const seed = buildMintSeed({ title: "IEA transport outlook (fixture)", sourceUrl: iea.url }, { sourceId: resolved.source_id });
  const result = await mintCandidateDryRun(sb, seed);

  assert.equal(result.ok, true, result.error);
  assert.equal(result.dryRun, true);
  assert.equal(result.action, "minted");
  assert.equal(sb.insertedSeed(), null, "dryRun never inserts -- the single INSERT is behind the dry-run boundary");
});

test("mint chokepoint: ALL 3 named grey-lit sources produce a would_mint candidate under dryRun", async () => {
  for (const src of FIXTURE_GREY_LIT_SOURCES) {
    const resolved = await resolveGreyLitSource(src, { mode: "dry" });
    assert.equal(resolved.ok, true, `${src.name} must classify through the institution class table`);
    const sb = buildFixtureSbClient({ registeredSources: [{ id: resolved.source_id, url: src.url }] });
    const seed = buildMintSeed({ title: `Candidate from ${src.name} (fixture)`, sourceUrl: src.url }, { sourceId: resolved.source_id });
    const result = await mintCandidateDryRun(sb, seed);
    assert.equal(result.ok, true, `${src.name}: ${result.error ?? ""}`);
    assert.equal(result.action, "minted");
  }
});

test("mint chokepoint: an OpenAlex candidate with NO registered source is correctly rejected unsourced (the source-link invariant), not silently minted", async () => {
  const candidate = normalizeOpenAlexWork(FIXTURE_OPENALEX_CANDIDATES[0]);
  assert.ok(candidate);
  const sb = buildFixtureSbClient({ registeredSources: [] }); // no source registered for this DOI host
  const seed = buildMintSeed(candidate); // no sourceId passed -- honest: this lane never auto-registers an OpenAlex publisher
  const result = await mintCandidateDryRun(sb, seed);
  assert.equal(result.ok, false);
  assert.equal(result.action, "unsourced");
  assert.match(result.error, /source-link invariant/);
});

test("mint chokepoint: a candidate with NO source_url and NO source_id is rejected unsourced (same gate, the degenerate case)", async () => {
  const sb = buildFixtureSbClient({ registeredSources: [] });
  const seed = buildMintSeed({ title: "No URL", sourceUrl: "" });
  const result = await mintCandidateDryRun(sb, seed);
  assert.equal(result.ok, false);
  assert.equal(result.action, "unsourced");
});

// ── lane S1-D: whole-walk acceptance on the publisher-host fixtures (dry, no network) ────────────────────

async function walkPublisherFixtures() {
  const verdicts = loadHostVerdicts({ files: [join(HOST_VERDICTS_DIR, "host-verdicts-000.fixture.json")] }).verdicts;
  return runWalk({
    greyLitSources: [],
    openAlexCandidatesOverride: FIXTURE_OPENALEX_PUBLISHER_CANDIDATES.map(normalizeOpenAlexWork),
    mode: "dry",
    hostVerdicts: verdicts,
  });
}

test("walk: a built-in-placed publisher reports would_register at the class tier and would_mint", async () => {
  const r = await walkPublisherFixtures();
  const url = "https://eprints.soton.ac.uk/example-rail-modal-shift";
  const outcomes = r.perItem.filter((i) => i.id === url).map((i) => i.outcome);
  assert.deepEqual(outcomes, ["would_register (tier 4, built-in rule)", "would_mint:minted"]);
});

test("walk: a publisher placed only by a fixture verdict does the same and names the verdict batch", async () => {
  const r = await walkPublisherFixtures();
  const url = "https://unplaced-example.test/papers/scope3-survey";
  const outcomes = r.perItem.filter((i) => i.id === url).map((i) => i.outcome);
  assert.deepEqual(outcomes, ["would_register (tier 4, host verdict host-verdicts-000.fixture)", "would_mint:minted"]);
});

test("walk: an unplaced publisher is residue, its host is listed, and it counts as no rejection", async () => {
  const r = await walkPublisherFixtures();
  const url = "https://unlisted-journal.example/articles/42";
  const outcomes = r.perItem.filter((i) => i.id === url).map((i) => i.outcome);
  assert.deepEqual(outcomes, ["residue:awaiting host verdict batch"]);
  assert.deepEqual(r.metrics.unplaced_hosts.map((h) => h.host), ["unlisted-journal.example"]);
  assert.equal(r.metrics.residue_awaiting_host_verdict, 1);
  assert.equal(r.metrics.rejected_unsourced, 0);
  assert.equal(r.metrics.would_register, 2);
  assert.equal(r.metrics.would_mint, 2);
});

test("walk: the two original DOI fixtures, landing-page host placed and DOI-only unresolved, never list doi.org as unplaced", async () => {
  const r = await runWalk({
    greyLitSources: [],
    openAlexCandidatesOverride: FIXTURE_OPENALEX_CANDIDATES.map(normalizeOpenAlexWork).filter(Boolean),
    mode: "dry",
    hostVerdicts: new Map(),
  });
  const byId = (u) => r.perItem.filter((i) => i.id === u).map((i) => i.outcome);
  assert.deepEqual(byId("https://its.example-univ.edu/freight-decarb-corridors"), ["would_register (tier 4, built-in rule)", "would_mint:minted"]);
  assert.deepEqual(byId("https://doi.org/10.1000/example-marine-fuels"), ["residue:publisher host unresolved from DOI"]);
  assert.deepEqual(r.metrics.unplaced_hosts, []);
  assert.equal(r.metrics.rejected_unsourced, 0);
});

// ── lane L4-B: whole-walk with open holdings-need targets as search inputs (dry, no network) ─────────────

test("walk: each holdings need is searched in words, its candidates enter the same register-rate-mint dry-run path, and metrics say so", async () => {
  const queries = [];
  const fetchStub = async (url) => {
    queries.push(new URL(String(url)).searchParams.get("search"));
    return { status: 200, statusText: "OK", ok: true, headers: { get: () => null }, json: async () => ({ results: FIXTURE_OPENALEX_PUBLISHER_CANDIDATES }) };
  };
  const verdicts = loadHostVerdicts({ files: [join(HOST_VERDICTS_DIR, "host-verdicts-000.fixture.json")] }).verdicts;
  const r = await runWalk({
    greyLitSources: [],
    openAlexCandidatesOverride: [],
    openAlexDeps: { fetch: fetchStub },
    holdingsNeeds: [
      { subject_ref: "a:regulations:what", need: "customs filing form for storage plans" },
      { subject_ref: "b:regulations:comply", need: "penalty schedule for late filing" },
    ],
    mode: "dry",
    hostVerdicts: verdicts,
  });
  assert.equal(queries.length, 2);
  assert.equal(queries[0], "customs filing form for storage plans");
  assert.equal(r.metrics.holdings_needs_searched, 2);
  assert.equal(r.metrics.holdings_need_candidates, FIXTURE_OPENALEX_PUBLISHER_CANDIDATES.length, "a url found for two needs is one candidate");
  assert.equal(r.metrics.holdings_needs_without_candidates, 0);
  assert.ok(r.perItem.some((i) => i.id === "need:a:regulations:what" && /need-searched \(\d+ candidate/.test(i.outcome) && i.verdict === "customs filing form for storage plans"));
  assert.ok(r.perItem.some((i) => /would_mint/.test(i.outcome)), "found sources run the real mint chokepoint (dry)");
  assert.equal(r.metrics.mode, "dry");
});

test("walk: needs are bounded by maxHoldingsNeeds, and no needs leaves the walk exactly as before", async () => {
  const urls = [];
  const fetchStub = async (url) => { urls.push(String(url)); return { status: 200, statusText: "OK", ok: true, headers: { get: () => null }, json: async () => ({ results: [] }) }; };
  const needs = Array.from({ length: 5 }, (_, i) => ({ subject_ref: `r${i}:x:what`, need: `need ${i}` }));
  const r = await runWalk({ greyLitSources: [], openAlexCandidatesOverride: [], openAlexDeps: { fetch: fetchStub }, holdingsNeeds: needs, maxHoldingsNeeds: 2, mode: "dry", hostVerdicts: new Map() });
  assert.equal(urls.length, 2);
  assert.equal(r.metrics.holdings_needs_searched, 2);
  assert.equal(r.metrics.holdings_needs_without_candidates, 2);
  const plain = await runWalk({ greyLitSources: [], openAlexCandidatesOverride: [], mode: "dry", hostVerdicts: new Map() });
  assert.equal(plain.metrics.holdings_needs_searched, 0);
});

// ── lane G5-NEED: term needs are searched through the same path, and the artifact counts say so ──────────

test("walk: holdings needs and term needs are both read, searched and counted (needs read, searched, candidates)", async () => {
  const queries = [];
  const fetchStub = async (url) => {
    queries.push(new URL(String(url)).searchParams.get("search"));
    return { status: 200, statusText: "OK", ok: true, headers: { get: () => null }, json: async () => ({ results: FIXTURE_OPENALEX_PUBLISHER_CANDIDATES }) };
  };
  const verdicts = loadHostVerdicts({ files: [join(HOST_VERDICTS_DIR, "host-verdicts-000.fixture.json")] }).verdicts;
  const r = await runWalk({
    greyLitSources: [],
    openAlexCandidatesOverride: [],
    openAlexDeps: { fetch: fetchStub },
    holdingsNeeds: [
      { subject_ref: "a:regulations:what", need: "customs filing form for storage plans" },
      { subject_ref: "t-1", need: "ISO 14083 standard authoritative source", namespace: "term-need", kind: "standard" },
      { subject_ref: "lineage:2019/1242", need: "2019/1242 standard authoritative source", namespace: "term-need", kind: "standard" },
    ],
    needsRead: 7,
    mode: "dry",
    hostVerdicts: verdicts,
  });
  assert.deepEqual(queries.sort(), ["2019/1242 standard authoritative source", "ISO 14083 standard authoritative source", "customs filing form for storage plans"]);
  assert.equal(r.metrics.needs_read, 7);
  assert.equal(r.metrics.holdings_needs_searched, 3, "total needs searched, both namespaces");
  assert.equal(r.metrics.term_needs_searched, 2);
  assert.equal(r.metrics.term_need_candidates, 0, "the candidate urls were already found for the first need, so they are not new for the term needs");
  assert.ok(r.perItem.some((i) => i.id === "need:t-1" && /need-searched/.test(i.outcome)));
});

test("walk: a term need that is the only need contributes its own candidates to the term-need count", async () => {
  const fetchStub = async () => ({ status: 200, statusText: "OK", ok: true, headers: { get: () => null }, json: async () => ({ results: FIXTURE_OPENALEX_PUBLISHER_CANDIDATES }) });
  const r = await runWalk({
    greyLitSources: [], openAlexCandidatesOverride: [], openAlexDeps: { fetch: fetchStub },
    holdingsNeeds: [{ subject_ref: "t-9", need: "x standard authoritative source", namespace: "term-need", kind: "standard" }],
    mode: "dry", hostVerdicts: new Map(),
  });
  assert.equal(r.metrics.term_needs_searched, 1);
  assert.equal(r.metrics.term_need_candidates, FIXTURE_OPENALEX_PUBLISHER_CANDIDATES.length);
  assert.equal(r.metrics.needs_read, 1, "defaults to the needs searched when the caller gives no read count");
});
