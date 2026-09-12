// Pure-logic tests for resolve-provisional-sources.mjs (task 7.5 item 1, brief-chain build plan Part
// 7, 2026-09-12; fixed per docs/plans/defect-fix-plan-2026-09-12.md D2/D3/D4/D13). No I/O, no DB, no
// fetch, no jiti (checkVerticalFitGate is lazy-loaded only inside buildDeps at runtime, see that
// file's header for why). Runs in the no-npm discipline glob.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideHost,
  hostForRow,
  sourcesDeadSignal,
  sourcesStatusForPromote,
  planProvisionalSourceRow,
  planSourcesProvisionalRow,
  syntheticItemIdFor,
  PROVISIONAL_WORKLIST_STATUS,
  SOURCES_REJECT_STATUS,
  main,
} from "./resolve-provisional-sources.mjs";
import { PROVISIONAL_SOURCES_STATUS_CHECK } from "../../src/lib/sources/promote-provisional.ts";

// ── decideHost: the two-way rule (defect D13 fix: rule c removed) ──────────────────────────────────

test("decideHost rule (a): an existing-institution tier match promotes at that tier, never re-derived", () => {
  const d = decideHost("epa.gov", { existingTier: 2, classTier: 6 });
  assert.equal(d.action, "promote");
  assert.equal(d.tier, 2); // existingTier wins over classTier even when both are present
  assert.equal(d.rule, "a");
});

test("decideHost rule (b): a class-table tier promotes when there is no institution match", () => {
  const d = decideHost("some.edu", { existingTier: null, classTier: 4 });
  assert.equal(d.action, "promote");
  assert.equal(d.tier, 4);
  assert.equal(d.rule, "b");
});

test("decideHost rule (d): an unclassifiable host worklists, never a guessed tier", () => {
  const d = decideHost("mystery.example", { existingTier: null, classTier: null });
  assert.equal(d.action, "worklist");
  assert.equal(d.tier, null);
  assert.equal(d.rule, "d");
});

// Defect D13 (docs/plans/defect-fix-plan-2026-09-12.md): rule (c) is REMOVED. decideHost's action
// space is now promote|worklist ONLY -- "reject" can never come out of decideHost for any input,
// including a host that would previously have been read as dead/inaccessible. A decline is possible
// only downstream, from the vertical-fit gate the provisional_sources promote arm already runs (see
// the main()-level test below), never from decideHost itself.
test("decideHost: 'reject' is not a producible outcome for any input -- rule c no longer exists", () => {
  const combos = [
    { existingTier: null, classTier: null }, // the old rule-c-fires shape, minus the removed signal
    { existingTier: 2, classTier: null },
    { existingTier: null, classTier: 4 },
    { existingTier: 2, classTier: 6 },
  ];
  for (const signals of combos) {
    const d = decideHost("any.example", signals);
    assert.notEqual(d.action, "reject", JSON.stringify(signals));
    assert.ok(["promote", "worklist"].includes(d.action), JSON.stringify(signals));
  }
});

// ── hostForRow / dead signals ────────────────────────────────────────────────────────────────────

test("hostForRow: derives the registrable host from a row's url, null on an unparsable/missing url", () => {
  assert.equal(hostForRow({ url: "https://www.example.gov/page" }), "example.gov");
  assert.equal(hostForRow({ url: null }), null);
  assert.equal(hostForRow({}), null);
});

// Defect D13 fix: provisionalDeadSignal is REMOVED (accessibility_verified is never read as evidence
// of anything -- no accessibility check has ever actually run against any live provisional_sources
// row, so treating its INSERT default as a "dead" verdict rejected 248 real institutions). There is no
// replacement signal for this table: accessibility simply never decides for provisional_sources rows.

test("sourcesDeadSignal: only fetch_status='error' counts as dead, a wall (cdn_block/blocked) is not a dead link", () => {
  assert.equal(sourcesDeadSignal({ fetch_status: "error" }), true);
  assert.equal(sourcesDeadSignal({ fetch_status: "cdn_block" }), false);
  assert.equal(sourcesDeadSignal({ fetch_status: "blocked" }), false);
  assert.equal(sourcesDeadSignal({ fetch_status: "ok" }), false);
  assert.equal(sourcesDeadSignal({}), false);
});

