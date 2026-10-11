/** Static proof of the migration-proof leg of the ONE pipeline workflow (lane MIG-CI, 2026-10-08; rewritten against
 *  .github/workflows/ci.yml by lane PIPE-1, 2026-10-11, when migration-proof.yml became steps of the `schema` job). It
 *  reads the committed workflow text and asserts what must stay true however the file is edited later: `schema` is a
 *  required check whose context name is fixed and whose job-level skip is decided by the one classifier (no in-job
 *  scope step, no path filter), it never touches production (no secret, contents: read, no export step, no oracle), the
 *  stack steps are the shared composite action, the replay precedes the apply, and every step that reaches the local
 *  database preflights first. Every case of the old migration-proof-workflow test maps to a case here. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FORBIDDEN_NAMES } from "./preflight.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..");
const WF = readFileSync(resolve(ROOT, ".github", "workflows", "ci.yml"), "utf8");

/** One job of ci.yml: from its column-2 id line to the next column-2 id line. */
function jobText(text, id) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l === `  ${id}:`);
  if (start < 0) return "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {2}[A-Za-z0-9_-]+:\s*$/.test(lines[i]) || /^\S/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join("\n");
}

const TEXT = jobText(WF, "schema");
const CODE = TEXT.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
const WF_CODE = WF.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");

/** Split the steps: each starts at a line `      - name:` (6 spaces). */
function steps() {
  const parts = TEXT.split(/^\s{6}- name: /m).slice(1);
  return parts.map((p) => ({ name: p.split("\n")[0], body: p }));
}
const step = (re) => steps().find((s) => re.test(s.name));

test("required-check shape: the schema job is a job of the one workflow, named exactly schema, skipped at JOB level by the classifier, never by a trigger filter", () => {
  const on = WF.slice(WF.indexOf("\non:"), WF.indexOf("\npermissions:"));
  assert.match(on, /pull_request:\n\s+branches:\n\s+- master/);
  for (const t of ["paths:", "paths-ignore:", "schedule:", "workflow_run:", "pull_request_target:"]) assert.ok(!on.includes(t), `trigger or filter ${t} present`);
  assert.match(WF_CODE, /^name: CI$/m);
  assert.match(CODE, /^ {2}schema:\n {4}name: schema$/m);
  const ifLine = CODE.match(/^ {4}if: (.*)$/m);
  assert.equal(ifLine?.[1], "github.event_name == 'pull_request' && needs.inputs.outputs.schema == 'true'", "the job-level skip is the classifier's output, and only on a pull request");
  assert.match(CODE, /^ {4}needs: inputs$/m);
});

test("never touches production: contents: read, no secret, no forbidden credential name, no environment, no export or oracle step, no GitHub token use", () => {
  assert.match(WF_CODE, /^permissions:\n {2}contents: read\n/m);
  assert.doesNotMatch(CODE, /^ {4}permissions:/m, "the schema job grants itself nothing beyond the workflow's contents: read");
  assert.doesNotMatch(CODE, /^\s*(actions|id-token|pull-requests|issues|statuses|packages|checks): write/m);
  assert.doesNotMatch(CODE, /secrets\./);
  assert.doesNotMatch(CODE, /^\s+environment:/m);
  for (const name of FORBIDDEN_NAMES) assert.ok(!CODE.includes(name), `${name} referenced`);
  assert.doesNotMatch(CODE, /github\.token|GITHUB_TOKEN|GH_TOKEN|gh workflow run/);
  assert.doesNotMatch(CODE, /dump-production-schema|export-subset|oracle|apply-schema-dump|load-subset/);
  assert.doesNotMatch(CODE, /schema-diff\.mjs.*--(replayed|oracle)/, "only the read-only --catalog-only entry of schema-diff may run here, never the oracle comparison");
});

test("the scope decision is the classifier's, not the job's: no in-job touched step, no hand-typed git diff path list, and every step runs unconditionally apart from the cleanup steps", () => {
  assert.doesNotMatch(CODE, /steps\.scope|id: scope|Did this pull request touch/, "the in-job scope decision is retired");
  assert.doesNotMatch(CODE, /git diff --name-only/);
  assert.match(WF_CODE, /node "\$CLASSIFIER" --pr-merge --github-output/, "the inputs job runs the classifier over the merge commit");
  const checkout = step(/Checkout repository/);
  assert.match(checkout.body, /fetch-depth: 1/);
  for (const s of steps()) {
    const cond = s.body.match(/^ {8}if: (.*)$/m)?.[1];
    if (cond !== undefined) assert.equal(cond, "always()", `step "${s.name}" carries a condition other than always() on the cleanup steps`);
  }
});

