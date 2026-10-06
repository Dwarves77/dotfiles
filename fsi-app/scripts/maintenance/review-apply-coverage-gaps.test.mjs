// Run: node --test scripts/maintenance/review-apply-coverage-gaps.test.mjs — no DB, deps injected. See
// review-apply-portal-links.test.mjs's header for the shared test rationale; this file covers the same
// wrapper shape against the `coverage_gap_candidates` table.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { main, resolveRulingPath } from "./review-apply-coverage-gaps.mjs";

// task 0.3b: normalize the separator before comparing. resolve() emits backslash-separated paths on
// Windows, so a hardcoded POSIX literal never matches there.
const posix = (p) => p.split(sep).join("/");

test("resolveRulingPath: relative arg resolves against the REPO ROOT", () => {
  const p = posix(resolveRulingPath("docs/ratifications/2026-09/coverage-gaps.ruling.json"));
  assert.ok(p.endsWith("/docs/ratifications/2026-09/coverage-gaps.ruling.json"));
  assert.ok(!p.includes("/fsi-app/docs/"));
});

import { main as realApplyMain } from "../review/apply-coverage-gaps.mjs";

// Rows with one group per rule outcome. estimated_priority mixes inside MISSING on purpose: the rule path
// groups per (coverage_class, estimated_priority), so there is no "mixed" group left undecided.
const LIVE_ROWS = [
  { id: "m1", coverage_class: "MISSING", estimated_priority: "CRITICAL", jurisdiction: "eu", transport_mode: "air", created_at: "2026-07-01T00:00:00Z" },
  { id: "m2", coverage_class: "MISSING", estimated_priority: "HIGH", jurisdiction: "us", transport_mode: "ocean", created_at: "2026-07-01T00:00:00Z" },
  { id: "m3", coverage_class: "MISSING", estimated_priority: "LOW", jurisdiction: "eu", transport_mode: "air", created_at: "2026-07-01T00:00:00Z" },
  { id: "q1", coverage_class: "HAVE_QUARANTINED", estimated_priority: "HIGH", jurisdiction: "uk", transport_mode: "multi", created_at: "2026-07-01T00:00:00Z" },
  { id: "a1", coverage_class: "AMBIGUOUS_ARCHIVED", estimated_priority: "MODERATE", jurisdiction: "uk", transport_mode: "multi", created_at: "2026-07-01T00:00:00Z" },
  { id: "x1", coverage_class: "SOMETHING_NEW", estimated_priority: "HIGH", jurisdiction: "uk", transport_mode: "multi", created_at: "2026-07-01T00:00:00Z" },
];

// The shape migration 273's coverage_gap_candidates_surface_test_required_check requires on any non-null,
// non-'kept' disposition: all five surface keys, each with a non-empty verdict and reason.
function satisfiesSurfaceTestCheck(st) {
  return ["regulations", "operations", "market_intel", "research", "community"].every(
    (k) => typeof st?.[k]?.verdict === "string" && st[k].verdict.length > 0 && typeof st?.[k]?.reason === "string" && st[k].reason.length > 0,
  );
}

function ruleDeps() {
  const writes = [];
  const deps = {
    writes,
    readAll: async () => LIVE_ROWS,
    readAllByIds: async (_t, _c, ids) => LIVE_ROWS.filter((r) => ids.includes(r.id)).map((r) => ({ id: r.id, disposition: "x" })),
    guardedUpdateByIds: async (table, ids, patch) => { writes.push({ table, ids, patch }); return { updated: ids.length, chunks: 1, halvings: 0 }; },
    applyMain: realApplyMain,
  };
  return deps;
}