// Defect D13 fix: sourcesDeadSignal no longer decides promote vs. reject -- it only decides which
// `sources` STATUS a promote/activate writes.
test("sourcesStatusForPromote: inaccessible only on fetch_status='error', active otherwise (wall, ok, unprobed, or no column at all)", () => {
  assert.equal(sourcesStatusForPromote({ fetch_status: "error" }), "inaccessible");
  assert.equal(sourcesStatusForPromote({ fetch_status: "cdn_block" }), "active");
  assert.equal(sourcesStatusForPromote({ fetch_status: "blocked" }), "active");
  assert.equal(sourcesStatusForPromote({ fetch_status: "ok" }), "active");
  assert.equal(sourcesStatusForPromote({}), "active"); // unprobed
  assert.equal(sourcesStatusForPromote(undefined), "active"); // a provisional_sources row: no fetch_status column at all
});

// ── per-table pure planners ─────────────────────────────────────────────────────────────────────

test("planProvisionalSourceRow: a row with no parsable host worklists honestly, never a fabricated dead verdict", () => {
  const plan = planProvisionalSourceRow({ id: "p1", url: "not-a-url" }, { existingTier: null, classTier: null });
  assert.equal(plan.decision.action, "worklist");
  assert.equal(plan.host, null);
});

// Defect D13's own required test: a row with accessibility_verified=false and no class match goes to
// the worklist, not reject -- rule c is removed, and provisional_sources.accessibility_verified is
// never read as evidence of anything (its INSERT default is false on every one of the 497 live rows;
// no check has ever actually run).
test("planProvisionalSourceRow: accessibility_verified=false and no class match worklists, never rejects (D13)", () => {
  const plan = planProvisionalSourceRow(
    { id: "p2", url: "https://dead.example/page", accessibility_verified: false },
    { existingTier: null, classTier: null },
  );
  assert.equal(plan.decision.action, "worklist");
  assert.equal(plan.host, "dead.example");
});

// Defect D13's own required test: a class-matched row with fetch_status='error' PROMOTES (never
// rejects); the caller (applySourcesDecision, exercised at the main()-level test below) stamps the
// promoted row's status as 'inaccessible' via sourcesStatusForPromote, carrying the accessibility
// fact instead of letting it block the promotion.
test("planSourcesProvisionalRow: fetch_status='error' still promotes when a class tier resolves (D13)", () => {
  const plan = planSourcesProvisionalRow(
    { id: "s1", url: "https://some.edu/page", fetch_status: "error" },
    { existingTier: null, classTier: 4 },
  );
  assert.equal(plan.decision.action, "promote");
  assert.equal(plan.decision.tier, 4);
  assert.equal(sourcesStatusForPromote({ fetch_status: "error" }), "inaccessible");
});

test("planSourcesProvisionalRow: no tier resolves and no dead signal -> worklist, never reject (D13, rule c removed)", () => {
  const plan = planSourcesProvisionalRow(
    { id: "s1b", url: "https://dead.example/page", fetch_status: "error" },
    { existingTier: null, classTier: null },
  );
  assert.equal(plan.decision.action, "worklist");
});

test("planSourcesProvisionalRow: an existing-institution match promotes even with a wall fetch_status", () => {
  const plan = planSourcesProvisionalRow(
    { id: "s2", url: "https://epa.gov/page", fetch_status: "cdn_block" },
    { existingTier: 2, classTier: null },
  );
  assert.equal(plan.decision.action, "promote");
  assert.equal(plan.decision.tier, 2);
});

// ── syntheticItemIdFor (defect D3 fix): stable per-row key so a repeat resolve merges, not duplicates

test("syntheticItemIdFor: stable and table-qualified, so the same row always keys the same aggregate entry", () => {
  assert.equal(syntheticItemIdFor("provisional_sources", "p1"), "provisional_sources:p1");
  assert.equal(syntheticItemIdFor("sources", "p1"), "sources:p1");
  assert.notEqual(syntheticItemIdFor("provisional_sources", "p1"), syntheticItemIdFor("sources", "p1"));
});

// ── vocabulary constants (documented judgment calls, pinned so a silent drift is visible in review) ─

