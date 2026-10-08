// plan-drain.test.mjs: the judgement drain planner on fixtures with injected deps (lane G6-DRAIN). No database,
// no network, no exporter is run. Acceptance: switch off or fleet-budget-halt open -> exit at STEP 0 with no
// further read (asserted by injected deps); switch on -> a plan with kinds, counts, batch paths and leases.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KINDS, kindById } from "./kinds.mjs";
import { decideDrainSwitch } from "./switch.mjs";
import { planDrain, releasePlanLeases, earliestPending, orderKinds, parseArgs, defaultRunId, runExporter, PLAN_SCHEMA, LEASE_STALE_SECONDS } from "./plan-drain.mjs";
import { emitJudgementDrainArtifact, buildDrainRun } from "./artifact.mjs";

const ON = decideDrainSwitch({ judgementDrain: "on", emergencyPaused: false, fleetHalted: false });
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NOW = () => "2026-10-06T00:00:00.000Z";

/** deps whose every call is recorded; any call outside `allowed` fails the test. */
function spyDeps({ sw = ON, queues = {}, dirs = {}, held = {} } = {}) {
  const calls = [];
  const deps = {
    readSwitch: async () => { calls.push("readSwitch"); return sw; },
    exportQueue: async (kind, o) => { calls.push(`exportQueue:${kind.id}:${o.limit}`); return queues[kind.id] ?? { ok: true, items: [] }; },
    listBatchDir: (kind) => { calls.push(`listBatchDir:${kind.id}`); return dirs[kind.id] ?? []; },
    acquire: async (id, holder, lane, stale) => {
      calls.push(`acquire:${id}`);
      if (held[id]) return { acquired: false, cur_holder: held[id] };
      return { acquired: true, cur_holder: holder, lane, stale };
    },
    now: NOW,
  };
  return { deps, calls };
}

test("STEP 0: switch off exits before ANY other read (only the switch read is touched)", async () => {
  const { deps, calls } = spyDeps({ sw: decideDrainSwitch({ judgementDrain: "off", emergencyPaused: false, fleetHalted: false }) });
  const plan = await planDrain(deps, { runId: "r1" });
  assert.deepEqual(calls, ["readSwitch"]);
  assert.equal(plan.drain, "off");
  assert.equal(plan.schema, PLAN_SCHEMA);
  assert.deepEqual(plan.kinds, []);
  assert.deepEqual(plan.leases, []);
  assert.match(plan.switch.reason, /judgement_drain is off/);
});

test("STEP 0: an open fleet-budget-halt exits at STEP 0 with the same no-further-read guarantee, even with the switch on", async () => {
  const { deps, calls } = spyDeps({ sw: decideDrainSwitch({ judgementDrain: "on", emergencyPaused: false, fleetHalted: true }) });
  const plan = await planDrain(deps, { runId: "r1" });
  assert.deepEqual(calls, ["readSwitch"]);
  assert.equal(plan.drain, "off");
  assert.match(plan.switch.reason, /fleet-budget-halt/);
});

test("STEP 0: the emergency stop halts the drain the same way", async () => {
  const { deps, calls } = spyDeps({ sw: decideDrainSwitch({ judgementDrain: "on", emergencyPaused: true, fleetHalted: false }) });
  assert.equal((await planDrain(deps, { runId: "r1" })).drain, "off");
  assert.deepEqual(calls, ["readSwitch"]);
});

