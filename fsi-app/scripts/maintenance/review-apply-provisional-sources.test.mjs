// Run: node --test scripts/maintenance/review-apply-provisional-sources.test.mjs — no DB, deps injected.
// See review-apply-portal-links.test.mjs's header for the shared test rationale; this file covers the
// same wrapper shape against the `sources` table.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, resolveRulingPath } from "./review-apply-provisional-sources.mjs";

test("resolveRulingPath: relative arg resolves against the REPO ROOT", () => {
  const p = resolveRulingPath("docs/ratifications/2026-09/provisional-sources.ruling.json");
  assert.ok(p.endsWith("/docs/ratifications/2026-09/provisional-sources.ruling.json"));
  assert.ok(!p.includes("/fsi-app/docs/"));
});

function unreachableDeps() {
  return {
    applyMain: async () => { throw new Error("applyMain must not be called when --arg is blank"); },
    readAll: async () => { throw new Error("readAll must not be called when --arg is blank"); },
  };
}

test("dry, blank arg: refused, exit 1, no DB call", async () => {
  const r = await main({ mode: "dry", arg: "" }, unreachableDeps());
  assert.equal(r.step, "review-apply-provisional-sources");
  assert.equal(r.exitCode, 1);
  assert.match(r.note, /REFUSED/);
});

test("apply, missing arg entirely (undefined): refused", async () => {
  const r = await main({ mode: "apply" }, unreachableDeps());
  assert.equal(r.exitCode, 1);
});

test("dry: calls applyMain with apply:false, plan passed through unmodified", async () => {
  const calls = [];
  const deps = {
    applyMain: async (opts) => {
      calls.push(opts);
      return { queue: "provisional-sources", mode: "dry-run", results: [{ key: "tier:1|reach:reachable", decision: "keep", would_apply: 12 }] };
    },
    readAll: async () => { throw new Error("dry mode must never call readAll"); },
  };
  const r = await main({ mode: "dry", arg: "docs/ratifications/2026-09/provisional-sources.ruling.json" }, deps);
  assert.equal(calls[0].apply, false);
  assert.equal(r.counts.queue, "provisional-sources");
  assert.equal(r.applied, 0);
  assert.deepEqual(r.read_back, {});
});

test("apply: sums applied across groups; reads back the ruling's row_ids against `sources`", async () => {
  const dir = mkdtempSync(join(tmpdir(), "review-apply-provisional-sources-"));
  const rulingPath = join(dir, "provisional-sources.ruling.json");
  writeFileSync(rulingPath, JSON.stringify({
    queue: "provisional-sources",
    generated_at: "2026-09-04T00:00:00.000Z",
    groups: [{ key: "tier:1|reach:unreachable", decision: "suspend", row_ids: ["s-1", "s-2"] }],
  }));
  try {
    const calls = { applyMain: [], readAll: [] };
    const deps = {
      applyMain: async (opts) => {
        calls.applyMain.push(opts);
        return { queue: "provisional-sources", mode: "apply", results: [{ key: "tier:1|reach:unreachable", decision: "suspend", applied: 2, chunks: 1, halvings: 0 }] };
      },
      readAll: async (table, cols, opts) => {
        calls.readAll.push({ table, cols });
        return [{ id: "s-1", status: "suspended" }, { id: "s-2", status: "suspended" }];
      },
    };
    const r = await main({ mode: "apply", arg: rulingPath }, deps);
    assert.equal(calls.readAll[0].table, "sources");
    assert.equal(r.applied, 2);
    assert.equal(r.read_back.rows_named_in_ruling, 2);
    assert.equal(r.read_back.rows_now_live, 2);
    assert.deepEqual(r.read_back.sample, [{ id: "s-1", status: "suspended" }, { id: "s-2", status: "suspended" }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
