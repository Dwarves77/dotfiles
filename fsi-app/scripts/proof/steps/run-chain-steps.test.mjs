/** Tests for scripts/proof/steps/run-chain-steps.mjs (lane PROOF-3). The database, bash and the filesystem are stubs. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync } from "node:fs";
import {
  runChainSteps, stepRunIds, checkEnvironment, scrubbedEnv, newArtifacts, sweepWindow, checkHopOrder, planLines, main,
} from "./run-chain-steps.mjs";
import { loadManifest } from "./manifest.mjs";
import { HOOKS } from "./prepare.mjs";

const FSI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const manifest = loadManifest();
const LOOP = "37700000000";
const scriptSteps = manifest.steps.filter((s) => s.kind === "script");

// ---- small pure pieces ---------------------------------------------------------------------------------

test("stepRunIds: the first script step IS the loop root; every later one appends its two digit ordinal", () => {
  const ids = stepRunIds(manifest, LOOP);
  assert.equal(ids["source-sweep"], LOOP);
  assert.equal(ids["fetch-drain"], `${LOOP}01`);
  assert.equal(new Set(Object.values(ids)).size, scriptSteps.length, "run ids are unique");
  assert.equal(ids.preconditions, undefined);
});

const LOCAL_ENV = {
  CHAIN_PROOF_LOCAL: "1",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_DB_URL: "postgresql://postgres:pw@127.0.0.1:54322/postgres",
  SUPABASE_SERVICE_ROLE_KEY: "local-key",
  PROOF_SERVICE_KEY: "local-key",
};

test("checkEnvironment: only the local stack passes; production hosts and credentials are named, never echoed", () => {
  assert.deepEqual(checkEnvironment(LOCAL_ENV), []);
  const bad = checkEnvironment({ ...LOCAL_ENV, NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", SUPABASE_DB_PASSWORD: "secret-value", APP_URL: "https://x", VERCEL_TOKEN: "t", CHAIN_PROOF_LOCAL: "0" });
  const text = bad.join(String.fromCharCode(10));
  assert.match(text, /CHAIN_PROOF_LOCAL is not 1/);
  assert.match(text, /NEXT_PUBLIC_SUPABASE_URL does not name a loopback host/);
  assert.match(text, /forbidden credential present: SUPABASE_DB_PASSWORD/);
  assert.match(text, /forbidden credential present: APP_URL/);
  assert.match(text, /forbidden credential present: VERCEL_TOKEN/);
  assert.ok(!text.includes("secret-value"), "no value is ever printed");
});

test("checkEnvironment refuses a walker kill switch left on", () => {
  assert.match(checkEnvironment({ ...LOCAL_ENV, RESEARCH_WALKER_ENABLED: "1" }).join(), /RESEARCH_WALKER_ENABLED/);
  assert.deepEqual(checkEnvironment({ ...LOCAL_ENV, RESEARCH_WALKER_ENABLED: "0" }), []);
});

test("scrubbedEnv: a child process never inherits a forbidden credential name or a stale upstream run id", () => {
  const out = scrubbedEnv({ ...LOCAL_ENV, GITHUB_TOKEN: "t", WORKER_SECRET: "s", VERCEL_ENV: "x", GITHUB_EVENT_WORKFLOW_RUN_ID: "1", KEEP: "yes" });
  assert.equal(out.KEEP, "yes");
  assert.equal(out.SUPABASE_DB_URL, LOCAL_ENV.SUPABASE_DB_URL);
  for (const n of ["GITHUB_TOKEN", "WORKER_SECRET", "VERCEL_ENV", "GITHUB_EVENT_WORKFLOW_RUN_ID"]) assert.equal(n in out, false, n);
});

test("newArtifacts: only files that appeared during the step, so an earlier step's artifact is never landed twice", () => {
  assert.deepEqual(newArtifacts(["a/a-run-001.json"], ["a/a-run-001.json", "b/b-run-004.json", "a/a-run-002.json"]), ["a/a-run-002.json", "b/b-run-004.json"]);
  assert.deepEqual(newArtifacts(["x"], ["x"]), []);
});

test("sweepWindow: the seven UTC days ending today", () => {
  assert.deepEqual(sweepWindow(new Date("2026-10-07T15:00:00Z")), { from: "2026-10-01", to: "2026-10-07" });
});

test("planLines: one line per step, hop or root, with the upstream and the assertion count", () => {
  const lines = planLines(manifest);
  assert.equal(lines.length, manifest.steps.length);
  assert.match(lines[0], /preconditions/);
  assert.ok(lines.some((l) => /hop 13 source-resolution-after-research-walker <- research-walker/.test(l)));
  assert.ok(lines.some((l) => /root +research-walker/.test(l)));
});

test("main --plan prints the plan and exits 0 without a database or an environment", async () => {
  const orig = console.log;
  const out = [];
  console.log = (m) => out.push(String(m));
  try {
    assert.equal(await main(["--plan"], {}), 0);
  } finally { console.log = orig; }
  assert.equal(out.join("\n").split("\n").length, manifest.steps.length);
});

test("main refuses to run on an environment that is not the local stack (exit 2)", async () => {
  const orig = console.error;
  const err = [];
  console.error = (m) => err.push(String(m));
  try {
    assert.equal(await main([], { NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", SUPABASE_DB_PASSWORD: "x" }), 2);
  } finally { console.error = orig; }
  assert.match(err.join("\n"), /refusing to run/);
});

// ---- checkHopOrder -----------------------------------------------------------------------------------

const hopSteps = [
  { id: "s1", family: "source-sweep", hop: null, runId: "100", upstreamStep: null, upstreamRunId: null, loop: true },
  { id: "s2", family: "fetch-drain", hop: "01", runId: "10001", upstreamStep: "s1", upstreamRunId: "100", loop: true },
];
const hopRows = [
  { harness_family: "source-sweep", github_run_id: "100", upstream_run_id: null, started_at: "2026-10-07 10:00:00+00", loop_run_id: "100" },
  { harness_family: "fetch-drain", github_run_id: "10001", upstream_run_id: "100", started_at: "2026-10-07 10:01:00+00", loop_run_id: "100" },
];

test("checkHopOrder: passes when every step landed, in order, linked and carrying the loop id", () => {
  const r = checkHopOrder({ rows: hopRows, steps: hopSteps, loopRunId: "100" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.hops.map((h) => h.ok), [true, true]);
});

test("checkHopOrder: names a missing row, a reversed order, a broken link and a lost loop id", () => {
  assert.match(checkHopOrder({ rows: [hopRows[0]], steps: hopSteps, loopRunId: "100" }).problems.join(), /no harness_runs row of family fetch-drain/);
  const reversed = [hopRows[0], { ...hopRows[1], started_at: "2026-10-07 09:00:00+00" }];
  assert.match(checkHopOrder({ rows: reversed, steps: hopSteps, loopRunId: "100" }).problems.join(), /started before/);
  const unlinked = [hopRows[0], { ...hopRows[1], upstream_run_id: "999" }];
  assert.match(checkHopOrder({ rows: unlinked, steps: hopSteps, loopRunId: "100" }).problems.join(), /upstream_run_id is not the run id of s1/);
  const noLoop = [hopRows[0], { ...hopRows[1], loop_run_id: null }];
  assert.match(checkHopOrder({ rows: noLoop, steps: hopSteps, loopRunId: "100" }).problems.join(), /does not carry the loop run id/);
});

// ---- the runner on stubs -------------------------------------------------------------------------------

/** Build stub deps. `scenario` tweaks behaviour: { zeroSql: 'substring' -> counts 0 for SQL containing it, exitFor: stepId, landFails: true }. */
function makeDeps(scenario = {}) {
  const calls = { scripts: [], landed: [], setup: [], queries: [] };
  const files = [];
  let clock = 0;
  let snapshotCalls = 0;
  const counts = new Map();
  const runIds = stepRunIds(manifest, LOOP);
  const state = { report: null };
  const familyOf = Object.fromEntries(scriptSteps.map((s) => [s.id, s]));

  const deps = {
    fsiRoot: FSI_ROOT,
    now: () => new Date(Date.UTC(2026, 9, 7, 10, 0, 0) + (clock += 1000)),
    dbClock: async () => `2026-10-07 10:00:${String(clock % 60).padStart(2, "0")}+00`,
    query: async (sql, params = []) => {
      calls.queries.push(sql);
      if (sql.includes("information_schema.columns")) {
        return params[0].filter((t) => t !== scenario.missingTable).flatMap((t) => ["id", "created_at"].map((c) => ({ table_name: t, column_name: c })));
      }
      if (sql.startsWith("EXPLAIN")) {
        if (scenario.explainFails && sql.includes(scenario.explainFails)) throw new Error('column "bogus_col" does not exist');
        return [{ "QUERY PLAN": "Result" }];
      }
      if (scenario.zeroSql && sql.includes(scenario.zeroSql)) return [{ n: 0 }];
      if (sql.includes("json_agg")) return [{ v: JSON.stringify(Array.from({ length: 5 }, (_, i) => ({ candidate_id: `00000000-0000-4000-8000-00000000000${i}`, url: `https://example.org/private-${i}`, anchor_text: "Title" }))) }];
      if (sql.includes("string_agg")) return [{ v: "00000000-0000-4000-8000-000000000001" }];
      if (sql.includes("md5(coalesce(full_brief")) { snapshotCalls += 1; return [{ k: "a", v: snapshotCalls === 1 ? "before" : "after" }]; }
      if (sql.includes("WHERE id = ANY($1::uuid[]) AND is_archived = false")) return params[0].map((id) => ({ id }));
      if (sql.includes("WHERE github_run_id = ANY($1::text[])")) {
        return scriptSteps.map((s, i) => ({ harness_family: s.family, github_run_id: runIds[s.id], upstream_run_id: s.upstream ? runIds[s.upstream.step] : null, started_at: `2026-10-07 10:${String(10 + i).padStart(2, "0")}:00+00`, loop_run_id: s.loop ? LOOP : null }));
      }
      if (sql.includes("greatest(")) return [{ greatest: 2 }];
      if (sql.includes("harness_runs WHERE true") || sql.includes("brief_apply_runs WHERE true") || sql.includes("= 'preflight_refused'") && sql.includes("harness_family = 'brief-apply'")) return [{ n: 0 }];
      if (sql.includes("section_claim_provenance")) return [{ n: 0 }];
      if (sql.includes("status = 'provisional'")) { const k = sql; const c = (counts.get(k) ?? 0) + 1; counts.set(k, c); return [{ n: c === 1 ? 50 : 40 }]; }
      if (sql.includes("WHERE true")) { const c = (counts.get(sql) ?? 0) + 1; counts.set(sql, c); return [{ n: c === 1 ? 10 : 20 }]; }
      return [{ n: 99 }];
    },
    setup: async (sql, params, opts) => { calls.setup.push({ sql, params, opts }); },
    runScript: async ({ script, env }) => {
      calls.scripts.push({ id: env.CP_STEP_ID, env, script });
      const s = familyOf[env.CP_STEP_ID];
      files.push(`scripts/harness-runs/${s.family}/${s.family}-run-${String(calls.scripts.length).padStart(3, "0")}.json`);
      return { status: scenario.exitFor === env.CP_STEP_ID ? 3 : 0, error: null };
    },
    listArtifacts: () => [...files],
    landArtifact: async (f) => { calls.landed.push(f); return scenario.landFails ? { ok: false, reason: "exit 1" } : { ok: true }; },
    livePromptVersion: async () => "sha256:1ceca92ff0dfae68",
    hooks: scenario.hooks ?? HOOKS,
    mkStepTmp: (id) => `/tmp/chain/${id}`,
    writeFile: () => {},
    readFile: (p) => readFileSync(p, "utf8"),
    listDir: (p) => readdirSync(p),
    writeReport: (r) => { state.report = JSON.parse(JSON.stringify(r)); },
    log: () => {},
  };
  return { deps, calls, state, runIds };
}

