// Run: node --test scripts/maintenance/close-run-logs.test.mjs -- no DB, deps injected.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isPerItemQuestion, isLegacyRemediationRunSummary, decideRunLogClosure, planClosure, groupCounts,
  main, CITE, RESOLVED_BY, RESOLUTION_NOTE,
} from "./close-run-logs.mjs";

// ── isPerItemQuestion ────────────────────────────────────────────────────────────────────────────────

test("isPerItemQuestion: a description ending in '?' is a question", () => {
  assert.equal(isPerItemQuestion("Does the workspace qualify as an importer here?"), true);
  assert.equal(isPerItemQuestion("  trailing whitespace before the mark?   "), true);
});

test("isPerItemQuestion: no trailing '?' is not a question", () => {
  assert.equal(isPerItemQuestion("RUN SUMMARY: 12 attempted, 10 completed"), false);
  assert.equal(isPerItemQuestion(""), false);
  assert.equal(isPerItemQuestion(null), false);
  assert.equal(isPerItemQuestion(undefined), false);
});

// ── isLegacyRemediationRunSummary ────────────────────────────────────────────────────────────────────

test("isLegacyRemediationRunSummary: matches RUN SUMMARY at the start, case-insensitive, with punctuation after", () => {
  assert.equal(isLegacyRemediationRunSummary("RUN SUMMARY: 40 items processed"), true);
  assert.equal(isLegacyRemediationRunSummary("Run summary -- batch 3 complete"), true);
  assert.equal(isLegacyRemediationRunSummary("  run summary\n40 processed"), true);
});

test("isLegacyRemediationRunSummary: a PARKED per-item entry does not match", () => {
  assert.equal(isLegacyRemediationRunSummary("PARKED: item abc123 needs operator review of role placement"), false);
  assert.equal(isLegacyRemediationRunSummary("This run summary mentions nothing at the start"), false);
  assert.equal(isLegacyRemediationRunSummary(""), false);
});

// ── decideRunLogClosure ──────────────────────────────────────────────────────────────────────────────

test("decideRunLogClosure: authorship-shard-N closes", () => {
  const d = decideRunLogClosure({ created_by: "authorship-shard-3", description: "attempted 10, completed 8" });
  assert.equal(d.close, true);
  assert.equal(d.family, "authorship-shard");
});

test("decideRunLogClosure: authorship-shard-0 closes too (shard index 0 is still a shard)", () => {
  assert.equal(decideRunLogClosure({ created_by: "authorship-shard-0", description: "x" }).close, true);
});

test("decideRunLogClosure: legacy-remediation RUN SUMMARY closes", () => {
  const d = decideRunLogClosure({ created_by: "legacy-remediation", description: "RUN SUMMARY: 12 attempted" });
  assert.equal(d.close, true);
  assert.equal(d.family, "legacy-remediation-run-summary");
});

test("decideRunLogClosure: legacy-remediation PARKED (per-item) is kept, not closed", () => {
  const d = decideRunLogClosure({ created_by: "legacy-remediation", description: "PARKED: item xyz needs role review" });
  assert.equal(d.close, false);
  assert.equal(d.family, null);
  assert.match(d.reason, /task 7\.3/);
});

test("decideRunLogClosure: citation-harvest* batch summaries close", () => {
  assert.equal(decideRunLogClosure({ created_by: "citation-harvest-batch-12", description: "42 citations processed" }).close, true);
  assert.equal(decideRunLogClosure({ created_by: "citation-harvest", description: "batch report" }).close, true);
});

test("decideRunLogClosure: the universal per-item-question guard overrides every family", () => {
  assert.equal(decideRunLogClosure({ created_by: "authorship-shard-1", description: "is this item in scope?" }).close, false);
  assert.equal(decideRunLogClosure({ created_by: "citation-harvest", description: "which source covers this claim?" }).close, false);
  assert.equal(decideRunLogClosure({ created_by: "legacy-remediation", description: "RUN SUMMARY but wait, is this right?" }).close, false);
});

test("decideRunLogClosure: an unrelated created_by is kept, unmatched", () => {
  const d = decideRunLogClosure({ created_by: "gate-a-verifier-sweep", description: "37 flags, unexplained" });
  assert.equal(d.close, false);
  assert.equal(d.family, null);
  assert.match(d.reason, /none of the three run-log families/);
});

