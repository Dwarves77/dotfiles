// Run: node --test scripts/maintenance/close-run-logs.test.mjs -- no DB, deps injected.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isPerItemQuestion, isLegacyRemediationRunSummary, hasRunSummaryMarker, hasAllWords,
  isAuthorshipRunSummary, isCitationHarvestRunSummary, decideRunLogClosure, planClosure, groupCounts,
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

// ── hasRunSummaryMarker / hasAllWords ────────────────────────────────────────────────────────────────

test("hasRunSummaryMarker: matches 'run summary' / 'run-summary' anywhere, case-insensitive", () => {
  assert.equal(hasRunSummaryMarker("RUN SUMMARY: 12 attempted"), true);
  assert.equal(hasRunSummaryMarker("closing this run-summary now"), true);
  assert.equal(hasRunSummaryMarker("a summary of the run, sort of"), false, "the two words must be adjacent");
});

test("hasAllWords: requires every word present, case-insensitively; a subset does not match", () => {
  assert.equal(hasAllWords("Attempted 10, Completed 8, Parked 1, Flagged 1", ["attempted", "completed", "parked", "flagged"]), true);
  assert.equal(hasAllWords("flagged for verifier judgment", ["attempted", "completed", "parked", "flagged"]), false);
  assert.equal(hasAllWords("", ["x"]), false);
});

// ── isAuthorshipRunSummary -- fix round 1 (reviewer finding A, CRITICAL) ─────────────────────────────
//
// Four fixture shapes per the coordinator's fix-round instruction: a BLOCKER, a "flagged for verifier
// judgment" per-item notice, a "NOVEL FINDING, not fixed" per-item notice, and a genuine run summary.

test("isAuthorshipRunSummary: a BLOCKER notice (the reviewer's own live repro) does NOT match", () => {
  assert.equal(
    isAuthorshipRunSummary("AUTHORSHIP-SHARD-8 BLOCKER: item needs operator decision on role placement, novel case"),
    false,
  );
});

test("isAuthorshipRunSummary: a 'flagged for verifier judgment' per-item notice does NOT match (one shared word alone is not enough)", () => {
  assert.equal(
    isAuthorshipRunSummary("AUTHORSHIP-SHARD-8: item flagged for verifier judgment, ambiguous jurisdiction mapping"),
    false,
  );
});

test("isAuthorshipRunSummary: a 'NOVEL FINDING, not fixed' per-item notice does NOT match", () => {
  assert.equal(
    isAuthorshipRunSummary("AUTHORSHIP-SHARD-8: NOVEL FINDING, not fixed -- source lacks any registrable tier, needs operator classification"),
    false,
  );
});

test("isAuthorshipRunSummary: a genuine run summary (all four charter categories + metering) matches", () => {
  assert.equal(
    isAuthorshipRunSummary(
      "RUN SUMMARY: 12 attempted, 9 completed-verified, 2 parked, 1 flagged; KPI 9/12 verified AND NOT is_archived; " +
      "metering: input_tokens=45000, output_tokens=3200, cache_read_input_tokens=120000, cache_creation_input_tokens=8000, turns=14",
    ),
    true,
  );
});

test("isAuthorshipRunSummary: the four category words together match even without an explicit 'run summary' marker", () => {
  assert.equal(isAuthorshipRunSummary("attempted 10, completed-verified 8, parked 1, flagged 1"), true);
});

// ── isCitationHarvestRunSummary -- fix round 1 (reviewer finding A, CRITICAL) ────────────────────────

test("isCitationHarvestRunSummary: a BLOCKER notice does NOT match", () => {
  assert.equal(
    isCitationHarvestRunSummary("CITATION-HARVEST BLOCKER: source lacks a decidable tier, needs operator review"),
    false,
  );
});

test("isCitationHarvestRunSummary: a 'flagged for verifier judgment' per-item notice does NOT match", () => {
  assert.equal(
    isCitationHarvestRunSummary("citation-harvest: url flagged for verifier judgment, ambiguous junk/document distinction"),
    false,
  );
});

test("isCitationHarvestRunSummary: a 'NOVEL FINDING, not fixed' per-item notice does NOT match", () => {
  assert.equal(
    isCitationHarvestRunSummary("citation-harvest: NOVEL FINDING, not fixed -- source structure not recognized by the tier heuristic"),
    false,
  );
});

test("isCitationHarvestRunSummary: the reviewer's own live repro (a per-item miss) does NOT match", () => {
  assert.equal(
    isCitationHarvestRunSummary("citation-harvest: missing source for item xyz, could not locate a citable document"),
    false,
  );
});

test("isCitationHarvestRunSummary: a genuine run summary (charter's own CLOSE shape) matches", () => {
  assert.equal(
    isCitationHarvestRunSummary("run-summary: 30 urls considered, 8 skipped as junk, 15 registered, 15 captured, 0 failed, backlog remaining: 142"),
    true,
  );
});

