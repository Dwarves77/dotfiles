// export-harness-ledger.test.mjs (lane R22, 2026-10-02). Fixture-driven, no database, no real fs write.
// node:test + node:assert/strict, no npm deps.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLedgerExport, runCli, DEFAULT_OUT_PATH } from "./export-harness-ledger.mjs";
import { HARNESS_LEDGER_EXPORT_PATH } from "./run-artifact.mjs";

test("buildLedgerExport sorts by family then run_id and carries config", () => {
  const rows = [
    { harness_family: "maintenance", run_id: "maintenance-run-002", started_at: "2026-10-01T00:00:00Z", finished_at: "2026-10-01T00:01:00Z", trigger: "workflow_dispatch", config: { step: "all", mode: "dry" } },
    { harness_family: "maintenance", run_id: "maintenance-run-001", started_at: "2026-09-28T00:00:00Z", finished_at: "2026-09-28T00:01:00Z", trigger: "workflow_dispatch", config: { step: "tier-opinions", mode: "apply" } },
    { harness_family: "mint", run_id: "mint-run-050", started_at: "2026-09-29T00:00:00Z", finished_at: null, trigger: "workflow_dispatch", config: {} },
  ];
  const out = buildLedgerExport(rows, "2026-10-02");
  assert.equal(out.counts.families, 2);
  assert.equal(out.counts.runs, 3);
  assert.deepEqual(out.rows.map((r) => r.run_id), ["maintenance-run-001", "maintenance-run-002", "mint-run-050"]);
  assert.equal(out.rows[0].config.step, "tier-opinions");
  assert.equal(out.rows[2].finished_at, null);
});

test("buildLedgerExport on an empty row set is still a valid, honest export", () => {
  const out = buildLedgerExport([], "2026-10-02");
  assert.deepEqual(out.rows, []);
  assert.equal(out.counts.families, 0);
  assert.equal(out.counts.runs, 0);
});

test("runCli: self-skips exit 2 when credentials are absent", async () => {
  const errors = [];
  const code = await runCli(["--out", "/tmp/x.json"], {
    errorLog: (m) => errors.push(m),
    loadEnv: () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    },
  });
  assert.equal(code, 2);
  assert.ok(errors.some((e) => /self-skip/.test(e)));
});

test("runCli DRY RUN (deps-injected readAllFn + writeFileFn, no real DB or fs): writes the export and logs the count", async () => {
  const logs = [];
  let written = null;
  const code = await runCli(["--out", "/fake/path.json"], {
    log: (m) => logs.push(m),
    loadEnv: () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fake.test";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-key";
    },
    readAllFn: async () => [
      { harness_family: "maintenance", run_id: "maintenance-run-005", started_at: "x", finished_at: "y", trigger: "workflow_dispatch", config: { step: "all" } },
    ],
    writeFileFn: (path, content) => {
      written = { path, content };
    },
    now: () => "2026-10-02",
  });
  assert.equal(code, 0);
  assert.ok(written);
  const parsed = JSON.parse(written.content);
  assert.equal(parsed.counts.runs, 1);
  assert.ok(logs.some((l) => /wrote .*1 run/.test(l)));
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

test("runCli: a DB read failure is reported, exit 1, never thrown", async () => {
  const errors = [];
  const code = await runCli(["--out", "/fake/path.json"], {
    errorLog: (m) => errors.push(m),
    loadEnv: () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fake.test";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-key";
    },
    readAllFn: async () => {
      throw new Error("simulated network failure");
    },
  });
  assert.equal(code, 1);
  assert.ok(errors.some((e) => /simulated network failure/.test(e)));
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

// ── governing_hash (lane GATE-3, 2026-10-08): the export row carries the governing-file hash F28 compares
// against a family's live hash. config.governing_hash wins (writeRunArtifact stamps it); a row landed before
// that stamp falls back to the harness_version column; a row with neither is null (never current). ──

test("buildLedgerExport: governing_hash comes from config.governing_hash, else harness_version, else null", () => {
  const rows = [
    { harness_family: "mint", run_id: "mint-run-003", started_at: "2026-10-03T00:00:00Z", harness_version: "sha256:aaaaaaaaaaaaaaaa", config: { governing_hash: "sha256:bbbbbbbbbbbbbbbb" } },
    { harness_family: "mint", run_id: "mint-run-002", started_at: "2026-10-02T00:00:00Z", harness_version: "sha256:cccccccccccccccc", config: {} },
    { harness_family: "mint", run_id: "mint-run-001", started_at: "2026-10-01T00:00:00Z", config: null },
  ];
  const out = buildLedgerExport(rows, "2026-10-08");
  assert.deepEqual(out.rows.map((r) => r.governing_hash), [null, "sha256:cccccccccccccccc", "sha256:bbbbbbbbbbbbbbbb"]);
});

test("runCli: the SELECT asks for harness_version (the governing_hash fallback) and DEFAULT_OUT_PATH is the readers' one path", async () => {
  let columns = null;
  const code = await runCli(["--out", "/fake/path.json"], {
    log: () => {},
    loadEnv: () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fake.test";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-key";
    },
    readAllFn: async (_table, cols) => {
      columns = cols;
      return [];
    },
    writeFileFn: () => {},
    now: () => "2026-10-08",
  });
  assert.equal(code, 0);
  assert.match(columns, /\bharness_version\b/);
  assert.equal(DEFAULT_OUT_PATH, HARNESS_LEDGER_EXPORT_PATH);
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});
