/** Static proof of the route-and-view-attacks leg of the ONE pipeline workflow (lane TESTS-2, 2026-10-10; rewritten against
 *  .github/workflows/ci.yml by lane PIPE-1, 2026-10-11, when route-and-view-attacks.yml became steps of the `schema`
 *  job). It reads the committed workflow text and asserts what must stay true however the file is edited later: the job
 *  never touches production (no secret, contents: read, no environment), the stack comes from the shared composite
 *  action, the order is stack, attack the stack steps, replay, apply, view and function attacks, definer attacks, build,
 *  start the app, attack the routes, and every step that reaches the database or the app preflights against the local env
 *  first. The mutation attacks in workflow-mutation-attacks.test.mjs break each of these on purpose and require this file
 *  to go red. Every case of the old route-and-view-attacks-workflow test maps to a case here. */
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
const idx = (re) => steps().findIndex((s) => re.test(s.name));
const step = (re) => steps().find((s) => re.test(s.name));
const ALWAYS = "\n        if: always()\n";

test("check shape: the routes attack is a step of the schema job, run on every pull request that touches its inputs, with no trigger filter and no pull_request_target", () => {
  const on = WF.slice(WF.indexOf("\non:"), WF.indexOf("\npermissions:"));
  assert.match(on, /pull_request:\n\s+branches:\n\s+- master/);
  for (const t of ["paths:", "paths-ignore:", "schedule:", "workflow_run:", "pull_request_target:"]) assert.ok(!on.includes(t), `trigger or filter ${t} present`);
  assert.ok(step(/Attack every route method/), "the routes attack is a step of the schema job");
});

