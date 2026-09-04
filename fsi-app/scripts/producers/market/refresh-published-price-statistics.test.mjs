// refresh-published-price-statistics.test.mjs — CLI-level proof for
// scripts/producers/market/refresh-published-price-statistics.mjs (lane PROD-FIX, 2026-09-02, ruling R-D
// mechanism).
//
// Complements src/__tests__/market-refresh-published-price-statistics.test.mjs (which proves
// deriveDisplayRows/unmappedSeriesKeys/buildProposedItemPayloads in-process, zero subprocess). This file
// proves the actual CLI: its two DRY, no-DB-creds-required paths --
//   1. the default summary line (Part B requirement 2: an unmapped/pending series is reported BY NAME in
//      the summary, never silently skipped), and
//   2. --propose-items (Part B requirement 3: prints the 6 record-grade mint payloads for ruling R-D).
// Neither path touches the database (SERIES_ITEM_MAP has zero ratified entries as committed, so the
// script exits before any readAll/guardedInsert call — see the script's own header), so both are safe to
// run as a real subprocess with no DB creds and no network, same posture ecb-fx-producer.test.mjs's own
// header states for its --input-bypassed dry-run tests.
//
// LOCATION: scripts/producers/*/*.test.mjs is a run-test-suite.sh glob (no-npm gate), same convention
// ecb-fx-producer.test.mjs and fetch-oil-bulletin.test.mjs already use in this directory.
//
// $0, spawns the real script as a subprocess — no network, no database.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = resolve(HERE, "refresh-published-price-statistics.mjs");
const LIVE_MAP_PATH = resolve(HERE, "../../../src/lib/market/series-item-map.mjs");

function runCli(args) {
  return spawnSync(process.execPath, [SCRIPT_PATH, ...args], { encoding: "utf8", env: process.env });
}

const SIX_SERIES_KEYS = [
  "eu-oil-bulletin:eurosuper-95",
  "eu-oil-bulletin:automotive-diesel",
  "eu-oil-bulletin:heating-gas-oil",
  "eu-oil-bulletin:lpg-motor-fuel",
  "eu-oil-bulletin:residual-fuel-oil-1pct",
  "eu-oil-bulletin:heavy-fuel-oil-3-5pct",
];

// ── fixture map (pending shape) ─────────────────────────────────────────────────────────────────────────
//
// series-item-map.mjs is now the RATIFIED live truth (ruling R-D landed, commit ef5602b6, 2026-09-04 — all
// six series carry a real item_id and status "ratified") and this lane's write set forbids touching it.
// The two tests below need the PRE-ratification shape (0 ratified / 6 pending) to prove the CLI's dry-run
// summary line and its --apply-without-creds posture, so they build their own fixture .mjs module — six
// pending entries, same key set the live parser emits — and point the CLI at it via --map-path (the flag
// this lane added to refresh-published-price-statistics.mjs for exactly this purpose; see that script's
// header). The live file is never written to by these tests.
function writePendingFixtureMapFile(dir) {
  const raw = Object.fromEntries(
    SIX_SERIES_KEYS.map((key) => [key, { item_id: null, status: "pending_R-D" }]),
  );
  const fixturePath = join(dir, "series-item-map.pending-fixture.mjs");
  writeFileSync(fixturePath, `export const SERIES_ITEM_MAP_RAW = ${JSON.stringify(raw, null, 2)};\n`, "utf8");
  return fixturePath;
}

// ── default (dry) run: requirement 2, unmapped series reported by name ─────────────────────────────────