test("the real manifest runs end to end on a permissive stub: every step in order, upstream ids threaded, artifacts landed once", async () => {
  const { deps, calls, state, runIds } = makeDeps();
  const res = await runChainSteps({ manifest, loopRunId: LOOP, deps });
  assert.equal(res.error, null, res.error ?? "");
  assert.equal(res.ok, true);
  assert.deepEqual(calls.scripts.map((c) => c.id), scriptSteps.map((s) => s.id));
  // threading
  const byId = Object.fromEntries(calls.scripts.map((c) => [c.id, c.env]));
  assert.equal(byId["source-sweep"].CP_STEP_RUN_ID, LOOP);
  assert.equal(byId["source-sweep"].CP_UPSTREAM_RUN_ID, undefined);
  assert.equal(byId["fetch-drain"].CP_UPSTREAM_RUN_ID, LOOP);
  assert.equal(byId["fetch-drain"].CP_UPSTREAM_NAME, "Source sweep");
  assert.equal(byId["downstream-after-corpus"].CP_UPSTREAM_RUN_ID, runIds["corpus-turn"]);
  assert.equal(byId["propagation-after-downstream"].CP_STEP_EVENT, "workflow_dispatch");
  assert.equal(byId["propagation-after-producers"].CP_UPSTREAM_NAME, "Data producers");
  assert.match(byId["ledger-consume"].CP_VERDICTS_FILE, /ledger-verdicts-chain-proof\.json$/);
  assert.match(byId["brief-apply"].CP_BRIEFS_FILE, /record-briefs-chain-proof\.json$/);
  assert.equal(byId["brief-export"].CP_VAR_brief_export_ids, "00000000-0000-4000-8000-000000000001");
  assert.match(byId["source-sweep"].CP_DATE_FROM, /^\d{4}-\d{2}-\d{2}$/);
  // the brief-apply reset ran under the replication role with the target ids
  assert.equal(calls.setup.length, 1);
  assert.equal(calls.setup[0].opts.replica, true);
  assert.match(calls.setup[0].sql, /SET full_brief = NULL, item_grade = 'record'/);
  // artifacts: each landed exactly once
  assert.equal(calls.landed.length, scriptSteps.length);
  assert.equal(new Set(calls.landed).size, calls.landed.length);
  // report: counts only, a row per step, passed
  const report = state.report;
  assert.equal(report.ok, true);
  assert.equal(report.steps.length, manifest.steps.length);
  assert.ok(report.steps.every((s) => s.status === "passed"));
  const text = JSON.stringify(report);
  assert.ok(!text.includes("example.org"), "no candidate url reaches the report");
  assert.ok(report.steps.find((s) => s.step === "population-turn").assertions.some((a) => a.id === "items-grew" && a.ok));
  assert.ok(report.caveats.some((c) => c.step === "fetch-drain" && /capture-worker/.test(c.caveat)));
});