test("the stack comes from the shared composite action with the stack's own scratch paths, never an inline copy", () => {
  const start = step(/Start the local stack/);
  assert.match(start.body, /uses: \.\/\.github\/actions\/local-stack/);
  assert.match(start.body, /stack_dir: \$\{\{ env\.SC_STACK \}\}/);
  assert.match(start.body, /env_file: \$\{\{ env\.SC_ENV \}\}/);
  assert.doesNotMatch(CODE, /supabase start|write-local-env\.mjs --out "\$SC_ENV"|setup-cli/);
  assert.match(CODE, /SC_STACK=\$RUNNER_TEMP\/schema-stack/);
});

test("the applied set replays first, then the pending set applies; both preflight against the local env before their script", () => {
  const names = steps().map((s) => s.name);
  const stack = names.findIndex((n) => /Start the local stack/.test(n));
  const replay = names.findIndex((n) => /Replay the applied migration files/.test(n));
  const apply = names.findIndex((n) => /Apply every pending migration/.test(n));
  assert.ok(stack >= 0 && replay > stack && apply > replay, "order must be stack, replay, apply");
  const r = steps()[replay];
  const a = steps()[apply];
  assert.match(r.body, /node scripts\/proof\/replay-migrations\.mjs --report "\$SC_OUT_DIR\/replay-report\.json"/);
  assert.match(a.body, /node scripts\/proof\/apply-pending-migrations\.mjs --apply --report "\$SC_OUT_DIR\/apply-report\.json"/);
  for (const s of [r, a]) {
    assert.match(s.body, /set -o pipefail/, `step "${s.name}" pipes to tee without pipefail: a failure would be swallowed`);
    const src = s.body.indexOf('. "$SC_ENV"');
    const pre = s.body.indexOf("scripts/proof/preflight.mjs");
    const script = s.body.search(/scripts\/proof\/(replay-migrations|apply-pending-migrations)\.mjs/);
    assert.ok(src >= 0 && pre > src && script > pre, `step "${s.name}" must source the local env, preflight, then run its script`);
    assert.doesNotMatch(s.body, /--db-url/, "the stack's own database (PROOF_DB_URL) is the only target");
  }
  assert.doesNotMatch(CODE, /continue-on-error/, "no step may continue on error");
});

test("the reports are uploaded and the stack is stopped on every run that started one, and the env file is deleted", () => {
  const up = step(/Upload the schema reports/);
  assert.match(up.body, /name: schema-report/);
  assert.match(up.body, /path: \$\{\{ runner\.temp \}\}\/schema-out/);
  assert.match(up.body, /retention-days: 7/);
  const stop = step(/Stop the app, stop the local stack/);
  assert.match(stop.body, /supabase stop --no-backup/);
  assert.match(stop.body, /rm -f "\$SC_ENV"/);
  // TESTS-2 (AUD-AT-5 OWED-1, found by workflow-mutation-attacks.test.mjs): both steps must run when an earlier step FAILED,
  // or a red proof leaves the stack and the env file behind.
  const ALWAYS = "\n        if: always()\n";
  assert.ok(up.body.includes(ALWAYS), "the upload step must run on failure");
  assert.ok(stop.body.includes(ALWAYS), "the stop step must run on failure");
});

