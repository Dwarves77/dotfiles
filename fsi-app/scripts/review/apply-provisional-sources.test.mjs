// Run: node --test scripts/review/apply-provisional-sources.test.mjs — no DB, deps injected (fakes).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, CITE } from "./apply-provisional-sources.mjs";

const LIVE_ROWS = [{ id: "s1", url: "https://a.gov/x", status: "provisional", updated_at: "2026-09-01T00:00:00Z" }];

function fakeDeps(calls) {
  return {
    readAll: async () => LIVE_ROWS,
    guardedUpdateByIds: async (table, ids, patch, opts) => {
      calls.push(["guardedUpdateByIds", table, ids, patch, opts]);
      return { updated: ids.length, chunks: 1, halvings: 0, rows: ids.map((id) => ({ id })) };
    },
  };
}

function writeRuling(dir, ruling) {
  const p = join(dir, "ruling.json");
  writeFileSync(p, JSON.stringify(ruling));
  return p;
}

test("apply --apply writes through guardedUpdateByIds with the CITE this script names", async () => {
  const dir = mkdtempSync(join(tmpdir(), "r1-apply-"));
  try {
    const rulingPath = writeRuling(dir, {
      queue: "provisional-sources",
      generated_at: "2026-09-02T00:00:00Z",
      groups: [{ key: "g1", row_ids: ["s1"], decision: "suspend" }],
    });
    const calls = [];
    const res = await main({ rulingPath, apply: true }, fakeDeps(calls));
    assert.equal(res.mode, "apply");
    assert.deepEqual(calls[0][3], { status: "suspended" });
    assert.equal(calls[0][4].cite, CITE);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("dry-run reports the plan and writes nothing", async () => {
  const dir = mkdtempSync(join(tmpdir(), "r1-apply-"));
  try {
    const rulingPath = writeRuling(dir, {
      queue: "provisional-sources",
      generated_at: "2026-09-02T00:00:00Z",
      groups: [{ key: "g1", row_ids: ["s1"], decision: "keep" }],
    });
    const calls = [];
    const res = await main({ rulingPath, apply: false }, fakeDeps(calls));
    assert.equal(res.mode, "dry-run");
    assert.deepEqual(calls, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
