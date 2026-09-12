// Pure-logic tests for resolve-provisional-sources.mjs (task 7.5 item 1, brief-chain build plan Part
// 7, 2026-09-12). No I/O, no DB, no fetch, no jiti (checkVerticalFitGate is lazy-loaded only inside
// buildDeps at runtime — see that file's header for why). Runs in the no-npm discipline glob.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideHost,
  hostForRow,
  provisionalDeadSignal,
  sourcesDeadSignal,
  planProvisionalSourceRow,
  planSourcesProvisionalRow,
  buildBatchWorklistFlag,
  PROVISIONAL_WORKLIST_STATUS,
  SOURCES_REJECT_STATUS,
  main,
} from "./resolve-provisional-sources.mjs";

// ── decideHost: the four-way rule ────────────────────────────────────────────────────────────────

test("decideHost rule (a): an existing-institution tier match promotes at that tier, never re-derived", () => {
  const d = decideHost("epa.gov", { existingTier: 2, classTier: 6, deadOrInaccessible: true });
  assert.equal(d.action, "promote");
  assert.equal(d.tier, 2); // existingTier wins over classTier even when both are present
  assert.equal(d.rule, "a");
});

test("decideHost rule (b): a class-table tier promotes when there is no institution match", () => {
  const d = decideHost("some.edu", { existingTier: null, classTier: 4, deadOrInaccessible: false });
  assert.equal(d.action, "promote");
  assert.equal(d.tier, 4);
  assert.equal(d.rule, "b");
});

test("decideHost rule (c): dead/inaccessible rejects only when neither (a) nor (b) resolved a tier", () => {
  const d = decideHost("dead.example", { existingTier: null, classTier: null, deadOrInaccessible: true });
  assert.equal(d.action, "reject");
  assert.equal(d.tier, null);
  assert.equal(d.rule, "c");
});

test("decideHost rule (d): an unclassifiable, not-dead host worklists — never a guessed tier", () => {
  const d = decideHost("mystery.example", { existingTier: null, classTier: null, deadOrInaccessible: false });
  assert.equal(d.action, "worklist");
  assert.equal(d.tier, null);
  assert.equal(d.rule, "d");
});

test("decideHost: rule (a)/(b) always win over a dead signal — a resolvable tier is never rejected", () => {
  const a = decideHost("epa.gov", { existingTier: 2, classTier: null, deadOrInaccessible: true });
  const b = decideHost("some.edu", { existingTier: null, classTier: 4, deadOrInaccessible: true });
  assert.equal(a.action, "promote");
  assert.equal(b.action, "promote");
});

// ── hostForRow / dead signals ────────────────────────────────────────────────────────────────────

test("hostForRow: derives the registrable host from a row's url, null on an unparsable/missing url", () => {
  assert.equal(hostForRow({ url: "https://www.example.gov/page" }), "example.gov");
  assert.equal(hostForRow({ url: null }), null);
  assert.equal(hostForRow({}), null);
});

test("provisionalDeadSignal: only an EXPLICIT accessibility_verified===false counts as dead", () => {
  assert.equal(provisionalDeadSignal({ accessibility_verified: false }), true);
  assert.equal(provisionalDeadSignal({ accessibility_verified: true }), false);
  assert.equal(provisionalDeadSignal({}), false); // unset/never-probed is NOT dead
  assert.equal(provisionalDeadSignal({ accessibility_verified: null }), false);
});

test("sourcesDeadSignal: only fetch_status='error' counts as dead — a wall (cdn_block/blocked) is not a dead link", () => {
  assert.equal(sourcesDeadSignal({ fetch_status: "error" }), true);
  assert.equal(sourcesDeadSignal({ fetch_status: "cdn_block" }), false);
  assert.equal(sourcesDeadSignal({ fetch_status: "blocked" }), false);
  assert.equal(sourcesDeadSignal({ fetch_status: "ok" }), false);
  assert.equal(sourcesDeadSignal({}), false);
});

// ── per-table pure planners ─────────────────────────────────────────────────────────────────────

