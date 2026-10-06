// Run: node --test scripts/maintenance/review-apply-portal-links.test.mjs — no DB, deps injected (same
// pattern as reopen-validation-holds.test.mjs). scripts/review/apply-portal-links.mjs's own selection/
// patch logic is pinned in scripts/review/apply-portal-links.test.mjs and its lib's own test; this file
// tests ONLY the wrapper's own orchestration - the rule path (blank arg), the ruling-path resolution,
// dry-plan pass-through, and apply read-back — and that it never re-derives the group decision itself (a
// single `deps.applyMain` call per invocation is the whole write-side DB interaction).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { main, resolveRulingPath } from "./review-apply-portal-links.mjs";

// task 0.3b: platform-independent path assertions (resolve()/join() emit backslash-separated paths on
// Windows, so a hardcoded POSIX literal never matches there). posix() normalizes the separator before
// comparing; the pass-through test builds its own platform-appropriate absolute path instead of a
// hardcoded "/tmp/..." literal.
const posix = (p) => p.split(sep).join("/");

test("resolveRulingPath: a relative arg resolves against the REPO ROOT (one level above fsi-app/)", () => {
  const p = posix(resolveRulingPath("docs/ratifications/2026-09/portal-links.ruling.json"));
  assert.ok(p.endsWith("/docs/ratifications/2026-09/portal-links.ruling.json"));
  assert.ok(!p.includes("/fsi-app/docs/"), "must not resolve under fsi-app/ — the ratifications tree is repo-root");
});

test("resolveRulingPath: an already-absolute arg passes through unchanged", () => {
  const absPath = resolve(tmpdir(), "some.ruling.json");
  assert.equal(resolveRulingPath(absPath), resolve(absPath));
});

// ── blank arg: decided by rule, no ruling file (lane G6-GATES, 2026-10-05) ────────────────────────────
// Red against the old wrapper, which refused a blank arg in both modes.

import { main as realApplyMain } from "../review/apply-portal-links.mjs";

const SOURCES = [
  { id: "s-law", url: "https://www.example-gov.org/portal" },
  { id: "s-misc", url: "https://news.example.com/" },
];
// gazette/legislation patterns -> link (rule); a URL with no instrument signal -> drop (rule);
// guidance / compliance patterns -> uncertain (residue, left for ledger-consume).
const CANDIDATES = [
  { id: "c1", source_id: "s-law", url: "https://www.example-gov.org/oj/L-2024-1", anchor_text: "Official Journal", status: "candidate", first_seen_at: "2026-09-01T00:00:00Z" },
  { id: "c2", source_id: "s-law", url: "https://www.example-gov.org/regulations/x", anchor_text: "Regulation text", status: "candidate", first_seen_at: "2026-09-01T00:00:00Z" },
  { id: "c3", source_id: "s-misc", url: "https://news.example.com/about-us", anchor_text: "About", status: "candidate", first_seen_at: "2026-09-01T00:00:00Z" },
  { id: "c4", source_id: "s-law", url: "https://www.example-gov.org/notice/9", anchor_text: "Guidance notice", status: "candidate", first_seen_at: "2026-09-01T00:00:00Z" },
];

function ruleDeps() {
  const writes = [];
  return {
    writes,
    readAll: async (table) => (table === "sources" ? SOURCES : CANDIDATES),
    readAllByIds: async (_t, _c, ids) => CANDIDATES.filter((r) => ids.includes(r.id)).map((r) => ({ id: r.id, status: r.status, disposition_reason: null })),
    guardedUpdateByIds: async (table, ids, patch) => { writes.push({ table, ids, patch }); return { updated: ids.length, chunks: 1, halvings: 0 }; },
    applyMain: realApplyMain,
  };
}

test("dry, blank arg: decides by rule with no ruling file, writes nothing, records decisions and residue", async () => {
  const d = ruleDeps();
  const r = await main({ mode: "dry", arg: "" }, d);
  assert.equal(r.exitCode, 0);
  assert.equal(r.source, "rule");
  assert.equal(d.writes.length, 0);
  assert.equal(r.applied, 0);
  // link: gazette + legislation groups (2 rows) plus the uncertain group (1 row, residue, no mutation); drop: 1 row
  assert.equal(r.decisions.drop.rows, 1);
  assert.equal(r.decisions.link.rows, 3);
  assert.deepEqual(r.residue, { "ledger-consume-owned": { groups: 1, rows: 1 } });
});

