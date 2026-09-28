import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isValidDeferral } from "./lib/deferral.mjs";
import { planDispositions, buildDeferralCandidate, runPlanner, nextRunNumberFromHarnessRuns } from "./plan-quarantine-disposition.mjs";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-09-28T00:00:00Z");
const iso = (ms) => new Date(NOW.getTime() + ms).toISOString();

test("every REASON_CLASS candidate satisfies scripts/lib/deferral.mjs's isValidDeferral", () => {
  for (const cls of ["needs_acquire", "stale_snapshot", "held_type_q2_gate", "provenance_gate_insufficient", "verify_error"]) {
    const c = buildDeferralCandidate("item-1", cls, NOW);
    const verdict = isValidDeferral({ reason: c.reason, deferred_until: c.deferred_until, owner: c.owner, resolution_event: c.resolution_event }, NOW);
    assert.equal(verdict.ok, true, `reason class '${cls}' failed isValidDeferral: ${verdict.error}`);
    assert.equal(c.item_id, "item-1");
    assert.equal(c.owner, "coordinator");
  }
});

test("buildDeferralCandidate throws on an unknown reason class", () => {
  assert.throws(() => buildDeferralCandidate("x", "not_a_real_class", NOW));
});

test("planDispositions: within-bound item -> within_bound, no deferral candidate", () => {
  const items = [{ id: "a", legacy_id: "it-a", item_type: "regulation" }];
  const flags = [{ subject_ref: "a", created_at: iso(-3 * DAY), created_by: "trigger", status: "open" }];
  const { plan, counts, deferralCandidates } = planDispositions({ items, flags, cheapDecisionByItemId: new Map(), now: NOW });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].disposition, "within_bound");
  assert.equal(counts.within_bound, 1);
  assert.equal(deferralCandidates.length, 0);
});

test("planDispositions: past-bound with an existing valid deferral -> already_deferred, no NEW candidate", () => {
  const items = [{ id: "a", legacy_id: "it-a", item_type: "regulation" }];
  const flags = [
    { subject_ref: "a", created_at: iso(-20 * DAY), created_by: "trigger", status: "open" },
    { subject_ref: "a", created_at: iso(-1 * DAY), created_by: "disposition_deferred", status: "open",
      recommended_actions: [{ deferral: { reason: "Needs-acquire: blocked pending re-ground.", deferred_until: iso(10 * DAY), owner: "coordinator", resolution_event: "x" } }] },
  ];
  const { plan, counts, deferralCandidates } = planDispositions({ items, flags, cheapDecisionByItemId: new Map(), now: NOW });
  assert.equal(plan[0].disposition, "already_deferred");
  assert.equal(counts.already_deferred, 1);
  assert.equal(deferralCandidates.length, 0);
});

test("planDispositions: enqueue-missing item -> enqueue_missing, flagged not planned", () => {
  const items = [{ id: "a", legacy_id: "it-a", item_type: "regulation" }];
  const { plan, counts } = planDispositions({ items, flags: [], cheapDecisionByItemId: new Map(), now: NOW });
  assert.equal(plan[0].disposition, "enqueue_missing");
  assert.equal(counts.enqueue_missing, 1);
});

test("planDispositions: past-bound HELD item_type -> deferral_candidate:held_type_q2_gate, regardless of cheap-verify", () => {
  const items = [{ id: "a", legacy_id: "it-a", item_type: "research_finding" }];
  const flags = [{ subject_ref: "a", created_at: iso(-20 * DAY), created_by: "trigger", status: "open" }];
  const { plan, counts, deferralCandidates } = planDispositions({ items, flags, cheapDecisionByItemId: new Map(), now: NOW });
  assert.equal(plan[0].disposition, "deferral_candidate");
  assert.equal(plan[0].reason_class, "held_type_q2_gate");
  assert.equal(counts["deferral_candidate:held_type_q2_gate"], 1);
  assert.equal(deferralCandidates.length, 1);
  assert.equal(deferralCandidates[0].reason_class, "held_type_q2_gate");
});