test("planProvisionalSourceRow: a row with no parsable host worklists honestly, never a fabricated dead verdict", () => {
  const plan = planProvisionalSourceRow({ id: "p1", url: "not-a-url" }, { existingTier: null, classTier: null });
  assert.equal(plan.decision.action, "worklist");
  assert.equal(plan.host, null);
});

test("planProvisionalSourceRow: accessibility_verified=false rejects when no tier resolves", () => {
  const plan = planProvisionalSourceRow(
    { id: "p2", url: "https://dead.example/page", accessibility_verified: false },
    { existingTier: null, classTier: null },
  );
  assert.equal(plan.decision.action, "reject");
  assert.equal(plan.host, "dead.example");
});

test("planSourcesProvisionalRow: fetch_status='error' rejects when no tier resolves", () => {
  const plan = planSourcesProvisionalRow(
    { id: "s1", url: "https://dead.example/page", fetch_status: "error" },
    { existingTier: null, classTier: null },
  );
  assert.equal(plan.decision.action, "reject");
});

test("planSourcesProvisionalRow: an existing-institution match promotes even with a wall fetch_status", () => {
  const plan = planSourcesProvisionalRow(
    { id: "s2", url: "https://epa.gov/page", fetch_status: "cdn_block" },
    { existingTier: 2, classTier: null },
  );
  assert.equal(plan.decision.action, "promote");
  assert.equal(plan.decision.tier, 2);
});

// ── buildBatchWorklistFlag: ONE row per run, listing every host, not one row per host ──────────────

test("buildBatchWorklistFlag: one flag names every distinct host across both tables", () => {
  const flag = buildBatchWorklistFlag([
    { host: "mystery.example", table: "provisional_sources", id: "p1" },
    { host: "mystery.example", table: "sources", id: "s1" }, // same host, different table -> deduped in the host list
    { host: "another.example", table: "provisional_sources", id: "p2" },
  ]);
  assert.equal(flag.category, "source_issue");
  assert.equal(flag.subject_type, "source");
  assert.equal(flag.status, "open");
  assert.equal(flag.created_by, "resolve-provisional-sources");
  assert.match(flag.description, /mystery\.example/);
  assert.match(flag.description, /another\.example/);
  assert.equal(flag.recommended_actions[0].hosts.length, 2);
  assert.equal(flag.recommended_actions[0].entries.length, 3); // all three row-level contributions preserved
});

test("buildBatchWorklistFlag: description never exceeds integrity_flags.description's 480-char write cap", () => {
  const manyHosts = Array.from({ length: 60 }, (_, i) => ({ host: `host-${i}.example`, table: "provisional_sources", id: `p${i}` }));
  const flag = buildBatchWorklistFlag(manyHosts);
  assert.ok(flag.description.length <= 480, `description length ${flag.description.length} exceeds 480`);
});

// ── vocabulary constants (documented judgment calls, pinned so a silent drift is visible in review) ─

test("worklist/reject status vocabulary constants are the documented values", () => {
  assert.equal(PROVISIONAL_WORKLIST_STATUS, "needs_more_data");
  assert.equal(SOURCES_REJECT_STATUS, "suspended");
});

// ── main(): orchestration driven entirely by a fake deps object (no DB, no jiti, no fetch) ─────────

function fakeDeps({ pending = [], sourcesProv = [], active = [], gateAllow = true } = {}) {
  const calls = { promote: [], reject: [], worklist: [], activate: [], rejectSources: [], worklistSources: [], flags: [] };
  return {
    calls,
    readPendingProvisional: async () => pending,
    readProvisionalSourcesRows: async () => sourcesProv,
    readActiveSources: async () => active,
    checkVerticalFitGate: async () => ({ allow: gateAllow, reason: gateAllow ? undefined : "off-vertical retired host" }),
    promoteProvisional: async (row, tier, reason) => { calls.promote.push({ id: row.id, tier, reason }); return { sourceId: "new-src", reused: false }; },
    rejectProvisional: async (id, reason) => calls.reject.push({ id, reason }),
    worklistProvisional: async (id, reason) => calls.worklist.push({ id, reason }),
    activateSourcesRow: async (id, tier) => calls.activate.push({ id, tier }),
    rejectSourcesRow: async (id, reason) => calls.rejectSources.push({ id, reason }),
    worklistSourcesRow: async (id, reason) => calls.worklistSources.push({ id, reason }),
    insertBatchFlag: async (row) => { calls.flags.push(row); return { id: "flag-1" }; },
  };
}