test("apply, blank arg: drops the no-signal row by rule (status rejected with a reason), leaves link and residue rows untouched", async () => {
  const d = ruleDeps();
  const r = await main({ mode: "apply", arg: "  " }, d);
  assert.equal(r.exitCode, 0);
  assert.equal(r.applied, 1);
  assert.equal(d.writes.length, 1);
  assert.deepEqual(d.writes[0].ids, ["c3"]);
  assert.equal(d.writes[0].patch.status, "rejected");
  assert.match(d.writes[0].patch.disposition_reason, /no instrument signal/);
  assert.equal(r.read_back.rows_named_in_ruling, 4);
});

// ── dry mode: passes rulingPath + apply:false through to applyMain, plan is applyMain's own result ─────

test("dry: resolves the ruling path, calls applyMain with apply:false, plan is passed through unmodified", async () => {
  const calls = [];
  const deps = {
    applyMain: async (opts) => {
      calls.push(opts);
      return { queue: "portal-links", mode: "dry-run", results: [{ key: "host::gazette_path", decision: "link", would_apply: 3 }] };
    },
    readAllByIds: async () => { throw new Error("dry mode must never call readAllByIds"); },
    readAll: async () => { throw new Error("a committed file must not trigger the rule path read"); },
  };
  const r = await main({ mode: "dry", arg: "docs/ratifications/2026-09/portal-links.ruling.json" }, deps);
  assert.equal(r.source, "ruling-file");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].apply, false);
  assert.ok(posix(calls[0].rulingPath).endsWith("/docs/ratifications/2026-09/portal-links.ruling.json"));
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
    const calls = { applyMain: [], readAllByIds: [] };
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
      readAllByIds: async (table, cols, ids) => {
        calls.readAllByIds.push({ table, cols, ids });
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
    assert.equal(calls.readAllByIds.length, 1);
    assert.equal(calls.readAllByIds[0].table, "portal_link_candidates");
    assert.equal(r.applied, 1);
    assert.equal(r.read_back.rows_named_in_ruling, 3);
    assert.equal(r.read_back.rows_now_live, 3);
    assert.deepEqual(r.read_back.sample.find((x) => x.id === "p-3"), { id: "p-3", status: "rejected", disposition_reason: "drop: ratification digest group b::other: drop" });
    assert.equal(r.exitCode, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("apply: an empty ruling.groups[].row_ids across the board -> readAllByIds is called with an empty id list (its own empty-list short circuit applies, no per-wrapper duplicate guard), empty read_back sample", async () => {
  const dir = mkdtempSync(join(tmpdir(), "review-apply-portal-links-"));
  const rulingPath = join(dir, "portal-links.ruling.json");
  writeFileSync(rulingPath, JSON.stringify({ queue: "portal-links", generated_at: "2026-09-04T00:00:00.000Z", groups: [] }));
  try {
    const calls = [];
    const deps = {
      applyMain: async () => ({ queue: "portal-links", mode: "apply", results: [] }),
      readAllByIds: async (...args) => { calls.push(args); return []; },
    };
    const r = await main({ mode: "apply", arg: rulingPath }, deps);
    assert.equal(r.applied, 0);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0][2], [], "called with the empty id list — the short circuit lives inside readAllByIds itself, not re-duplicated here");
    assert.deepEqual(r.read_back, { rows_named_in_ruling: 0, rows_now_live: 0, sample: [] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("dry/apply propagate a thrown validation error (invalid or stale ruling) unmodified — never swallowed", async () => {
  const deps = {
    applyMain: async () => { throw new Error("ruling is STALE: generated_at ... predates a live queue row"); },
    readAllByIds: async () => [],
  };
  await assert.rejects(
    () => main({ mode: "dry", arg: "docs/ratifications/2026-09/portal-links.ruling.json" }, deps),
    /STALE/
  );
});
