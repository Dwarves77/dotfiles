// Run: node --test scripts/review/apply-coverage-gaps.test.mjs — no DB, deps injected (fakes).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, CITE } from "./apply-coverage-gaps.mjs";

const LIVE_ROWS = [{ id: "g1", coverage_class: "HAVE_QUARANTINED", jurisdiction: "global", transport_mode: "ocean", estimated_priority: "HIGH", created_at: "2026-07-17T00:00:00Z" }];

function fakeDeps(calls) {
  return {
    readAll: async () => LIVE_ROWS,
    guardedUpdateByIds: async (table, ids, patch, opts) => {
      calls.push(["guardedUpdateByIds", table, ids, patch, opts]);
      return { updated: ids.length, chunks: 1, halvings: 0, rows: ids.map((id) => ({ id })) };
    },
  };
}

test("apply --apply: declined writes disposition + the required surface_test payload, with CITE", async () => {
  const dir = mkdtempSync(join(tmpdir(), "r1-apply-"));
  try {
    const rulingPath = join(dir, "ruling.json");
    writeFileSync(rulingPath, JSON.stringify({
      queue: "coverage-gaps",
      generated_at: "2026-09-02T00:00:00Z",
      groups: [{ key: "g1", row_ids: ["g1"], decision: "declined", rationale: "already in-corpus via the drain" }],
    }));
    const calls = [];
    const res = await main({ rulingPath, apply: true }, fakeDeps(calls));
    assert.equal(res.mode, "apply");
    const patch = calls[0][3];
    assert.equal(patch.disposition, "declined");
    assert.equal(patch.surface_test.regulations.verdict, "not_applicable");
    assert.equal(patch.surface_test.community.reason, "already in-corpus via the drain");
    assert.equal(calls[0][4].cite, CITE);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("kept decision omits surface_test (migration 273 does not require it for 'kept')", async () => {
  const dir = mkdtempSync(join(tmpdir(), "r1-apply-"));
  try {
    const rulingPath = join(dir, "ruling.json");
    writeFileSync(rulingPath, JSON.stringify({
      queue: "coverage-gaps",
      generated_at: "2026-09-02T00:00:00Z",
      groups: [{ key: "g1", row_ids: ["g1"], decision: "kept" }],
    }));
    const calls = [];
    await main({ rulingPath, apply: true }, fakeDeps(calls));
    assert.deepEqual(calls[0][3], { disposition: "kept" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
