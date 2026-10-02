// queue.test.mjs (lane R22, 2026-10-02). Fixture-driven, no database, no fs beyond the injected fakes.
// node:test + node:assert/strict, no npm deps.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FAMILY,
  partFileNames,
  readExportedParts,
  buildQueueArtifact,
  isPendingQueueRow,
  pendingQueueRows,
} from "./queue.mjs";
import { validateRunArtifact } from "../../lib/run-artifact.mjs";

// ── partFileNames / readExportedParts (producer-side fs read) ──────────────────────────────────────

test("partFileNames finds and orders -partN siblings, ignoring unrelated files", () => {
  const names = partFileNames("/x/mint-run-005.json", [
    "mint-run-005-part2.json",
    "mint-run-005-part1.json",
    "mint-run-005-part10.json",
    "unrelated.json",
    "mint-run-005.json",
  ]);
  assert.deepEqual(names, ["mint-run-005-part1.json", "mint-run-005-part2.json", "mint-run-005-part10.json"]);
});

test("partFileNames returns [] when nothing matches", () => {
  assert.deepEqual(partFileNames("/x/mint-run-005.json", ["other.json"]), []);
});

test("readExportedParts reads matching parts in order via injected deps (no real fs)", () => {
  const fakeDir = { "mint-run-005-part1.json": '{"part":1,"items":[{"id":"a"}]}', "mint-run-005-part2.json": '{"part":2,"items":[{"id":"b"}]}' };
  const parts = readExportedParts("/x/mint-run-005.json", {
    readdirSyncFn: () => Object.keys(fakeDir),
    readFileSyncFn: (p) => fakeDir[p.split(/[\\/]/).pop()],
  });
  assert.equal(parts.length, 2);
  assert.equal(parts[0].part, 1);
  assert.equal(parts[1].part, 2);
});

test("readExportedParts returns [] when the directory read throws (nothing written this run)", () => {
  const parts = readExportedParts("/x/mint-run-005.json", {
    readdirSyncFn: () => {
      throw new Error("ENOENT");
    },
  });
  assert.deepEqual(parts, []);
});

// ── buildQueueArtifact (producer-side shape) ────────────────────────────────────────────────────────

test("buildQueueArtifact marks every id queued when parts exist", () => {
  const artifact = buildQueueArtifact({
    runId: "brief-export-run-099",
    harnessVersion: "sha256:fake",
    startedAt: "2026-10-02T00:00:00Z",
    mintRunId: "mint-run-050",
    ids: ["a", "b"],
    parts: [{ part: 1, items: [{ id: "a" }, { id: "b" }] }],
  });
  assert.equal(artifact.harness_family, FAMILY);
  assert.equal(artifact.config.auto_queued, true);
  assert.equal(artifact.config.drained, false);
  assert.equal(artifact.config.mint_run_id, "mint-run-050");
  assert.deepEqual(artifact.inputs_ref, [{ part: 1, items: [{ id: "a" }, { id: "b" }] }]);
  assert.deepEqual(
    artifact.per_item.map((p) => p.outcome),
    ["queued", "queued"],
  );
  assert.equal(artifact.defects_found.length, 0);
});

test("buildQueueArtifact RED: ids present but zero parts written is a named defect, not silently zero", () => {
  const artifact = buildQueueArtifact({
    runId: "brief-export-run-100",
    harnessVersion: "sha256:fake",
    startedAt: "2026-10-02T00:00:00Z",
    mintRunId: "mint-run-051",
    ids: ["a"],
    parts: [],
  });
  assert.equal(artifact.per_item[0].outcome, "not_queued");
  assert.equal(artifact.defects_found.length, 1);
  assert.match(artifact.defects_found[0].description, /no brief-export part was written/);
});