test("ATTACK: a database that answers 0 stops the run at the first failing assertion with the step, the table, the predicate and the observed value", async () => {
  const { deps, calls, state } = makeDeps({ zeroSql: "harness_family = 'ledger-consume'" });
  const res = await runChainSteps({ manifest, loopRunId: LOOP, deps });
  assert.equal(res.ok, false);
  assert.match(res.error, /chain step "ledger-consume" failed assertion "harness-row"/);
  assert.match(res.error, /harness_runs WHERE harness_family = 'ledger-consume' AND github_run_id = '3770000000002'/);
  assert.match(res.error, /observed 0, expected >= 1/);
  assert.deepEqual(calls.scripts.map((c) => c.id), ["source-sweep", "fetch-drain", "ledger-consume"], "no later step ran");
  assert.equal(state.report.ok, false);
  assert.equal(state.report.stopped_at, "ledger-consume");
  assert.ok(state.report.not_run.includes("population-turn") && state.report.not_run.includes("hop-order"));
  assert.equal(state.report.steps.at(-1).status, "failed");
});

test("ATTACK: a stub that returns 0 for every count fails the very first step (the preconditions), before any script runs", async () => {
  const { deps, calls } = makeDeps({ zeroSql: "count(*)" });
  const res = await runChainSteps({ manifest, loopRunId: LOOP, deps });
  assert.equal(res.ok, false);
  assert.match(res.error, /chain step "preconditions" failed assertion "cadence-open": system_state WHERE scrape_cadence <> 'off': observed 0/);
  assert.equal(calls.scripts.length, 0);
});