test("never touches production: contents: read, no secret, no forbidden credential name, no environment, no write permission", () => {
  assert.match(WF_CODE, /^permissions:\n {2}contents: read\n/m);
  assert.doesNotMatch(CODE, /^ {4}permissions:/m);
  assert.doesNotMatch(CODE, /^\s*(actions|id-token|pull-requests|issues|statuses|packages|checks|deployments): write/m);
  assert.doesNotMatch(CODE, /\$\{\{\s*secrets\./);
  assert.doesNotMatch(CODE, /^\s+environment:/m);
  for (const n of FORBIDDEN_NAMES) assert.ok(!CODE.includes(n), `forbidden name ${n} present`);
  // the only production-looking host is the invented one the stack-step attacks feed to the refusals
  const withoutAttackInputs = CODE.split("\n").filter((l) => !l.includes("abc.supabase.co")).join("\n");
  assert.doesNotMatch(withoutAttackInputs, /supabase\.co|supabase\.com|vercel\.app/);
});

test("the scope decision is the classifier's: the routes inputs are inputs of the schema job, the job carries the job-level if, and no step re-decides it", () => {
  assert.doesNotMatch(CODE, /steps\.scope|git diff --name-only|touched ==/, "no in-job scope step remains");
  assert.match(CODE, /^ {4}if: github\.event_name == 'pull_request' && needs\.inputs\.outputs\.schema == 'true'$/m);
  for (const s of steps()) {
    const cond = s.body.match(/^ {8}if: (.*)$/m)?.[1];
    if (cond !== undefined) assert.equal(cond, "always()", `step "${s.name}" is conditioned on something other than always()`);
  }
  assert.equal(steps()[0].name.startsWith("Checkout repository"), true);
  const head = WF.slice(0, WF.indexOf("\non:"));
  assert.match(head, /WHERE THE ROUTE ATTACKS RUN, AND WHY/);
  assert.match(head, /A container job has no Docker daemon/);
});

test("the stack comes from the shared composite action with its own scratch paths, never an inline copy", () => {
  const s = step(/Start the local stack/);
  assert.match(s.body, /uses: \.\/\.github\/actions\/local-stack/);
  assert.match(s.body, /stack_dir: \$\{\{ env\.SC_STACK \}\}/);
  assert.match(s.body, /env_file: \$\{\{ env\.SC_ENV \}\}/);
  assert.doesNotMatch(CODE, /supabase start/);
});

test("the order: stack, attack the stack steps, replay, apply, views and functions, definers, build, start, routes", () => {
  const order = [/Start the local stack/, /Attack the stack steps themselves/, /Replay the applied migration files/, /Apply every pending migration/, /Attack the views and the system-only functions/, /definer and count RPC attacks/, /Build the app against the stack/, /Start the app with next start/, /Attack every route method/];
  const at = order.map(idx);
  assert.ok(at.every((n) => n >= 0), `a step is missing: ${at.join(",")}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at, "the steps are out of order");
});

test("every step that reaches the database or the app sources the local env and preflights before its script", () => {
  for (const re of [/Attack the stack steps themselves/, /Replay the applied/, /Apply every pending/, /Attack the views/, /definer and count RPC/, /Build the app/, /Attack every route method/]) {
    const s = step(re);
    const src = s.body.indexOf('. "$SC_ENV"');
    const pre = s.body.indexOf("scripts/proof/preflight.mjs");
    assert.ok(src >= 0 && pre > src, `step "${s.name}" must source the env file then preflight`);
    const script = s.body.search(/node scripts\/(proof|verify)\/(?!preflight)[a-z/-]+\.mjs|npx next build/);
    assert.ok(script > pre || /Attack the stack steps/.test(s.name), `step "${s.name}" runs its script before the preflight`);
  }
});

test("the attack scripts: the right entry points, the fixed attack ids, and a loopback app url", () => {
  assert.match(step(/Attack the views/).body, /node scripts\/verify\/attacks\/rls-view-function-attacks\.mjs --out-dir "\$SC_OUT_DIR"/);
  const d = step(/definer and count RPC/).body;
  assert.match(d, /node scripts\/proof\/attacks\/run-attacks\.mjs --out-dir "\$SC_OUT_DIR" --only /);
  for (const id of ["sec4-definer-class-d-anon-refused", "sec4-definer-class-a-authenticated-refused", "sec4-definer-class-c-anon-control", "sec4-accept-invitation-keeps-role", "s8-c-count-rpcs-membership-gate"]) assert.ok(d.includes(id), `attack ${id} is not run`);
  const r = step(/Attack every route method/).body;
  assert.match(r, /node scripts\/verify\/attacks\/routes-attacked\.mjs --base-url http:\/\/127\.0\.0\.1:3100 --out-dir "\$SC_OUT_DIR"/);
  const start = step(/Start the app with next start/).body;
  assert.match(start, /next start -H 127\.0\.0\.1 -p 3100/);
  assert.match(start, /--retry-connrefused/);
  assert.match(start, /exit 1/, "an app that never answers fails the job");
});

test("the stack-step attacks refuse a remote host, a forbidden name and a production database, and check the env file mode", () => {
  const s = step(/Attack the stack steps themselves/).body;
  assert.match(s, /stat -c %a "\$SC_ENV"/);
  assert.match(s, /write-local-env\.mjs --out/);
  assert.match(s, /VERCEL_ATTACK=1 node scripts\/proof\/preflight\.mjs/);
  assert.match(s, /DATABASE_URL='postgresql:\/\/postgres:x@db\.abc\.supabase\.co/);
  assert.equal((s.match(/ATTACK NOT REFUSED/g) ?? []).length, 3);
  assert.match(s, /psql --version/);
  assert.match(s, /supabase --version/);
});

test("the report is uploaded and the app, the stack and the env file are cleaned up on every run that started them", () => {
  const up = step(/Upload the schema reports/);
  assert.ok(up.body.includes(ALWAYS));
  assert.match(up.body, /name: schema-report/);
  assert.match(up.body, /retention-days: 7/);
  const stop = step(/Stop the app, stop the local stack/);
  assert.ok(stop.body.includes(ALWAYS));
  assert.match(stop.body, /kill "\$\(cat/);
  assert.match(stop.body, /supabase stop --no-backup/);
  assert.match(stop.body, /rm -f "\$SC_ENV"/);
});

test("pull requests supersede each other (workflow concurrency) and the job has a time limit; telemetry is off", () => {
  assert.match(WF_CODE, /concurrency:\n {2}group: \$\{\{ github\.workflow \}\}-\$\{\{ github\.event\.pull_request\.number \|\| github\.ref \}\}\n {2}cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
  assert.match(CODE, /^ {4}timeout-minutes: 40$/m);
  assert.match(CODE, /NEXT_TELEMETRY_DISABLED: '1'/);
});

test("the header states what the routes attack proves and that the job never touches production", () => {
  assert.match(TEXT, /NEVER TOUCHES PRODUCTION/);
  assert.match(TEXT, /the 153 methods of the AT2 register/);
  assert.match(WF.slice(0, WF.indexOf("\non:")), /ALL FIVE are the required status contexts/);
});
