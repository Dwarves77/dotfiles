// Lane DORMANT-1 (2026-10-09): the shared workflow-run emitter, the seven families it records for, and the wiring of
// each workflow's `record-harness-run` job. The wiring checks read the real workflow files and are proven by attack:
// a copy of the file with the property removed must be reported.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { overallOutcome, buildWorkflowRunArtifact, parseArgs, emitWorkflowRun } from "./emit-workflow-run-artifact.mjs";
import { validateRunArtifact } from "./run-artifact.mjs";
import { GOVERNING_FILES } from "../harness-runs/governing-files.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI = resolve(HERE, "..", "..");
const WORKFLOWS = resolve(FSI, "..", ".github", "workflows");

const WIRED = {
  "data-audit-lane": { jobs: ["data-audit-lane"] },
  "date-chain": { jobs: ["date-chain"] },
  "layout-baseline-renewal": { jobs: ["renew"] },
  "uptime-probes": { jobs: ["surfaces", "spend"] },
  "source-monitoring": { jobs: ["check-sources", "triage-inaccessible"] },
  "spot-check-monthly": { jobs: ["spot-check"] },
  "design-audit": { jobs: ["design-audit"], dispatchOnly: true },
};

test("overallOutcome: a failure outranks a cancellation outranks success, and all-skipped did not run", () => {
  assert.equal(overallOutcome(["success", "failure"]), "failure");
  assert.equal(overallOutcome(["success", "cancelled"]), "cancelled");
  assert.equal(overallOutcome(["success", "skipped"]), "success");
  assert.equal(overallOutcome(["skipped", "skipped"]), "skipped");
  assert.equal(overallOutcome([]), "skipped");
});

test("the artifact validates against the run-artifact schema, and a failed run carries a defect", () => {
  const base = { family: "uptime-probes", harnessVersion: "sha256:0123456789abcdef", runId: "uptime-probes-run-001", startedAt: "2026-10-09T00:00:00Z", workflowFile: "uptime-probes.yml", event: "workflow_dispatch", githubRunId: 123 };
  const ok = buildWorkflowRunArtifact({ ...base, results: ["success", "skipped"] });
  assert.deepEqual(validateRunArtifact({ ...ok, trigger: "workflow_dispatch" }), []);
  assert.equal(ok.config.github_run_id, "123");
  assert.equal(ok.defects_found.length, 0);
  const bad = buildWorkflowRunArtifact({ ...base, results: ["failure"] });
  assert.equal(bad.config.outcome, "failure");
  assert.equal(bad.defects_found.length, 1);
});