test("main() dry: classifies every row into promote/reject/worklist without calling any write dep", async () => {
  const pending = [
    { id: "p1", url: "https://epa.gov/page" }, // rule a (existing active institution)
    { id: "p2", url: "https://some.edu/page" }, // rule b (class table)
    { id: "p3", url: "https://dead.example/page", accessibility_verified: false }, // rule c
    { id: "p4", url: "https://mystery.example/page" }, // rule d
  ];
  const active = [{ id: "s0", url: "https://epa.gov", status: "active", base_tier: 2 }];
  const deps = fakeDeps({ pending, active });
  const summary = await main({ mode: "dry" }, deps);
  assert.equal(summary.counts.promote, 2);
  assert.equal(summary.counts.reject, 1);
  assert.equal(summary.counts.worklist, 1);
  assert.equal(deps.calls.promote.length, 0, "dry must never write");
  assert.equal(deps.calls.reject.length, 0);
  assert.equal(deps.calls.flags.length, 0);
});

test("main() apply: promotes rule-a/b rows, rejects rule-c, worklists rule-d and writes ONE batch flag", async () => {
  const pending = [
    { id: "p1", url: "https://epa.gov/page" },
    { id: "p3", url: "https://dead.example/page", accessibility_verified: false },
    { id: "p4", url: "https://mystery.example/page" },
  ];
  const active = [{ id: "s0", url: "https://epa.gov", status: "active", base_tier: 2 }];
  const deps = fakeDeps({ pending, active });
  const summary = await main({ mode: "apply" }, deps);
  assert.equal(deps.calls.promote.length, 1);
  assert.equal(deps.calls.promote[0].tier, 2);
  assert.equal(deps.calls.reject.length, 1);
  assert.equal(deps.calls.worklist.length, 1);
  assert.equal(deps.calls.flags.length, 1, "exactly one batch worklist flag per run");
  assert.equal(summary.worklist_flag_id, "flag-1");
});

test("main() apply: the vertical-fit gate can turn a would-be promote into a reject (off-vertical retired host)", async () => {
  const pending = [{ id: "p1", url: "https://epa.gov/page" }];
  const active = [{ id: "s0", url: "https://epa.gov", status: "active", base_tier: 2 }];
  const deps = fakeDeps({ pending, active, gateAllow: false });
  const summary = await main({ mode: "apply" }, deps);
  assert.equal(deps.calls.promote.length, 0);
  assert.equal(deps.calls.reject.length, 1);
  assert.match(deps.calls.reject[0].reason, /vertical-fit gate/);
  assert.equal(summary.counts.reject, 1);
  assert.equal(summary.counts.promote, 0);
});

test("main() apply: sources-table provisional rows activate in place (UPDATE), never a second INSERT", async () => {
  const sourcesProv = [{ id: "s1", url: "https://some.edu/page" }];
  const deps = fakeDeps({ sourcesProv });
  const summary = await main({ mode: "apply" }, deps);
  assert.equal(deps.calls.activate.length, 1);
  assert.equal(deps.calls.activate[0].tier, 4);
  assert.equal(deps.calls.promote.length, 0, "sources-table rows never go through the provisional_sources promote path");
  assert.equal(summary.counts.promote, 1);
});

test("main(): zero pending rows across both tables is a clean no-op", async () => {
  const deps = fakeDeps({});
  const summary = await main({ mode: "apply" }, deps);
  assert.equal(summary.applied, 0);
  assert.equal(deps.calls.flags.length, 0);
});