test("planDispositions: past-bound non-held item classifies by cheap-verify outcome", () => {
  const items = [
    { id: "a", legacy_id: "it-a", item_type: "regulation" },
    { id: "b", legacy_id: "it-b", item_type: "regulation" },
    { id: "c", legacy_id: "it-c", item_type: "regulation" },
    { id: "d", legacy_id: "it-d", item_type: "regulation" },
  ];
  const flags = items.map((it) => ({ subject_ref: it.id, created_at: iso(-20 * DAY), created_by: "trigger", status: "open" }));
  const cheapDecisionByItemId = new Map([
    ["a", { outcome: "needs-acquire" }],
    ["b", { outcome: "stale-snapshot" }],
    ["c", { outcome: "cheap-ok-still-quarantined" }],
    ["d", { outcome: "error", error: "boom" }],
  ]);
  const { plan, counts } = planDispositions({ items, flags, cheapDecisionByItemId, now: NOW });
  const byId = Object.fromEntries(plan.map((p) => [p.item_id, p.reason_class]));
  assert.equal(byId.a, "needs_acquire");
  assert.equal(byId.b, "stale_snapshot");
  assert.equal(byId.c, "provenance_gate_insufficient");
  assert.equal(byId.d, "verify_error");
  assert.equal(counts["deferral_candidate:needs_acquire"], 1);
  assert.equal(counts["deferral_candidate:stale_snapshot"], 1);
  assert.equal(counts["deferral_candidate:provenance_gate_insufficient"], 1);
  assert.equal(counts["deferral_candidate:verify_error"], 1);
});

test("planDispositions: past-bound item with NO cheap-verify decision recorded falls back to needs_acquire (never silently dropped)", () => {
  const items = [{ id: "a", legacy_id: "it-a", item_type: "regulation" }];
  const flags = [{ subject_ref: "a", created_at: iso(-20 * DAY), created_by: "trigger", status: "open" }];
  const { plan } = planDispositions({ items, flags, cheapDecisionByItemId: new Map(), now: NOW });
  assert.equal(plan[0].reason_class, "needs_acquire");
});

// ── runPlanner integration (fake sb/readAllFn/familyDir -- no real DB, no real repo writes) ────────────

function fakeDb({ items, flags, harnessRuns = [] }) {
  return async (table) => {
    if (table === "intelligence_items") return items;
    if (table === "integrity_flags") return flags;
    if (table === "harness_runs") return harnessRuns;
    throw new Error(`fakeDb: unexpected table ${table}`);
  };
}

// ── nextRunNumberFromHarnessRuns (coordinator ruling, 2026-09-28: harness_runs is the durable record
//    since #813, not a maintenance-artifact/* branch scan -- see this function's own header) ───────────

test("nextRunNumberFromHarnessRuns: no prior rows -> 1", async () => {
  const n = await nextRunNumberFromHarnessRuns(fakeDb({ items: [], flags: [], harnessRuns: [] }), "quarantine-disposition");
  assert.equal(n, 1);
});

test("nextRunNumberFromHarnessRuns: picks max+1, not count+1 (a gap in numbers must not be filled)", async () => {
  const rows = [{ run_id: "quarantine-disposition-run-001" }, { run_id: "quarantine-disposition-run-003" }];
  const n = await nextRunNumberFromHarnessRuns(fakeDb({ items: [], flags: [], harnessRuns: rows }), "quarantine-disposition");
  assert.equal(n, 4);
});

test("nextRunNumberFromHarnessRuns: ignores rows from a DIFFERENT family's run_id shape and malformed ids", async () => {
  const rows = [
    { run_id: "quarantine-disposition-run-002" },
    { run_id: "maintenance-run-099" },       // different family, must not leak in
    { run_id: "not-a-run-id-at-all" },       // malformed, must not throw
    { run_id: null },                         // null, must not throw
  ];
  const n = await nextRunNumberFromHarnessRuns(fakeDb({ items: [], flags: [], harnessRuns: rows }), "quarantine-disposition");
  assert.equal(n, 3);
});

test("nextRunNumberFromHarnessRuns: queries scoped to the named family (match filter honored)", async () => {
  let capturedMatch = null;
  const readAllFn = async (table, columns, opts) => {
    if (table === "harness_runs") {
      capturedMatch = opts?.match;
      return [{ run_id: "quarantine-disposition-run-005" }];
    }
    throw new Error("unexpected table");
  };
  const n = await nextRunNumberFromHarnessRuns(readAllFn, "quarantine-disposition");
  assert.equal(n, 6);
  assert.equal(typeof capturedMatch, "function", "must pass a match filter scoping to harness_family");
});