test("a growth assertion fails when the table did not grow", async () => {
  const { deps, state } = makeDeps();
  const q = deps.query;
  deps.query = async (sql, params) => (sql.includes("public.item_cross_references") ? [{ n: 7 }] : q(sql, params));
  const res = await runChainSteps({ manifest, loopRunId: LOOP, deps });
  assert.equal(res.ok, false);
  assert.match(res.error, /chain step "corpus-turn" failed assertion "cross-references-grew": item_cross_references WHERE true: observed 0, expected grew by >= 1 \(before 7, after 7\)/);
  assert.equal(state.report.stopped_at, "corpus-turn");
});

test("a script that exits nonzero stops the run (its artifact is still landed first)", async () => {
  const { deps, calls } = makeDeps({ exitFor: "corpus-turn" });
  const res = await runChainSteps({ manifest, loopRunId: LOOP, deps });
  assert.equal(res.ok, false);
  assert.match(res.error, /chain step "corpus-turn": the script exited 3/);
  assert.equal(calls.landed.length, 5, "the failing step's own artifact was landed before the stop");
  assert.ok(!calls.scripts.some((c) => c.id === "downstream-after-population"));
});

test("an artifact that will not land stops the run, naming the file", async () => {
  const { deps } = makeDeps({ landFails: true });
  const res = await runChainSteps({ manifest, loopRunId: LOOP, deps });
  assert.equal(res.ok, false);
  assert.match(res.error, /chain step "source-sweep": the harness-run artifact source-sweep-run-001\.json would not land/);
});

