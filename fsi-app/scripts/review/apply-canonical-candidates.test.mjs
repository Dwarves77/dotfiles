// Run: node --test scripts/review/apply-canonical-candidates.test.mjs — no DB, deps injected (fakes).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, CITE, resolveExistingSourceId } from "./apply-canonical-candidates.mjs";

const LIVE_ROWS = [
  // resolvable: candidate_url already matches a registered source (src1) — accept auto-applies.
  { id: "c1", intelligence_item_id: "item1", candidate_url: "https://eur-lex.europa.eu/a", issue_classification: "stale_url", confidence: "high", verified: true, updated_at: "2026-09-01T00:00:00Z", reviewed_at: null },
  // unresolvable: no registered source for this URL — accept routes to needs_individual_review.
  { id: "c2", intelligence_item_id: "item2", candidate_url: "https://brand-new-registrar.example.gov/x", issue_classification: "missing_source", confidence: "high", verified: true, updated_at: "2026-09-01T00:00:00Z", reviewed_at: null },
];
const SOURCES = [{ id: "src1", url: "https://eur-lex.europa.eu/a" }];

function fakeDeps(calls, { liveRows = LIVE_ROWS, sources = SOURCES } = {}) {
  return {
    readAll: async (table) => {
      calls.push(["readAll", table]);
      if (table === "sources") return sources;
      return liveRows;
    },
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

test("resolveExistingSourceId: canonical-URL match against the registry, null when no match", () => {
  assert.equal(resolveExistingSourceId({ candidate_url: "https://eur-lex.europa.eu/a" }, SOURCES), "src1");
  assert.equal(resolveExistingSourceId({ candidate_url: "https://nowhere.example.com/z" }, SOURCES), null);
});

test("apply --apply: accept on a resolvable candidate writes BOTH canonical_source_candidates and intelligence_items, with CITE", async () => {
  const dir = mkdtempSync(join(tmpdir(), "r1-apply-cc-"));
  try {
    const rulingPath = writeRuling(dir, {
      queue: "canonical-candidates",
      generated_at: "2026-09-02T00:00:00Z",
      groups: [{ key: "eur-lex.europa.eu::stale_url", row_ids: ["c1"], decision: "accept", rationale: "unanimous verified+high" }],
    });
    const calls = [];
    const res = await main({ rulingPath, apply: true }, fakeDeps(calls));
    assert.equal(res.mode, "apply");
    const candWrite = calls.find((c) => c[0] === "guardedUpdateByIds" && c[1] === "canonical_source_candidates");
    const itemWrite = calls.find((c) => c[0] === "guardedUpdateByIds" && c[1] === "intelligence_items");
    assert.ok(candWrite, "expected a write to canonical_source_candidates");
    assert.ok(itemWrite, "expected a write to intelligence_items");
    assert.equal(candWrite[2][0], "c1");
    assert.equal(candWrite[3].decision, "approved");
    assert.equal(candWrite[3].promoted_to_source_id, "src1");
    assert.equal(itemWrite[2][0], "item1");
    assert.equal(itemWrite[3].source_id, "src1");
    assert.equal(candWrite[4].cite, CITE);
    const groupResult = res.results.find((r) => r.decision === "accept");
    assert.equal(groupResult.applied, 1);
    assert.equal(res.needs_individual_review.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("apply --apply: accept on an unresolvable candidate writes NOTHING and is routed to needs_individual_review", async () => {
  const dir = mkdtempSync(join(tmpdir(), "r1-apply-cc-"));
  try {
    const rulingPath = writeRuling(dir, {
      queue: "canonical-candidates",
      generated_at: "2026-09-02T00:00:00Z",
      groups: [{ key: "brand-new-registrar.example.gov::missing_source", row_ids: ["c2"], decision: "accept" }],
    });
    const calls = [];
    const res = await main({ rulingPath, apply: true }, fakeDeps(calls));
    assert.ok(!calls.some((c) => c[0] === "guardedUpdateByIds"));
    assert.equal(res.needs_individual_review.length, 1);
    assert.equal(res.needs_individual_review[0].candidateId, "c2");
    const groupResult = res.results.find((r) => r.decision === "accept");
    assert.equal(groupResult.applied, 0);
    assert.equal(groupResult.needs_individual_review, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("apply --apply: reject writes only canonical_source_candidates.decision='rejected', never intelligence_items", async () => {
  const dir = mkdtempSync(join(tmpdir(), "r1-apply-cc-"));
  try {
    const rulingPath = writeRuling(dir, {
      queue: "canonical-candidates",
      generated_at: "2026-09-02T00:00:00Z",
      groups: [{ key: "g1", row_ids: ["c1"], decision: "reject", rationale: "unanimous unverified" }],
    });
    const calls = [];
    const res = await main({ rulingPath, apply: true }, fakeDeps(calls));
    const writes = calls.filter((c) => c[0] === "guardedUpdateByIds");
    assert.equal(writes.length, 1);
    assert.equal(writes[0][1], "canonical_source_candidates");
    assert.equal(writes[0][3].decision, "rejected");
    assert.equal(res.results[0].decision, "reject");
    assert.equal(res.results[0].applied, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("dry-run: reports the plan (resolvable vs needs-review counts) and writes nothing", async () => {
  const dir = mkdtempSync(join(tmpdir(), "r1-apply-cc-"));
  try {
    const rulingPath = writeRuling(dir, {
      queue: "canonical-candidates",
      generated_at: "2026-09-02T00:00:00Z",
      groups: [{ key: "g1", row_ids: ["c1", "c2"], decision: "accept" }],
    });
    const calls = [];
    const res = await main({ rulingPath, apply: false }, fakeDeps(calls));
    assert.equal(res.mode, "dry-run");
    assert.ok(!calls.some((c) => c[0] === "guardedUpdateByIds"));
    assert.equal(res.results[0].would_apply, 1);
    assert.equal(res.results[0].would_review, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("skip: no mutation, counted as skipped", async () => {
  const dir = mkdtempSync(join(tmpdir(), "r1-apply-cc-"));
  try {
    const rulingPath = writeRuling(dir, {
      queue: "canonical-candidates",
      generated_at: "2026-09-02T00:00:00Z",
      groups: [{ key: "g1", row_ids: ["c1"], decision: "skip" }],
    });
    const calls = [];
    const res = await main({ rulingPath, apply: true }, fakeDeps(calls));
    assert.ok(!calls.some((c) => c[0] === "guardedUpdateByIds"));
    assert.deepEqual(res.results[0], { key: "g1", decision: "skip", applied: 0, skipped: true });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("invalid ruling (missing decision) is refused before any write", async () => {
  const dir = mkdtempSync(join(tmpdir(), "r1-apply-cc-"));
  try {
    const rulingPath = writeRuling(dir, {
      queue: "canonical-candidates",
      generated_at: "2026-09-02T00:00:00Z",
      groups: [{ key: "g1", row_ids: ["c1"], decision: null }],
    });
    const calls = [];
    await assert.rejects(main({ rulingPath, apply: true }, fakeDeps(calls)), /decision is missing/);
    assert.deepEqual(calls, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("stale ruling is refused", async () => {
  const dir = mkdtempSync(join(tmpdir(), "r1-apply-cc-"));
  try {
    const rulingPath = writeRuling(dir, {
      queue: "canonical-candidates",
      generated_at: "2026-08-01T00:00:00Z",
      groups: [{ key: "g1", row_ids: ["c1"], decision: "accept" }],
    });
    await assert.rejects(main({ rulingPath, apply: true }, fakeDeps([])), /STALE/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
