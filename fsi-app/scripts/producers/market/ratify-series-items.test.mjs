// Proof for scripts/producers/market/ratify-series-items.mjs (Lane RD, ruling R-D, 2026-09-03).
// Run: node --test scripts/producers/market/ratify-series-items.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  indexPerItemById,
  ratificationForSeries,
  ratifySeriesItemMap,
  renderSeriesItemMapFile,
} from "./ratify-series-items.mjs";
import { loadSeriesItemMap, isRatified } from "../../../src/lib/market/refresh-published-price-statistics.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const FIXTURE_MAP = Object.freeze({
  "eu-oil-bulletin:eurosuper-95": {
    item_id: null,
    status: "pending_R-D",
    proposed_item: { title: "T1", source_url: "https://example.org/bulletin", item_type: "market_signal" },
  },
  "eu-oil-bulletin:automotive-diesel": {
    item_id: null,
    status: "pending_R-D",
    proposed_item: { title: "T2", source_url: "https://example.org/bulletin", item_type: "market_signal" },
  },
  "eu-oil-bulletin:already-ratified": {
    item_id: "11111111-1111-1111-1111-111111111111",
    status: "ratified",
    proposed_item: { title: "T3", source_url: "https://example.org/bulletin", item_type: "market_signal" },
  },
  "_comment": "documentation key, never a series entry",
});

function artifactWith(perItem) {
  return { harness_family: "mint", run_id: "mint-run-999", per_item: perItem };
}

// ── indexPerItemById ─────────────────────────────────────────────────────────────────────────────────

test("indexPerItemById keys by id, last entry wins on a duplicate id", () => {
  const idx = indexPerItemById({
    per_item: [
      { id: "a", outcome: "apply_ready" },
      { id: "a", outcome: "minted_verified", item_id: "x" },
    ],
  });
  assert.equal(idx.get("a").outcome, "minted_verified");
});

test("indexPerItemById tolerates a missing/empty per_item array", () => {
  assert.equal(indexPerItemById({}).size, 0);
  assert.equal(indexPerItemById({ per_item: [] }).size, 0);
});

// ── ratificationForSeries ────────────────────────────────────────────────────────────────────────────

test("ratifies only on outcome minted_verified with a real item_id", () => {
  const perItemById = new Map([["k", { id: "k", outcome: "minted_verified", item_id: "uuid-1" }]]);
  const result = ratificationForSeries({ item_id: null, status: "pending_R-D" }, "k", perItemById);
  assert.deepEqual(result, { action: "ratify", item_id: "uuid-1" });
});

test("never ratifies on minted_unverified — an unverified item must not become a visible display row", () => {
  const perItemById = new Map([["k", { id: "k", outcome: "minted_unverified", item_id: "uuid-1" }]]);
  const result = ratificationForSeries({ item_id: null, status: "pending_R-D" }, "k", perItemById);
  assert.deepEqual(result, { action: "skip", reason: "outcome_not_verified", outcome: "minted_unverified" });
});

for (const outcome of ["apply_failed", "not_applied_holder_conflict", "validation_failed", "build_failed"]) {
  test(`never ratifies on outcome ${outcome}`, () => {
    const perItemById = new Map([["k", { id: "k", outcome, item_id: null }]]);
    const result = ratificationForSeries({ item_id: null, status: "pending_R-D" }, "k", perItemById);
    assert.equal(result.action, "skip");
    assert.equal(result.reason, "outcome_not_verified");
  });
}

test("reports not_found_in_artifact when this artifact has no per_item entry for the series", () => {
  const result = ratificationForSeries({ item_id: null, status: "pending_R-D" }, "missing-key", new Map());
  assert.deepEqual(result, { action: "skip", reason: "not_found_in_artifact" });
});

test("an already-ratified entry is left alone, never re-derived from a later run", () => {
  const perItemById = new Map([["k", { id: "k", outcome: "minted_verified", item_id: "uuid-2" }]]);
  const result = ratificationForSeries({ item_id: "uuid-1", status: "ratified" }, "k", perItemById);
  assert.deepEqual(result, { action: "skip", reason: "already_ratified" });
});