test("dry run against a fixture --map-path with 6 pending entries: exit 0, reports 0 ratified / 6 pending, and names all 6 pending series in the summary — never a silent skip", () => {
  const dir = mkdtempSync(join(tmpdir(), "refresh-pps-test-"));
  try {
    const fixtureMapPath = writePendingFixtureMapFile(dir);
    const before = readFileSync(LIVE_MAP_PATH, "utf8");
    const res = runCli(["--map-path", fixtureMapPath]);
    assert.equal(res.status, 0, `expected exit 0, got ${res.status}. stderr: ${res.stderr}`);
    assert.match(res.stdout, /0 ratified entr(?:y|ies) and 6 pending \(unratified\)/);
    assert.match(res.stdout, /no ratified series->item mapping yet/);
    for (const key of SIX_SERIES_KEYS) {
      assert.ok(res.stdout.includes(key), `summary must name unmapped series ${key} — got: ${res.stdout}`);
    }
    assert.equal(readFileSync(LIVE_MAP_PATH, "utf8"), before, "must never touch the live (ratified) map file");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--apply against a fixture --map-path with 0 ratified entries also exits 0 without requiring DB creds — an unratified map IS the switch", () => {
  const dir = mkdtempSync(join(tmpdir(), "refresh-pps-test-"));
  try {
    const fixtureMapPath = writePendingFixtureMapFile(dir);
    const res = runCli(["--apply", "--map-path", fixtureMapPath]);
    assert.equal(res.status, 0, `expected exit 0, got ${res.status}. stderr: ${res.stderr}`);
    assert.match(res.stdout, /no ratified series->item mapping yet/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── new invariant (this lane, 2026-09-04): the ruling has landed, and holds from now on ────────────────
//
// Ruling R-D landed on this branch's base (commit ef5602b6): every oil-bulletin series in the LIVE
// series-item-map.mjs is now ratified. That is the invariant the CLI's default (no --map-path) run must
// report from now on — a future regression back to pending should fail this test, not ship silently. Also
// asserts the underlying live module directly (status "ratified", uuid-shaped item_id per non-underscore
// key), the same invariant ratify-series-items.test.mjs asserts for its own script.
test("invariant: the LIVE series-item-map.mjs is fully ratified — default CLI run reports 6 ratified / 0 pending, and every entry is status ratified with a uuid-shaped item_id (ruling R-D, ef5602b6)", async () => {
  const res = runCli([]);
  assert.equal(res.status, 0, `expected exit 0, got ${res.status}. stderr: ${res.stderr}`);
  assert.match(res.stdout, /6 ratified entr(?:y|ies) and 0 pending \(unratified\)/);
  assert.doesNotMatch(res.stdout, /no ratified series->item mapping yet/);

  const mapModule = await import(`file://${LIVE_MAP_PATH}`);
  const raw = mapModule.SERIES_ITEM_MAP_RAW;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const seriesKeys = Object.keys(raw).filter((k) => !k.startsWith("_"));
  assert.equal(seriesKeys.length, 6, "expected exactly the six oil-bulletin series");
  for (const key of seriesKeys) {
    assert.equal(raw[key].status, "ratified", `${key} must be status "ratified"`);
    assert.match(raw[key].item_id, UUID_RE, `${key}'s item_id must be uuid-shaped, got ${raw[key].item_id}`);
  }
});

// ── --propose-items: requirement 3, the 6 R-D mint payloads ────────────────────────────────────────────

test("--propose-items: exit 0, prints a summary line naming 6 drafted payloads, then a JSON array of exactly 6", () => {
  const res = runCli(["--propose-items"]);
  assert.equal(res.status, 0, `expected exit 0, got ${res.status}. stderr: ${res.stderr}`);
  assert.match(res.stdout, /--propose-items: 6 record-grade mint payload\(s\) drafted for ruling R-D/);
  assert.match(res.stdout, /none minted/);

  const jsonStart = res.stdout.indexOf("[");
  assert.ok(jsonStart >= 0, "expected a JSON array in stdout");
  const payloads = JSON.parse(res.stdout.slice(jsonStart));
  assert.equal(payloads.length, 6);
  assert.deepEqual(payloads.map((p) => p._series_key).sort(), [...SIX_SERIES_KEYS].sort());
});

test("--propose-items: every drafted payload carries item.grade 'record', a placeholder source.id, and the WSEQ-forward screen field", () => {
  const res = runCli(["--propose-items"]);
  const payloads = JSON.parse(res.stdout.slice(res.stdout.indexOf("[")));
  for (const p of payloads) {
    assert.equal(p.item.grade, "record");
    assert.equal(p.source.id, "PENDING-LIVE-SOURCES-LOOKUP");
    assert.deepEqual(p.screen, { verdict: "on_vertical", provenance: "reviewed", basis: "R-D ruling" });
  }
});

test("--propose-items never touches the database — no DB creds present in this test's env, exit 0 regardless", () => {
  const env = { ...process.env };
  delete env.NEXT_PUBLIC_SUPABASE_URL;
  delete env.SUPABASE_SERVICE_ROLE_KEY;
  const res = spawnSync(process.execPath, [SCRIPT_PATH, "--propose-items"], { encoding: "utf8", env });
  assert.equal(res.status, 0, `expected exit 0 with no DB creds, got ${res.status}. stderr: ${res.stderr}`);
});