test("runPlanner (dry): reads, plans, writes a harness-run artifact, records harness_runs (fake), writes NO plan.json", async (t) => {
  const familyDir = mkdtempSync(join(tmpdir(), "qd-plan-test-"));
  t.after(() => rmSync(familyDir, { recursive: true, force: true }));

  const items = [
    { id: "a", legacy_id: "it-a", item_type: "regulation" },     // within-bound
    { id: "b", legacy_id: "it-b", item_type: "research_finding" }, // held, past-bound
  ];
  const flags = [
    { subject_ref: "a", created_at: iso(-3 * DAY), created_by: "trigger", status: "open" },
    { subject_ref: "b", created_at: iso(-20 * DAY), created_by: "trigger", status: "open" },
  ];

  const recorded = [];
  const r = await runPlanner(
    { mode: "dry", out: null, dispatchApplyDeferrals: false },
    {
      sb: {},
      readAllFn: fakeDb({ items, flags }),
      log: () => {},
      now: NOW,
      familyDir,
      recordHarnessRunFn: async (sb, artifact) => { recorded.push(artifact); return { ok: true, run_id: artifact.run_id }; },
    }
  );

  assert.equal(r.counts.within_bound, 1);
  assert.equal(r.counts["deferral_candidate:held_type_q2_gate"], 1);
  assert.equal(r.outPlanPath, null, "dry mode must not write plan.json");
  assert.ok(existsSync(r.artifactPath), "harness-run artifact must be written even in dry mode");
  assert.equal(recorded.length, 1, "recordHarnessRun must be called even in dry mode (rule 17 harness record)");
  assert.equal(recorded[0].harness_family, "quarantine-disposition");
  assert.equal(recorded[0].config.mode, "dry");
  assert.equal(recorded[0].config.r14_live_write_held, true);

  const onDisk = JSON.parse(readFileSync(r.artifactPath, "utf8"));
  assert.equal(onDisk.run_id, r.runId);
  assert.ok(Array.isArray(onDisk.full_trace_refs) && onDisk.full_trace_refs.length > 0);
});

test("runPlanner (apply, dispatchApplyDeferrals): writes plan.json and exercises apply-deferrals.mjs in ITS dry mode -- never a real write", async (t) => {
  const familyDir = mkdtempSync(join(tmpdir(), "qd-plan-test-"));
  const outDir = mkdtempSync(join(tmpdir(), "qd-plan-out-"));
  t.after(() => { rmSync(familyDir, { recursive: true, force: true }); rmSync(outDir, { recursive: true, force: true }); });

  const items = [{ id: "a", legacy_id: "it-a", item_type: "regulation" }];
  const flags = [{ subject_ref: "a", created_at: iso(-20 * DAY), created_by: "trigger", status: "open" }];

  const r = await runPlanner(
    { mode: "apply", out: outDir, dispatchApplyDeferrals: true },
    {
      sb: {},
      readAllFn: fakeDb({ items, flags }),
      log: () => {},
      now: NOW,
      familyDir,
      recordHarnessRunFn: async (sb, artifact) => ({ ok: true, run_id: artifact.run_id }),
    }
  );

  assert.ok(r.outPlanPath && existsSync(r.outPlanPath), "apply mode must write plan.json");
  const planOnDisk = JSON.parse(readFileSync(r.outPlanPath, "utf8"));
  assert.equal(planOnDisk.length, 1);
  assert.equal(planOnDisk[0].item_id, "a");

  assert.ok(r.applyDeferralsDryResult, "apply-deferrals.mjs hand-off must have run");
  assert.equal(r.applyDeferralsDryResult.mode, "dry", "the hand-off must stay in apply-deferrals.mjs's OWN dry mode while R14 holds");
  assert.equal(r.applyDeferralsDryResult.applied, 0, "dry mode never writes a row");
  assert.equal(r.applyDeferralsDryResult.counts.valid, 1);
});