test("dry, blank arg: decides by rule with no ruling file (red against the old wrapper, which refused a blank arg)", async () => {
  const d = ruleDeps();
  const r = await main({ mode: "dry", arg: "" }, d);
  assert.equal(r.exitCode, 0);
  assert.equal(r.source, "rule");
  assert.equal(d.writes.length, 0);
  assert.equal(r.counts.queue, "coverage-gaps");
  // per (class, priority): MISSING::CRITICAL, MISSING::HIGH, MISSING::LOW, HAVE_QUARANTINED::HIGH, AMBIGUOUS_ARCHIVED::MODERATE, SOMETHING_NEW::HIGH
  assert.equal(r.counts.groups, 6);
  assert.deepEqual(r.decisions, {
    kept: { groups: 2, rows: 2 },
    parked: { groups: 2, rows: 2 },
    declined: { groups: 1, rows: 1 },
    skip: { groups: 1, rows: 1 },
  });
});

test("blank arg: residue is counted with its reason, never decided and never written", async () => {
  const d = ruleDeps();
  const r = await main({ mode: "apply", arg: "" }, d);
  assert.deepEqual(r.residue, { "unrecognised-coverage-class": { groups: 1, rows: 1 } });
  assert.ok(!d.writes.some((w) => w.ids.includes("x1")));
});

test("apply, blank arg: writes the rule decisions, and every non-kept decision carries a surface_test that satisfies migration 273", async () => {
  const d = ruleDeps();
  const r = await main({ mode: "apply", arg: "" }, d);
  assert.equal(r.exitCode, 0);
  assert.equal(r.applied, 5); // m1, m2 kept; m3, a1 parked; q1 declined; x1 is residue
  const byDisposition = {};
  for (const w of d.writes) (byDisposition[w.patch.disposition] ??= []).push(...w.ids);
  assert.deepEqual(byDisposition.kept.sort(), ["m1", "m2"]);
  assert.deepEqual(byDisposition.parked.sort(), ["a1", "m3"]);
  assert.deepEqual(byDisposition.declined, ["q1"]);
  for (const w of d.writes) {
    assert.equal(w.table, "coverage_gap_candidates");
    if (w.patch.disposition !== "kept") assert.ok(satisfiesSurfaceTestCheck(w.patch.surface_test), `${w.patch.disposition} surface_test`);
    else assert.equal(w.patch.surface_test, undefined);
  }
  const declined = d.writes.find((w) => w.patch.disposition === "declined");
  assert.match(declined.patch.surface_test.regulations.reason, /HAVE_QUARANTINED/);
  assert.match(declined.patch.surface_test.regulations.reason, /HIGH/);
  assert.equal(r.read_back.rows_named_in_ruling, 6);
});

test("dry: calls applyMain with apply:false, plan passed through unmodified", async () => {
  const calls = [];
  const deps = {
    readAll: async () => { throw new Error("a committed file must not trigger the rule path read"); },
    applyMain: async (opts) => {
      calls.push(opts);
      return { queue: "coverage-gaps", mode: "dry-run", results: [{ key: "MISSING::EU::ocean", decision: "kept", would_apply: 4 }] };
    },
    readAllByIds: async () => { throw new Error("dry mode must never call readAllByIds"); },
  };
  const r = await main({ mode: "dry", arg: "docs/ratifications/2026-09/coverage-gaps.ruling.json" }, deps);
  assert.equal(calls[0].apply, false);
  assert.ok(calls[0].rulingPath, "a committed file still applies through its path");
  assert.equal(calls[0].ruling, undefined);
  assert.equal(r.source, "ruling-file");
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
    const calls = { applyMain: [], readAllByIds: [] };
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
      readAllByIds: async (table, cols, ids) => {
        calls.readAllByIds.push({ table, cols, ids });
        return [{ id: "g-1", disposition: "declined" }, { id: "g-2", disposition: "kept" }];
      },
    };
    const r = await main({ mode: "apply", arg: rulingPath }, deps);
    assert.equal(calls.readAllByIds[0].table, "coverage_gap_candidates");
    assert.equal(r.applied, 2);
    assert.equal(r.read_back.rows_named_in_ruling, 2);
    assert.equal(r.read_back.rows_now_live, 2);
    assert.deepEqual(r.read_back.sample, [{ id: "g-1", disposition: "declined" }, { id: "g-2", disposition: "kept" }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