test("switch on: a plan with kinds, counts, batch paths, the apply workflow of each, and the leases held", async () => {
  const themes = Array.from({ length: 3 }, (_, i) => ({ theme_id: uuid(10 + i), created_at: "2026-09-01T00:00:00Z" }));
  const questions = [{ subject_ref: "question:a", item_id: uuid(20) }, { subject_ref: "question:b", item_id: uuid(21) }];
  const { deps, calls } = spyDeps({
    queues: { "theme-briefs": { ok: true, items: themes, source: { type: "file", path: "/tmp/t.json" } }, "question-answers": { ok: true, items: questions } },
    dirs: { "theme-briefs": ["theme-briefs-001.json", "theme-briefs-002.json"] },
  });
  const plan = await planDrain(deps, { runId: "r2" });
  assert.equal(plan.drain, "on");
  assert.equal(plan.holder, "drain-r2");
  const tb = plan.kinds.find((k) => k.kind === "theme-briefs");
  assert.equal(tb.batches.length, 1);
  assert.equal(tb.batches[0].batch_path, "scripts/turns/theme-briefs/batches/theme-briefs-003.json");
  assert.deepEqual(tb.batches[0].item_ids, themes.map((t) => t.theme_id));
  assert.equal(tb.apply_workflow, "theme-briefs.yml");
  assert.match(tb.apply_trigger, /push to master touching scripts\/turns\/theme-briefs\/batches\/theme-briefs-\*\.json/);
  assert.equal(tb.source.path, "/tmp/t.json");
  const qa = plan.kinds.find((k) => k.kind === "question-answers");
  assert.deepEqual(qa.batches[0].item_ids, ["question:a", "question:b"]);
  assert.equal(plan.totals.items, 5);
  assert.equal(plan.totals.batches, 2);
  assert.equal(plan.totals.kinds_planned, 2);
  assert.equal(plan.leases.length, 5);
  assert.ok(plan.leases.every((l) => l.holder === "drain-r2" && l.released === false));
  assert.equal(calls[0], "readSwitch");
  assert.equal(calls.filter((c) => c.startsWith("exportQueue:")).length, KINDS.length);
});

test("every kind is exported through the existing exporter dep with a per-kind limit sized to its batch, never a second query", async () => {
  const { deps, calls } = spyDeps();
  await planDrain(deps, { runId: "r3" });
  for (const k of KINDS) assert.ok(calls.includes(`exportQueue:${k.id}:${k.batchSize * k.maxBatchesPerRun}`), k.id);
});

test("ordering: dated kinds oldest first, undated kinds after them in KIND_ORDER", async () => {
  const { deps } = spyDeps({
    queues: {
      "theme-briefs": { ok: true, items: [{ theme_id: uuid(1), created_at: "2026-09-10T00:00:00Z" }] },
      "ledger-verdicts": { ok: true, items: [{ candidate_id: uuid(2), created_at: "2026-09-20T00:00:00Z" }] },
      "host-verdicts": { ok: true, items: [{ host: "a.example" }] },
      "question-answers": { ok: true, items: [{ subject_ref: "q", item_id: uuid(3) }] },
    },
  });
  const plan = await planDrain(deps, { runId: "r4" });
  assert.deepEqual(plan.kinds.map((k) => k.kind), ["theme-briefs", "ledger-verdicts", "host-verdicts", "needs-search", "question-answers", "record-briefs"]);
});

test("orderKinds and earliestPending are pure and stable", () => {
  assert.equal(earliestPending([{ created_at: "2026-09-02T00:00:00Z" }, { first_seen_at: "2026-09-01T00:00:00Z" }, { created_at: "garbage" }]), "2026-09-01T00:00:00Z");
  assert.equal(earliestPending([{}, { x: 1 }]), null);
  const rows = [{ id: "record-briefs", earliest: null }, { id: "theme-briefs", earliest: "2026-09-02T00:00:00Z" }, { id: "ledger-verdicts", earliest: null }];
  assert.deepEqual(orderKinds(rows).map((r) => r.id), ["theme-briefs", "ledger-verdicts", "record-briefs"]);
});

test("one kind per batch, at most batchSize items, extra items counted as over_cap residue and never leased", async () => {
  const k = kindById("theme-briefs");
  const items = Array.from({ length: k.batchSize + 4 }, (_, i) => ({ theme_id: uuid(100 + i) }));
  const { deps, calls } = spyDeps({ queues: { "theme-briefs": { ok: true, items } } });
  const plan = await planDrain(deps, { runId: "r5" });
  const tb = plan.kinds.find((x) => x.kind === "theme-briefs");
  assert.equal(tb.batches.length, 1);
  assert.equal(tb.batches[0].count, k.batchSize);
  assert.equal(tb.residue.over_cap, 4);
  assert.equal(calls.filter((c) => c.startsWith("acquire:")).length, k.batchSize);
});