test("a prepare hook that cannot proceed (NO TARGET) stops the run at that step with its message", async () => {
  const { deps, calls, state } = makeDeps({ hooks: { ...HOOKS, "brief-batch": async () => { throw new Error("NO TARGET: none of the item ids exists locally"); } } });
  const res = await runChainSteps({ manifest, loopRunId: LOOP, deps });
  assert.equal(res.ok, false);
  assert.match(res.error, /NO TARGET/);
  assert.equal(state.report.stopped_at, "brief-apply");
  assert.ok(!calls.scripts.some((c) => c.id === "gate-a-after-brief-apply"));
  assert.equal(calls.setup.length, 0, "no reset was issued for a step whose hook refused");
});

test("the closing check fails when a step's row is missing from the ledger", async () => {
  const { deps } = makeDeps();
  const q = deps.query;
  deps.query = async (sql, params) => (sql.includes("WHERE github_run_id = ANY($1::text[])") ? (await q(sql, params)).slice(1) : q(sql, params));
  const res = await runChainSteps({ manifest, loopRunId: LOOP, deps });
  assert.equal(res.ok, false);
  assert.match(res.error, /chain step "hop-order" failed assertion "hop-order"/);
  assert.match(res.error, /no harness_runs row of family source-sweep/);
});

test("the report is rewritten after every step, so a crash mid-run still leaves the steps that passed", async () => {
  const { deps } = makeDeps();
  const writes = [];
  deps.writeReport = (r) => writes.push(r.steps.length);
  await runChainSteps({ manifest, loopRunId: LOOP, deps });
  assert.ok(writes.length >= manifest.steps.length);
  assert.equal(writes.at(-1), manifest.steps.length);
});