// ── ratifySeriesItemMap (the whole-map pass) ─────────────────────────────────────────────────────────

test("ratifies exactly the series that reached minted_verified, leaves the rest and the _comment key untouched", () => {
  const artifact = artifactWith([
    { id: "eu-oil-bulletin:eurosuper-95", outcome: "minted_verified", item_id: "uuid-eurosuper" },
    { id: "eu-oil-bulletin:automotive-diesel", outcome: "apply_failed", item_id: null },
  ]);
  const { updated, dispositions } = ratifySeriesItemMap(FIXTURE_MAP, artifact);

  assert.equal(updated["eu-oil-bulletin:eurosuper-95"].item_id, "uuid-eurosuper");
  assert.equal(updated["eu-oil-bulletin:eurosuper-95"].status, "ratified");
  assert.equal(updated["eu-oil-bulletin:automotive-diesel"].item_id, null);
  assert.equal(updated["eu-oil-bulletin:automotive-diesel"].status, "pending_R-D");
  assert.deepEqual(updated["eu-oil-bulletin:already-ratified"], FIXTURE_MAP["eu-oil-bulletin:already-ratified"]);
  assert.equal(updated._comment, FIXTURE_MAP._comment);

  const ratified = dispositions.filter((d) => d.action === "ratified");
  assert.equal(ratified.length, 1);
  assert.equal(ratified[0].series_key, "eu-oil-bulletin:eurosuper-95");
});

test("never mutates its input map (pure)", () => {
  const artifact = artifactWith([{ id: "eu-oil-bulletin:eurosuper-95", outcome: "minted_verified", item_id: "uuid-x" }]);
  const before = JSON.stringify(FIXTURE_MAP);
  ratifySeriesItemMap(FIXTURE_MAP, artifact);
  assert.equal(JSON.stringify(FIXTURE_MAP), before);
});

test("the ratified map, loaded through the SAME loadSeriesItemMap/isRatified the app uses, reports the series as ratified", () => {
  const artifact = artifactWith([{ id: "eu-oil-bulletin:eurosuper-95", outcome: "minted_verified", item_id: "uuid-y" }]);
  const { updated } = ratifySeriesItemMap(FIXTURE_MAP, artifact);
  const loaded = loadSeriesItemMap(updated);
  const entry = loaded.find(([k]) => k === "eu-oil-bulletin:eurosuper-95")[1];
  assert.equal(isRatified(entry), true);
  const stillPending = loaded.find(([k]) => k === "eu-oil-bulletin:automotive-diesel")[1];
  assert.equal(isRatified(stillPending), false);
});

// ── renderSeriesItemMapFile (the real file's header preserved byte-for-byte) ────────────────────────

test("renderSeriesItemMapFile preserves everything before the export marker verbatim", () => {
  const original = "// a header comment\n// second line\nexport const SERIES_ITEM_MAP_RAW = Object.freeze({\n  \"old\": true\n});\n";
  const out = renderSeriesItemMapFile(original, { new: true });
  assert.match(out, /^\/\/ a header comment\n\/\/ second line\n/);
  assert.doesNotMatch(out, /"old"/);
  assert.match(out, /"new": true/);
});

test("renderSeriesItemMapFile throws (never guesses) when the export marker is missing", () => {
  assert.throws(() => renderSeriesItemMapFile("// no marker here\n", {}), /could not find/);
});

test("renderSeriesItemMapFile against the REAL series-item-map.mjs file's header round-trips byte-identical when nothing changed", async () => {
  const realPath = resolve(HERE, "../../../src/lib/market/series-item-map.mjs");
  const originalText = readFileSync(realPath, "utf8");
  const marker = "export const SERIES_ITEM_MAP_RAW = Object.freeze(";
  const idx = originalText.indexOf(marker);
  const originalHeader = originalText.slice(0, idx);
  // Re-render with the SAME raw object the file already exports (loaded via the real module, not a
  // regex slice) — proves this script's header-preservation is exact against the real file, not just a
  // small fixture, without hand-parsing the object literal a second way.
  const mapModule = await import(`file://${realPath}`);
  const rendered = renderSeriesItemMapFile(originalText, mapModule.SERIES_ITEM_MAP_RAW);
  assert.equal(rendered.slice(0, originalHeader.length), originalHeader);
});

