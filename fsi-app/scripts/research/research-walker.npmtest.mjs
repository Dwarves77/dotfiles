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
} from "./research-walker.mjs";
import { FIXTURE_GREY_LIT_SOURCES, FIXTURE_OPENALEX_CANDIDATES } from "./fixtures/research-walker-fixtures.mjs";

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
