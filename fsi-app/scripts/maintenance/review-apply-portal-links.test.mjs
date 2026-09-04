// Run: node --test scripts/maintenance/review-apply-portal-links.test.mjs — no DB, deps injected (same
// pattern as reopen-validation-holds.test.mjs). scripts/review/apply-portal-links.mjs's own selection/
// patch logic is pinned in scripts/review/apply-portal-links.test.mjs and its lib's own test; this file
// tests ONLY the wrapper's own orchestration — the --arg gate (both modes), the ruling-path resolution,
// dry-plan pass-through, and apply read-back — and that it never re-derives the group decision itself (a
// single `deps.applyMain` call per invocation is the whole write-side DB interaction).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, resolveRulingPath } from "./review-apply-portal-links.mjs";

test("resolveRulingPath: a relative arg resolves against the REPO ROOT (one level above fsi-app/)", () => {
  const p = resolveRulingPath("docs/ratifications/2026-09/portal-links.ruling.json");
  assert.ok(p.endsWith("/docs/ratifications/2026-09/portal-links.ruling.json"));
  assert.ok(!p.includes("/fsi-app/docs/"), "must not resolve under fsi-app/ — the ratifications tree is repo-root");
});

test("resolveRulingPath: an already-absolute arg passes through unchanged", () => {
  assert.equal(resolveRulingPath("/tmp/some.ruling.json"), "/tmp/some.ruling.json");
});

// ── --arg gate: refuses BEFORE any DB call, in both modes ──────────────────────────────────────────────

function unreachableDeps() {
  return {
    applyMain: async () => { throw new Error("applyMain must not be called when --arg is blank"); },
    readAll: async () => { throw new Error("readAll must not be called when --arg is blank"); },
  };
}

test("dry, blank arg: refused, exit 1, no DB call", async () => {
  const r = await main({ mode: "dry", arg: "" }, unreachableDeps());
  assert.equal(r.step, "review-apply-portal-links");
  assert.equal(r.exitCode, 1);
  assert.match(r.note, /REFUSED/);
  assert.match(r.note, /--arg/);
});

test("dry, whitespace-only arg: refused the same as blank", async () => {
  const r = await main({ mode: "dry", arg: "   " }, unreachableDeps());
  assert.equal(r.exitCode, 1);
});

test("apply, blank arg: refused, exit 1, no DB call — a blanket apply is refused just as hard as a blanket dry read", async () => {
  const r = await main({ mode: "apply", arg: "" }, unreachableDeps());
  assert.equal(r.exitCode, 1);
  assert.match(r.note, /REFUSED/);
});

// ── dry mode: passes rulingPath + apply:false through to applyMain, plan is applyMain's own result ─────

test("dry: resolves the ruling path, calls applyMain with apply:false, plan is passed through unmodified", async () => {
  const calls = [];
  const deps = {
    applyMain: async (opts) => {
      calls.push(opts);
      return { queue: "portal-links", mode: "dry-run", results: [{ key: "host::gazette_path", decision: "link", would_apply: 3 }] };
    },
    readAll: async () => { throw new Error("dry mode must never call readAll"); },
  };
  const r = await main({ mode: "dry", arg: "docs/ratifications/2026-09/portal-links.ruling.json" }, deps);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].apply, false);
  assert.ok(calls[0].rulingPath.endsWith("/docs/ratifications/2026-09/portal-links.ruling.json"));
  assert.equal(r.mode, "dry");
  assert.equal(r.counts.queue, "portal-links");
  assert.equal(r.counts.groups, 1);
  assert.equal(r.applied, 0);
  assert.deepEqual(r.plan, [{ key: "host::gazette_path", decision: "link", would_apply: 3 }]);
  assert.deepEqual(r.read_back, {});
  assert.equal(r.exitCode, 0);
});

// ── apply mode: writes through applyMain only, then reads back every row named in the ruling file ──────

test("apply: sums applied across groups; reads back exactly the ruling's row_ids", async () => {
  const dir = mkdtempSync(join(tmpdir(), "review-apply-portal-links-"));
  const rulingPath = join(dir, "portal-links.ruling.json");
  writeFileSync(rulingPath, JSON.stringify({
    queue: "portal-links",
    generated_at: "2026-09-04T00:00:00.000Z",
    groups: [
      { key: "a::gazette_path", decision: "link", row_ids: ["p-1", "p-2"] },
      { key: "b::other", decision: "drop", row_ids: ["p-3"] },
    ],
  }));
  try {
    const calls = { applyMain: [], readAll: [] };
    const deps = {
      applyMain: async (opts) => {
        calls.applyMain.push(opts);
        return {
          queue: "portal-links",
          mode: "apply",
          results: [
            { key: "a::gazette_path", decision: "link", applied: 0, skipped: false },
            { key: "b::other", decision: "drop", applied: 1, chunks: 1, halvings: 0 },
          ],
        };
      },
      readAll: async (table, cols, opts) => {
        calls.readAll.push({ table, cols });
        return [
          { id: "p-1", status: "candidate", disposition_reason: null },
          { id: "p-2", status: "candidate", disposition_reason: null },
          { id: "p-3", status: "rejected", disposition_reason: "drop: ratification digest group b::other: drop" },
        ];
      },
    };
    const r = await main({ mode: "apply", arg: rulingPath }, deps);
    assert.equal(calls.applyMain[0].apply, true);
    assert.equal(calls.applyMain[0].rulingPath, rulingPath);
    assert.equal(calls.readAll.length, 1);
    assert.equal(calls.readAll[0].table, "portal_link_candidates");
    assert.equal(r.applied, 1);
    assert.equal(r.read_back.rows_named_in_ruling, 3);
    assert.equal(r.read_back.rows_now_live, 3);
    assert.deepEqual(r.read_back.sample.find((x) => x.id === "p-3"), { id: "p-3", status: "rejected", disposition_reason: "drop: ratification digest group b::other: drop" });
    assert.equal(r.exitCode, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("apply: an empty ruling.groups[].row_ids across the board -> no readAll call, empty read_back sample", async () => {
  const dir = mkdtempSync(join(tmpdir(), "review-apply-portal-links-"));
  const rulingPath = join(dir, "portal-links.ruling.json");
  writeFileSync(rulingPath, JSON.stringify({ queue: "portal-links", generated_at: "2026-09-04T00:00:00.000Z", groups: [] }));
  try {
    const calls = [];
    const deps = {
      applyMain: async () => ({ queue: "portal-links", mode: "apply", results: [] }),
      readAll: async (...args) => { calls.push(args); return []; },
    };
    const r = await main({ mode: "apply", arg: rulingPath }, deps);
    assert.equal(r.applied, 0);
    assert.equal(calls.length, 0);
    assert.deepEqual(r.read_back, { rows_named_in_ruling: 0, rows_now_live: 0, sample: [] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("dry/apply propagate a thrown validation error (invalid or stale ruling) unmodified — never swallowed", async () => {
  const deps = {
    applyMain: async () => { throw new Error("ruling is STALE: generated_at ... predates a live queue row"); },
    readAll: async () => [],
  };
  await assert.rejects(
    () => main({ mode: "dry", arg: "docs/ratifications/2026-09/portal-links.ruling.json" }, deps),
    /STALE/
  );
});
