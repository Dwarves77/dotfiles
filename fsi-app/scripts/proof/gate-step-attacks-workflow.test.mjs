/** Static proof of the gate-step-attacks leg of the ONE pipeline workflow (lane TESTS-2, 2026-10-10; rewritten against
 *  .github/workflows/ci.yml by lane PIPE-1, 2026-10-11, when gate-step-attacks.yml became steps of the `static` job). It
 *  reads the committed workflow text and asserts what must stay true however the file is edited later: the attacks run
 *  only when the classifier says code changed, never touch production, run after the install, each attack step refuses
 *  by explicit exit (an attack that is not refused fails the job), the lint attack uses the exact command the ESLint
 *  step runs, and the attack files are removed before the compiler half runs and again on every exit.
 *  workflow-mutation-attacks.test.mjs breaks each of these on purpose. Every case of the old gate-step-attacks-workflow
 *  test maps to a case here. */
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

const TEXT = jobText(WF, "static");
const CODE = TEXT.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
const WF_CODE = WF.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
const IF_CODE = "if: needs.inputs.outputs.code == 'true'";

function steps() {
  const parts = TEXT.split(/^\s{6}- name: /m).slice(1);
  return parts.map((p) => ({ name: p.split("\n")[0], body: p }));
}
const idx = (re) => steps().findIndex((s) => re.test(s.name));
const step = (re) => steps().find((s) => re.test(s.name));

test("check shape: the attacks are steps of the static job, a pull request job with no trigger filter", () => {
  const on = WF.slice(WF.indexOf("\non:"), WF.indexOf("\npermissions:"));
  assert.match(on, /pull_request:\n\s+branches:\n\s+- master/);
  for (const t of ["paths:", "paths-ignore:", "schedule:", "workflow_run:", "pull_request_target:"]) assert.ok(!on.includes(t), `trigger or filter ${t} present`);
  assert.match(CODE, /^ {4}if: github\.event_name == 'pull_request'$/m);
});