test("buildQueueArtifact REGRESSION: the built artifact passes validateRunArtifact for real (caught live during this lane's own proof: an empty full_trace_refs threw inside writeRunArtifact)", () => {
  const artifact = buildQueueArtifact({
    runId: "brief-export-run-123",
    harnessVersion: "sha256:fake",
    startedAt: "2026-10-02T00:00:00Z",
    mintRunId: "mint-run-060",
    ids: ["a"],
    parts: [{ part: 1, items: [{ id: "a" }] }],
  });
  assert.deepEqual(validateRunArtifact(artifact), []);
});

test("buildQueueArtifact GREEN: zero ids this batch records honestly, no defect (record it every batch)", () => {
  const artifact = buildQueueArtifact({
    runId: "brief-export-run-101",
    harnessVersion: "sha256:fake",
    startedAt: "2026-10-02T00:00:00Z",
    mintRunId: "mint-run-052",
    ids: [],
    parts: [],
  });
  assert.deepEqual(artifact.per_item, []);
  assert.equal(artifact.defects_found.length, 0);
  assert.match(artifact.proposer_notes, /minted no items/);
});

// ── isPendingQueueRow / pendingQueueRows (consumer-side correlation) ────────────────────────────────

test("isPendingQueueRow is true only for an auto-queued, non-drained brief-export row", () => {
  assert.equal(isPendingQueueRow({ harness_family: "brief-export", config: { auto_queued: true } }), true);
  assert.equal(isPendingQueueRow({ harness_family: "brief-export", config: { auto_queued: true, drained: true } }), false);
  assert.equal(isPendingQueueRow({ harness_family: "brief-export", config: { auto_queued: false } }), false);
  assert.equal(isPendingQueueRow({ harness_family: "brief-apply", config: { auto_queued: true } }), false);
  assert.equal(isPendingQueueRow({}), false);
});

test("pendingQueueRows ATTACK: an export row whose ids never appear in any brief-apply row stays pending", () => {
  const exportRows = [{ harness_family: "brief-export", config: { auto_queued: true }, per_item: [{ id: "x" }] }];
  const applyRows = [{ harness_family: "brief-apply", per_item: [{ id: "y", outcome: "generated" }] }];
  const pending = pendingQueueRows(exportRows, applyRows);
  assert.equal(pending.length, 1);
});

test("pendingQueueRows: a row whose every id was attempted by a later brief-apply run is drained, success or not", () => {
  const exportRows = [{ harness_family: "brief-export", config: { auto_queued: true }, per_item: [{ id: "x" }, { id: "y" }] }];
  const applyRows = [
    { harness_family: "brief-apply", per_item: [{ id: "x", outcome: "generated" }] },
    { harness_family: "brief-apply", per_item: [{ id: "y", outcome: "stale_pool_hash" }] },
  ];
  assert.deepEqual(pendingQueueRows(exportRows, applyRows), []);
});

test("pendingQueueRows: PARTIAL coverage (only some ids attempted) still counts as pending", () => {
  const exportRows = [{ harness_family: "brief-export", config: { auto_queued: true }, per_item: [{ id: "x" }, { id: "y" }] }];
  const applyRows = [{ harness_family: "brief-apply", per_item: [{ id: "x", outcome: "generated" }] }];
  assert.equal(pendingQueueRows(exportRows, applyRows).length, 1);
});

test("pendingQueueRows ignores already-drained and non-auto-queued rows regardless of apply history", () => {
  const exportRows = [
    { harness_family: "brief-export", config: { auto_queued: true, drained: true }, per_item: [{ id: "x" }] },
    { harness_family: "brief-export", config: { auto_queued: false }, per_item: [{ id: "z" }] },
  ];
  assert.deepEqual(pendingQueueRows(exportRows, []), []);
});

test("pendingQueueRows: a queue row with no ids at all (a zero-mint batch) is always pending until inspected", () => {
  const exportRows = [{ harness_family: "brief-export", config: { auto_queued: true }, per_item: [] }];
  assert.equal(pendingQueueRows(exportRows, []).length, 1);
});
