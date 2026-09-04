// emit-corpus-turn-artifact.test.mjs — proves the pure shaping functions (per-item extraction from a
// tickets snapshot, latest-forward-events lookup, artifact assembly) and that buildArtifact's output
// always validates against CONVENTION.md's own schema (validateRunArtifact) across the configurations
// corpus-turn.yml can actually produce. Importing this module never invokes main() (IS_MAIN guards on
// process.argv[1] against this file's own path).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateRunArtifact } from "../lib/run-artifact.mjs";
import {
  perItemFromTicketsSnapshot,
  latestForwardEventsCount,
  buildArtifact,
} from "./emit-corpus-turn-artifact.mjs";

function tmpDir() {
  return mkdtempSync(join(tmpdir(), "ct-artifact-test-"));
}

// ── perItemFromTicketsSnapshot ──────────────────────────────────────────────────────────────────────

test("perItemFromTicketsSnapshot: maps a consume-turn-requests.mjs snapshot's requests to per_item rows", () => {
  const dir = tmpDir();
  const path = join(dir, "tickets.json");
  writeFileSync(path, JSON.stringify({
    requests: [
      { id: "req-1", intelligence_item_id: "item-1", reason: "verified", requested_at: "2026-09-01T00:00:00Z" },
      { id: "req-2", intelligence_item_id: "item-2", reason: "tags_applied", requested_at: "2026-09-01T00:01:00Z" },
    ],
  }));
  const out = perItemFromTicketsSnapshot(path, "apply");
  assert.deepEqual(out, [
    { id: "item-1", outcome: "turned", verdict: "verified", evidence_refs: [], error: null },
    { id: "item-2", outcome: "turned", verdict: "tags_applied", evidence_refs: [], error: null },
  ]);
});

test("perItemFromTicketsSnapshot: dry mode reports 'would_turn', never 'turned' (nothing was written)", () => {
  const dir = tmpDir();
  const path = join(dir, "tickets.json");
  writeFileSync(path, JSON.stringify({ requests: [{ id: "r1", intelligence_item_id: "i1", reason: "verified" }] }));
  const out = perItemFromTicketsSnapshot(path, "dry");
  assert.equal(out[0].outcome, "would_turn");
});

test("perItemFromTicketsSnapshot: 0 requests -> empty array, a legitimate steady state", () => {
  const dir = tmpDir();
  const path = join(dir, "tickets.json");
  writeFileSync(path, JSON.stringify({ requests: [], count: 0, ids: [] }));
  assert.deepEqual(perItemFromTicketsSnapshot(path, "dry"), []);
});

test("perItemFromTicketsSnapshot: missing path, unreadable file, or malformed JSON -> empty array, never throws", () => {
  assert.deepEqual(perItemFromTicketsSnapshot(null, "dry"), []);
  assert.deepEqual(perItemFromTicketsSnapshot(join(tmpDir(), "does-not-exist.json"), "dry"), []);
  const dir = tmpDir();
  const badPath = join(dir, "bad.json");
  writeFileSync(badPath, "not json {{{");
  assert.deepEqual(perItemFromTicketsSnapshot(badPath, "dry"), []);
});

// ── latestForwardEventsCount ────────────────────────────────────────────────────────────────────────

test("latestForwardEventsCount: reads metrics.events_emitted from the lexicographically-latest *.json in dir", () => {
  const dir = tmpDir();
  writeFileSync(join(dir, "forward-events-run-001.json"), JSON.stringify({ metrics: { events_emitted: 3 } }));
  writeFileSync(join(dir, "forward-events-run-002.json"), JSON.stringify({ metrics: { events_emitted: 15 } }));
  const { count, path } = latestForwardEventsCount(dir);
  assert.equal(count, 15);
  assert.match(path, /forward-events-run-002\.json$/);
});

test("latestForwardEventsCount: missing dir, no files, or malformed latest file -> { count: null, path: null }", () => {
  assert.deepEqual(latestForwardEventsCount(join(tmpdir(), "definitely-does-not-exist-fe")), { count: null, path: null });

  const emptyDir = tmpDir();
  assert.deepEqual(latestForwardEventsCount(emptyDir), { count: null, path: null });

  const badDir = tmpDir();
  writeFileSync(join(badDir, "forward-events-run-001.json"), "not json");
  assert.deepEqual(latestForwardEventsCount(badDir), { count: null, path: null });
});

test("latestForwardEventsCount: a non-numeric metrics.events_emitted degrades to null, never NaN", () => {
  const dir = tmpDir();
  writeFileSync(join(dir, "forward-events-run-001.json"), JSON.stringify({ metrics: {} }));
  const { count } = latestForwardEventsCount(dir);
  assert.equal(count, null);
});

