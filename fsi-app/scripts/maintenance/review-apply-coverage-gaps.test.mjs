// Run: node --test scripts/maintenance/review-apply-coverage-gaps.test.mjs — no DB, deps injected. See
// review-apply-portal-links.test.mjs's header for the shared test rationale; this file covers the same
// wrapper shape against the `coverage_gap_candidates` table.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, resolveRulingPath } from "./review-apply-coverage-gaps.mjs";

test("resolveRulingPath: relative arg resolves against the REPO ROOT", () => {
  const p = resolveRulingPath("docs/ratifications/2026-09/coverage-gaps.ruling.json");
  assert.ok(p.endsWith("/docs/ratifications/2026-09/coverage-gaps.ruling.json"));
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
  assert.equal(r.step, "review-apply-coverage-gaps");
  assert.equal(r.exitCode, 1);
  assert.match(r.note, /REFUSED/);
});

test("apply, blank arg: refused, exit 1, no DB call", async () => {
  const r = await main({ mode: "apply", arg: "" }, unreachableDeps());
  assert.equal(r.exitCode, 1);
});

test("dry: calls applyMain with apply:false, plan passed through unmodified", async () => {
  const calls = [];
  const deps = {
    applyMain: async (opts) => {
      calls.push(opts);
      return { queue: "coverage-gaps", mode: "dry-run", results: [{ key: "MISSING::EU::ocean", decision: "kept", would_apply: 4 }] };
    },
    readAll: async () => { throw new Error("dry mode must never call readAll"); },
  };
  const r = await main({ mode: "dry", arg: "docs/ratifications/2026-09/coverage-gaps.ruling.json" }, deps);
  assert.equal(calls[0].apply, false);
  assert.equal(r.counts.queue, "coverage-gaps");
  assert.equal(r.applied, 0);
});

test("apply: sums applied across groups; reads back the ruling's row_ids against coverage_gap_candidates", async () => {
  const dir = mkdtempSync(join(tmpdir(), "review-apply-coverage-gaps-"));
  const rulingPath = join(dir, "coverage-gaps.ruling.json");
  writeFileSync(rulingPath, JSON.stringify({
    queue: "coverage-gaps",
    generated_at: "2026-09-04T00:00:00.000Z",
    groups: [
      { key: "HAVE_QUARANTINED::EU::ocean", decision: "declined", row_ids: ["g-1"] },
      { key: "MISSING::US::air", decision: "kept", row_ids: ["g-2"] },
    ],
  }));
  try {
    const calls = { applyMain: [], readAll: [] };
    const deps = {
      applyMain: async (opts) => {
        calls.applyMain.push(opts);
        return {
          queue: "coverage-gaps",
          mode: "apply",
          results: [
            { key: "HAVE_QUARANTINED::EU::ocean", decision: "declined", applied: 1, chunks: 1, halvings: 0 },
            { key: "MISSING::US::air", decision: "kept", applied: 1, chunks: 1, halvings: 0 },
          ],
        };
      },
      readAll: async (table, cols, opts) => {
        calls.readAll.push({ table, cols });
        return [{ id: "g-1", disposition: "declined" }, { id: "g-2", disposition: "kept" }];
      },
    };
    const r = await main({ mode: "apply", arg: rulingPath }, deps);
    assert.equal(calls.readAll[0].table, "coverage_gap_candidates");
    assert.equal(r.applied, 2);
    assert.equal(r.read_back.rows_named_in_ruling, 2);
    assert.equal(r.read_back.rows_now_live, 2);
    assert.deepEqual(r.read_back.sample, [{ id: "g-1", disposition: "declined" }, { id: "g-2", disposition: "kept" }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