test("isCitationHarvestRunSummary: 'considered' + 'backlog' + a disposition word match even without an explicit marker", () => {
  assert.equal(isCitationHarvestRunSummary("30 urls considered, 15 registered, backlog remaining: 142"), true);
});

test("isCitationHarvestRunSummary: 'backlog' alone (no 'considered', no disposition word) does NOT match", () => {
  assert.equal(isCitationHarvestRunSummary("backlog remaining: 142"), false);
});

// ── decideRunLogClosure ──────────────────────────────────────────────────────────────────────────────

test("decideRunLogClosure: authorship-shard-N closes on a genuine run summary", () => {
  const d = decideRunLogClosure({
    created_by: "authorship-shard-3",
    description: "attempted 10, completed-verified 8, parked 1, flagged 1",
  });
  assert.equal(d.close, true);
  assert.equal(d.family, "authorship-shard");
});

test("decideRunLogClosure: authorship-shard-0 closes too (shard index 0 is still a shard) on a genuine run summary", () => {
  assert.equal(
    decideRunLogClosure({ created_by: "authorship-shard-0", description: "RUN SUMMARY: 5 attempted" }).close,
    true,
  );
});

test("decideRunLogClosure: authorship-shard-N does NOT close a per-item BLOCKER (fix round 1, CRITICAL regression test)", () => {
  const d = decideRunLogClosure({
    created_by: "authorship-shard-8",
    description: "AUTHORSHIP-SHARD-8 BLOCKER: item needs operator decision on role placement, novel case",
  });
  assert.equal(d.close, false);
  assert.equal(d.family, null);
  assert.match(d.reason, /task 7\.3/);
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

test("decideRunLogClosure: citation-harvest* closes on a genuine batch summary", () => {
  assert.equal(
    decideRunLogClosure({
      created_by: "citation-harvest-batch-12",
      description: "42 urls considered, 30 registered, backlog remaining: 8",
    }).close,
    true,
  );
  assert.equal(
    decideRunLogClosure({ created_by: "citation-harvest", description: "run-summary: batch report, backlog 0" }).close,
    true,
  );
});

test("decideRunLogClosure: citation-harvest* does NOT close a per-item miss (fix round 1, CRITICAL regression test -- the reviewer's own repro)", () => {
  const d = decideRunLogClosure({
    created_by: "citation-harvest",
    description: "citation-harvest: missing source for item xyz, could not locate a citable document",
  });
  assert.equal(d.close, false);
  assert.equal(d.family, null);
  assert.match(d.reason, /task 7\.3/);
});

test("decideRunLogClosure: the universal per-item-question guard still overrides every family", () => {
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
  { id: "1", created_by: "authorship-shard-0", description: "attempted 10, completed-verified 8, parked 1, flagged 1" },
  { id: "2", created_by: "authorship-shard-7", description: "RUN SUMMARY: attempted 5" },
  { id: "3", created_by: "legacy-remediation", description: "RUN SUMMARY: batch 2" },
  { id: "4", created_by: "legacy-remediation", description: "PARKED: item needs review" },
  { id: "5", created_by: "citation-harvest-b1", description: "12 urls considered, 8 registered, backlog remaining: 4" },
  { id: "6", created_by: "authorship-shard-2", description: "does this qualify?" },
  { id: "7", created_by: "authorship-shard-8", description: "AUTHORSHIP-SHARD-8 BLOCKER: item needs operator decision on role placement, novel case" },
  { id: "8", created_by: "citation-harvest", description: "citation-harvest: missing source for item xyz, could not locate a citable document" },
];

test("planClosure: partitions correctly and preserves per-row reason (includes the fix-round-1 blocker/miss regression rows 7 and 8)", () => {
  const { toClose, toKeep } = planClosure(ROWS);
  assert.deepEqual(toClose.map((e) => e.id).sort(), ["1", "2", "3", "5"]);
  assert.deepEqual(toKeep.map((e) => e.id).sort(), ["4", "6", "7", "8"]);
  assert.ok(toKeep.find((e) => e.id === "4").reason.includes("task 7.3"));
  assert.ok(toKeep.find((e) => e.id === "6").reason.includes("question"));
  assert.ok(toKeep.find((e) => e.id === "7").reason.includes("task 7.3"), "the authorship-shard BLOCKER must be kept, not closed as a log");
  assert.ok(toKeep.find((e) => e.id === "8").reason.includes("task 7.3"), "the citation-harvest per-item miss must be kept, not closed as a log");
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
  assert.equal(r.counts.candidates_scanned, 8);
  assert.equal(r.counts.would_close, 4);
  assert.equal(r.counts.kept, 4);
  assert.equal(r.kept_total, 4);
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