// ── buildArtifact ────────────────────────────────────────────────────────────────────────────────────

const BASE_ARGS = {
  runId: "corpus-turn-run-001",
  harnessVersion: "sha256:aaaaaaaaaaaaaaaa",
  startedAt: "2026-09-04T00:00:00Z",
  mode: "dry",
  selection: "tickets",
  limit: "200",
  since: null,
  ticketCount: "150",
  consumed: false,
  signals: true,
  ticketsPathRel: "scripts/_snapshots/turn-1/tickets.json",
  corpusPathRel: "scripts/_snapshots/turn-1/turn-corpus.json",
  forwardEvents: { count: 12, pathRel: "scripts/harness-runs/forward-events/forward-events-run-032.json" },
  perItem: [{ id: "item-1", outcome: "would_turn", verdict: "verified", evidence_refs: [], error: null }],
};

test("buildArtifact: shape matches CONVENTION.md's schema (validateRunArtifact green) — ticket mode, dry", () => {
  const artifact = buildArtifact(BASE_ARGS);
  assert.deepEqual(validateRunArtifact(artifact), []);
  assert.equal(artifact.harness_family, "corpus-turn");
  assert.equal(artifact.config.mode, "dry");
  assert.equal(artifact.config.selection, "tickets");
  assert.equal(artifact.config.limit, 200);
  assert.equal(artifact.metrics.tickets_selected, 150);
  assert.equal(artifact.metrics.forward_events_extracted, 12);
  assert.equal(artifact.metrics.consumed, false);
  assert.deepEqual(artifact.full_trace_refs, [
    "scripts/_snapshots/turn-1/tickets.json",
    "scripts/_snapshots/turn-1/turn-corpus.json",
    "scripts/harness-runs/forward-events/forward-events-run-032.json",
  ]);
});

test("buildArtifact: apply mode + consumed -> metrics.consumed is true, still validates", () => {
  const artifact = buildArtifact({ ...BASE_ARGS, mode: "apply", consumed: true });
  assert.deepEqual(validateRunArtifact(artifact), []);
  assert.equal(artifact.metrics.consumed, true);
});

test("buildArtifact: since-override mode never reports consumed, even if the caller passed consumed:true (workflow guard, not this function's job — this function trusts its inputs but the shape stays valid either way)", () => {
  const artifact = buildArtifact({
    ...BASE_ARGS,
    selection: "since",
    since: "2026-08-01",
    ticketsPathRel: null,
    ticketCount: "0",
  });
  assert.deepEqual(validateRunArtifact(artifact), []);
  assert.equal(artifact.config.since, "2026-08-01");
  assert.deepEqual(artifact.full_trace_refs, [
    "scripts/_snapshots/turn-1/turn-corpus.json",
    "scripts/harness-runs/forward-events/forward-events-run-032.json",
  ]);
});

test("buildArtifact: 0 tickets selected (ticket mode, has_scope false) -> empty per_item, still validates via the fallback trace ref", () => {
  const artifact = buildArtifact({
    ...BASE_ARGS,
    ticketCount: "0",
    perItem: [],
    ticketsPathRel: "scripts/_snapshots/turn-1/tickets.json", // consume-turn-requests.mjs always writes --out
    corpusPathRel: null, // export-corpus-for-extraction.mjs never ran (has_scope=false)
    forwardEvents: { count: null, pathRel: null },
  });
  assert.deepEqual(validateRunArtifact(artifact), []);
  assert.equal(artifact.metrics.tickets_selected, 0);
  assert.deepEqual(artifact.per_item, []);
  assert.deepEqual(artifact.full_trace_refs, ["scripts/_snapshots/turn-1/tickets.json"]);
});

test("buildArtifact: no trace refs at all (defensive/unanticipated configuration) falls back to a real repo path, never an empty array", () => {
  const artifact = buildArtifact({
    ...BASE_ARGS,
    ticketsPathRel: null,
    corpusPathRel: null,
    forwardEvents: { count: null, pathRel: null },
  });
  assert.deepEqual(validateRunArtifact(artifact), []);
  assert.deepEqual(artifact.full_trace_refs, ["docs/runbooks/CORPUS-TURN-RUNBOOK.md"]);
});

test("buildArtifact: limit is coerced to a number; a null limit (since-override mode without an explicit limit) stays null", () => {
  const a = buildArtifact({ ...BASE_ARGS, limit: "50" });
  assert.equal(a.config.limit, 50);
  const b = buildArtifact({ ...BASE_ARGS, limit: null });
  assert.equal(b.config.limit, null);
});
