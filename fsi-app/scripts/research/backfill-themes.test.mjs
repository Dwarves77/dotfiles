// backfill-themes.test.mjs - dry-run fixture tests for scripts/research/backfill-themes.mjs (lane L8,
// 2026-10-02). No live LLM call, no DB credential, anywhere in this file: every `streamFn` below is a
// local fake standing in for the canonical `streamMessagesText` call (discipline rule 016 - a script
// never builds its own Anthropic request). Plain ESM / node:test / node-builtin imports only, so this
// file can sit in the no-npm discipline glob rather than needing a `*.npmtest.mjs` carve-out.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyOne,
  classifyBatch,
  patchFor,
  themeCardsFromResults,
  recordDryHarnessRun,
  main,
  ENABLED,
  UNCLASSIFIED,
} from "./backfill-themes.mjs";
import { DB_THEME_VALUE_LIST } from "../../src/lib/agent/metadata-vocab.ts";
import { HAIKU_MODEL } from "../../src/lib/llm/model-ids.mjs";
import { NULL_THEME_RESEARCH_FINDINGS, fakeStream } from "./fixtures/backfill-themes-fixtures.mjs";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function streamReturning(theme, confidence = 0.9, rationale = "test rationale") {
  return async () => ({ text: JSON.stringify({ theme, confidence, rationale }), stopReason: "end_turn", usage: {} });
}

test("ENABLED is false - R14 hold, this lane does not run the live pass", () => {
  assert.equal(ENABLED, false);
});

test("the fixture population is sized to the DB-executor-confirmed live count (47)", () => {
  assert.equal(NULL_THEME_RESEARCH_FINDINGS.length, 47);
});

test("classifyOne accepts a DB-vocabulary theme", async () => {
  const rec = await classifyOne(
    { id: "x1", title: "t", text: "SAF feedstock" },
    { apiKey: "unused", streamFn: streamReturning("fuels_saf") },
  );
  assert.equal(rec.theme, "fuels_saf");
  assert.ok(DB_THEME_VALUE_LIST.includes(rec.theme));
});

test("classifyOne accepts the honest unclassified outcome - never a forced pick", async () => {
  const rec = await classifyOne(
    { id: "x2", title: "t", text: "no sustainability content" },
    { apiKey: "unused", streamFn: streamReturning(UNCLASSIFIED, 0.3, "no theme content") },
  );
  assert.equal(rec.theme, UNCLASSIFIED);
});

test("classifyOne rejects a theme outside the closed vocabulary (never a hand-copied literal list - this is the live import)", async () => {
  await assert.rejects(
    () =>
      classifyOne(
        { id: "x3", title: "t", text: "t" },
        { apiKey: "unused", streamFn: streamReturning("not_a_real_theme") },
      ),
    /malformed classification shape/,
  );
});

test("classifyOne rejects a malformed response (missing confidence/rationale)", async () => {
  const badStream = async () => ({ text: JSON.stringify({ theme: "fuels_saf" }), stopReason: "end_turn", usage: {} });
  await assert.rejects(() => classifyOne({ id: "x4", title: "t", text: "t" }, { apiKey: "unused", streamFn: badStream }));
});

test("classifyOne propagates a stream failure honestly rather than swallowing it", async () => {
  const failStream = async () => { throw new Error("ANTHROPIC_TRANSIENT (status 429)"); };
  await assert.rejects(() => classifyOne({ id: "x5", title: "t", text: "t" }, { apiKey: "unused", streamFn: failStream }), /429/);
});

test("classifyBatch never throws on a per-item failure - one bad row becomes an error outcome, not an aborted batch", async () => {
  const items = [
    { id: "a", title: "ok", text: "ok" },
    { id: "b", title: "bad", text: "bad" },
  ];
  let calls = 0;
  const classifyFn = async (item) => {
    calls += 1;
    if (item.id === "b") throw new Error("boom");
    return { theme: "fuels_saf", confidence: 0.9, rationale: "r" };
  };
  const results = await classifyBatch(items, classifyFn);
  assert.equal(calls, 2);
  assert.equal(results.find((r) => r.id === "a").outcome, "classified");
  assert.equal(results.find((r) => r.id === "b").outcome, "error");
  assert.match(results.find((r) => r.id === "b").error, /boom/);
});

test("patchFor: a classified theme writes the theme and clears theme_candidate", () => {
  assert.deepEqual(patchFor({ theme: "carbon_markets" }), { theme: "carbon_markets", theme_candidate: null });
});

test("patchFor: unclassified leaves theme NULL and banks theme_candidate (migration 136 capture-not-null) - never a forced non-null theme", () => {
  assert.deepEqual(patchFor({ theme: UNCLASSIFIED }), { theme: null, theme_candidate: UNCLASSIFIED });
});

test("main(): --apply is recognised only to refuse it (R14 hold); no fetch, no DB call happens", async () => {
  let fetchCalled = false;
  const out = await main(["node", "backfill-themes.mjs", "--apply"], {
    classifyFn: async () => {
      fetchCalled = true;
      return { theme: "fuels_saf", confidence: 0.9, rationale: "r" };
    },
  });
  assert.equal(out.refused, true);
  assert.equal(fetchCalled, false);
});

