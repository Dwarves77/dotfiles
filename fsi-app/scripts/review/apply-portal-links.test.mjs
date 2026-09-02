// Run: node --test scripts/review/apply-portal-links.test.mjs — no DB, deps injected (fakes).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, CITE } from "./apply-portal-links.mjs";

const LIVE_ROWS = [{ id: "p1", source_id: "src1", url: "https://a.gov/regulation-1", anchor_text: "Reg 1", status: "candidate", last_seen_at: "2026-09-01T00:00:00Z" }];

function fakeDeps(calls) {
  return {
    readAll: async () => LIVE_ROWS,
    guardedUpdateByIds: async (table, ids, patch, opts) => {
      calls.push(["guardedUpdateByIds", table, ids, patch, opts]);
      return { updated: ids.length, chunks: 1, halvings: 0, rows: ids.map((id) => ({ id })) };
    },
  };
}

test("apply --apply: drop decision writes status='rejected' with a disposition_reason and CITE", async () => {
  const dir = mkdtempSync(join(tmpdir(), "r1-apply-"));
  try {
    const rulingPath = join(dir, "ruling.json");
    writeFileSync(rulingPath, JSON.stringify({
      queue: "portal-links",
      generated_at: "2026-09-02T00:00:00Z",
      groups: [{ key: "g1", row_ids: ["p1"], decision: "drop", rationale: "no instrument signal" }],
    }));
    const calls = [];
    const res = await main({ rulingPath, apply: true }, fakeDeps(calls));
    assert.equal(res.mode, "apply");
    const patch = calls[0][3];
    assert.equal(patch.status, "rejected");
    assert.equal(patch.disposition_reason, "no instrument signal");
    assert.ok(patch.dispositioned_at);
    assert.equal(calls[0][4].cite, CITE);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("apply --apply: link decision NEVER writes status='promoted' (that means 'minted' elsewhere) — no mutation", async () => {
  const dir = mkdtempSync(join(tmpdir(), "r1-apply-"));
  try {
    const rulingPath = join(dir, "ruling.json");
    writeFileSync(rulingPath, JSON.stringify({
      queue: "portal-links",
      generated_at: "2026-09-02T00:00:00Z",
      groups: [{ key: "g1", row_ids: ["p1"], decision: "link", rationale: "gazette-signal group" }],
    }));
    const calls = [];
    const res = await main({ rulingPath, apply: true }, fakeDeps(calls));
    assert.equal(res.mode, "apply");
    assert.equal(calls.length, 0); // no guardedUpdateByIds call at all — link is a no-op
    assert.equal(res.results[0].skipped, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("stale ruling is refused", async () => {
  const dir = mkdtempSync(join(tmpdir(), "r1-apply-"));
  try {
    const rulingPath = join(dir, "ruling.json");
    writeFileSync(rulingPath, JSON.stringify({
      queue: "portal-links",
      generated_at: "2026-08-01T00:00:00Z",
      groups: [{ key: "g1", row_ids: ["p1"], decision: "link" }],
    }));
    await assert.rejects(main({ rulingPath, apply: true }, fakeDeps([])), /STALE/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
