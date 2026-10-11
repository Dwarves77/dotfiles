/** Static proof of the gate-step-attacks workflow's contract (lane TESTS-2, 2026-10-10). It reads the committed workflow text and
 *  asserts what must stay true however the file is edited later: a pull_request check with no path filter, contents: read, no
 *  secret, the scope decision, the install before every attack, each attack step refusing by explicit exit (an attack that is not
 *  refused fails the job), the lint attack using the exact command discipline.yml runs, the attack files removed before the
 *  compiler half runs and again on every exit. workflow-mutation-attacks.test.mjs breaks each of these on purpose. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FORBIDDEN_NAMES } from "./preflight.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..");
const TEXT = readFileSync(resolve(ROOT, ".github", "workflows", "gate-step-attacks.yml"), "utf8");
const CODE = TEXT.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
const DISCIPLINE = readFileSync(resolve(ROOT, ".github", "workflows", "discipline.yml"), "utf8");

function steps() {
  const parts = TEXT.split(/^\s{6}- name: /m).slice(1);
  return parts.map((p) => ({ name: p.split("\n")[0], body: p }));
}
const idx = (re) => steps().findIndex((s) => re.test(s.name));
const step = (re) => steps().find((s) => re.test(s.name));

test("check shape: every pull_request to master, no path filter, no other trigger", () => {
  const on = TEXT.slice(TEXT.indexOf("\non:"), TEXT.indexOf("\npermissions:"));
  assert.match(on, /pull_request:\n\s+branches:\n\s+- master/);
  for (const t of ["paths:", "paths-ignore:", "schedule:", "workflow_dispatch:", "workflow_run:", "push:"]) assert.ok(!on.includes(t), `trigger or filter ${t} present`);
});

test("never touches production: contents: read, no secret, no forbidden name, no environment, no database", () => {
  assert.match(CODE, /^permissions:\n {2}contents: read\n/m);
  assert.doesNotMatch(CODE, /^\s*(actions|id-token|pull-requests|issues|statuses|packages|checks|deployments): write/m);
  assert.doesNotMatch(CODE, /\$\{\{\s*secrets\./);
  assert.doesNotMatch(CODE, /^\s+environment:/m);
  for (const n of FORBIDDEN_NAMES) assert.ok(!CODE.includes(n), `forbidden name ${n} present`);
  assert.doesNotMatch(CODE, /SUPABASE|DATABASE_URL|psql|supabase start/);
});

test("the scope decision fails toward running, watches the install, lint, compiler and attack files, and gates every later step", () => {
  const scope = step(/Did this pull request touch/);
  assert.match(scope.body, /git rev-parse --verify --quiet 'HEAD\^2'/);
  for (const path of ["fsi-app/package-lock.json", "fsi-app/eslint.config.mjs", "fsi-app/tsconfig.json", "fsi-app/.discipline/fitness/functions/F9-build-compiles.mjs", "fsi-app/scripts/verify/attacks", ".github/workflows/discipline.yml"]) {
    assert.ok(scope.body.includes(path), `the scope decision does not watch ${path}`);
  }
  for (const s of steps().slice(2)) {
    assert.ok(s.body.includes("if: steps.scope.outputs.touched == 'true'") || s.body.includes("if: always() && steps.scope.outputs.touched == 'true'"), `step "${s.name}" is not gated on the scope decision`);
  }
});

test("the order: the install (control) before the npm ci attacks, the lint attacks, then F9, then the clean-up", () => {
  const order = [/DS23 control/, /DS23 attacks/, /DS24 control and attacks/, /F9 on the real app/, /Remove the attack files/];
  const at = order.map(idx);
  assert.ok(at.every((n) => n >= 0), `a step is missing: ${at.join(",")}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at, "the steps are out of order");
  assert.match(step(/DS23 control/).body, /npm ci --prefer-offline --no-audit/);
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

test("DS24: the lint attack runs the exact command discipline.yml runs, with a control, a warning attack, an error attack and the flag-is-the-gate check", () => {
  assert.ok(DISCIPLINE.includes("run: npm run lint -- --max-warnings=0"), "discipline.yml still runs this command; update this test and the step together");
  const s = step(/DS24 control and attacks/).body;
  assert.match(s, /npm run lint -- --max-warnings=0 src\/lib\/__eslint_control\.ts \|\| \{ echo "CONTROL FAILED/);
  assert.ok(s.includes("if npm run lint -- --max-warnings=0 src/lib/__eslint_warning_attack.ts; then"), "the warning attack runs the discipline.yml command");
  assert.ok(s.includes("if npm run lint -- --max-warnings=0 src/lib/__eslint_error_attack.ts; then"), "the error attack runs the discipline.yml command");
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
  assert.match(rm.body, /if: always\(\) && steps\.scope\.outputs\.touched == 'true'/);
  for (const f of ["__eslint_control.ts", "__eslint_warning_attack.ts", "__eslint_error_attack.ts", "__f9_attack_type_error.ts"]) assert.ok(rm.body.includes(f), `${f} is not removed`);
});

test("pull requests supersede each other (concurrency) and the job has a time limit; no step swallows a failure", () => {
  assert.match(CODE, /concurrency:\n {2}group: \$\{\{ github\.workflow \}\}-\$\{\{ github\.event\.pull_request\.number \}\}\n {2}cancel-in-progress: true/);
  assert.match(CODE, /timeout-minutes: 25/);
  assert.doesNotMatch(CODE, /continue-on-error/);
  assert.doesNotMatch(CODE, /\|\| true/);
});

test("the header states what it proves and that it never touches production", () => {
  const head = TEXT.slice(0, TEXT.indexOf("\non:"));
  assert.match(head, /WHAT THIS PROVES/);
  assert.match(head, /NEVER TOUCHES PRODUCTION/);
  assert.match(head, /TRIGGER\. Every pull_request to master, no path filter/);
});
