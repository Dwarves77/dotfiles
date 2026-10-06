// Run: node --test scripts/review/build-review-digests.test.mjs — no DB, deps injected (fakes).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { QUEUES, buildQueueDigest, main } from "./build-review-digests.mjs";
import * as CoverageGaps from "./lib/coverage-gaps.mjs";

test("QUEUES: names the two live queues with an apply script and a maint step (canonical-candidates and provisional-sources are retired)", () => {
  assert.equal(QUEUES.length, 2);
  assert.ok(!QUEUES.some((q) => ["canonical-candidates", "provisional-sources"].includes(q.module.QUEUE_ID)));
  for (const q of QUEUES) {
    assert.ok(q.applyScript.startsWith("scripts/review/apply-"));
    assert.ok(q.maintStep.startsWith("review-apply-"));
  }
});

test("buildQueueDigest: markdown + ruling for a single queue, deterministic given the same rows", () => {
  const entry = QUEUES.find((q) => q.module === CoverageGaps);
  const rows = [
    { id: "g1", instrument: "CORSIA", jurisdiction: "global", transport_mode: "air", estimated_priority: "HIGH", coverage_class: "MISSING", authoritative_url: "https://icao.int/x", created_at: "2026-09-01T00:00:00Z" },
  ];
  const out1 = buildQueueDigest(entry, rows, { generatedAt: "2026-09-02T00:00:00Z" });
  const out2 = buildQueueDigest(entry, rows, { generatedAt: "2026-09-02T00:00:00Z" });
  assert.deepEqual(out1.ruling, out2.ruling);
  assert.equal(out1.ruling.queue, "coverage-gaps");
  assert.match(out1.markdown, /Ratification digest/);
});

function fakeReadAll(rowsByTable) {
  return async (table, _cols, _opts) => rowsByTable[table] ?? [];
}

test("main: writes one .digest.md and one .ruling.json per queue into --out, filtered by --queue", async () => {
  const dir = mkdtempSync(join(tmpdir(), "r1-digest-"));
  try {
    const rowsByTable = {
      coverage_gap_candidates: [{ id: "g1", instrument: "CORSIA", jurisdiction: "global", transport_mode: "air", estimated_priority: "HIGH", coverage_class: "MISSING", authoritative_url: "https://icao.int/x", created_at: "2026-09-01T00:00:00Z" }],
    };
    const summary = await main({ out: dir, queue: "coverage-gaps", now: "2026-09-02T00:00:00Z" }, { readAll: fakeReadAll(rowsByTable) });
    assert.equal(summary.length, 1);
    assert.equal(summary[0].queue, "coverage-gaps");
    assert.ok(existsSync(join(dir, "coverage-gaps.digest.md")));
    assert.ok(existsSync(join(dir, "coverage-gaps.ruling.json")));
    const ruling = JSON.parse(readFileSync(join(dir, "coverage-gaps.ruling.json"), "utf8"));
    assert.equal(ruling.generated_at, "2026-09-02T00:00:00Z");
    assert.equal(ruling.groups.length, 1);
    assert.ok(!existsSync(join(dir, "portal-links.digest.md"))); // --queue filtered the others out
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("main: with no --queue filter, builds both queues (portal-links resolves source hosts via a second readAll)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "r1-digest-"));
  try {
    const rowsByTable = {
      sources: [{ id: "src1", url: "https://portal.gov/x", name: "Portal", status: "provisional", total_checks: 0, updated_at: "2026-09-01T00:00:00Z" }],
      portal_link_candidates: [{ id: "p1", source_id: "src1", url: "https://portal.gov/regulation-1", anchor_text: "Regulation 1", status: "candidate", last_seen_at: "2026-09-01T00:00:00Z" }],
      coverage_gap_candidates: [],
    };
    const summary = await main({ out: dir, now: "2026-09-02T00:00:00Z" }, { readAll: fakeReadAll(rowsByTable) });
    assert.equal(summary.length, 2);
    const portalSummary = summary.find((s) => s.queue === "portal-links");
    assert.equal(portalSummary.rows, 1);
    assert.equal(portalSummary.groups, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("main: throws without --out", async () => {
  await assert.rejects(main({}, { readAll: fakeReadAll({}) }), /--out/);
});

test("main: throws on an unknown --queue", async () => {
  const dir = mkdtempSync(join(tmpdir(), "r1-digest-"));
  try {
    await assert.rejects(main({ out: dir, queue: "not-a-real-queue" }, { readAll: fakeReadAll({}) }), /unknown --queue/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