// ── end-to-end: dry run against a real synthetic mint-run artifact file AND a fixture map file ─────────
//
// series-item-map.mjs is now the RATIFIED live truth (ruling R-D landed, commit ef5602b6, 2026-09-04 —
// all six oil-bulletin series carry a real item_id and status "ratified") and this lane's write set
// forbids touching it. So this end-to-end CLI test builds its OWN fixture map file — six pending entries,
// the pre-ratification shape — and points the CLI at it via --map-path (the flag ratify-series-items.mjs
// already exposed for exactly this). The live file is still read (via mapModule below is not needed here;
// the byte-identity assertion below reads it directly) to prove the CLI, run against the fixture, never
// touches the real file at all.
function writeFixtureMapFile(dir) {
  const fixturePath = join(dir, "series-item-map.fixture.mjs");
  writeFileSync(
    fixturePath,
    `export const SERIES_ITEM_MAP_RAW = ${JSON.stringify(FIXTURE_MAP, null, 2)};\n`,
    "utf8",
  );
  return fixturePath;
}

test("CLI --mint-run dry run against a fixture artifact AND a fixture --map-path: reports ratifications, writes nothing, never touches the live (ratified) map file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ratify-series-items-test-"));
  const artifactPath = join(dir, "mint-run-fixture.json");
  const livePath = resolve(HERE, "../../../src/lib/market/series-item-map.mjs");
  try {
    const fixtureMapPath = writeFixtureMapFile(dir);
    writeFileSync(
      artifactPath,
      JSON.stringify(artifactWith([{ id: "eu-oil-bulletin:eurosuper-95", outcome: "minted_verified", item_id: "uuid-cli" }])),
      "utf8",
    );
    const before = readFileSync(livePath, "utf8");
    const { execFileSync } = await import("node:child_process");
    const out = execFileSync(
      process.execPath,
      [resolve(HERE, "ratify-series-items.mjs"), "--mint-run", artifactPath, "--map-path", fixtureMapPath],
      { encoding: "utf8" },
    );
    assert.match(out, /RATIFY {2}eu-oil-bulletin:eurosuper-95 -> item_id=uuid-cli/);
    assert.match(out, /DRY RUN — nothing written/);
    const after = readFileSync(livePath, "utf8");
    assert.equal(after, before, "a dry run against a fixture --map-path must never touch the real series-item-map.mjs file");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── new invariant (this lane, 2026-09-04): the ruling has landed, and holds from now on ────────────────
//
// Ruling R-D landed on this branch's base (commit ef5602b6): every oil-bulletin series in the LIVE
// series-item-map.mjs is now ratified — a real item_id (uuid-shaped) and status "ratified". That is no
// longer a transient state a test should assume away; it is the invariant the live file must uphold going
// forward. A future regression (someone hand-editing an entry back to pending, or a bad --apply run) should
// fail a test, not silently ship. This reads the REAL file, not a fixture.
test("invariant: every non-underscore entry in the LIVE series-item-map.mjs is ratified with a uuid-shaped item_id (ruling R-D, ef5602b6)", async () => {
  const realPath = resolve(HERE, "../../../src/lib/market/series-item-map.mjs");
  const mapModule = await import(`file://${realPath}`);
  const raw = mapModule.SERIES_ITEM_MAP_RAW;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const seriesKeys = Object.keys(raw).filter((k) => !k.startsWith("_"));
  assert.equal(seriesKeys.length, 6, "expected exactly the six oil-bulletin series");
  for (const key of seriesKeys) {
    const entry = raw[key];
    assert.equal(entry.status, "ratified", `${key} must be status "ratified"`);
    assert.match(entry.item_id, UUID_RE, `${key}'s item_id must be uuid-shaped, got ${entry.item_id}`);
    assert.equal(isRatified(entry), true, `${key} must satisfy isRatified()`);
  }
});