test("never touches production: contents: read, no secret, no forbidden name, no environment, no database", () => {
  assert.match(WF_CODE, /^permissions:\n {2}contents: read\n/m);
  assert.match(CODE, /^ {4}permissions:\n {6}contents: read\n {6}actions: read\n/m, "the static job asks for contents read and actions read, nothing writes");
  assert.doesNotMatch(CODE, /^\s*(id-token|pull-requests|issues|statuses|packages|checks|deployments|contents|actions): write/m);
  assert.doesNotMatch(CODE, /\$\{\{\s*secrets\./);
  assert.doesNotMatch(CODE, /^\s+environment:/m);
  // The static job legitimately holds the job's own read-only GITHUB_TOKEN for the closure gate's live lookup (two
  // steps, named); the ATTACK steps themselves carry no credential name and reach no database.
  const attackSteps = steps().filter((s) => /DS23 attacks|DS24 control|F9 on the real app|Remove the attack files|Install fsi-app deps/.test(s.name)).map((s) => s.body).join(String.fromCharCode(10));
  for (const n of FORBIDDEN_NAMES) assert.ok(!attackSteps.includes(n), `forbidden name ${n} present in an attack step`);
  assert.doesNotMatch(CODE, /SUPABASE|DATABASE_URL|psql|supabase start/);
  const tokenSteps = steps().filter((s) => s.body.includes("GITHUB_TOKEN")).map((s) => s.name);
  assert.deepEqual(tokenSteps, ["Run discipline test suite", "Closure gate (never-run steps, stale NEXT rows, writer/reader orphans, lane-contract drift)"]);
});

test("the scope decision is the classifier's code verdict: every attack and the install carry the code condition, and the clean-up runs on every exit when code changed", () => {
  for (const re of [/Install fsi-app deps \(DS23 control/, /DS23 attacks/, /DS24 control and attacks/, /F9 on the real app/]) {
    const s = step(re);
    assert.ok(s, `a step is missing: ${re}`);
    assert.ok(s.body.includes(`\n        ${IF_CODE}\n`), `step "${s.name}" is not gated on the code verdict`);
  }
  assert.ok(step(/Remove the attack files/).body.includes("\n        if: always() && needs.inputs.outputs.code == 'true'\n"));
  assert.doesNotMatch(CODE, /steps\.scope|git diff --name-only HEAD\^1/, "the in-job scope decision is retired");
});

test("the order: the install (control) before the npm ci attacks, the lint attacks, then F9, then the clean-up; all after the fitness runner so the attack files are never in the tree it compiles", () => {
  const order = [/Install fsi-app deps \(DS23 control/, /Run fitness functions/, /DS23 attacks/, /DS24 control and attacks/, /F9 on the real app/, /Remove the attack files/];
  const at = order.map(idx);
  assert.ok(at.every((n) => n >= 0), `a step is missing: ${at.join(",")}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at, "the steps are out of order");
  assert.match(step(/Install fsi-app deps \(DS23 control/).body, /npm ci --prefer-offline --no-audit/);
  assert.ok(idx(/ESLint \(max-warnings 0\)/) < idx(/DS24 control and attacks/), "the clean-tree lint runs before the lint attack files exist");
});

test("DS23: both attacks must be refused by an explicit exit, for the sync reason and the lockfile reason", () => {
  const s = step(/DS23 attacks/).body;
  assert.match(s, /left-pad/);
  assert.match(s, /ATTACK NOT REFUSED: npm ci accepted a package\.json that is out of sync/);
  assert.match(s, /ATTACK NOT REFUSED: npm ci accepted a missing lockfile/);
  assert.match(s, /grep -q "package\.json and package-lock\.json" out-sync\.log/);
  assert.match(s, /rm -f package-lock\.json/);
  assert.equal((s.match(/npm ci --dry-run/g) ?? []).length, 2);
});

test("DS24: the lint attack runs the exact command the ESLint step runs, with a control, a warning attack, an error attack and the flag-is-the-gate check", () => {
  const lint = step(/ESLint \(max-warnings 0\)/).body;
  assert.ok(lint.includes("run: npm run lint -- --max-warnings=0"), "the ESLint step still runs this command; update this test and the step together");
  const s = step(/DS24 control and attacks/).body;
  assert.match(s, /npm run lint -- --max-warnings=0 src\/lib\/__eslint_control\.ts \|\| \{ echo "CONTROL FAILED/);
  assert.ok(s.includes("if npm run lint -- --max-warnings=0 src/lib/__eslint_warning_attack.ts; then"), "the warning attack runs the ESLint step's command");
  assert.ok(s.includes("if npm run lint -- --max-warnings=0 src/lib/__eslint_error_attack.ts; then"), "the error attack runs the ESLint step's command");
  assert.match(s, /ATTACK NOT REFUSED: the lint command passes a file with a warning/);
  assert.match(s, /ATTACK NOT REFUSED: the lint command passes a file with an error/);
  assert.match(s, /npm run lint -- src\/lib\/__eslint_warning_attack\.ts \|\| \{ echo "the warning attack was refused WITHOUT the flag/);
  assert.match(s, /trap 'rm -f src\/lib\/__eslint_control\.ts src\/lib\/__eslint_warning_attack\.ts src\/lib\/__eslint_error_attack\.ts' EXIT/);
});

test("F9: the compiler half runs the attack script in a disposable checkout and the attack files are removed on every exit", () => {
  const s = step(/F9 on the real app/).body;
  assert.match(s, /GATE_ATTACK_DISPOSABLE_CHECKOUT: '1'/);
  assert.match(s, /node scripts\/verify\/attacks\/f9-real-project-attack\.mjs/);
  const rm = step(/Remove the attack files/);
  assert.match(rm.body, /if: always\(\) && needs\.inputs\.outputs\.code == 'true'/);
  for (const f of ["__eslint_control.ts", "__eslint_warning_attack.ts", "__eslint_error_attack.ts", "__f9_attack_type_error.ts"]) assert.ok(rm.body.includes(f), `${f} is not removed`);
});

test("the job has a time limit set from measurement and the workflow supersedes pull request runs; the only swallowed failures are the named soft report-only scans", () => {
  assert.match(WF_CODE, /concurrency:\n {2}group: \$\{\{ github\.workflow \}\}-\$\{\{ github\.event\.pull_request\.number \|\| github\.ref \}\}\n {2}cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
  assert.match(CODE, /^ {4}timeout-minutes: 19$/m);
  assert.match(TEXT, /FROM MEASUREMENT/);
  assert.doesNotMatch(CODE, /continue-on-error/);
  // every `|| true` in the job is inside the one SOFT scan step, whose name says it never fails the build
  for (const s of steps()) {
    const run = s.body.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
    if (/\|\| true/.test(run.replace(/git fetch --no-tags origin "\$BASE_REF" \|\| true/g, ""))) {
      assert.match(s.name, /^SOFT - /, `step "${s.name}" swallows a failure but is not a SOFT report-only step`);
    }
  }
});

test("the header states the five jobs and that the gate-step attacks are part of the static job", () => {
  const head = WF.slice(0, WF.indexOf("\non:"));
  assert.match(head, /FIVE jobs/);
  assert.match(head, /the gate-step attacks/);
  assert.match(TEXT, /gate-step attacks \(lane TESTS-2, CLAUDE\.md rule 15\)/);
});