test("emitWorkflowRun writes a run-numbered artifact to the family dir and lands it only with --land", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ewra-"));
  try {
    const landed = [];
    const env = { GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_RUN_ID: "42" };
    const landFn = async (a) => { landed.push(a); return 0; };
    const a = await emitWorkflowRun({ argv: ["--family", "date-chain", "--workflow", "date-chain.yml", "--results", "success"], env, familyDir: dir, landFn });
    assert.equal(landed.length, 0, "no --land, no landing");
    assert.match(a.outPath, /date-chain-run-001\.json$/);
    const b = await emitWorkflowRun({ argv: ["--family", "date-chain", "--workflow", "date-chain.yml", "--results", "failure,skipped", "--land"], env, familyDir: dir, landFn });
    assert.match(b.outPath, /date-chain-run-002\.json$/);
    assert.deepEqual(landed, [["--file", b.outPath]]);
    assert.equal(JSON.parse(readFileSync(b.outPath, "utf8")).config.outcome, "failure");
    assert.equal(readdirSync(dir).filter((f) => f.endsWith(".json")).length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the landing code is the emitter's exit code: a failed landing is not swallowed", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ewra-"));
  try {
    const r = await emitWorkflowRun({ argv: ["--family", "date-chain", "--workflow", "date-chain.yml", "--results", "success", "--land"], env: {}, familyDir: dir, landFn: async () => 1 });
    assert.equal(r.code, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an unregistered family or a missing argument is refused", async () => {
  await assert.rejects(() => emitWorkflowRun({ argv: ["--family", "no-such-family", "--workflow", "x.yml"], env: {} }), /not a registered harness family/);
  await assert.rejects(() => emitWorkflowRun({ argv: ["--workflow", "x.yml"], env: {} }), /required/);
  assert.deepEqual(parseArgs(["--family", "a", "--land"]), { family: "a", land: true });
});

test("each of the seven families is registered and every governing file exists", () => {
  for (const fam of Object.keys(WIRED)) {
    assert.ok(GOVERNING_FILES[fam]?.length > 0, `${fam} has governing files`);
    for (const g of GOVERNING_FILES[fam]) assert.ok(readFileSync(resolve(FSI, g), "utf8").length > 0, `${fam}: ${g}`);
  }
});

/** Problems with one workflow's record job. PURE over the file text. */
function recordJobProblems(text, fam, spec) {
  const problems = [];
  const at = text.indexOf("\n  record-harness-run:\n");
  if (at < 0) return [`${fam}: no record-harness-run job`];
  const job = text.slice(at);
  const needs = /\n {4}needs: \[([^\]]*)\]/.exec(job)?.[1].split(",").map((s) => s.trim()).sort().join(",");
  if (needs !== [...spec.jobs].sort().join(",")) problems.push(`${fam}: needs is ${needs}, expected ${spec.jobs.join(",")}`);
  const cond = (/\n {4}if: (.*)\n/.exec(job)?.[1] ?? "").replace(/^\$\{\{\s*|\s*\}\}$/g, "");
  if (!cond.startsWith("always()")) problems.push(`${fam}: the record job does not run if: always() (a kill-switch exit would leave no row)`);
  if (spec.dispatchOnly && !/github\.event_name == 'workflow_dispatch'/.test(cond)) problems.push(`${fam}: a pull_request job must not hold the production credential`);
  if (!spec.dispatchOnly && /github\.event_name/.test(cond)) problems.push(`${fam}: the record job is conditioned on the event`);
  const call = `--family ${fam} --workflow ${fam}.yml --results "\${{ join(needs.*.result, ',') }}" --land`;
  if (!job.includes(call)) problems.push(`${fam}: the emitter call is not ${call}`);
  if (!job.includes("SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}") || !job.includes("NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}")) problems.push(`${fam}: the landing step does not carry the two secrets`);
  if (/\|\|\s*(echo|true)/.test(job)) problems.push(`${fam}: the landing is best-effort (|| echo / || true swallows a failed landing)`);
  if (text.slice(0, at).includes("SUPABASE_SERVICE_ROLE_KEY") && spec.dispatchOnly) problems.push(`${fam}: a pull_request job holds the service credential`);
  return problems;
}

for (const [fam, spec] of Object.entries(WIRED)) {
  const text = readFileSync(join(WORKFLOWS, `${fam}.yml`), "utf8");
  test(`${fam}.yml: a record-harness-run job lands the ${fam} family on every path`, () => {
    assert.deepEqual(recordJobProblems(text, fam, spec), []);
  });
  test(`${fam}.yml: attack - removing each property is reported`, () => {
    assert.match(recordJobProblems(text.replace(/\n {4}if: (\$\{\{ )?always\(\)/, "\n    if: success()"), fam, spec).join(";"), /always\(\)/);
    assert.match(recordJobProblems(text.replace(" --land\n", "\n"), fam, spec).join(";"), /emitter call/);
    assert.match(recordJobProblems(text.replace("\n  record-harness-run:\n", "\n  other:\n"), fam, spec).join(";"), /no record-harness-run job/);
    assert.match(recordJobProblems(text.replace(/--land\n$/, "--land || echo skipped\n"), fam, spec).join(";"), /best-effort/);
  });
}