test("an item leased by another session is left out, named with its holder, and never blocks the rest", async () => {
  const items = [{ theme_id: uuid(1) }, { theme_id: uuid(2) }, { theme_id: uuid(3) }];
  const { deps } = spyDeps({ queues: { "theme-briefs": { ok: true, items } }, held: { [uuid(2)]: "session-A" } });
  const plan = await planDrain(deps, { runId: "r6" });
  const tb = plan.kinds.find((x) => x.kind === "theme-briefs");
  assert.deepEqual(tb.batches[0].item_ids, [uuid(1), uuid(3)]);
  assert.deepEqual(tb.residue.lease_held, [{ id: uuid(2), holder: "session-A", reason: "leased by another session" }]);
  assert.equal(plan.leases.length, 2);
});

test("a lease key that is not a uuid is residue, not a thrown error and not a lease", async () => {
  const { deps, calls } = spyDeps({ queues: { "theme-briefs": { ok: true, items: [{ theme_id: "not-a-uuid" }, { theme_id: uuid(1) }] } } });
  const plan = await planDrain(deps, { runId: "r7" });
  const tb = plan.kinds.find((x) => x.kind === "theme-briefs");
  assert.equal(tb.residue.lease_held[0].reason, "lease key is not a uuid");
  assert.deepEqual(calls.filter((c) => c.startsWith("acquire:")), [`acquire:${uuid(1)}`]);
});

test("a second question on an item this run already leased reuses the lease (one lease per item, one release)", async () => {
  const qs = [{ subject_ref: "q1", item_id: uuid(5) }, { subject_ref: "q2", item_id: uuid(5) }];
  const { deps, calls } = spyDeps({ queues: { "question-answers": { ok: true, items: qs } } });
  const plan = await planDrain(deps, { runId: "r8" });
  assert.deepEqual(plan.kinds.find((k) => k.kind === "question-answers").batches[0].item_ids, ["q1", "q2"]);
  assert.equal(calls.filter((c) => c === `acquire:${uuid(5)}`).length, 1);
  assert.equal(plan.leases.length, 1);
});

test("a kind with no uuid key (host verdicts) takes no lease; a failed export is recorded and does not stop the other kinds", async () => {
  const { deps, calls } = spyDeps({ queues: { "host-verdicts": { ok: true, items: [{ host: "a.example" }, { host: "b.example" }] }, "ledger-verdicts": { ok: false, items: [], error: "no egress" } } });
  const plan = await planDrain(deps, { runId: "r9" });
  assert.equal(calls.filter((c) => c.startsWith("acquire:")).length, 0);
  assert.equal(plan.kinds.find((k) => k.kind === "ledger-verdicts").export_error, "no egress");
  assert.deepEqual(plan.kinds.find((k) => k.kind === "host-verdicts").batches[0].item_ids, ["a.example", "b.example"]);
  assert.equal(plan.leases.length, 0);
});

test("leases use a stale window longer than a session so a heartbeat is not needed mid-run", () => {
  assert.ok(LEASE_STALE_SECONDS >= 2 * 60 * 60);
});

test("releasePlanLeases releases every lease, records a failed release instead of throwing", async () => {
  const plan = { leases: [{ kind: "theme-briefs", id: "a", lease_id: uuid(1), holder: "drain-x", released: false }, { kind: "theme-briefs", id: "b", lease_id: uuid(2), holder: "drain-x", released: false }] };
  const out = await releasePlanLeases(plan, async (id) => { if (id === uuid(2)) throw new Error("rpc down"); return true; });
  assert.deepEqual(out.leases.map((l) => l.released), [true, false]);
  assert.equal(out.leases[1].release_error, "rpc down");
});

test("parseArgs and defaultRunId", () => {
  assert.equal(parseArgs(["--limit", "0"]).ok, false);
  assert.equal(parseArgs(["--nope"]).ok, false);
  assert.deepEqual(parseArgs(["--finish", "p.json", "--prs", "a=b"]), { ok: true, out: null, runId: null, limit: null, finish: "p.json", prs: "a=b" });
  assert.equal(defaultRunId("2026-10-06T01:02:03.456Z"), "20261006t010203Z");
});

test("runExporter runs the kind's own exporter argv with {out} and {limit} filled and reads the bundle it wrote", () => {
  const out = mkdtempSync(join(tmpdir(), "drain-test-"));
  let seen;
  const spawn = (_node, argv) => { seen = argv; return { status: 0, stdout: "" }; };
  const kind = kindById("theme-briefs");
  const res = runExporter(kind, { limit: 15 }, {
    spawn, mkdtemp: () => out, readdir: () => ["theme-briefs-export-2026.json"], readFile: () => JSON.stringify({ bundles: [{ theme_id: uuid(1) }] }),
  });
  assert.deepEqual(seen.slice(0, 1), ["scripts/turns/export-themes-for-briefs.mjs"]);
  assert.ok(seen.includes(out) && seen.includes("15"));
  assert.equal(res.ok, true);
  assert.deepEqual(res.items, [{ theme_id: uuid(1) }]);
});