test("pull requests supersede each other (workflow concurrency) and the job has a time limit", () => {
  assert.match(WF_CODE, /concurrency:\n {2}group: \$\{\{ github\.workflow \}\}-\$\{\{ github\.event\.pull_request\.number \|\| github\.ref \}\}\n {2}cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
  assert.match(CODE, /^ {4}timeout-minutes: 40$/m);
});

test("the workflow header states the five jobs and the required contexts; the schema job states what it proves, that production apply follows a green job, and the by-design cost of a failing pending migration", () => {
  const head = WF.slice(0, WF.indexOf("\non:"));
  assert.match(head, /FIVE jobs/);
  assert.match(head, /ALL FIVE are the required status contexts/);
  assert.match(TEXT, /A migration is proven by RUNNING it before production sees it/);
  assert.match(TEXT, /fails EVERY schema job\s+#?\s*until that migration reaches production, by design/);
});

test("PROOF-9 rule 15: the catalog query runs on the replayed stack on every PR that reaches it, after the replay, read-only, preflighted, against PROOF_DB_URL only", () => {
  const names = steps().map((s) => s.name);
  const replay = names.findIndex((n) => /Replay the applied migration files/.test(n));
  const cat = names.findIndex((n) => /schema catalog query on the replayed stack/.test(n));
  const apply = names.findIndex((n) => /Apply every pending migration/.test(n));
  assert.ok(cat > replay && cat < apply, "the catalog step comes after the replay and before the pending apply");
  const c = steps()[cat];
  assert.doesNotMatch(c.body, /\n {8}if:/, "it runs whenever the schema job runs");
  assert.match(c.body, /set -o pipefail/);
  const src = c.body.indexOf('. "$SC_ENV"');
  const pre = c.body.indexOf("scripts/proof/preflight.mjs");
  const run = c.body.indexOf("scripts/proof/schema-diff.mjs");
  assert.ok(src >= 0 && pre > src && run > pre, "source the local env, preflight, then run schema-diff");
  assert.match(c.body, /node scripts\/proof\/schema-diff\.mjs --catalog-only --db-url "\$PROOF_DB_URL"/);
  assert.doesNotMatch(c.body, /--oracle|--replayed|PROOF_ORACLE_DB_URL/);
});

test("the RLS persona matrix runs on the SAME stack, after the pending apply, preflighted, and the migration proof and the matrix share one stack start", () => {
  const names = steps().map((s) => s.name);
  const apply = names.findIndex((n) => /Apply every pending migration/.test(n));
  const matrix = names.findIndex((n) => /Run the RLS persona matrix/.test(n));
  assert.ok(matrix > apply, "the matrix attacks the stack the pending migrations were applied to");
  assert.equal(names.filter((n) => /Start the local stack/.test(n)).length, 1, "ONE stack start for the whole job");
  const m = steps()[matrix];
  const src = m.body.indexOf('. "$SC_ENV"');
  const pre = m.body.indexOf("scripts/proof/preflight.mjs");
  const run = m.body.indexOf("scripts/verify/attacks/rls-persona-matrix.mjs");
  assert.ok(src >= 0 && pre > src && run > pre, "source the local env, preflight, then run the matrix");
  assert.match(m.body, /rls-persona-matrix\.mjs --out-dir "\$SC_OUT_DIR"/);
  assert.match(m.body, /set -o pipefail/);
});

test("PROOF-9 ATTACK: removing the catalog step, moving it before the replay, or dropping its preflight is caught", () => {
  const check = (text) => {
    const job = jobText(text, "schema");
    const parts = job.split(/^\s{6}- name: /m).slice(1).map((p) => ({ name: p.split("\n")[0], body: p }));
    const names = parts.map((p) => p.name);
    const replay = names.findIndex((n) => /Replay the applied migration files/.test(n));
    const cat = names.findIndex((n) => /schema catalog query on the replayed stack/.test(n));
    if (cat < 0 || cat < replay) return false;
    const b = parts[cat].body;
    return b.indexOf("scripts/proof/preflight.mjs") >= 0 && b.indexOf("scripts/proof/preflight.mjs") < b.indexOf("schema-diff.mjs");
  };
  assert.equal(check(WF), true, "the committed workflow passes the check");
  const start = WF.indexOf("      # Rule 15 (PROOF-9)");
  const end = WF.indexOf("      - name: Apply every pending migration on the stack");
  assert.ok(start > 0 && end > start);
  assert.equal(check(WF.slice(0, start) + WF.slice(end)), false, "step removed");
  const block = WF.slice(start, end);
  const replayAt = WF.indexOf("      - name: Replay the applied migration files onto the stack");
  assert.ok(replayAt > 0 && replayAt < start);
  assert.equal(check(WF.slice(0, replayAt) + block + WF.slice(replayAt, start) + WF.slice(end)), false, "step before the replay");
  assert.equal(check(WF.replace(block, block.replace("          node scripts/proof/preflight.mjs\n", ""))), false, "preflight dropped");
});