test("worklist/reject status vocabulary constants are the documented values", () => {
  assert.equal(PROVISIONAL_WORKLIST_STATUS, "needs_more_data");
  assert.equal(SOURCES_REJECT_STATUS, "suspended");
});

// Defect fix D2: PROVISIONAL_WORKLIST_STATUS must itself be inside the live
// provisional_sources_status_check set (imported from the shared module, the one place the
// vocabulary is spelled).
test("PROVISIONAL_WORKLIST_STATUS is in the live provisional_sources_status_check set", () => {
  assert.ok(PROVISIONAL_SOURCES_STATUS_CHECK.includes(PROVISIONAL_WORKLIST_STATUS));
});

// ── main(): orchestration driven entirely by a fake deps object (no DB, no jiti, no fetch) ─────────

function fakeDeps({ pending = [], sourcesProv = [], active = [], gateAllow = true, nullTierFlags = {} } = {}) {
  const calls = {
    promote: [], reject: [], worklist: [], activate: [], rejectSources: [], worklistSources: [],
    readNullTierFlag: [], insertNullTierFlag: [], updateNullTierFlag: [],
  };
  return {
    calls,
    readPendingProvisional: async () => pending,
    readProvisionalSourcesRows: async () => sourcesProv,
    readActiveSources: async () => active,
    checkVerticalFitGate: async () => ({ allow: gateAllow, reason: gateAllow ? undefined : "off-vertical retired host" }),
    promoteProvisional: async (row, tier, reason) => { calls.promote.push({ id: row.id, tier, reason }); return { sourceId: "new-src", reused: false }; },
    rejectProvisional: async (id, reason) => calls.reject.push({ id, reason }),
    worklistProvisional: async (id, reason) => calls.worklist.push({ id, reason }),
    activateSourcesRow: async (id, tier, status) => calls.activate.push({ id, tier, status }),
    rejectSourcesRow: async (id, reason) => calls.rejectSources.push({ id, reason }),
    worklistSourcesRow: async (id, reason) => calls.worklistSources.push({ id, reason }),
    // Defect D3 fix: the shared per-host null-tier-host mechanism's own three deps, matching
    // resolve-cited-host-gate.mjs's own buildDeps shape exactly.
    readNullTierFlag: async (host) => {
      calls.readNullTierFlag.push(host);
      return nullTierFlags[host] ?? null;
    },
    insertNullTierFlag: async (row) => {
      calls.insertNullTierFlag.push(row);
      nullTierFlags[row.subject_ref] = { id: `flag-${row.subject_ref}`, recommended_actions: row.recommended_actions };
    },
    updateNullTierFlag: async (id, patch) => {
      calls.updateNullTierFlag.push({ id, patch });
      const host = Object.keys(nullTierFlags).find((h) => nullTierFlags[h]?.id === id);
      if (host) nullTierFlags[host] = { id, recommended_actions: patch.recommended_actions };
    },
  };
}

// Defect D13 fix: p3 (dead.example, accessibility_verified=false, no institution/class match) now
// WORKLISTS -- rule c is removed, so an unresolvable tier never rejects on accessibility alone.
test("main() dry: classifies every row into promote/worklist without calling any write dep (D13: no rule-c reject)", async () => {
  const pending = [
    { id: "p1", url: "https://epa.gov/page" }, // rule a (existing active institution)
    { id: "p2", url: "https://some.edu/page" }, // rule b (class table)
    { id: "p3", url: "https://dead.example/page", accessibility_verified: false }, // D13: worklist, not reject
    { id: "p4", url: "https://mystery.example/page" }, // rule d
  ];
  const active = [{ id: "s0", url: "https://epa.gov", status: "active", base_tier: 2 }];
  const deps = fakeDeps({ pending, active });
  const summary = await main({ mode: "dry" }, deps);
  assert.equal(summary.counts.promote, 2);
  assert.equal(summary.counts.reject, 0, "D13: rule c removed, dry mode never predicts a reject");
  assert.equal(summary.counts.worklist, 2);
  assert.equal(deps.calls.promote.length, 0, "dry must never write");
  assert.equal(deps.calls.reject.length, 0);
  assert.equal(deps.calls.insertNullTierFlag.length, 0);
});