test("main(): dry run against the real fixture module classifies every one of the 47 rows with no throw", async () => {
  const out = await main(["node", "backfill-themes.mjs"], {
    fixturesModule: { NULL_THEME_RESEARCH_FINDINGS, fakeStream },
  });
  assert.equal(out.results.length, 47);
  for (const r of out.results) {
    assert.equal(r.outcome, "classified", `row ${r.id} should classify cleanly against the fixture fake: ${r.error ?? ""}`);
    assert.ok(r.theme === UNCLASSIFIED || DB_THEME_VALUE_LIST.includes(r.theme));
  }
});

test("main(): the fixture dry run's own fake correctly recovers each row's expected theme from its text (sanity on the fixture, not just the script)", async () => {
  const out = await main(["node", "backfill-themes.mjs"], {
    fixturesModule: { NULL_THEME_RESEARCH_FINDINGS, fakeStream },
  });
  const byId = new Map(out.results.map((r) => [r.id, r]));
  for (const fixture of NULL_THEME_RESEARCH_FINDINGS) {
    assert.equal(byId.get(fixture.id).theme, fixture.expectTheme);
  }
});

// Confirmation 2 (coordinator, 2026-10-02): the canonical-path Haiku call reads its model id from the
// shared config the other producers use (src/lib/llm/model-ids.mjs / haiku-classify.ts), never a
// hardcoded literal at the call site.
test("the live request body's model field is the shared HAIKU_MODEL constant, not a re-typed literal", async () => {
  let capturedModel = null;
  const captureStream = async ({ body }) => {
    capturedModel = body.model;
    return streamReturning("fuels_saf")();
  };
  await classifyOne({ id: "m1", title: "t", text: "t" }, { apiKey: "unused", streamFn: captureStream });
  assert.equal(capturedModel, HAIKU_MODEL);
  assert.equal(HAIKU_MODEL, "claude-haiku-4-5-20251001"); // the known-good value, confirmed via the import, not asserted blind
});

// Confirmation 1 (coordinator, 2026-10-02, rule 17): the backfill records a harness_runs row via
// record-harness-run.mjs and fires its downstream (the Research theme facet data path).
test("themeCardsFromResults: buckets classified rows by theme and counts unclassified separately, ignoring error rows", () => {
  const results = [
    { id: "a", outcome: "classified", theme: "fuels_saf" },
    { id: "b", outcome: "classified", theme: "fuels_saf" },
    { id: "c", outcome: "classified", theme: UNCLASSIFIED },
    { id: "d", outcome: "error", error: "boom" },
  ];
  assert.deepEqual(themeCardsFromResults(results), { themed: { fuels_saf: 2 }, unclassifiedCount: 1 });
});

test("recordDryHarnessRun: writes a valid run artifact + trace file to an injected tmp dir, and calls recordHarnessRun against an injected fake client (no real DB, no real repo-tree write)", async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "theme-backfill-harness-test-"));
  const results = [
    { id: "a", outcome: "classified", theme: "fuels_saf", confidence: 0.9, rationale: "r" },
    { id: "b", outcome: "classified", theme: UNCLASSIFIED, confidence: 0.3, rationale: "r" },
  ];
  let insertCalled = false;
  const fakeSb = {
    from(table) {
      assert.equal(table, "harness_runs");
      return {
        insert: async (row) => {
          insertCalled = true;
          assert.match(row.run_id, /^theme-backfill-run-\d{3}$/);
          return { error: null };
        },
      };
    },
  };
  const out = await recordDryHarnessRun(results, {
    harnessRunsDir: tmpDir,
    fsiRoot: dirname(dirname(dirname(fileURLToPath(import.meta.url)))),
    log: () => {},
    sb: fakeSb,
    readAllFn: async () => [],
  });
  assert.equal(insertCalled, true);
  assert.equal(out.outcome.ok, true);
  assert.deepEqual(out.downstream, { themed: { fuels_saf: 1 }, unclassifiedCount: 1 });
  assert.ok(existsSync(out.artifactPath), "run artifact file should exist on disk");
  const artifact = JSON.parse(readFileSync(out.artifactPath, "utf8"));
  assert.equal(artifact.harness_family, "theme-backfill");
  assert.equal(artifact.metrics.downstream_unclassified_count, 1);
  rmSync(tmpDir, { recursive: true, force: true });
});

test("main(): --fire-harness is opt-in - a plain dry run (no flag) never calls recordDryHarnessRun", async () => {
  let called = false;
  await main(["node", "backfill-themes.mjs"], {
    fixturesModule: { NULL_THEME_RESEARCH_FINDINGS, fakeStream },
    recordDryHarnessRun: async () => { called = true; },
  });
  assert.equal(called, false);
});

test("main(): --fire-harness invokes recordDryHarnessRun with this run's results", async () => {
  let receivedResults = null;
  const out = await main(["node", "backfill-themes.mjs", "--fire-harness"], {
    fixturesModule: { NULL_THEME_RESEARCH_FINDINGS, fakeStream },
    recordDryHarnessRun: async (results) => {
      receivedResults = results;
      return { fired: true };
    },
  });
  assert.equal(receivedResults.length, 47);
  assert.deepEqual(out.harness, { fired: true });
});