test("decideRunLogClosure: handles missing fields without throwing", () => {
  assert.doesNotThrow(() => decideRunLogClosure({}));
  assert.doesNotThrow(() => decideRunLogClosure());
  assert.equal(decideRunLogClosure({}).close, false);
});

// ── planClosure / groupCounts ────────────────────────────────────────────────────────────────────────

const ROWS = [
  { id: "1", created_by: "authorship-shard-0", description: "attempted 10" },
  { id: "2", created_by: "authorship-shard-7", description: "attempted 5" },
  { id: "3", created_by: "legacy-remediation", description: "RUN SUMMARY: batch 2" },
  { id: "4", created_by: "legacy-remediation", description: "PARKED: item needs review" },
  { id: "5", created_by: "citation-harvest-b1", description: "12 citations" },
  { id: "6", created_by: "authorship-shard-2", description: "does this qualify?" },
];

test("planClosure: partitions correctly and preserves per-row reason", () => {
  const { toClose, toKeep } = planClosure(ROWS);
  assert.deepEqual(toClose.map((e) => e.id).sort(), ["1", "2", "3", "5"]);
  assert.deepEqual(toKeep.map((e) => e.id).sort(), ["4", "6"]);
  assert.ok(toKeep.find((e) => e.id === "4").reason.includes("task 7.3"));
  assert.ok(toKeep.find((e) => e.id === "6").reason.includes("question"));
});

test("groupCounts: counts by family for the closed set", () => {
  const { toClose } = planClosure(ROWS);
  const counts = groupCounts(toClose, (e) => e.family);
  assert.deepEqual(counts, { "authorship-shard": 2, "legacy-remediation-run-summary": 1, "citation-harvest-batch-summary": 1 });
});

test("planClosure: empty input -> empty output, no throw", () => {
  const { toClose, toKeep } = planClosure([]);
  assert.deepEqual(toClose, []);
  assert.deepEqual(toKeep, []);
  assert.deepEqual(planClosure(undefined), { toClose: [], toKeep: [] });
});

// ── main() orchestration, fake deps ─────────────────────────────────────────────────────────────────

function fakeDeps(rows, { remaining = [] } = {}) {
  const calls = [];
  return {
    calls,
    readCandidates: async () => rows,
    closeIds: async (ids) => {
      calls.push(["closeIds", ids]);
      return { updated: ids.length, snapshot: "snap-1" };
    },
    readRemainingOpen: async () => remaining,
  };
}

test("main: dry mode reports counts and a kept sample, writes nothing", async () => {
  const deps = fakeDeps(ROWS);
  const r = await main({ mode: "dry" }, deps);
  assert.equal(r.step, "close-run-logs");
  assert.equal(r.mode, "dry");
  assert.equal(r.counts.candidates_scanned, 6);
  assert.equal(r.counts.would_close, 4);
  assert.equal(r.counts.kept, 2);
  assert.equal(r.kept_total, 2);
  assert.ok(Array.isArray(r.kept_sample));
  assert.equal(deps.calls.length, 0, "dry mode must never call closeIds");
  assert.match(r.note, /DRY/);
});

test("main: apply mode writes the closeable ids and reports read-back", async () => {
  const deps = fakeDeps(ROWS, { remaining: [{ id: "6", created_by: "authorship-shard-2" }] });
  const r = await main({ mode: "apply" }, deps);
  assert.equal(r.mode, "apply");
  assert.equal(r.applied, 4);
  const [, ids] = deps.calls.find((c) => c[0] === "closeIds");
  assert.deepEqual(ids.sort(), ["1", "2", "3", "5"]);
  assert.equal(r.read_back.remaining_open_in_families, 1);
});

test("main: apply mode with nothing to close never calls closeIds", async () => {
  const deps = fakeDeps([{ id: "6", created_by: "authorship-shard-2", description: "is this in scope?" }]);
  const r = await main({ mode: "apply" }, deps);
  assert.equal(r.applied, 0);
  assert.equal(deps.calls.length, 0);
});

test("constants: resolved_by / resolution_note / cite are present and match the spec wording", () => {
  assert.equal(RESOLVED_BY, "close-run-logs");
  assert.match(RESOLUTION_NOTE, /run log, informational; closed under ADR-030 rider/);
  assert.ok(CITE.skill && CITE.reason);
});
