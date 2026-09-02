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
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = resolve(HERE, "refresh-published-price-statistics.mjs");

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

// ── default (dry) run: requirement 2, unmapped series reported by name ─────────────────────────────────

test("dry run (no flags): exit 0, reports 0 ratified / 6 pending, and names all 6 pending series in the summary — never a silent skip", () => {
  const res = runCli([]);
  assert.equal(res.status, 0, `expected exit 0, got ${res.status}. stderr: ${res.stderr}`);
  assert.match(res.stdout, /0 ratified entr(?:y|ies) and 6 pending \(unratified\)/);
  assert.match(res.stdout, /no ratified series->item mapping yet/);
  for (const key of SIX_SERIES_KEYS) {
    assert.ok(res.stdout.includes(key), `summary must name unmapped series ${key} — got: ${res.stdout}`);
  }
});

test("--apply with zero ratified entries also exits 0 without requiring DB creds — the unratified map IS the switch", () => {
  const res = runCli(["--apply"]);
  assert.equal(res.status, 0, `expected exit 0, got ${res.status}. stderr: ${res.stderr}`);
  assert.match(res.stdout, /no ratified series->item mapping yet/);
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