// Regression: live run 36446625925 (2026-09-28) passed the READ-GUARDED `sb` (scripts/lib/db.mjs's
// readClient() proxy, whose .from(table).insert THROWS by design, rule 015) straight into
// recordHarnessRun, so the harness_runs insert threw every time and was swallowed silently (no
// recordHarnessRunFn override in real dispatches -- only tests supply one). This proves `sb` is NEVER
// touched for the insert when no override is given: a throwing `sb` must not be the thing that fails.
test("runPlanner (no recordHarnessRunFn override): never calls .insert on the guarded `sb` -- fails only on missing creds for the SEPARATE write client, never on sb.from(...).insert throwing", async (t) => {
  const familyDir = mkdtempSync(join(tmpdir(), "qd-plan-test-"));
  t.after(() => rmSync(familyDir, { recursive: true, force: true }));

  const items = [{ id: "a", legacy_id: "it-a", item_type: "regulation" }];
  const flags = [{ subject_ref: "a", created_at: iso(-20 * DAY), created_by: "trigger", status: "open" }];

  // Mimics scripts/lib/db.mjs's readClient() guard proxy: .from(table).insert throws synchronously.
  const guardedSb = {
    from() {
      return {
        insert() { throw new Error("db.mjs: write refused -- use a guarded function (rule 015)"); },
        select() { return this; }, eq() { return this; }, single() { return Promise.resolve({ data: null }); },
      };
    },
  };

  const savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  t.after(() => {
    if (savedUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl;
    if (savedKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
  });

  const r = await runPlanner(
    { mode: "dry", out: null, dispatchApplyDeferrals: false },
    { sb: guardedSb, readAllFn: fakeDb({ items, flags }), log: () => {}, now: NOW, familyDir }
    // no recordHarnessRunFn override -- exercises the real buildHarnessRunsClient() branch.
  );

  assert.equal(r.harnessRunRow.ok, false);
  assert.match(r.harnessRunRow.error, /NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY/, "must fail on missing credentials for the dedicated write client, never on guardedSb.from(...).insert throwing (rule 015)");
  assert.doesNotMatch(r.harnessRunRow.error, /write refused|rule 015/, "guardedSb's own throw text must never appear -- proves guardedSb.insert was never called");
});

// Collision case (coordinator ruling, 2026-09-28): the OLD behavior claimed the run_id from the LOCAL
// git checkout alone (scanning the family dir for existing run-NNN.json files), which is empty on every
// fresh CI checkout unless a prior run's own git branch happened to have merged -- confirmed live to
// collide on harness_runs' primary key four dispatches in a row (runs 36446625925, 36450334869,
// 36452938188, 36457240971) before this fix. This proves the NEW behavior: with an EMPTY local family
// dir (the CI-checkout condition that caused every collision) but harness_runs already holding
// run-001..003, runPlanner claims run-004, never re-claiming a number harness_runs already has.
test("runPlanner: claims the run_id from harness_runs, not the (possibly empty) local checkout -- the collision case", async (t) => {
  const familyDir = mkdtempSync(join(tmpdir(), "qd-plan-test-")); // EMPTY -- no run-NNN.json committed here, exactly like a fresh CI checkout
  t.after(() => rmSync(familyDir, { recursive: true, force: true }));

  const items = [{ id: "a", legacy_id: "it-a", item_type: "regulation" }];
  const flags = [{ subject_ref: "a", created_at: iso(-3 * DAY), created_by: "trigger", status: "open" }];
  const harnessRuns = [
    { run_id: "quarantine-disposition-run-001" },
    { run_id: "quarantine-disposition-run-002" },
    { run_id: "quarantine-disposition-run-003" },
  ];

  const recorded = [];
  const r = await runPlanner(
    { mode: "dry", out: null, dispatchApplyDeferrals: false },
    {
      sb: {},
      readAllFn: fakeDb({ items, flags, harnessRuns }),
      log: () => {},
      now: NOW,
      familyDir,
      recordHarnessRunFn: async (sb, artifact) => { recorded.push(artifact); return { ok: true, run_id: artifact.run_id }; },
    }
  );

  assert.equal(r.runId, "quarantine-disposition-run-004", "must claim run-004 (harness_runs' own next number), never re-claim run-001 from the empty local checkout");
  assert.equal(recorded[0].run_id, "quarantine-disposition-run-004");
});
