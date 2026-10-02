// read-brief-export-queue.test.mjs (lane R22, 2026-10-02). Fixture-driven, no database, no fs.
// node:test + node:assert/strict, no npm deps.

import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPendingList, resolveQueueContent, runCli } from "./read-brief-export-queue.mjs";

// ── pure helpers ─────────────────────────────────────────────────────────────────────────────────

test("formatPendingList: empty queue reads as caught up, not broken", () => {
  const lines = formatPendingList([]);
  assert.match(lines[0], /caught up/);
});

test("formatPendingList: sorts oldest run_id first and shows ids/parts counts", () => {
  const rows = [
    { run_id: "brief-export-run-002", config: { mint_run_id: "mint-run-050" }, per_item: [{ id: "a" }], inputs_ref: [{ part: 1 }] },
    { run_id: "brief-export-run-001", config: { mint_run_id: "mint-run-049" }, per_item: [{ id: "b" }, { id: "c" }], inputs_ref: [] },
  ];
  const lines = formatPendingList(rows);
  assert.match(lines[0], /2 pending row/);
  assert.match(lines[1], /brief-export-run-001/);
  assert.match(lines[1], /ids=2/);
  assert.match(lines[2], /brief-export-run-002/);
  assert.match(lines[2], /parts=1/);
});

test("resolveQueueContent: a found run_id returns its parts and per_item", () => {
  const rows = [{ run_id: "brief-export-run-005", config: { auto_queued: true }, per_item: [{ id: "x" }], inputs_ref: [{ part: 1, items: [] }] }];
  const r = resolveQueueContent(rows, "brief-export-run-005");
  assert.equal(r.ok, true);
  assert.deepEqual(r.content.parts, [{ part: 1, items: [] }]);
});

test("resolveQueueContent: an unknown run_id is a named error, never a thrown exception", () => {
  const r = resolveQueueContent([], "brief-export-run-999");
  assert.equal(r.ok, false);
  assert.match(r.error, /no brief-export row/);
});

// ── runCli (deps-injected, no real DB or env) ───────────────────────────────────────────────────────

test("runCli: self-skips exit 2 when credentials are absent, never a false red", async () => {
  const errors = [];
  const code = await runCli(["--list"], {
    errorLog: (m) => errors.push(m),
    loadEnv: () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    },
  });
  assert.equal(code, 2);
  assert.ok(errors.some((e) => /self-skip/.test(e)));
});

test("runCli: no flags at all is a usage error (exit 1), before touching credentials or the DB", async () => {
  const errors = [];
  const code = await runCli([], { errorLog: (m) => errors.push(m) });
  assert.equal(code, 1);
  assert.match(errors[0], /Usage/);
});

test("runCli --list DRY RUN (deps-injected readAllFn, real env-check path, no real network): prints the pending set", async () => {
  const logs = [];
  const fakeRows = [
    { run_id: "brief-export-run-010", harness_family: "brief-export", config: { auto_queued: true, drained: false, mint_run_id: "mint-run-060" }, per_item: [{ id: "a" }], inputs_ref: [{ part: 1 }] },
    { run_id: "brief-apply-run-003", harness_family: "brief-apply", config: {}, per_item: [{ id: "zzz", outcome: "generated" }], inputs_ref: [] },
  ];
  const code = await runCli(["--list"], {
    log: (m) => logs.push(m),
    loadEnv: () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fake.test";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-key";
    },
    readAllFn: async () => fakeRows,
  });
  assert.equal(code, 0);
  assert.ok(logs.some((l) => /1 pending row/.test(l)));
  assert.ok(logs.some((l) => /brief-export-run-010/.test(l)));
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

test("runCli --run-id DRY RUN: prints the one row's content as JSON", async () => {
  const logs = [];
  const fakeRows = [
    { run_id: "brief-export-run-011", harness_family: "brief-export", config: { auto_queued: true }, per_item: [{ id: "a" }], inputs_ref: [{ part: 1, items: [{ id: "a" }] }] },
  ];
  const code = await runCli(["--run-id", "brief-export-run-011"], {
    log: (m) => logs.push(m),
    loadEnv: () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fake.test";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-key";
    },
    readAllFn: async () => fakeRows,
  });
  assert.equal(code, 0);
  const parsed = JSON.parse(logs[0]);
  assert.equal(parsed.run_id, "brief-export-run-011");
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

test("runCli: a DB read failure is reported, exit 1, never thrown out of runCli", async () => {
  const errors = [];
  const code = await runCli(["--list"], {
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