test("runExporter reports a non-zero exporter exit as a failed export, not an empty queue", () => {
  const res = runExporter(kindById("question-answers"), { limit: 5 }, { spawn: () => ({ status: 2, stdout: "", stderr: "no database credentials" }), mkdtemp: () => tmpdir() });
  assert.equal(res.ok, false);
  assert.match(res.error, /exited 2/);
});

test("runExporter reads the brief queue through its one consumer: --list then --run-id per row", () => {
  const calls = [];
  const spawn = (_n, argv) => {
    calls.push(argv.join(" "));
    if (argv.includes("--list")) return { status: 0, stdout: "read-brief-export-queue: 1 pending row(s):\n  brief-export-run-007  mint_run=x  ids=2 (a,b)  parts=1\n" };
    return { status: 0, stdout: JSON.stringify({ per_item: [{ id: uuid(1) }, { id: uuid(2) }] }) };
  };
  const res = runExporter(kindById("record-briefs"), { limit: 40 }, { spawn, mkdtemp: () => tmpdir() });
  assert.deepEqual(res.items, [{ id: uuid(1), queue_run_id: "brief-export-run-007" }, { id: uuid(2), queue_run_id: "brief-export-run-007" }]);
  assert.match(calls[1], /--run-id brief-export-run-007/);
});

// ── the harness artifact ──────────────────────────────────────────────────────────────────────────────

test("artifact: records switch state, kinds, counts, leases held and released, and the PRs", async () => {
  const items = [{ theme_id: uuid(1) }, { theme_id: uuid(2) }];
  const { deps } = spyDeps({ queues: { "theme-briefs": { ok: true, items } } });
  const plan = await releasePlanLeases(await planDrain(deps, { runId: "r10" }), async () => true);
  const run = buildDrainRun({ plan, prs: { "theme-briefs": "https://example.invalid/pr/1" }, finishedAt: NOW() });
  assert.equal(run.config.switch.on, true);
  assert.equal(run.config.leases_held, 2);
  assert.equal(run.config.leases_released, 2);
  assert.deepEqual(run.config.kinds.filter((k) => k.planned > 0).map((k) => [k.kind, k.planned, k.pr]), [["theme-briefs", 2, "https://example.invalid/pr/1"]]);
  assert.equal(run.config.kinds.length, KINDS.length);
  assert.equal(run.metrics.items, 2);
  assert.equal(run.perItem.length, 2);
  assert.deepEqual(run.defectsFound, []);
});

test("artifact: an unreleased lease and an export failure are defects, not silence", async () => {
  const { deps } = spyDeps({ queues: { "theme-briefs": { ok: true, items: [{ theme_id: uuid(1) }] }, "ledger-verdicts": { ok: false, items: [], error: "no egress" } } });
  const plan = await planDrain(deps, { runId: "r11" });
  const run = buildDrainRun({ plan, finishedAt: NOW() });
  assert.equal(run.config.leases_released, 0);
  assert.ok(run.defectsFound.some((d) => /not released/.test(d.description)));
  assert.ok(run.defectsFound.some((d) => /export failed/.test(d.description)));
});

test("artifact: written through the shared writer into a family directory with a claimed run id (schema-valid or it throws)", async () => {
  const familyDir = mkdtempSync(join(tmpdir(), "drain-family-"));
  const { deps } = spyDeps({ queues: { "theme-briefs": { ok: true, items: [{ theme_id: uuid(1) }] } } });
  const plan = await releasePlanLeases(await planDrain(deps, { runId: "r12" }), async () => true);
  const path = emitJudgementDrainArtifact({ plan, finishedAt: NOW() }, { familyDir });
  const files = readdirSync(familyDir).filter((f) => f.endsWith(".json"));
  assert.deepEqual(files, ["judgement-drain-run-001.json"]);
  const json = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(json.harness_family, "judgement-drain");
  assert.equal(json.config.leases_released, 1);
});