test("main() apply: promotes rule-a/b rows, worklists everything else, via the per-host null-tier-host merge (D13: no rule-c reject)", async () => {
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
  assert.equal(deps.calls.reject.length, 0, "D13: rule c removed, accessibility_verified=false no longer rejects");
  assert.equal(deps.calls.worklist.length, 2, "p3 (dead, unclassifiable) and p4 (unclassifiable) both worklist");
  assert.equal(deps.calls.insertNullTierFlag.length, 2, "one null-tier-host flag insert per unclassifiable host");
  const flaggedHosts = deps.calls.insertNullTierFlag.map((r) => r.subject_ref).sort();
  assert.deepEqual(flaggedHosts, ["dead.example", "mystery.example"]);
  assert.equal(summary.worklist_flag_writes.inserted, 2);
  assert.equal(summary.worklist_flag_writes.updated, 0);
});

// Defect D3's own idempotency requirement (defect-fix-plan-2026-09-12.md D3, review-7.5.md finding 2):
// a second run over the SAME still-unclassifiable input must insert 0 new flag rows and instead
// update the existing per-host row's contribution list.
test("main() apply, run twice: the second run inserts 0 new null-tier-host flag rows and updates the existing one instead", async () => {
  const pending = [{ id: "p4", url: "https://mystery.example/page" }];
  const deps = fakeDeps({ pending });

  const first = await main({ mode: "apply" }, deps);
  assert.equal(deps.calls.insertNullTierFlag.length, 1);
  assert.equal(deps.calls.updateNullTierFlag.length, 0);
  assert.equal(first.worklist_flag_writes.inserted, 1);

  // Second run over the identical input (the row is still worklisted, still unclassifiable).
  const second = await main({ mode: "apply" }, deps);
  assert.equal(deps.calls.insertNullTierFlag.length, 1, "still exactly one insert across both runs");
  assert.equal(deps.calls.updateNullTierFlag.length, 1, "the second run updates instead of inserting");
  assert.equal(second.worklist_flag_writes.inserted, 0);
  assert.equal(second.worklist_flag_writes.updated, 1);

  // The contribution list merged rather than duplicating: the same synthetic item id contributes
  // once, not twice, across the two runs.
  const finalPatch = deps.calls.updateNullTierFlag[0].patch;
  assert.deepEqual(
    finalPatch.recommended_actions[0].aggregate.perItemFacts,
    { "provisional_sources:p4": 1 },
  );
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

test("main() apply: sources-table provisional rows activate in place (UPDATE), never a second INSERT, status active when fetch_status is unset", async () => {
  const sourcesProv = [{ id: "s1", url: "https://some.edu/page" }];
  const deps = fakeDeps({ sourcesProv });
  const summary = await main({ mode: "apply" }, deps);
  assert.equal(deps.calls.activate.length, 1);
  assert.equal(deps.calls.activate[0].tier, 4);
  assert.equal(deps.calls.activate[0].status, "active");
  assert.equal(deps.calls.promote.length, 0, "sources-table rows never go through the provisional_sources promote path");
  assert.equal(summary.counts.promote, 1);
});

// Defect D13's own required test: a class-matched row with fetch_status='error' PROMOTES with status
// 'inaccessible' -- rule c is removed, so a dead-but-classified host is never rejected; its
// unreachability is recorded on the promoted row's own status instead. Supersedes the pre-D13 test
// that asserted this row called rejectSourcesRow (that mechanism is now unreached from main() for the
// `sources` table -- see resolve-provisional-sources.mjs's applySourcesDecision header comment).
test("main() apply: a class-matched sources-table row with fetch_status='error' promotes with status 'inaccessible', never rejects (D13)", async () => {
  const sourcesProv = [{ id: "s3", url: "https://some.edu/page", fetch_status: "error" }];
  const deps = fakeDeps({ sourcesProv });
  const summary = await main({ mode: "apply" }, deps);
  assert.equal(deps.calls.rejectSources.length, 0, "D13: rule c removed, a dead-but-classified host never rejects");
  assert.equal(deps.calls.activate.length, 1);
  assert.equal(deps.calls.activate[0].tier, 4);
  assert.equal(deps.calls.activate[0].status, "inaccessible");
  assert.equal(summary.counts.promote, 1);
  assert.equal(summary.counts.reject, 0);
});

// An unclassified AND dead sources-table row (no institution/class match, fetch_status='error') now
// worklists, never rejects -- there is no vertical-fit gate on this table's promote path, so once
// rule c is gone this table has no decline path left at all through this step.
test("main() apply: an unclassified, dead sources-table row worklists, never rejects (D13, no gate on this table)", async () => {
  const sourcesProv = [{ id: "s4", url: "https://dead.example/page", fetch_status: "error" }];
  const deps = fakeDeps({ sourcesProv });
  const summary = await main({ mode: "apply" }, deps);
  assert.equal(deps.calls.rejectSources.length, 0);
  assert.equal(deps.calls.activate.length, 0);
  assert.equal(deps.calls.worklistSources.length, 1);
  assert.equal(summary.counts.worklist, 1);
  assert.equal(summary.counts.reject, 0);
});

// Fix round 2 for D3 (defect-fix-plan-2026-09-12.md, re-review of 16179a2a, CONFIRMED regression):
// worklistProvisional/worklistSourcesRow were nested inside `if (plan.host)` next to the null-tier-host
// flag merge, so a row whose URL has no parsable host was COUNTED as worklisted but its own row was
// NEVER written on apply, and never reached a terminal state. Fixed: the row-level write runs for
// every worklist decision; only the per-host flag merge is conditional on having a real host.
test("main() apply: a provisional_sources row with an unparsable URL reaches its terminal state with 'URL has no parsable host', and no flag row is inserted", async () => {
  const pending = [{ id: "p9", url: "not-a-url" }];
  const deps = fakeDeps({ pending });
  const summary = await main({ mode: "apply" }, deps);

  assert.equal(deps.calls.worklist.length, 1, "the row's own terminal write must run even with no host");
  assert.equal(deps.calls.worklist[0].id, "p9");
  assert.equal(deps.calls.worklist[0].reason, "URL has no parsable host");
  assert.equal(deps.calls.insertNullTierFlag.length, 0, "a null host has no flag to merge into");
  assert.equal(deps.calls.updateNullTierFlag.length, 0);
  assert.equal(summary.counts.worklist, 1);
  assert.equal(summary.worklist_flag_writes.inserted, 0);

  // A second run over the identical input changes nothing further: the row-level write runs again
  // (idempotent, same terminal status/reason both times) and still no flag row is ever touched.
  const second = await main({ mode: "apply" }, deps);
  assert.equal(deps.calls.worklist.length, 2);
  assert.equal(deps.calls.worklist[1].reason, "URL has no parsable host");
  assert.equal(deps.calls.insertNullTierFlag.length, 0);
  assert.equal(deps.calls.updateNullTierFlag.length, 0);
  assert.equal(second.worklist_flag_writes.inserted, 0);
  assert.equal(second.worklist_flag_writes.updated, 0);
});

test("main() apply: a sources-table row with an unparsable URL reaches its terminal state with 'URL has no parsable host'", async () => {
  const sourcesProv = [{ id: "s9", url: "not-a-url" }];
  const deps = fakeDeps({ sourcesProv });
  const summary = await main({ mode: "apply" }, deps);

  assert.equal(deps.calls.worklistSources.length, 1, "the row's own terminal write must run even with no host");
  assert.equal(deps.calls.worklistSources[0].id, "s9");
  assert.equal(deps.calls.worklistSources[0].reason, "URL has no parsable host");
  assert.equal(deps.calls.insertNullTierFlag.length, 0);
  assert.equal(summary.counts.worklist, 1);
});

test("main() dry: a null-host worklist row is counted but the row-level write never fires in dry mode", async () => {
  const pending = [{ id: "p10", url: "not-a-url" }];
  const deps = fakeDeps({ pending });
  const summary = await main({ mode: "dry" }, deps);
  assert.equal(summary.counts.worklist, 1);
  assert.equal(deps.calls.worklist.length, 0, "dry mode must never write, including the row-level terminal write");
});

test("main(): zero pending rows across both tables is a clean no-op", async () => {
  const deps = fakeDeps({});
  const summary = await main({ mode: "apply" }, deps);
  assert.equal(summary.applied, 0);
  assert.equal(deps.calls.insertNullTierFlag.length, 0);
});