// ---- CHAIN-5: the manifest's names are checked against the live stack before any step runs ----------------

test("CHAIN-5: the schema check runs first, plans every statement, and its counts land in the report", async () => {
  const { deps, calls, state } = makeDeps();
  const res = await runChainSteps({ manifest, loopRunId: LOOP, deps });
  assert.equal(res.ok, true, res.error ?? "");
  const firstInfo = calls.queries.findIndex((q) => q.includes("information_schema.columns"));
  const firstStep = calls.queries.findIndex((q) => q.includes("system_state"));
  assert.ok(firstInfo >= 0 && firstInfo < firstStep, "the information_schema lookup precedes the first assertion");
  assert.ok(calls.queries.some((q) => q.startsWith("EXPLAIN (COSTS OFF) SELECT count(*)::int AS n FROM public.brief_apply_runs")));
  assert.equal(state.report.schema_names.ok, true);
  assert.ok(state.report.schema_names.statements_planned > 40);
  assert.ok(state.report.schema_names.tables_checked >= 10);
});

test("ATTACK: a column the stack does not carry stops the run before any script, naming the assertion and the table's real columns", async () => {
  const { deps, calls, state } = makeDeps({ explainFails: "(metrics->>'invocations')::int" });
  const res = await runChainSteps({ manifest, loopRunId: LOOP, deps });
  assert.equal(res.ok, false);
  assert.equal(state.report.stopped_at, "schema-names");
  assert.match(res.error, /the stack's schema does not carry \d+ name\(s\)/);
  assert.match(res.error, /step fetch-drain assertion post-reached-function-host: column "bogus_col" does not exist \(public\.harness_runs has: id, created_at\)/);
  assert.equal(calls.scripts.length, 0, "no step ran against a manifest that names a missing column");
  assert.equal(state.report.not_run.length, manifest.steps.length);
});

test("ATTACK: a table absent from the stack's information_schema is named, and its statements are not planned", async () => {
  const { deps, calls, state } = makeDeps({ missingTable: "brief_apply_runs" });
  const res = await runChainSteps({ manifest, loopRunId: LOOP, deps });
  assert.equal(res.ok, false);
  assert.match(res.error, /table public\.brief_apply_runs is not in the stack's information_schema/);
  assert.equal(state.report.stopped_at, "schema-names");
  assert.equal(calls.scripts.length, 0);
});

test("CHAIN-5: the fetch-drain caveat no longer claims the function is unserved, and its assertion demands the POST reached the host", () => {
  const fd = manifest.steps.find((x) => x.id === "fetch-drain");
  assert.doesNotMatch(fd.caveat, /is not served/);
  const a = fd.assertions.find((x) => x.id === "post-reached-function-host");
  assert.ok(a, "the assertion exists");
  assert.match(a.predicate, /invocations'\)::int >= 1/);
  assert.match(a.predicate, /queued_selected'\)::int >= 1/);
  assert.match(a.predicate, /http_call_failed%/);
});

test("CHAIN-5: the IO pre-flight is asserted on a fresh stack: no prior apply run before, a finished apply run and no refusal after", () => {
  const pre = manifest.steps.find((x) => x.id === "preconditions").assertions.find((x) => x.id === "no-prior-apply-run");
  assert.deepEqual([pre.table, pre.kind, pre.max], ["brief_apply_runs", "max", 0]);
  const ba = manifest.steps.find((x) => x.id === "brief-apply");
  const ran = ba.assertions.find((x) => x.id === "io-preflight-passed");
  assert.equal(ran.table, "brief_apply_runs");
  assert.match(ran.predicate, /finished_at IS NOT NULL/);
  assert.match(ran.predicate, /started_at >= '\{\{started_at\}\}'::timestamptz/);
  const refused = ba.assertions.find((x) => x.id === "io-preflight-not-refused");
  assert.equal(refused.kind, "max");
  assert.match(refused.predicate, /preflight_refused/);
});
